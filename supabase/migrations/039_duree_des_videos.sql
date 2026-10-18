-- 039 — LA DURÉE D'UNE VIDÉO
--
-- Mehdi, 18/10/2026, en voyant la playlist d'une journée : « distingue-les
-- grâce à la durée, et crée deux sections distinctes ».
--
-- ─── CE QUE LA PAGE MONTRAIT ──────────────────────────────────────────────
-- Un match a souvent DEUX vidéos : le résumé court et l'extended. Les deux
-- cartes portent les mêmes équipes, la même vignette et la même heure — à
-- la lecture, un doublon. Le `kind` les sépare déjà en base, mais il ne dit
-- rien au visiteur : « resume » contre « resume_long » n'est pas une
-- information, « 2:14 » contre « 9:48 » en est une.
--
-- ─── POURQUOI EN SECONDES, ET PAS EN ISO 8601 ─────────────────────────────
-- YouTube rend « PT9M48S ». Le ranger tel quel obligerait chaque lecteur —
-- la page, le worker, un futur tri — à refaire l'analyse, et interdirait de
-- trier ou de comparer en SQL. On analyse UNE fois, à l'écriture.
--
-- NULL = pas encore mesuré, et c'est un état à part entière : une vidéo X
-- n'a pas de durée chez YouTube et n'en aura jamais. L'affichage n'écrit
-- rien plutôt que « 0:00 ».

alter table public.videos_matchs add column if not exists duree_s integer;

-- ─── LES DEUX LECTURES PUBLIQUES REPRENNENT LA COLONNE ───────────────────
-- Le type de retour change, donc DROP avant CREATE (42P13). C'est la même
-- manœuvre qu'en 037 pour `embarquable`.

drop function if exists public.videos_recentes(text, integer);

create function public.videos_recentes(p_kind text default null, p_limite integer default 30)
returns table (
  video_id text, source text, kind text, titre text, description text,
  publie_at timestamptz, match_id text, competition text,
  equipe_dom text, equipe_ext text, score_dom integer, score_ext integer,
  buteur text, minute text, vignette text, embarquable boolean, duree_s integer
)
language sql stable security definer set search_path = public as $$
  select v.video_id, v.source, v.kind, v.titre, v.description,
         v.publie_at, v.match_id, v.competition,
         v.equipe_dom, v.equipe_ext, v.score_dom, v.score_ext,
         v.buteur, v.minute, v.vignette, v.embarquable, v.duree_s
    from public.videos_matchs v
   where (p_kind is null or v.kind = p_kind)
     and (v.match_id is not null or v.source like '%manuel%')
   order by v.publie_at desc
   limit greatest(1, least(coalesce(p_limite, 30), 100))
$$;

revoke all on function public.videos_recentes(text, integer) from public, anon, authenticated;
grant execute on function public.videos_recentes(text, integer) to anon, authenticated;

drop function if exists public.videos_du_jour(date, text);

create function public.videos_du_jour(p_jour date, p_kind text default null)
returns table (
  video_id text, source text, kind text, titre text, description text,
  publie_at timestamptz, match_id text, competition text,
  equipe_dom text, equipe_ext text, score_dom integer, score_ext integer,
  buteur text, minute text, vignette text, embarquable boolean, duree_s integer
)
language sql stable security definer set search_path = public as $$
  select v.video_id, v.source, v.kind, v.titre, v.description,
         v.publie_at, v.match_id, v.competition,
         v.equipe_dom, v.equipe_ext, v.score_dom, v.score_ext,
         v.buteur, v.minute, v.vignette, v.embarquable, v.duree_s
    from public.videos_matchs v
   where (v.publie_at at time zone 'UTC')::date = p_jour
     and (p_kind is null or v.kind = p_kind)
     and (v.match_id is not null or v.source like '%manuel%')
   order by v.publie_at desc
   limit 200
$$;

revoke all on function public.videos_du_jour(date, text) from public, anon, authenticated;
grant execute on function public.videos_du_jour(date, text) to anon, authenticated;
