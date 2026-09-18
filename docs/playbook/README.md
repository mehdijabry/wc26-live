# Playbook contenu — TikTok, Pinterest, KPIs (2026)

Trois recherches intégrées **telles quelles** (Mehdi, 18/09/2026) :

| Fichier | Sujet |
|---|---|
| `1-tiktok-algorithme-viralite-seo-miniatures.md` | Algorithme TikTok 2026, viralité, TikTok SEO, miniatures |
| `2-pinterest-algorithme-trends-motscles-conversion.md` | Pinterest : piliers de classement, Trends, mots-clés, images, conversion |
| `3-analyse-kpis-tiktok-pinterest-leviers.md` | Hiérarchie des KPIs, diagnostics, leviers, rythme d'analyse |

Ils sont rédigés pour Cradly (parentalité UK) ; les principes sont génériques et s'appliquent à Pressing 90'.

## Comment le moteur les utilise

- `worker/src/playbook.ts` condense ces règles en cinq sections (`reel`, `cover`, `caption`, `pin`, `kpi`).
  `withPlaybook(system, …sections)` les ajoute aux prompts du modèle qui écrit les accroches, miniatures, légendes
  et narrations : Football Stories (script, variantes de covers/légendes), recréations de buts « كيف جاء الهدف »
  (narration, sous-titres, légende).
- `checkCaption(text, { keyword })` s'applique à chaque légende publiée : plafonne les hashtags à 5, signale un
  mot-clé absent de la première phrase et l'absence d'appel à l'action (avertissements dans le journal ops, jamais
  bloquant).
- Ops : `POST /studio/ops/run {"job":"playbook"}` renvoie le résumé en vigueur.
- La même connaissance est disponible comme skill Claude : `~/.claude/skills/tiktok-pinterest-playbook`.

Quand un format change (nouveau type de reel, nouvelle cover), le vérifier contre les checklists des sections 2-4 du
skill avant de le mettre en production.
