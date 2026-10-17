-- 032 — PUBLIER UN PARI GAGNÉ SUR SON PROFIL
--
-- Mehdi, 17/10/2026 : « quand un joueur remporte un pari il puisse le
-- partager sur son profil […] possibilité d'aimer le post par les autres
-- utilisateurs et envoi de notifications pour les followers ».
--
-- ─── CE QUI VIENT DU CLIENT, ET CE QUI N'EN VIENT JAMAIS ──────────────────
-- Le post est un INSTANTANÉ : il doit rester lisible dans six mois, quand
-- l'API des scores aura oublié le match. On stocke donc son contenu plutôt
-- que de le recalculer à l'affichage.
--
-- Mais tout n'a pas la même valeur. Les NOMS D'ÉQUIPES et les SCORES sont
-- résolus par le navigateur (c'est lui qui interroge ESPN) : les accepter
-- est sans danger, mentir dessus ne rapporte rien. LA COTE, LA MISE ET LE
-- GAIN, eux, sont relus en base depuis `bet_slips` et jamais pris du client.
-- Un post est une vitrine : si on pouvait y écrire son propre gain, le
-- classement social ne vaudrait plus rien.
--
-- ─── LA RARETÉ, CE QUE PERSONNE D'AUTRE NE PEUT AFFICHER ──────────────────
-- `part_du_choix()` dit quelle PROPORTION des parieurs avait fait le même
-- choix sur ce match. « Seulement 12 % avaient vu Miami » — c'est la donnée
-- qui transforme un ticket en fierté, et nous sommes les seuls à l'avoir.
-- Elle est figée à la publication : une fois le match joué, elle ne bouge
-- plus, et la recalculer plus tard donnerait un autre chiffre.

create table if not exists public.posts (
  id         bigserial primary key,
  auteur     uuid not null references public.profiles(id) on delete cascade,
  slip_id    bigint unique references public.bet_slips(id) on delete set null,
  kind       text not null default 'pari_gagne',
  donnees    jsonb not null default '{}'::jsonb,
  -- Le mot du joueur. Court : c'est une légende, pas un billet de blog.
  legende    text check (legende is null or char_length(legende) <= 140),
  created_at timestamptz not null default now()
);
create index if not exists posts_auteur_idx on public.posts (auteur, created_at desc);
create index if not exists posts_recents_idx on public.posts (created_at desc);

alter table public.posts enable row level security;

-- Un post est PUBLIC : c'est sa raison d'être. Il s'affiche sur le profil
-- public, donc même un visiteur non connecté doit pouvoir le lire.
drop policy if exists posts_lecture on public.posts;
create policy posts_lecture on public.posts for select using (true);

-- L'écriture passe par la fonction : elle seule sait relire le bulletin.
drop policy if exists posts_suppression on public.posts;
create policy posts_suppression on public.posts
  for delete using (auth.uid() = auteur);

revoke all on public.posts from anon, authenticated;
grant select on public.posts to anon;
grant select, delete on public.posts to authenticated;

-- ─── LES J'AIME ───────────────────────────────────────────────────────────
create table if not exists public.post_likes (
  post_id    bigint not null references public.posts(id) on delete cascade,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_post_idx on public.post_likes (post_id);

alter table public.post_likes enable row level security;

-- Le COMPTE est public (il s'affiche sous le post) ; la liste de qui a aimé
-- n'intéresse personne et n'est pas exposée : la lecture directe reste
-- limitée à ses propres lignes, le compte vient de la fonction de lecture.
drop policy if exists post_likes_lecture on public.post_likes;
create policy post_likes_lecture on public.post_likes
  for select using (auth.uid() = user_id);

drop policy if exists post_likes_ajout on public.post_likes;
create policy post_likes_ajout on public.post_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists post_likes_retrait on public.post_likes;
create policy post_likes_retrait on public.post_likes
  for delete using (auth.uid() = user_id);

revoke all on public.post_likes from anon, authenticated;
grant select, insert, delete on public.post_likes to authenticated;

-- ─── LA RARETÉ D'UN CHOIX ─────────────────────────────────────────────────
-- Combien, sur cent parieurs de ce match, avaient fait le même choix.
-- Rend NULL sous cinq parieurs : « 100 % des parieurs » quand ils sont deux
-- ne dit rien, et afficher un pourcentage sur un échantillon de deux serait
-- un mensonge habillé en statistique.
create or replace function public.part_du_choix(
  p_match text, p_market text, p_pick text
) returns integer
language sql stable security definer set search_path = public as $$
  with t as (
    select l.pick from public.bet_legs l
     where l.match_id = p_match and l.market = p_market
  )
  select case when (select count(*) from t) < 5 then null
              else round(100.0 * (select count(*) from t where pick = p_pick)
                               / (select count(*) from t))::integer
         end
$$;

grant execute on function public.part_du_choix(text, text, text) to anon, authenticated;

-- ─── PUBLIER ──────────────────────────────────────────────────────────────
-- `p_matchs` ne porte QUE de l'affichage : [{match_id, titre, score}].
-- Tout le reste — cote, mise, gain, choix, jambes — est relu en base.
create or replace function public.publier_pari(
  p_slip_id bigint, p_legende text default null, p_matchs jsonb default '[]'::jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_moi    uuid := auth.uid();
  s        record;
  v_jambes jsonb;
  v_id     bigint;
  v_serie  integer;
begin
  if v_moi is null then raise exception 'connexion requise' using errcode = 'P0004'; end if;

  select * into s from public.bet_slips where id = p_slip_id;
  if not found then raise exception 'pari introuvable' using errcode = 'P0020'; end if;
  if s.user_id <> v_moi then raise exception 'ce pari n''est pas le votre' using errcode = 'P0021'; end if;
  if s.status <> 'won' then raise exception 'seul un pari gagne se publie' using errcode = 'P0022'; end if;

  if exists (select 1 from public.posts where slip_id = p_slip_id) then
    raise exception 'ce pari est deja publie' using errcode = 'P0023';
  end if;

  -- Les jambes, enrichies : le choix et la cote viennent de la base, le
  -- libellé du match et le score de ce que le navigateur a résolu.
  select jsonb_agg(
           jsonb_build_object(
             'match_id', l.match_id,
             'market',   l.market,
             'pick',     l.pick,
             'cote',     l.odds,
             'titre',    coalesce(m.value->>'titre', ''),
             'score',    coalesce(m.value->>'score', ''),
             -- La rareté, figée ici pour toujours.
             'part',     public.part_du_choix(l.match_id, l.market, l.pick)
           ) order by l.id)
    into v_jambes
    from public.bet_legs l
    left join lateral (
      select value from jsonb_array_elements(coalesce(p_matchs, '[]'::jsonb)) as value
       where value->>'match_id' = l.match_id limit 1
    ) m on true
   where l.slip_id = p_slip_id;

  select coalesce(count(*), 0)::integer into v_serie
    from public.bet_slips b
   where b.user_id = v_moi and b.status = 'won'
     and b.settled_at >= coalesce(s.settled_at, now()) - interval '7 days';

  insert into public.posts (auteur, slip_id, kind, legende, donnees)
  values (
    v_moi, p_slip_id, 'pari_gagne',
    nullif(btrim(coalesce(p_legende, '')), ''),
    jsonb_build_object(
      'mise',    s.stake,
      'cote',    s.odds,
      'gain',    coalesce(s.payout, 0),
      'jambes',  coalesce(v_jambes, '[]'::jsonb),
      -- La probabilité implicite de la cote : 1/cote. C'est elle qui dit
      -- l'audace du pari, et elle se lit mieux qu'un multiplicateur.
      'chance',  case when s.odds > 0 then round(100.0 / s.odds)::integer else null end,
      'gagnes7', v_serie,
      'regle_le', s.settled_at
    )
  )
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.publier_pari(bigint, text, jsonb) from public;
grant execute on function public.publier_pari(bigint, text, jsonb) to authenticated;

-- ─── LES PARIS GAGNÉS ENCORE PUBLIABLES ───────────────────────────────────
-- Pour que le bouton « Partager » n'apparaisse que là où il mène quelque
-- part : gagné, à moi, et pas déjà publié.
create or replace function public.mes_paris_publiables()
returns table (slip_id bigint, cote numeric, mise integer, gain bigint, regle_le timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, b.odds, b.stake, coalesce(b.payout, 0), b.settled_at
    from public.bet_slips b
   where b.user_id = auth.uid() and b.status = 'won'
     and not exists (select 1 from public.posts p where p.slip_id = b.id)
   order by b.settled_at desc nulls last
   limit 50
$$;

revoke all on function public.mes_paris_publiables() from public;
grant execute on function public.mes_paris_publiables() to authenticated;

-- ─── LIRE LES POSTS ───────────────────────────────────────────────────────
-- Le compte de j'aime et « est-ce que je l'aime » arrivent avec le post :
-- une requête de plus par carte ferait vingt requêtes sur un profil.
create or replace function public.posts_profil(p_alias text, p_limite integer default 20)
returns table (
  id bigint, auteur uuid, alias text, avatar_url text, tier text,
  kind text, donnees jsonb, legende text, created_at timestamptz,
  jaimes integer, jaime boolean
)
language sql stable security definer set search_path = public as $$
  select po.id, po.auteur, pr.alias, pr.avatar_url, pr.tier,
         po.kind, po.donnees, po.legende, po.created_at,
         (select count(*) from public.post_likes l where l.post_id = po.id)::integer,
         exists (select 1 from public.post_likes l
                  where l.post_id = po.id and l.user_id = auth.uid())
    from public.posts po
    join public.profiles pr on pr.id = po.auteur
   where lower(pr.alias) = lower(p_alias)
   order by po.created_at desc
   limit greatest(1, least(coalesce(p_limite, 20), 50))
$$;

grant execute on function public.posts_profil(text, integer) to anon, authenticated;

-- Un post seul, par son identifiant : c'est ce que lit la page partagée et
-- ce que le studio dessine.
create or replace function public.post_public(p_id bigint)
returns table (
  id bigint, auteur uuid, alias text, avatar_url text, tier text,
  kind text, donnees jsonb, legende text, created_at timestamptz, jaimes integer
)
language sql stable security definer set search_path = public as $$
  select po.id, po.auteur, pr.alias, pr.avatar_url, pr.tier,
         po.kind, po.donnees, po.legende, po.created_at,
         (select count(*) from public.post_likes l where l.post_id = po.id)::integer
    from public.posts po
    join public.profiles pr on pr.id = po.auteur
   where po.id = p_id
$$;

grant execute on function public.post_public(bigint) to anon, authenticated;

-- ─── AIMER ────────────────────────────────────────────────────────────────
create or replace function public.aimer_post(p_post bigint, p_aimer boolean)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_moi uuid := auth.uid(); v_n integer;
begin
  if v_moi is null then raise exception 'connexion requise' using errcode = 'P0004'; end if;
  if p_aimer then
    insert into public.post_likes (post_id, user_id) values (p_post, v_moi)
    on conflict do nothing;
  else
    delete from public.post_likes where post_id = p_post and user_id = v_moi;
  end if;
  select count(*)::integer into v_n from public.post_likes where post_id = p_post;
  return v_n;
end $$;

revoke all on function public.aimer_post(bigint, boolean) from public;
grant execute on function public.aimer_post(bigint, boolean) to authenticated;

-- ─── LES NOTIFICATIONS ────────────────────────────────────────────────────
-- 1. À LA PUBLICATION : tous les abonnés de l'auteur. C'est la demande de
--    Mehdi, et c'est aussi ce qui donne un sens à « suivre » quelqu'un.
create or replace function public.notif_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_alias text; v_avatar text;
begin
  select alias, avatar_url into v_alias, v_avatar from public.profiles where id = new.auteur;
  insert into public.notifications (user_id, kind, donnees, lien)
  select a.abonne, 'post_abonne',
         jsonb_build_object('alias', v_alias, 'avatar', v_avatar, 'id', new.auteur,
                            'post', new.id, 'cote', new.donnees->'cote'),
         '/u/' || coalesce(v_alias, '')
    from public.abonnements a
   where a.suivi = new.auteur;
  return null;
end $$;

drop trigger if exists posts_notif on public.posts;
create trigger posts_notif after insert on public.posts
  for each row execute function public.notif_post();

-- 2. QUAND ON AIME : l'auteur, et personne d'autre. Jamais pour soi-même —
--    aimer son propre post ne notifie rien.
create or replace function public.notif_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_alias text; v_auteur uuid;
begin
  select auteur into v_auteur from public.posts where id = new.post_id;
  if v_auteur is null or v_auteur = new.user_id then return null; end if;
  select alias into v_alias from public.profiles where id = new.user_id;
  perform public.notifier(
    v_auteur, 'post_aime',
    jsonb_build_object('alias', v_alias, 'id', new.user_id, 'post', new.post_id),
    '/u/' || coalesce((select alias from public.profiles where id = v_auteur), ''));
  return null;
end $$;

drop trigger if exists post_likes_notif on public.post_likes;
create trigger post_likes_notif after insert on public.post_likes
  for each row execute function public.notif_like();
