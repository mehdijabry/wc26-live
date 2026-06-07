-- WC26 Hub — initial schema
-- Run this in the Supabase SQL editor of a fresh project.
-- Auth is the default Supabase email/magic-link provider.

-- 1. profiles ------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  alias           text unique,
  country         text,
  avatar_url      text,
  total_points    integer not null default 0,
  total_predictions integer not null default 0,
  resolved_predictions integer not null default 0,
  accuracy_pct    numeric(5,2) not null default 0,
  current_streak  integer not null default 0,
  best_streak     integer not null default 0,
  tier            text not null default 'Rookie',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, alias)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'alias',
      'fan_' || substr(new.id::text, 1, 6)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. predictions -------------------------------------------------------------
create table if not exists public.predictions (
  id              bigserial primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  match_id        text not null,           -- e.g. 'M01', 'R32-1', 'FINAL'
  home_score      integer not null check (home_score >= 0 and home_score <= 30),
  away_score      integer not null check (away_score >= 0 and away_score <= 30),
  -- richer predictions (v2)
  scorer_ids      text[],                  -- array of player ids
  card_player_ids text[],
  -- bookkeeping
  points          integer,                 -- computed once result is in
  points_breakdown jsonb,                  -- {exact:0, winner:30, ...}
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, match_id)
);

drop trigger if exists predictions_updated_at on public.predictions;
create trigger predictions_updated_at
  before update on public.predictions
  for each row execute function public.set_updated_at();

-- 3. match_results ----------------------------------------------------------
-- Populated from the ESPN/FIFA worker proxy when a match ends.
create table if not exists public.match_results (
  match_id        text primary key,
  home_score      integer not null,
  away_score      integer not null,
  scorer_ids      text[] not null default '{}',
  card_player_ids text[] not null default '{}',
  finished_at     timestamptz not null default now()
);

-- 4. scoring function -------------------------------------------------------
-- Returns points + breakdown for a given prediction vs a result.
create or replace function public.compute_points(
  p_home int, p_away int,
  r_home int, r_away int
)
returns table (points int, breakdown jsonb) language plpgsql as $$
declare
  pts int := 0;
  brk jsonb := '{}'::jsonb;
  p_winner int := case
    when p_home > p_away then 1
    when p_home < p_away then -1
    else 0 end;
  r_winner int := case
    when r_home > r_away then 1
    when r_home < r_away then -1
    else 0 end;
  p_total int := p_home + p_away;
  r_total int := r_home + r_away;
  p_diff int := p_home - p_away;
  r_diff int := r_home - r_away;
begin
  if p_home = r_home and p_away = r_away then
    pts := 100;
    brk := jsonb_build_object('exact', 100);
  elsif p_winner = r_winner and p_winner != 0 and p_diff = r_diff then
    pts := 60;
    brk := jsonb_build_object('winner', 30, 'goal_diff', 30);
  elsif p_winner = r_winner then
    pts := 30;
    brk := jsonb_build_object('winner', 30);
  elsif p_total = r_total then
    pts := 20;
    brk := jsonb_build_object('total_goals', 20);
  else
    pts := 0;
    brk := jsonb_build_object('miss', 0);
  end if;
  return query select pts, brk;
end;
$$;

-- 5. trigger: when a match_result lands, score every prediction for it -----
create or replace function public.score_predictions_on_result()
returns trigger language plpgsql as $$
declare
  p record;
  c record;
begin
  for p in
    select * from public.predictions where match_id = new.match_id and points is null
  loop
    select * into c from public.compute_points(
      p.home_score, p.away_score, new.home_score, new.away_score
    );
    update public.predictions
      set points = c.points, points_breakdown = c.breakdown
      where id = p.id;

    -- profile rollup
    update public.profiles
      set total_points         = total_points + c.points,
          resolved_predictions = resolved_predictions + 1,
          accuracy_pct         = round(
            (total_points + c.points)::numeric
             / ((resolved_predictions + 1) * 100) * 100, 2
          ),
          current_streak       = case when c.points >= 30 then current_streak + 1 else 0 end,
          best_streak          = greatest(best_streak,
            case when c.points >= 30 then current_streak + 1 else best_streak end),
          tier = case
            when total_points + c.points >= 10000 then 'Legend'
            when total_points + c.points >= 5000  then 'Elite'
            when total_points + c.points >= 2000  then 'Pro'
            when total_points + c.points >= 500   then 'Amateur'
            else 'Rookie' end
      where id = p.user_id;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_score_on_result on public.match_results;
create trigger trg_score_on_result
  after insert or update on public.match_results
  for each row execute function public.score_predictions_on_result();

-- 6. increment total_predictions when a prediction is created --------------
create or replace function public.bump_total_predictions()
returns trigger language plpgsql as $$
begin
  update public.profiles
    set total_predictions = total_predictions + 1
    where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_total on public.predictions;
create trigger trg_bump_total
  after insert on public.predictions
  for each row execute function public.bump_total_predictions();

-- 7. RLS --------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.predictions   enable row level security;
alter table public.match_results enable row level security;

-- profiles: everyone reads (public leaderboard), user writes their own row
create policy "profiles_read_all"    on public.profiles for select using (true);
create policy "profiles_write_own"   on public.profiles for update using (auth.uid() = id);

-- predictions: user reads & writes only their own
create policy "predictions_read_own" on public.predictions for select using (auth.uid() = user_id);
create policy "predictions_insert_own" on public.predictions for insert with check (auth.uid() = user_id);
create policy "predictions_update_own" on public.predictions for update using (auth.uid() = user_id);

-- match_results: read-only public, write reserved to service role
create policy "match_results_read"   on public.match_results for select using (true);

-- 8. leaderboard view -------------------------------------------------------
create or replace view public.leaderboard as
  select id, alias, country, avatar_url,
         total_points, resolved_predictions, accuracy_pct, current_streak, best_streak, tier
    from public.profiles
   where resolved_predictions > 0
   order by total_points desc, accuracy_pct desc
   limit 100;

grant select on public.leaderboard to anon, authenticated;
