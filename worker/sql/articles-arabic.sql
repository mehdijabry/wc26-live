-- Adds Arabic translation columns to the articles table (bilingual EN/AR).
-- Run once in the Supabase SQL editor (project → SQL → New query).
--
-- Nullable on purpose: articles created before the Arabic switch was
-- turned on (or while it's off) simply have NULLs and render EN-only.
-- The site shows the EN/AR toggle only when title_ar AND body_ar are set.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS title_ar   TEXT,
  ADD COLUMN IF NOT EXISTS excerpt_ar TEXT,
  ADD COLUMN IF NOT EXISTS body_ar    TEXT;
