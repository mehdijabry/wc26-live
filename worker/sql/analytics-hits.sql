-- Real-visitor analytics (2026-08-31).
-- One row per pageview, written by the worker's public /hit endpoint
-- (beacon sent from the site on every page load / SPA navigation).
-- Country comes from Cloudflare's request.cf.country — no client IP is
-- ever stored. Unlike the Cloudflare zone analytics (requests), this
-- only counts real browser sessions: bots and API polls are filtered.
create table if not exists public.hits (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  country text,          -- ISO-3166 alpha-2 from Cloudflare
  path text,             -- pathname only, no query string
  source text,           -- facebook / google / direct / internal / …
  lang text,             -- site language at hit time (en/fr/ar)
  new_session boolean not null default false
);

create index if not exists hits_ts_idx on public.hits (ts desc);

-- Service-role key bypasses RLS; enabling it with no policies blocks
-- any anon access.
alter table public.hits enable row level security;
