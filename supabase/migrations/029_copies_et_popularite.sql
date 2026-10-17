-- 029 — copier le pari d'un joueur, et compter qui le copie
--
-- Mehdi, 17/10/2026 : « on affiche aussi combien de personnes copient cet
-- utilisateur, et ça sera un indice de popularité ».
--
-- ─── POURQUOI LA COPIE EST UNE FONCTION, ET LE COMPTEUR AUSSI ────────────
-- Un indice de popularité affiché publiquement est une chose qu'on a intérêt
-- à gonfler. Si le navigateur pouvait écrire dans la table des copies,
-- n'importe qui ferait grimper la sienne en boucle. La copie passe donc par
-- `copier_pari()`, qui pose le pari ET journalise dans le même geste : on ne
-- peut pas enregistrer une copie sans avoir réellement engagé ses crampons.
--
-- Et la clé primaire (copieur, bulletin) fait le reste : copier deux fois le
-- même bulletin ne compte qu'une fois.

create table if not exists public.copies_paris (
  copieur     uuid   not null references public.profiles(id) on delete cascade,
  slip_id     bigint not null references public.bet_slips(id) on delete cascade,
  -- L'auteur est dénormalisé exprès : le compteur de popularité se lit sans
  -- jointure, et il survit à la suppression du bulletin d'origine.
  auteur      uuid   not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (copieur, slip_id)
);
create index if not exists copies_auteur_idx on public.copies_paris (auteur);

alter table public.copies_paris enable row level security;

-- Lecture ouverte : c'est un indice public, affiché sur les profils.
drop policy if exists copies_lecture on public.copies_paris;
create policy copies_lecture on public.copies_paris for select using (true);
-- AUCUNE policy d'écriture : seule la fonction écrit ici.

-- ─── COPIER UN PARI ───────────────────────────────────────────────────────
-- Le copieur mise CE QU'IL VEUT, pas ce qu'a misé l'auteur : les soldes ne se
-- ressemblent pas, et imposer la mise d'origine rendrait la copie impossible
-- au petit joueur. Les cotes, elles, sont celles du moment — `place_slip`
-- les revalide, donc copier un pari dont le match a commencé échoue, ce qui
-- est le comportement voulu.
create or replace function public.copier_pari(p_slip_id bigint, p_stake integer)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_moi     uuid := auth.uid();
  v_auteur  uuid;
  v_statut  text;
  v_legs    jsonb;
  v_neuf    bigint;
begin
  if v_moi is null then
    raise exception 'connexion requise';
  end if;

  select s.user_id, s.status into v_auteur, v_statut
    from public.bet_slips s where s.id = p_slip_id;
  if v_auteur is null then
    raise exception 'pari introuvable';
  end if;
  if v_auteur = v_moi then
    raise exception 'on ne copie pas son propre pari';
  end if;
  -- On ne copie que ce qui est encore en jeu : recopier un pari deja perdu
  -- n'aurait aucun sens, et recopier un pari gagne encore moins.
  if v_statut <> 'open' then
    raise exception 'ce pari n''est plus en cours';
  end if;

  select jsonb_agg(jsonb_build_object('match_id', l.match_id,
                                      'market',   l.market,
                                      'pick',     l.pick) order by l.id)
    into v_legs
    from public.bet_legs l where l.slip_id = p_slip_id;
  if v_legs is null then
    raise exception 'ce pari n''a aucune selection';
  end if;

  -- C'est `place_slip` qui verifie le solde, les cotes et les matchs encore
  -- ouverts, et qui debite. On ne reecrit pas ces regles ici.
  v_neuf := public.place_slip(v_legs, p_stake);

  -- La copie n'est journalisee qu'APRES un pari reellement pose. `on conflict
  -- do nothing` : recopier le meme bulletin ne compte pas deux fois.
  insert into public.copies_paris (copieur, slip_id, auteur)
       values (v_moi, p_slip_id, v_auteur)
  on conflict (copieur, slip_id) do nothing;

  return v_neuf;
end $$;

revoke all on function public.copier_pari(bigint, integer) from public;
grant execute on function public.copier_pari(bigint, integer) to authenticated;


-- ─── LE PROFIL PORTE SON INDICE DE POPULARITÉ ─────────────────────────────
-- Le nombre de joueurs DISTINCTS qui ont copié au moins un de ses paris.
-- Distincts, parce que copier dix bulletins du même auteur ne fait pas dix
-- admirateurs — ça fait un lecteur assidu.
create or replace function public.profil_public(p_alias text)
returns table (
  id            uuid,
  alias         text,
  avatar_url    text,
  tier          text,
  points        bigint,
  rang          integer,
  joueurs       integer,
  paris_total   integer,
  gagnes        integer,
  serie         integer,
  meilleure_serie integer,
  groupe        text,
  membre_depuis timestamptz,
  copieurs      integer
)
language sql stable security definer set search_path = public as $$
  with moi as (
    select p.* from public.profiles p where lower(p.alias) = lower(p_alias) limit 1
  )
  select m.id, m.alias, m.avatar_url, m.tier,
         coalesce(m.ranking_points, 0) as points,
         (1 + (select count(*) from public.profiles q
                where coalesce(q.ranking_points, 0) > coalesce(m.ranking_points, 0)))::integer as rang,
         (select count(*) from public.profiles q
           where coalesce(q.ranking_points, 0) > 0)::integer as joueurs,
         (coalesce((select count(*) from public.bet_slips s where s.user_id = m.id), 0)
        + coalesce((select count(*) from public.bets b where b.user_id = m.id), 0))::integer as paris_total,
         (coalesce((select count(*) from public.bet_slips s
                     where s.user_id = m.id and s.status = 'won'), 0)
        + coalesce((select count(*) from public.bets b
                     where b.user_id = m.id and b.status = 'won'), 0))::integer as gagnes,
         m.current_streak, m.best_streak,
         (select l.name from public.league_members lm
            join public.leagues l on l.id = lm.league_id
           where lm.user_id = m.id limit 1) as groupe,
         m.created_at,
         (select count(distinct c.copieur)
            from public.copies_paris c where c.auteur = m.id)::integer as copieurs
    from moi m
$$;

revoke all on function public.profil_public(text) from public;
grant execute on function public.profil_public(text) to anon, authenticated;
