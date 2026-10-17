-- 034 — LES VIDÉOS DE MATCH : buts et résumés
--
-- Mehdi, 17/10/2026 : republier les buts et les résumés que les comptes
-- officiels et les diffuseurs mettent en ligne, en mini-article avec
-- l'embed, puis une carte Facebook qui donne envie de voir le but.
--
-- ─── CE QUE CETTE TABLE EST, ET N'EST PAS ─────────────────────────────────
-- Elle ne stocke AUCUNE vidéo : seulement l'identifiant YouTube, le type, et
-- le match auquel on a su la rattacher. La vidéo reste chez l'ayant droit,
-- qui garde ses vues — c'est ce qui rend l'opération légitime, et c'est
-- aussi pour ça qu'on ne reverse jamais un clip sur notre page Facebook.
--
-- ─── POURQUOI UN TYPE, ET PAS UN BOOLÉEN ──────────────────────────────────
-- Relevé du 17/10 : beIN publie TROIS versions du même match — QUICK,
-- normale, EXTENDED — à quelques minutes d'écart, et la Serie A publie la
-- sienne en italien ET en anglais. Elles ne se remplacent pas : Mehdi veut
-- la principale dans le post et les autres en commentaire. Il faut donc
-- pouvoir les distinguer, pas seulement dédoublonner.

create table if not exists public.videos_matchs (
  id          bigserial primary key,
  -- L'identifiant YouTube : clé naturelle, et garde-fou contre le doublon
  -- quand le worker repasse sur la même page de mises en ligne.
  video_id    text not null unique,
  source      text not null,          -- 'fubo' | 'bein' | 'dazn' | 'seriea' | …
  -- 'but' | 'resume' | 'resume_long' | 'resume_court' | 'autre'
  kind        text not null,
  titre       text not null,
  description text,
  publie_at   timestamptz not null,

  -- Ce à quoi on a su le rattacher. Tout est nullable : un clip non
  -- rattaché se garde quand même, parce qu'une passe ultérieure (ou une
  -- correction de normalisation) peut le rattacher plus tard.
  match_id    text,                   -- l'identifiant ESPN, comme bet_legs
  competition text,
  equipe_dom  text,
  equipe_ext  text,
  score_dom   integer,
  score_ext   integer,
  -- Pour un but : qui, et à quelle minute — repris de NOTRE détection ESPN,
  -- jamais deviné depuis le titre.
  buteur      text,
  minute      text,

  -- Ce qu'on en a fait. Séparé de la détection : une vidéo peut être
  -- rattachée sans avoir encore été publiée, et republier ne doit jamais
  -- dépendre d'un drapeau perdu dans le KV.
  publie_site boolean not null default false,
  publie_fb   boolean not null default false,
  fb_post_id  text,

  created_at  timestamptz not null default now()
);

create index if not exists videos_matchs_match_idx on public.videos_matchs (match_id, kind);
create index if not exists videos_matchs_recent_idx on public.videos_matchs (publie_at desc);
create index if not exists videos_matchs_a_publier_idx
  on public.videos_matchs (publie_at desc) where not publie_fb;

alter table public.videos_matchs enable row level security;

-- Le site les affiche : la lecture est publique, comme les articles.
drop policy if exists videos_lecture on public.videos_matchs;
create policy videos_lecture on public.videos_matchs for select using (true);

-- Aucune écriture par le client : seul le worker écrit, avec la clé de
-- service, et lui ne passe pas par les policies.
revoke all on public.videos_matchs from anon, authenticated;
grant select on public.videos_matchs to anon, authenticated;

-- ─── LECTURE POUR LE SITE ─────────────────────────────────────────────────
-- Les buts récents, les plus frais d'abord. `p_kind` null = tout.
create or replace function public.videos_recentes(p_kind text default null, p_limite integer default 30)
returns table (
  video_id text, source text, kind text, titre text, description text,
  publie_at timestamptz, match_id text, competition text,
  equipe_dom text, equipe_ext text, score_dom integer, score_ext integer,
  buteur text, minute text
)
language sql stable security definer set search_path = public as $$
  select v.video_id, v.source, v.kind, v.titre, v.description,
         v.publie_at, v.match_id, v.competition,
         v.equipe_dom, v.equipe_ext, v.score_dom, v.score_ext,
         v.buteur, v.minute
    from public.videos_matchs v
   where (p_kind is null or v.kind = p_kind)
     and v.match_id is not null
   order by v.publie_at desc
   limit greatest(1, least(coalesce(p_limite, 30), 100))
$$;

grant execute on function public.videos_recentes(text, integer) to anon, authenticated;
