-- WC26 Hub — full-bracket prediction schema (v2)
-- Run this AFTER 001_init.sql.

create table if not exists public.bracket_predictions (
  id              bigserial primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,

  -- Group standings: { "A": ["MAR","MEX","AUS","CAN"], "B":[...], ... } (12 keys)
  group_standings jsonb not null default '{}',

  -- Best 8 third-placed teams advancing to R32 (team codes)
  third_place_advancing text[] not null default '{}',

  -- KO stage winners: { "R32-1": "MAR", "R16-1": "MAR", ..., "FINAL": "MAR" }
  ko_winners      jsonb not null default '{}',

  third_place_winner text,    -- 3rd place playoff winner
  final_winner    text,       -- ultimate winner

  -- Sharing
  is_published    boolean not null default false,
  share_slug      text unique,

  -- Scoring (computed once results come in; nullable until then)
  total_points    integer,
  group_points    integer,
  ko_points       integer,
  final_points    integer,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One bracket per user (latest revision)
  unique (user_id)
);

drop trigger if exists bracket_predictions_updated_at on public.bracket_predictions;
create trigger bracket_predictions_updated_at
  before update on public.bracket_predictions
  for each row execute function public.set_updated_at();

-- RLS
alter table public.bracket_predictions enable row level security;

-- Owner reads/writes their own
create policy "bracket_own_select"  on public.bracket_predictions for select using (auth.uid() = user_id);
create policy "bracket_own_insert"  on public.bracket_predictions for insert with check (auth.uid() = user_id);
create policy "bracket_own_update"  on public.bracket_predictions for update using (auth.uid() = user_id);
create policy "bracket_own_delete"  on public.bracket_predictions for delete using (auth.uid() = user_id);

-- Public can read published brackets only
create policy "bracket_public_read" on public.bracket_predictions for select using (is_published);

-- Public view: brackets joined with alias for shareable URLs
create or replace view public.public_brackets as
  select b.id,
         b.user_id,
         p.alias,
         p.tier,
         p.country,
         p.avatar_url,
         b.share_slug,
         b.group_standings,
         b.third_place_advancing,
         b.ko_winners,
         b.third_place_winner,
         b.final_winner,
         b.total_points,
         b.created_at,
         b.updated_at
    from public.bracket_predictions b
    join public.profiles p on p.id = b.user_id
   where b.is_published;

grant select on public.public_brackets to anon, authenticated;
