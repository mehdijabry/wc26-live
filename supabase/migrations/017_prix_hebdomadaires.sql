-- 017 — les prix hebdomadaires du podium
--
-- LE CYCLE. Du lundi 00:00 UTC au dimanche 23:59:59. Le lundi, le cron clôt
-- la semaine écoulée et inscrit les prix dus. Rien n'est versé à ce moment :
-- le joueur réclame, et il CHOISIT — le groupe et la monnaie.
--
-- POURQUOI UNE RÉCLAMATION ET PAS UN VERSEMENT. Même raison que pour le
-- bonus quotidien : un joueur peut être sur le podium de plusieurs groupes,
-- il n'encaisse qu'une fois, et c'est lui qui arbitre (Mehdi, 2026-10-10).
-- Verser automatiquement le meilleur retirerait le choix, qui EST la
-- fonctionnalité. S'ajoute ici un second choix, la monnaie.
--
-- LE BARÈME. Mehdi a donné « 50 crampons ou 10 pressings » pour un
-- vainqueur. Les deuxième et troisième places n'avaient pas de valeur : on
-- les pose à 30/6 et 20/4, en gardant partout le rapport 5 crampons pour
-- 1 pressing qu'implique son chiffre. À corriger si l'échelle ne lui va pas.
--
--     1er   50 crampons  ou  10 pressings
--     2e    30           ou   6
--     3e    20           ou   4
--
-- Le tout multiplié par le TAUX DE LA SEMAINE : la part des membres actifs
-- ayant posé au moins cinq paris. Un podium dans un groupe mort ne paie
-- presque rien, et c'est voulu — le prix récompense un groupe vivant.
--
-- COMBIEN DE PLACES. Trois à partir de cinq membres, une seule à trois ou
-- quatre, aucune en dessous. C'est la règle de Mehdi, déjà appliquée par
-- `groupe_etat()`.

