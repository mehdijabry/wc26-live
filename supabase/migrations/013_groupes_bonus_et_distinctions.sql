-- 013 — le bonus quotidien de groupe, la barre de déblocage, les distinctions
--
-- CE QU'ON POSE (Mehdi, 2026-10-10). Un groupe n'existe que si ses membres
-- jouent. On récompense donc l'ACTIVITÉ COLLECTIVE chaque jour, et la
-- PERFORMANCE chaque semaine.
--
--     bonus du jour = 3 crampons × (membres actifs ayant parié / membres actifs)
--
-- La règle de Mehdi était « tous parient → récompense complète, un seul parie
-- → le quart ». Dans un groupe de quatre, 1/4 = 25 % : ses deux exemples SONT
-- déjà la règle proportionnelle. Elle couvre en plus 2 sur 3 et 3 sur 5, sans
-- marche d'escalier.
--
-- ── POURQUOI « MEMBRES ACTIFS » ET PAS « MEMBRES » ────────────────────────
-- L'unanimité est atteignable à trois, impossible à dix : un seul ami en
-- vacances plafonnerait tout le monde à 90 % pour toujours, et le mécanisme
-- punirait exactement les groupes qui ont réussi à recruter. Le dénominateur
-- est donc l'effectif ACTIF — ceux qui ont parié au moins une fois dans les
-- sept derniers jours. Un dormant ne pénalise personne ; s'il revient, il
-- recompte.
--
-- ── POURQUOI UN SEUL BONUS PAR JOUR ───────────────────────────────────────
-- Le vrai trou n'est pas les faux comptes — on a chiffré le gain à 0,0067 $,
-- ce n'est pas farmable. C'est le CUMUL DE GROUPES : rien n'empêcherait
-- d'être dans dix groupes et de toucher dix fois le bonus pour un seul pari.
-- Un joueur touche donc le bonus de son MEILLEUR groupe, une fois par jour.
--
-- ── POURQUOI « PARIER » = POSER, PAS RÉGLER ───────────────────────────────
-- Un joueur choisit quand il mise, pas quand le match se joue. Compter les
-- règlements punirait celui qui parie sur un match de dimanche.

-- ── Ce qui a été versé ────────────────────────────────────────────────────
create table if not exists public.group_bonus_paid (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  jour      date not null,
  league_id uuid references public.leagues(id) on delete set null,
  crampons  integer not null check (crampons >= 0),
  taux      numeric(4,3) not null,
  -- LA CLÉ EST (joueur, jour), PAS (joueur, groupe, jour). C'est elle qui
  -- interdit le cumul : la base refuse un second versement le même jour,
  -- même si le cron repasse ou si le joueur est dans quinze groupes.
  primary key (user_id, jour)
);

alter table public.group_bonus_paid enable row level security;
drop policy if exists "group_bonus_read_own" on public.group_bonus_paid;
create policy "group_bonus_read_own" on public.group_bonus_paid
  for select using (auth.uid() = user_id);

-- ── Les briques de calcul ─────────────────────────────────────────────────

/** A-t-il posé au moins un pari dans la fenêtre ? Bulletins ET paris simples. */
create or replace function public.a_parie(p_user uuid, p_depuis timestamptz, p_jusqua timestamptz)
returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.bet_slips s
                  where s.user_id = p_user and s.created_at >= p_depuis and s.created_at < p_jusqua)
      or exists (select 1 from public.bets b
                  where b.user_id = p_user and b.created_at >= p_depuis and b.created_at < p_jusqua);
$$;

/** Combien de paris posés dans la fenêtre. */
create or replace function public.nb_paris(p_user uuid, p_depuis timestamptz, p_jusqua timestamptz)
returns integer
language sql stable set search_path = public as $$
  select (
    (select count(*) from public.bet_slips s
      where s.user_id = p_user and s.created_at >= p_depuis and s.created_at < p_jusqua)
  + (select count(*) from public.bets b
      where b.user_id = p_user and b.created_at >= p_depuis and b.created_at < p_jusqua)
  )::integer;
$$;

