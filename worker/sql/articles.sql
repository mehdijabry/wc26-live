-- Articles table for the auto-news pipeline.
-- Run this in Supabase SQL editor before deploying the news worker.
--
-- Lifecycle:
--   1. Worker cron fetches news, picks best, AI-rewrites, inserts as 'draft'
--   2. Mehdi gets an email with admin panel link to approve / reject
--   3. Approve → status='published', published_at=now()
--   4. Reject → status='archived' (kept for audit, hidden from public)

create table if not exists articles (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  excerpt     text,
  body        text not null,
  image_url   text,
  source_url  text not null,
  source_name text not null,
  -- Short "Based on reporting by X — link" string we embed at the end.
  source_attribution text,
  -- draft (awaiting approval) | published | archived
  status      text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  -- 0-100 score from the news ranker (kept for debugging the algorithm).
  score       numeric,
  created_at  timestamptz not null default now(),
  published_at timestamptz,
  archived_at  timestamptz
);

create index if not exists articles_status_created_at_idx
  on articles (status, created_at desc);

create index if not exists articles_slug_idx on articles (slug);

-- Row-level security: anon can read PUBLISHED only, service role does everything.
alter table articles enable row level security;

drop policy if exists "articles_public_read" on articles;
create policy "articles_public_read"
  on articles for select
  using (status = 'published');