create table if not exists public.weekly_prizes (
  id          bigserial primary key,
  league_id   uuid not null references public.leagues(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- Le LUNDI de la semaine close. Sert de clé de cycle partout.
  semaine     date not null,
  rang        integer not null check (rang between 1 and 3),
  taux        numeric(4,3) not null,
  crampons    integer not null check (crampons >= 0),
  pressings   integer not null check (pressings >= 0),
  reclame_le  timestamptz,
  monnaie     text check (monnaie in ('crampons', 'pressings')),
  created_at  timestamptz not null default now(),
  -- Un seul prix par groupe, par joueur et par semaine : c'est ce qui rend
  -- la clôture rejouable sans rien dupliquer.
  unique (league_id, user_id, semaine)
);

-- UN SEUL PRIX RÉCLAMÉ PAR JOUEUR ET PAR SEMAINE. L'index est partiel : les
-- prix non réclamés peuvent être plusieurs — c'est justement entre eux que
-- le joueur choisit — mais un seul peut porter une date de réclamation.
create unique index if not exists weekly_prizes_une_reclamation
  on public.weekly_prizes (user_id, semaine) where reclame_le is not null;

create index if not exists weekly_prizes_user_idx on public.weekly_prizes (user_id, semaine desc);

alter table public.weekly_prizes enable row level security;
drop policy if exists "weekly_prizes_read_own" on public.weekly_prizes;
create policy "weekly_prizes_read_own" on public.weekly_prizes
  for select using (auth.uid() = user_id);

-- ── Le barème, en un seul endroit ─────────────────────────────────────────
create or replace function public.bareme_du_rang(p_rang integer)
returns table (crampons integer, pressings integer)
language sql immutable set search_path = public as $$
  select case p_rang when 1 then 50 when 2 then 30 when 3 then 20 else 0 end,
         case p_rang when 1 then 10 when 2 then 6  when 3 then 4  else 0 end;
$$;

grant execute on function public.bareme_du_rang(integer) to anon, authenticated;

-- ── La clôture d'une semaine ──────────────────────────────────────────────
-- Appelée par le cron le lundi. `p_semaine` est le LUNDI de la semaine à
-- clore ; par défaut, celle qui vient de se terminer.
create or replace function public.cloturer_semaine(p_semaine date default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_sem0 timestamptz;
  v_sem1 timestamptz;
  v_pose integer := 0;
begin
  v_sem0 := coalesce(p_semaine::timestamptz, public.debut_semaine() - interval '7 days');
  v_sem1 := v_sem0 + interval '7 days';

  with membres as (
    select mb.league_id, mb.user_id,
           public.nb_paris(mb.user_id, v_sem0, v_sem1) as paris,
           coalesce((select sum(e.points) from public.ranking_events e
                      where e.user_id = mb.user_id
                        and e.created_at >= v_sem0 and e.created_at < v_sem1), 0) as points
      from public.league_members mb
  ),
  groupes as (
    select league_id,
           count(*)::integer                                   as membres,
           count(*) filter (where paris >= 1)::numeric         as actifs,
           count(*) filter (where paris >= 5)::numeric         as assidus
      from membres
     group by league_id
    having count(*) >= 3
  ),
  taux as (
    select g.league_id, g.membres,
           case when g.actifs = 0 then 0 else round(g.assidus / g.actifs, 3) end as t,
           -- Trois places à partir de cinq membres, une seule à trois ou quatre.
           case when g.membres >= 5 then 3 else 1 end as places
      from groupes g
  ),
  classes as (
    select m.league_id, m.user_id, m.points,
           rank() over (partition by m.league_id order by m.points desc) as rang
      from membres m
     where m.points > 0
  ),
  podium as (
    select c.league_id, c.user_id, c.rang::integer, tx.t
      from classes c
      join taux tx on tx.league_id = c.league_id
     where c.rang <= tx.places and c.rang <= 3
  ),
  pose as (
    insert into public.weekly_prizes (league_id, user_id, semaine, rang, taux, crampons, pressings)
    select p.league_id, p.user_id, v_sem0::date, p.rang, p.t,
           round(b.crampons * p.t)::integer, round(b.pressings * p.t)::integer
      from podium p
     cross join lateral public.bareme_du_rang(p.rang) b
     -- Un prix à zéro n'est pas un prix : si personne n'a été assidu, le
     -- taux est nul et on n'inscrit rien plutôt qu'une ligne vide à réclamer.
     where round(b.crampons * p.t)::integer > 0
    on conflict (league_id, user_id, semaine) do nothing
    returning 1
  )
  select count(*)::integer into v_pose from pose;

  return v_pose;
end;
$$;

revoke all on function public.cloturer_semaine(date) from public;

-- ── Ce que le joueur a en attente ─────────────────────────────────────────
create or replace function public.mes_prix()
returns table (
  id bigint, groupe text, slug text, semaine date, rang integer,
  taux numeric, crampons integer, pressings integer, reclame boolean
)
language sql stable security definer set search_path = public as $$
  select w.id, l.name, l.slug, w.semaine, w.rang, w.taux, w.crampons, w.pressings,
         w.reclame_le is not null
    from public.weekly_prizes w
    join public.leagues l on l.id = w.league_id
   where w.user_id = auth.uid()
   order by w.semaine desc, w.rang asc;
$$;

revoke all on function public.mes_prix() from public;
grant execute on function public.mes_prix() to authenticated;

-- ── Réclamer, avec le choix de la monnaie ─────────────────────────────────
create or replace function public.reclamer_prix(p_prix bigint, p_monnaie text)
returns table (crampons integer, pressings integer, groupe text)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  w record;
  v_nom text;
begin
  if v_user is null then
    raise exception 'Connexion requise' using errcode = 'P0004';
  end if;
  if p_monnaie not in ('crampons', 'pressings') then
    raise exception 'Monnaie inconnue' using errcode = 'P0009';
  end if;

  select * into w from public.weekly_prizes where id = p_prix and user_id = v_user for update;
  if not found then
    raise exception 'Prix introuvable' using errcode = 'P0016';
  end if;
  if w.reclame_le is not null then
    raise exception 'Prix déjà réclamé' using errcode = 'P0017';
  end if;
  if exists (select 1 from public.weekly_prizes x
              where x.user_id = v_user and x.semaine = w.semaine and x.reclame_le is not null) then
    raise exception 'Un seul prix par semaine' using errcode = 'P0018';
  end if;

  select l.name into v_nom from public.leagues l where l.id = w.league_id;

  update public.weekly_prizes
     set reclame_le = now(), monnaie = p_monnaie
   where id = w.id;

  if p_monnaie = 'crampons' then
    update public.profiles p set crampons = p.crampons + w.crampons where p.id = v_user;
    return query select w.crampons, 0, v_nom;
  else
    update public.profiles p set pressings = p.pressings + w.pressings where p.id = v_user;
    return query select 0, w.pressings, v_nom;
  end if;
end;
$$;

revoke all on function public.reclamer_prix(bigint, text) from public;
grant execute on function public.reclamer_prix(bigint, text) to authenticated;
