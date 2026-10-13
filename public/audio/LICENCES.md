# Musiques des reels — provenance et licences

Le studio va chercher ces fichiers sur `https://pressing90.live/audio/`
(voir `MUSIC` dans `studio/video.js`). Ne jamais remplacer un fichier sans
noter ici d'où vient le nouveau : une piste dont on ignore la provenance ne
peut plus être défendue si Meta la revendique.

Pour poser une nouvelle piste :
`node scripts/poser-musique.mjs "<source>" <nom.m4a> 60`
— elle est alors normalisée à −12,4 LUFS, le niveau auquel le gain fixe du
studio a été réglé.

| Fichier | Usage | Provenance |
|---|---|---|
| `matchday2.m4a` | Reels **matchs du jour** et **soirées de Ligue des champions** | [PASHA SAMETS](https://pixabay.com/fr/users/sametspasha-42749143/) sur [Pixabay](https://pixabay.com/music/) — piste `217806` |
| `scores.m4a` | Reels **résultats** | [PASHA SAMETS](https://pixabay.com/fr/users/sametspasha-42749143/) sur [Pixabay](https://pixabay.com/music/) — piste `212450` |
| `matchday.m4a` | Reels de **but** (format validé à part) | — à documenter |
| `articles.m4a` | Reels d'articles | — à documenter |
| `stories.m4a` | Stories | — à documenter |
| `tales.m4a` | Football Stories | — à documenter |

## Licence Pixabay

Les deux pistes de PASHA SAMETS relèvent de la **licence de contenu
Pixabay** : usage commercial autorisé, **attribution non obligatoire**.

Elles ne sont donc PAS créditées dans les légendes des reels, et c'est
délibéré : la légende tient entre 200 et 400 caractères — mesuré le
11/10/2026, 334 caractères pour le reel à 1 036 vues contre 575 pour celui
à 217 — et une ligne de crédit non exigée mangerait cette marge.

Mention fournie par Pixabay, si on veut tout de même créditer :

> Music by PASHA SAMETS from Pixabay

À ne pas confondre avec **Uppbeat**, dont la licence rend le crédit
OBLIGATOIRE : c'est le cas de la musique des reconstitutions de buts
(code `UHBKKEMPL5OBSULI`), ajoutée dans CapCut et non ici.
