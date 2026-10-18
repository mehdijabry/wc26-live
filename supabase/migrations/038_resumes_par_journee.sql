-- 038 — LES RÉSUMÉS SE RANGENT PAR JOURNÉE
--
-- Mehdi, 18/10/2026 : « les résumés dans le site doivent être classés par
-- dates et chaque date agit comme une playlist qui a un lien propre, et
-- c'est ce lien qu'on va publier en commentaire ».
--
-- ─── POURQUOI UNE ADRESSE PAR JOURNÉE ────────────────────────────────────
-- Facebook pénalise les publications qui font quitter son fil : les liens
-- quittent la description et passent en premier commentaire. On publie donc
-- un seul post par jour, et ce post a besoin d'une adresse qui désigne
-- EXACTEMENT sa journée — pas « les résumés récents », qui aura changé
-- demain. Une journée devient une playlist, elle a son lien, et elle reste
-- juste quand on la rouvre un mois plus tard.
--
-- ─── LE JOUR EST EN UTC ──────────────────────────────────────────────────
-- Comme partout ailleurs ici (voir `jourDuJeu()` côté site) : `publie_at`
-- est un timestamptz et le découpage se fait sur sa date UTC. Un découpage
-- au fuseau du lecteur donnerait deux playlists différentes pour le même
-- post selon qui l'ouvre, et le lien publié en commentaire renverrait
-- parfois sur une journée vide.
--
-- ─── LE FILTRE EST CELUI DE `videos_recentes`, MOT POUR MOT ──────────────
-- « rattaché à un match OU saisi à la main » (voir 035). Ne pas en inventer
-- un autre ici : une page de journée qui montrerait autre chose que la page
-- /resumes serait un piège à la première divergence.

create index if not exists videos_matchs_jour_idx
  on public.videos_matchs (((publie_at at time zone 'UTC')::date), kind);

-- ─── LES JOURNÉES QUI ONT QUELQUE CHOSE ──────────────────────────────────
-- Sert l'index des playlists : une ligne par jour, avec son compte.
create or replace function public.jours_de_videos(p_kind text default null, p_limite integer default 30)
returns table (jour date, nombre bigint)
language sql stable security definer set search_path = public as $$
  select (v.publie_at at time zone 'UTC')::date as jour, count(*) as nombre
    from public.videos_matchs v
   where (p_kind is null or v.kind = p_kind)
     and (v.match_id is not null or v.source like '%manuel%')
   group by 1
   order by 1 desc
   limit greatest(1, least(coalesce(p_limite, 30), 120))
$$;

revoke all on function public.jours_de_videos(text, integer) from public, anon, authenticated;
grant execute on function public.jours_de_videos(text, integer) to anon, authenticated;

-- ─── UNE JOURNÉE ─────────────────────────────────────────────────────────
-- Les mêmes colonnes que `videos_recentes`, pour que la page n'ait qu'un
-- seul type à connaître.
create or replace function public.videos_du_jour(p_jour date, p_kind text default null)
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
   where (v.publie_at at time zone 'UTC')::date = p_jour
     and (p_kind is null or v.kind = p_kind)
     and (v.match_id is not null or v.source like '%manuel%')
   order by v.publie_at desc
   limit 200
$$;

revoke all on function public.videos_du_jour(date, text) from public, anon, authenticated;
grant execute on function public.videos_du_jour(date, text) to anon, authenticated;