grant execute on function public.a_parie(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.nb_paris(uuid, timestamptz, timestamptz) to anon, authenticated;

/** Le lundi 00:00 UTC de la semaine d'une date. */
create or replace function public.debut_semaine(p_quand timestamptz default now())
returns timestamptz
language sql immutable set search_path = public as $$
  select date_trunc('week', p_quand at time zone 'UTC') at time zone 'UTC';
$$;

grant execute on function public.debut_semaine(timestamptz) to anon, authenticated;

-- ── L'état d'un groupe : tout ce que la barre affiche, en une ligne ───────
create or replace function public.groupe_etat(p_slug text)
returns table (
  league_id        uuid,
  membres          integer,
  actifs           integer,
  ont_parie_jour   integer,
  taux_jour        numeric,
  bonus_jour       integer,
  ont_cinq_semaine integer,
  taux_semaine     numeric,
  recompenses      integer,
  manquants_jour   text[],
  manquants_semaine text[]
)
language sql stable security definer set search_path = public as $$
  with l as (select id from public.leagues where slug = p_slug),
  m as (
    select mb.user_id, p.alias
      from public.league_members mb
      join l on l.id = mb.league_id
      join public.profiles p on p.id = mb.user_id
  ),
  bornes as (
    select (current_date)::timestamptz                 as jour0,
           (current_date + 1)::timestamptz             as jour1,
           now() - interval '7 days'                   as actif0,
           public.debut_semaine()                      as sem0,
           public.debut_semaine() + interval '7 days'  as sem1
  ),
  etat as (
    select m.user_id, m.alias,
           public.a_parie(m.user_id, b.actif0, b.jour1)        as actif,
           public.a_parie(m.user_id, b.jour0,  b.jour1)        as joue_aujourdhui,
           public.nb_paris(m.user_id, b.sem0,  b.sem1) >= 5    as cinq_cette_semaine
      from m cross join bornes b
  ),
  somme as (
    select count(*)::integer                                               as membres,
           count(*) filter (where actif)::integer                          as actifs,
           count(*) filter (where actif and joue_aujourdhui)::integer      as ont_jour,
           count(*) filter (where actif and cinq_cette_semaine)::integer   as ont_sem,
           array_remove(array_agg(alias) filter (where actif and not joue_aujourdhui), null)      as manq_jour,
           array_remove(array_agg(alias) filter (where actif and not cinq_cette_semaine), null)   as manq_sem
      from etat
  )
  select (select id from l),
         s.membres,
         s.actifs,
         s.ont_jour,
         -- Un groupe sans actif a un taux de zéro, pas une division par zéro.
         case when s.actifs = 0 then 0 else round(s.ont_jour::numeric / s.actifs, 3) end,
         case when s.actifs = 0 or s.membres < 3 then 0
              else round(3 * s.ont_jour::numeric / s.actifs)::integer end,
         s.ont_sem,
         case when s.actifs = 0 then 0 else round(s.ont_sem::numeric / s.actifs, 3) end,
         -- Le podium : trois places à partir de cinq membres, une seule à
         -- trois ou quatre, aucune en dessous (Mehdi, 2026-10-10).
         case when s.membres >= 5 then 3 when s.membres >= 3 then 1 else 0 end,
         coalesce(s.manq_jour, '{}'),
         coalesce(s.manq_sem, '{}')
    from somme s;
$$;

revoke all on function public.groupe_etat(text) from public;
grant execute on function public.groupe_etat(text) to anon, authenticated;

-- ── Le versement quotidien ────────────────────────────────────────────────
-- Appelée par le cron du worker. Idempotente par la clé primaire : rejouer
-- la même journée ne verse rien de plus.
create or replace function public.verser_bonus_de_groupe()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_pose integer := 0;
begin
  with bornes as (
    select (current_date)::timestamptz     as jour0,
           (current_date + 1)::timestamptz as jour1,
           now() - interval '7 days'       as actif0
  ),
  -- L'état de chaque groupe d'au moins trois membres.
  groupes as (
    select mb.league_id,
           count(*) filter (where public.a_parie(mb.user_id, b.actif0, b.jour1))::numeric as actifs,
           count(*) filter (where public.a_parie(mb.user_id, b.actif0, b.jour1)
                              and public.a_parie(mb.user_id, b.jour0, b.jour1))::numeric as ont_joue,
           count(*) as membres
      from public.league_members mb cross join bornes b
     group by mb.league_id
    having count(*) >= 3
  ),
  taux as (
    select league_id, membres,
           case when actifs = 0 then 0 else ont_joue / actifs end as t
      from groupes
  ),
  -- LE MEILLEUR GROUPE DE CHAQUE JOUEUR, et lui seul. `distinct on` garde la
  -- première ligne de chaque joueur une fois trié par taux décroissant.
  meilleur as (
    select distinct on (mb.user_id)
           mb.user_id, tx.league_id, tx.t
      from public.league_members mb
      join taux tx on tx.league_id = mb.league_id
     cross join bornes b
     -- Seuls ceux qui ont eux-mêmes joué aujourd'hui touchent le bonus : il
     -- récompense la participation, pas l'appartenance.
     where public.a_parie(mb.user_id, b.jour0, b.jour1)
     order by mb.user_id, tx.t desc, tx.league_id
  ),
  -- LE CRÉDIT VIENT DU `returning` DE L'INSERTION, et de rien d'autre.
  -- Seules les lignes réellement posées en sortent : si le cron repasse, le
  -- `on conflict do nothing` n'en rend aucune et personne n'est recrédité.
  -- Une mise à jour séparée, elle, aurait repayé tout le monde à chaque
  -- passage — il n'existe aucune façon fiable de distinguer après coup une
  -- ligne neuve d'une ancienne.
  pose as (
    insert into public.group_bonus_paid (user_id, jour, league_id, crampons, taux)
    select m.user_id, current_date, m.league_id, round(3 * m.t)::integer, round(m.t, 3)
      from meilleur m
     where round(3 * m.t)::integer > 0
    on conflict (user_id, jour) do nothing
    returning user_id, crampons
  )
  update public.profiles p
     set crampons = p.crampons + x.crampons
    from pose x
   where x.user_id = p.id;

  get diagnostics v_pose = row_count;

  return v_pose;
end;
$$;

revoke all on function public.verser_bonus_de_groupe() from public;

-- ── Les distinctions ──────────────────────────────────────────────────────
-- ELLES NE SE STOCKENT PAS, ELLES SE DÉDUISENT. « La médaille reste 24 h, il
-- faut être encore premier demain pour la garder » décrit exactement un état
-- calculé : on la porte tant qu'on est sur le podium du jour. Pareil pour le
-- GOAT, qui est le vainqueur de la dernière semaine close. Rien à stocker,
-- rien à faire expirer, aucune dérive possible.
--
-- Un joueur peut être premier dans un groupe et quatrième dans un autre : on
-- affiche SA MEILLEURE distinction, celle dont il peut se vanter.
create or replace function public.distinctions(p_user uuid)
returns table (rang integer, goat boolean, groupe text)
language sql stable security definer set search_path = public as $$
  with bornes as (
    select (current_date)::timestamptz     as jour0,
           (current_date + 1)::timestamptz as jour1,
           public.debut_semaine() - interval '7 days' as sem_prec0,
           public.debut_semaine()                     as sem_prec1
  ),
  mes_groupes as (
    select mb.league_id, l.name
      from public.league_members mb
      join public.leagues l on l.id = mb.league_id
     where mb.user_id = p_user
  ),
  -- Le classement du JOUR dans chacun de mes groupes.
  jour as (
    select g.league_id, g.name, mb.user_id,
           coalesce((select sum(e.points) from public.ranking_events e
                      where e.user_id = mb.user_id
                        and e.created_at >= b.jour0 and e.created_at < b.jour1), 0) as pts
      from mes_groupes g
      join public.league_members mb on mb.league_id = g.league_id
     cross join bornes b
  ),
  mon_rang as (
    select j.name,
           (select count(*) + 1 from jour j2
             where j2.league_id = j.league_id and j2.pts > j.pts)::integer as r,
           j.pts
      from jour j
     where j.user_id = p_user
  ),
  -- Le vainqueur de la SEMAINE PRÉCÉDENTE, qui porte le GOAT sept jours.
  sem as (
    select g.league_id, g.name, mb.user_id,
           coalesce((select sum(e.points) from public.ranking_events e
                      where e.user_id = mb.user_id
                        and e.created_at >= b.sem_prec0 and e.created_at < b.sem_prec1), 0) as pts
      from mes_groupes g
      join public.league_members mb on mb.league_id = g.league_id
     cross join bornes b
  ),
  mon_goat as (
    select s.name
      from sem s
     where s.user_id = p_user and s.pts > 0
       and not exists (select 1 from sem s2 where s2.league_id = s.league_id and s2.pts > s.pts)
     limit 1
  )
  select r.r, (select count(*) from mon_goat) > 0, r.name
    from mon_rang r
   where r.r <= 3 and r.pts > 0
   order by r.r asc
   limit 1;
$$;

grant execute on function public.distinctions(uuid) to anon, authenticated;
