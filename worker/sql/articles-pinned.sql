-- Adds the `pinned_to_home` flag to the articles table.
-- Run this once in the Supabase SQL editor (project → SQL → New query).
--
-- Default = TRUE so any article published BEFORE we shipped this flag
-- shows on home automatically (matches the prior behaviour). The admin
-- panel News tab adds a pin/unpin toggle per article.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS pinned_to_home BOOLEAN NOT NULL DEFAULT true;

-- Index for the home page query (NewsTicker filters by this flag +
-- status = 'published' and orders by published_at desc).
CREATE INDEX IF NOT EXISTS articles_pinned_home_idx
  ON public.articles (pinned_to_home, status, published_at DESC);
