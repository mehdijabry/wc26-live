-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 026 — LE GENRE D'UN ARTICLE                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- La page /news mêle deux choses que rien ne distingue : les dépêches
-- réécrites par le pipeline RSS, et les « Football Stories » — des récits
-- vérifiés à la main, écrits pour être lus des mois plus tard. Un visiteur
-- qui cherche l'actualité du jour tombe sur un récit de 1974, et l'inverse.
--
-- ── POURQUOI UNE COLONNE PLUTÔT QU'UNE DÉDUCTION ──────────────────────────
-- On POURRAIT deviner : les récits ont un slug qui commence par « story- »
-- et une source « Pressing 90' · Football Stories ». Mais ce sont des
-- conventions de nommage, pas des déclarations : le jour où un slug change,
-- le tri se casse en silence et personne ne s'en aperçoit.
--
-- Or le worker SAIT ce qu'il fabrique au moment où il l'insère — il n'a pas
-- à le deviner, il n'a qu'à le dire. C'est ce que cette colonne lui permet.

alter table public.articles
  add column if not exists kind text not null default 'news'
    check (kind in ('news', 'story', 'analysis'));

-- Rattrapage de l'existant, par la convention de slug qui a cours jusqu'ici.
-- C'est la SEULE fois où l'on devine : après cette migration, c'est le
-- worker qui déclare.
update public.articles set kind = 'story' where slug like 'story-%' and kind = 'news';

-- La page publique lit par genre et par date : sans cet index, chaque
-- ouverture de /news balaie toute la table.
create index if not exists articles_kind_published_idx
  on public.articles (kind, published_at desc nulls last)
  where status = 'published';

comment on column public.articles.kind is
  'Ce que le worker a produit : news (dépêche réécrite), story (récit '
  'vérifié à la main), analysis. Déclaré à l''insertion, jamais deviné.';
