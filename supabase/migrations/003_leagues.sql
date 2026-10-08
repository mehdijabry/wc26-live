-- 003_leagues.sql — ligues privées entre amis
--
-- La brique qui manquait. Tout le reste du jeu existait déjà : comptes,
-- pronostics, barème, points, séries, classement général. Ce qui n'existait
-- pas, c'est la seule chose qui fait venir des gens sans les acheter — une
-- ligue qu'on crée en dix secondes et qu'on partage par lien à ses amis.
--
-- Un point de conception mérite d'être explicite. Le classement d'une ligue
-- NE reprend PAS `profiles.total_points`, qui est le cumul de toute la vie du
-- compte. Sinon rejoindre une ligue où quelqu'un joue depuis un an serait
-- perdu d'avance, et la ligue n'aurait aucun intérêt. On compte donc les
-- points gagnés DEPUIS L'ADHÉSION de chacun, ce qui met tout le monde à zéro
-- en entrant. C'est ce que fait `league_table()` plus bas.

-- 1. les ligues -------------------------------------------------------------
create table if not exists public.leagues (
  id          uuid primary key default gen_random_uuid(),
  -- Le slug sert de lien d'invitation : il doit être impossible à deviner,
  -- puisque c'est lui seul qui donne l'accès. Généré côté client sur 10
  -- caractères aléatoires.
  slug        text not null unique check (char_length(slug) between 6 and 32),
  name        text not null check (char_length(name) between 1 and 60),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists leagues_owner_idx on public.leagues (owner_id);

-- 2. les membres ------------------------------------------------------------
create table if not exists public.league_members (
  league_id   uuid not null references public.leagues(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index if not exists league_members_user_idx on public.league_members (user_id);

-- 3. RLS --------------------------------------------------------------------
alter table public.leagues        enable row level security;
alter table public.league_members enable row level security;

-- Lecture publique d'une ligue : la page d'invitation doit pouvoir afficher
-- le nom de la ligue AVANT que l'invité ait un compte. Ce qui protège une
-- ligue, c'est que son slug est imprévisible, pas qu'elle soit illisible.
drop policy if exists "leagues_read" on public.leagues;
create policy "leagues_read"   on public.leagues for select using (true);

-- On ne crée une ligue que pour soi-même.
drop policy if exists "leagues_insert_own" on public.leagues;
create policy "leagues_insert_own" on public.leagues for insert
  with check (auth.uid() = owner_id);

-- Seul le propriétaire renomme ou supprime.
drop policy if exists "leagues_update_own" on public.leagues;
create policy "leagues_update_own" on public.leagues for update using (auth.uid() = owner_id);
drop policy if exists "leagues_delete_own" on public.leagues;
create policy "leagues_delete_own" on public.leagues for delete using (auth.uid() = owner_id);

-- Les adhésions sont lisibles : c'est ce qui permet d'afficher un classement.
-- Elles ne contiennent qu'un identifiant et une date, et les pseudos sont
-- déjà publics via `profiles`.
drop policy if exists "members_read" on public.league_members;
create policy "members_read"   on public.league_members for select using (true);

-- On ne s'inscrit que soi-même, et on ne peut partir que soi-même.
drop policy if exists "members_join_self" on public.league_members;
create policy "members_join_self" on public.league_members for insert
  with check (auth.uid() = user_id);
drop policy if exists "members_leave_self" on public.league_members;
create policy "members_leave_self" on public.league_members for delete
  using (auth.uid() = user_id);

-- 4. le classement d'une ligue ----------------------------------------------
-- `security definer` est nécessaire et assumé : `predictions` est en lecture
-- strictement personnelle (`auth.uid() = user_id`), donc aucune vue ordinaire
-- ne peut additionner les points des autres membres. Cette fonction contourne
-- ce verrou pour une seule chose — une somme de points par joueur — et ne
-- renvoie que des informations déjà publiques : pseudo, avatar, total.
-- Elle ne laisse jamais filtrer un pronostic individuel.
create or replace function public.league_table(p_slug text)
returns table (
  user_id   uuid,
  alias     text,
  avatar_url text,
  country   text,
  points    int,
  resolved  int,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.alias,
         p.avatar_url,
         p.country,
         coalesce(sum(pr.points), 0)::int                as points,
         count(pr.id)::int                               as resolved,
         m.joined_at
    from public.leagues l
    join public.league_members m on m.league_id = l.id
    join public.profiles p       on p.id = m.user_id
    -- Seuls les pronostics postérieurs à l'adhésion comptent : tout le monde
    -- entre à zéro, et une ligue créée aujourd'hui reste jouable.
    left join public.predictions pr
           on pr.user_id = p.id
          and pr.points is not null
          and pr.created_at >= m.joined_at
   where l.slug = p_slug
   group by p.id, p.alias, p.avatar_url, p.country, m.joined_at
   order by points desc, m.joined_at asc;
$$;

revoke all on function public.league_table(text) from public;
grant execute on function public.league_table(text) to anon, authenticated;
