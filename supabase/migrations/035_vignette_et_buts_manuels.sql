-- 035 — LA VIGNETTE D'UNE VIDÉO, ET LES BUTS SAISIS À LA MAIN
--
-- Deux corrections constatées le 17/10/2026 en publiant un but de X depuis
-- le panneau d'administration.
--
-- ─── 1. LA VIGNETTE NE SE DÉDUIT PAS TOUJOURS DE L'IDENTIFIANT ────────────
-- Pour YouTube, elle se calcule : i.ytimg.com/vi/<id>/maxresdefault.jpg.
-- Pour X, non — il faut la demander au point de syndication, et rien ne
-- garantit qu'il réponde encore dans six mois. Or l'image de partage de
-- /v/<id> en a besoin à chaque rendu : sans elle, la fenêtre du gabarit
-- sort NOIRE, ce qui est exactement ce qu'on cherchait à éviter en passant
-- au post de lien. On la range donc au moment où on l'a.
--
-- Elle sert aussi au site : les cartes de /buts et /resumes n'affichaient
-- rien pour une source X, faute de pouvoir deviner l'adresse.

alter table public.videos_matchs add column if not exists vignette text;

-- ─── 2. UN BUT SAISI À LA MAIN N'A PAS DE MATCH ESPN ──────────────────────
-- `videos_recentes` exigeait `match_id is not null`. Le filtre avait un
-- sens : un résumé non rattaché est une compilation de journée (« EVERY
-- Weekend Goal »), pas un match, et il n'a rien à faire sur la page. Mais
-- un but publié depuis l'admin n'a PAS de match_id — il est choisi à la
-- main par Mehdi — et il était donc invisible sur /buts quoi qu'il arrive.
--
-- La règle devient : on montre ce qui est rattaché à un match, ET tout ce
-- qui a été saisi à la main. Ce qui reste écarté est exactement ce que le
-- filtre visait : un clip détecté automatiquement sans match reconnu.

drop function if exists public.videos_recentes(text, integer);

create function public.videos_recentes(p_kind text default null, p_limite integer default 30)
returns table (
  video_id text, source text, kind text, titre text, description text,
  publie_at timestamptz, match_id text, competition text,
  equipe_dom text, equipe_ext text, score_dom integer, score_ext integer,
  buteur text, minute text, vignette text
)
language sql stable security definer set search_path = public as $$
  select v.video_id, v.source, v.kind, v.titre, v.description,
         v.publie_at, v.match_id, v.competition,
         v.equipe_dom, v.equipe_ext, v.score_dom, v.score_ext,
         v.buteur, v.minute, v.vignette
    from public.videos_matchs v
   where (p_kind is null or v.kind = p_kind)
     and (v.match_id is not null or v.source like '%manuel%')
   order by v.publie_at desc
   limit greatest(1, least(coalesce(p_limite, 30), 100))
$$;

revoke all on function public.videos_recentes(text, integer) from public, anon, authenticated;
grant execute on function public.videos_recentes(text, integer) to anon, authenticated;
