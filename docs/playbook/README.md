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
- **Publication** : `fbPost()` et `fbReel()` passent chaque légende par `checkCaption()` (hashtags plafonnés à 5,
  mot-clé en première phrase, appel à l'action) — avertissements dans le journal ops sous « playbook », jamais
  bloquant. Les légendes de fin de match mettent le score en première phrase ; `pinnedComment()` construit le
  commentaire épinglé (phrase riche en mots-clés + question fermée + lien) sous les histoires et les recréations de buts.
- **Revue hebdomadaire** (guide KPIs) : `worker/src/review.ts` lit les reels de la page et leurs insights Graph
  (temps moyen regardé → complétion, replays, partages, commentaires), classe-les et propose une action par reel et
  pour le compte ; automatique le lundi 09:05 (journal « playbook-review »), à la demande via
  `{"job":"playbook-review","limit":20,"days":7}`.
- Ops : `{"job":"playbook"}` renvoie le résumé des règles en vigueur.
- La même connaissance est disponible comme skill Claude : `~/.claude/skills/tiktok-pinterest-playbook`.

Quand un format change (nouveau type de reel, nouvelle cover), le vérifier contre les checklists des sections 2-4 du
skill avant de le mettre en production.
