-- Web Push subscription store. Each row = one (browser, device) pair.
-- The endpoint is the canonical unique key — push services issue a new
-- one every time the user re-subscribes, so upserting on endpoint stays
-- idempotent.
--
-- Run against pressing90.live Supabase project:
--   psql "$SUPABASE_DB_URL" < this-file.sql
-- Or paste into the Supabase Dashboard SQL editor.

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  lang       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh on every upsert
create or replace function public.touch_push_subs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_push_subs_updated_at on public.push_subscriptions;
create trigger trg_push_subs_updated_at
  before update on public.push_subscriptions
  for each row execute function public.touch_push_subs_updated_at();

-- The Cloudflare Worker uses the service-role key so RLS doesn't apply
-- to its requests, but we still lock the table down for the client-side
-- anon key — no one should be able to read other people's subscriptions
-- from the public site.
alter table public.push_subscriptions enable row level security;

drop policy if exists "no anon access" on public.push_subscriptions;
create policy "no anon access" on public.push_subscriptions
  for all using (false) with check (false);
