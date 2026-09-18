# Pressing 90' — brief de reprise (Cowork / nouvelle session)

État au 18 septembre 2026, 08:00 Maroc. À coller dans les instructions du projet Cowork
ou à lire en début de session. Ne contient aucun secret.

## Le produit
- **pressing90.live** : média foot arabophone (Algérie 35 %, Maroc 33 %, Égypte, Tunisie), page Facebook
  « Pressing 90' » (5 154 abonnés hérités d'une page Barça). Positionnement : **Barça first**, joueurs marocains.
- Repo : `/Users/Mehdi/Desktop/wc2026-hub` (site Vite/React sur Cloudflare Pages `wc26-live`,
  worker `wc26-api` Cloudflare, studio de rendu `p90-studio` sur Render, Supabase, Make, Meta Graph API).

## Services et commandes
- **Site** : `npm run build:prerender && npx wrangler pages deploy dist --project-name=wc26-live --commit-dirty=true`
  (jamais un simple `build`).
- **Worker** (`worker/`) : `npx wrangler deploy`. Type-check : `npx tsc --noEmit -p .` — les erreurs dans
  `admin.ts` / `index.ts` sont anciennes et connues ; seules celles de `automation.ts` comptent.
- **Studio** (`studio/`) : déployé par `git push` (Render, ~3 min). Un job envoyé pendant le redéploiement est perdu.
  `studio/fonts` est git-ignoré → ajouter une police avec `git add -f`.
- **Ops du worker** : `POST https://wc26-api.nameless-violet-5dc1.workers.dev/studio/ops/run {job, ...}`,
  `POST /studio/ops/settings {patch}`, `GET /studio/ops/status` (log du jour). En-tête `x-ops-secret`, valeur dans
  `~/.config/pressing90/ops_secret` (chmod 600). Toujours `-A "p90-test/1.0"` (le worker bloque curl).
  Logs des jours passés : `npx wrangler kv key get --binding=CACHE --remote "auto:log:YYYY-MM-DD"`.
- **Secrets** : jamais tapés ni affichés par l'assistant. Mehdi colle lui-même les tokens
  (`cd worker && npx wrangler secret put FB_PAGE_TOKEN`). Make et Render demandent sa connexion.

## Réglages en vigueur (KV, modifiables par `/studio/ops/settings` ou le panneau admin du site)
- `maxPostsPerDay 26`, `articlesPerDay 2`, `ftPerDay 3` (= posts groupés de scores), `barcaDaily true`,
  `barcaFtStyle 'poster'`, `lineups true`, `mainLang 'ar'`, `freeVoices true`, `goalScope 'barca'`.
- Histoires (tales) : `talesPerDay 2` aux créneaux `08:30,18:00`, 2 variantes AR puis 2 EN (`taleVariants 2`,
  `taleVariantGapMin 15`), 1 h entre l'arabe et l'anglais (`taleGapMin 60`), photos libres uniquement (`taleArt 'photos'`).
- Reels de but : **uniquement** matchs du Barça et buteurs marocains (nationalité ESPN + liste de noms).
- Scores de fin de match : **album groupé** (une affiche par match) quand plus aucun gros match n'est en cours,
  ou après 75 min, 6 matchs, ou 23:40. Jobs : `ft-pending`, `ft-flush`.
- Compos Barça : XI probable 6-3 h avant (dernier XI officiel, KV `auto:lineup:last`, seed `lineup-seed {event}`),
  XI officiel dès qu'ESPN le publie. Prochain match réel : mercredi 16/09 20:30 Barça – Racing.
- Aperçus : `preview-image {type: matchday-post | lineup-post | fulltime-post, event?}`,
  `preview {type: barca-goal | barca-ft | matchday | barca}` (URL dans le log « PREVIEW ready »).
  Le faux match « Barcelona – Valencia (APERÇU) » n'est pas un vrai match.

## Design (depuis le 14/09) — base de tous les posts
- Kit `studio/editorial.js` : papier crème, lavis bleu/grenat, ruban grenat, stade en bichromie, titres arabes
  Aref Ruqaa en dégradé, Playfair pour latin/chiffres, petites capitales Cairo (jamais d'espacement sur l'arabe),
  maillots vectoriels, bustes de joueurs alignés (`studio/assets/cutouts` + `heads.json`).
- Tous les renderers de `studio/draw.js` sont dessus (affiche FT, compo, matchday, articles, stories, reels, histoires).
- Crédits photos (Wikimedia, kits modifiés par IA) : page `/credits` du site.

## Chiffres à garder en tête
- Pic 9-10/09 (semaine UCL) ≈ 3 100 vues/jour ; 13/09 ≈ 1 600. Les rafales de reels de but tuent la distribution
  (11-16 reels/jour → 17-45 vues chacun ; 5 reels → 262). Meilleur reel : but de Zabiri, 857 vues.
- 12,8 % des vues viennent des abonnés ; un post photo d'article atteint ~5 personnes.
- Make : plan Free, ~800/1000 opérations consommées ; l'album de scores passe par le Graph API, pas Make.

## Prochaine discussion prévue
- Trouver « une idée de reel qui cartonne ». Pistes proposées : « Les Lions à l'étranger » (compilation
  hebdomadaire des buts/passes des Marocains), « le duel arabe du jour », « Yamal en chiffres ».

## « كيف جاء الهدف » — reconstitutions de buts (depuis le 18/09)
- Après chaque match fini du pool, le meilleur but (coordonnées ESPN du tir) devient un reel de 60-75 s :
  reconstitution schématique narrée en arabe (voix Edge Jamal), tracés lumineux, six étapes numérotées, carte de
  but, appel à suivre la page. Musique « Quake » (aavirall, Uppbeat) — la ligne de crédit est ajoutée à chaque légende.
- Worker `worker/src/goalanim.ts` (file `auto:goalanim:queue:<date>`, un job à la fois, étapes textes → voix →
  rendu → callback → publication ; pas de publication si le QA audio du studio signale un problème). Studio
  `studio/goalanim.js`, type `goal-anim` (~30 min de rendu à 20 fps sur 0,1 CPU).
- Réglages : `goalAnim true`, `goalAnimPerDay 4`, `goalAnimScope 'all'`, `goalAnimFps 20` (panneau admin).
- Ops : `goal-anim {event, slug, preview?, fps?}` (file + aperçu), `goal-anim-tick`, `goal-anim-status`,
  `goal-anim-reset`, `goal-anim-scene {event, slug}` (chorégraphie sans rendu), `reel-publish {url, description, title}`.
- Les positions des autres joueurs et l'enchaînement avant le tir sont une interprétation (mention « رسم توضيحي »).

## Playbook contenu (depuis le 18/09)
- Trois recherches 2026 (algorithme TikTok / viralité / SEO / miniatures ; Pinterest / Trends / mots-clés / conversion ;
  KPIs et leviers) intégrées telles quelles dans `docs/playbook/` et comme skill Claude `tiktok-pinterest-playbook`
  (avec le skill `prospect-pitch` installé tel quel pour la prospection TikTok for Business).
- `worker/src/playbook.ts` : règles condensées injectées dans les prompts (scripts d'histoires, covers/légendes,
  narration et légende des recréations de buts, posts d'articles) via `withPlaybook()` ; `checkCaption()` plafonne
  les hashtags à 5 et journalise « tale-playbook » / « goal-anim-playbook » quand une légende n'a pas le mot-clé en
  première phrase ou pas d'appel à l'action. Ops : `playbook` (résumé en vigueur).
