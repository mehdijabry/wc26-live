-- 037 — UNE VIDÉO QUI NE SE LAISSE PAS EMBARQUER
--
-- Mehdi, 18/10/2026 : « aperçu LaLiga pas disponible, que faire ? ». La
-- page /v/<id> d'un résumé LaLiga affiche le message de YouTube : « Cette
-- vidéo inclut du contenu de LaLiga, qui a bloqué sa diffusion sur ce site
-- Web ou dans cette application ».
--
-- Ce n'est pas une panne de notre côté : l'ayant droit interdit la lecture
-- hors de YouTube. On ne peut pas la contourner, et on ne cherchera pas à
-- le faire — c'est la même ligne que pour le fichier mp4 de X.
--
-- Ce qu'on PEUT faire, c'est cesser d'afficher un lecteur mort. Il faut
-- pour cela savoir, AVANT de rendre la page, si la vidéo acceptera d'être
-- embarquée. L'API YouTube le dit dans `status.embeddable`, pour une unité
-- de quota par cinquante vidéos.
--
-- NULL = pas encore mesuré. On ne met pas `true` par défaut : « on ne sait
-- pas » et « ça marche » sont deux états différents, et confondre les deux
-- est exactement ce qui fait afficher un lecteur mort.

alter table public.videos_matchs add column if not exists embarquable boolean;

-- La lecture publique passe par `videos_recentes` : on la refait avec la
-- colonne. Le type de retour change, donc il faut DROP avant (42P13).
drop function if exists public.videos_recentes(text, integer);

create function public.videos_recentes(p_kind text default null, p_limite integer default 30)
returns table (
  video_id text, source text, kind text, titre text, description text,
  publie_at timestamptz, match_id text, competition text,
  equipe_dom text, equipe_ext text, score_dom integer, score_ext integer,
  buteur text, minute text, vignette text, embarquable boolean
)
language sql stable security definer set search_path = public as $$
  select v.video_id, v.source, v.kind, v.titre, v.description,
         v.publie_at, v.match_id, v.competition,
         v.equipe_dom, v.equipe_ext, v.score_dom, v.score_ext,
         v.buteur, v.minute, v.vignette, v.embarquable
    from public.videos_matchs v
   where (p_kind is null or v.kind = p_kind)
     and (v.match_id is not null or v.source like '%manuel%')
   order by v.publie_at desc
   limit greatest(1, least(coalesce(p_limite, 30), 100))
$$;

revoke all on function public.videos_recentes(text, integer) from public, anon, authenticated;
grant execute on function public.videos_recentes(text, integer) to anon, authenticated;
