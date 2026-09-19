// Content playbook (Mehdi, 2026-09-18): the 2026 TikTok / Pinterest algorithm, virality, SEO, thumbnail, conversion and
// KPI guidance condensed for the engine. Full sources (verbatim research notes, French) live in docs/playbook/*.md;
// the same knowledge is a Claude skill (~/.claude/skills/tiktok-pinterest-playbook, Pressing 90' only).
// Used at three moments of the pipeline:
//   1. creation  — withPlaybook() appends the relevant sections to every prompt that writes a hook, a cover, a caption
//                  or a narration (Football Stories, cover/caption variants, goal recreations, article social copy);
//   2. publication — checkCaption() runs inside fbPost() / fbReel() on every caption (hashtag cap, keyword in the first
//                  sentence, call to action) and pinnedComment() builds the keyword-rich comment under each reel;
//   3. review    — reelDiagnostics() turns the page's reel insights into the weekly review of the KPI guide
//                  (ops job 'playbook-review', automatic every Monday 09:05).
export const PLAYBOOK_VERSION = '2026-09-18'
export const PLAYBOOK_SOURCE = 'docs/playbook/1-tiktok-algorithme-viralite-seo-miniatures.md · 2-pinterest-algorithme-trends-motscles-conversion.md · 3-analyse-kpis-tiktok-pinterest-leviers.md'

export const PLAYBOOK = {
  /** Short vertical video (TikTok / Reels / Shorts): what the algorithm rewards in 2026. */
  reel: `SHORT-VIDEO RULES (2026 algorithms): every video is scored on its own (interest graph, followers are not a ranking factor). The master signal is the COMPLETION RATE (bar ≈ 70 %), then replays, shares (especially in DMs), saves, substantive comments; likes are the weakest signal. So: (1) the first 3 seconds are a HOOK that names the subject / keyword out loud and promises the payoff or opens a tension resolved only at the end; (2) no intro, no dead second — 15 s watched to the end beats 60 s watched to the middle; (3) the last line is a LOOP or an open question that makes people rewatch or answer with a real sentence; (4) give a reason to SAVE (list, numbered steps, figures, "keep for later") or to SHARE (universal emotion, "tag someone who…"); (5) say the main keyword in the first 3-5 seconds and show it on screen; (6) one strong niche community beats a generic viral tone; (7) never a trending sound unrelated to the subject.`,
  /** Hook archetypes for the first line (spoken and written). */
  hook: `HOOK RULES: the first spoken line and the first caption line carry the keyword (player, club, story) and ONE of these archetypes — a shocking number ("7 goals in one night"), the mistake nobody saw ("the detail the replay hides"), a paradox ("the goal that came from a save"), a direct question ("did you know…"), or a promise with a deadline ("watch until the end: the trick is at the 5th step"). Never a generic viral hook copied from another niche, never a sentence that could open any video.`,
  /** Cover / thumbnail (profile grid, search grid, Facebook reel thumbnail). */
  cover: `COVER RULES: sharp image, one focal point, a face with a visible emotion when possible, strong text/background contrast, 3-6 words that give the context (a number, a paradox, a name — never a full sentence), vertical 9:16 with the essentials in the central 3:4 area, constant brand chart (same colours, type, logo place) and one template per series. The cover must promise exactly what the video delivers.`,
  /** Caption / description (indexed like a mini article by TikTok Search, Facebook and Google). */
  caption: `CAPTION RULES: the first sentence contains the main keyword (name of the player, club, story) in natural language — no keyword stuffing; write 2-3 short lines that create curiosity without giving the ending; one explicit call to action (a question that invites a real answer, follow the page, link in the comments); 3 to 5 hashtags maximum, mixing one or two broad community tags with two or three precise niche tags — never more; no line of emojis. The caption, the cover and the video must make the same promise.`,
  /** Pinned comment under a reel (extra indexable text + a reason to comment). */
  comment: `PINNED COMMENT RULES: 1-2 sentences rich in the same keywords as the video (who, what, where), then the closed question of the caption, then the link — the comment is indexed like the caption and feeds the comment-quality signal.`,
  /** Pinterest pin (image or video). */
  pin: `PIN RULES: 2:3 format 1000×1500 px (video 1080×1920), never square; bright sharp photo, high-contrast colours, one focal point, the final result shown first; short bold overlay text (big heavy type, few words); title with the main keyword in the first 30-60 characters; description whose first sentence is brand + keyword, with an explicit call to action; alt text filled; board titles with generic keywords, long-tail keywords per pin; seasonal pins published 45-60 days before the peak; the landing page keeps the exact promise of the pin.`,
  /** Publishing rhythm. */
  timing: `TIMING RULES: no bursts — each video is tested on its own sample, and a burst splits the audience's attention (11-16 reels in a day gave 17-45 views each on this page); keep at least the engine's minimum gap between posts, spread variants 15 min apart, keep the daily budget; the first 60 minutes decide the launch — answer early comments with substantive replies.`,
  /** KPI reading order and diagnostics (weekly content review, monthly account review). */
  kpi: `KPI ORDER — TikTok: completion rate (read against the length) → average watch time → replays → shares (DMs) → saves (2-3 % on informative content) → substantive comments → engagement rate → likes → views/reach; followers = loyalty, not reach. Pinterest: saves (saves/impressions) → outbound clicks (organic CTR 1-3 %) → close-ups → impressions → engagement → monthly audience. DIAGNOSTICS: low completion → shorten, stronger hook, cut the slack, add a loop; good views but few saves/shares → add a practical or emotional dimension; good engagement but little traffic → explicit CTA, link, promise = landing page; search performs but not the feed (or the reverse) → two different constructions. Weekly review per video/pin, monthly review per account with a baseline.`,
} as const
export type PlaybookSection = keyof typeof PLAYBOOK

/** Append the playbook sections to a system prompt (the model then applies them to whatever it writes). */
export function withPlaybook(system: string, ...sections: PlaybookSection[]): string {
  const parts = (sections.length ? sections : (['reel', 'caption'] as PlaybookSection[])).map((s) => PLAYBOOK[s])
  return `${system}\n\nPLAYBOOK ${PLAYBOOK_VERSION} — apply these rules to everything you write:\n${parts.map((p) => `- ${p}`).join('\n')}`
}

const HASHTAG_MAX = 5
const CTA_RE = /[👇👉⬇]|تابع|شاركنا|أخبرنا|رأيك|follow|link in|comment|tag someone|abonne|dis-nous|lien en/i
/** Mechanical caption checks: caps the hashtags at 5 (keeps the first ones), reports a missing keyword in the first
 *  sentence and a missing call to action. Never blocks a post — warnings go to the log so the prompts can be tuned. */
export function checkCaption(text: string, opts: { keyword?: string; lang?: 'ar' | 'en' | 'fr' } = {}): { text: string; warnings: string[]; hashtags: number } {
  const warnings: string[] = []
  let out = String(text ?? '').replace(/\r/g, '').trim()
  // The Uppbeat licence block is kept out of every count and every trim (Brentford, 2026-09-19): its "#Uppbeat" was
  // counted as a hashtag and dropped by the cap, publishing "Music from (free for Creators!)" — the credit is mandatory.
  const creditAt = out.search(/^\s*Music from/im)
  const credit = creditAt >= 0 ? out.slice(creditAt) : ''
  if (creditAt >= 0) out = out.slice(0, creditAt).trimEnd()
  // hashtags: keep the first 5, drop the rest (wherever they are)
  const tags = [...out.matchAll(/(^|\s)(#[^\s#]+)/gu)].map((m) => m[2])
  if (tags.length > HASHTAG_MAX) {
    const keep = new Set(tags.slice(0, HASHTAG_MAX)); let seen = 0
    out = out.replace(/(^|\s)(#[^\s#]+)/gu, (m, sp: string, tag: string) => { if (keep.has(tag) && seen < HASHTAG_MAX) { seen++; return m } return sp ? sp.replace(/\s+$/, '') : '' }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
    warnings.push(`hashtags trimmed ${tags.length} → ${HASHTAG_MAX}`)
  } else if (tags.length === 0) warnings.push('no hashtag (3-5 expected)')
  else if (tags.length < 3) warnings.push(`only ${tags.length} hashtag(s) (3-5 expected)`)
  // keyword in the first sentence
  const first = out.split(/\n|[.!?؟…]/)[0] ?? ''
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ً-ْـ]/g, '').replace(/^ال/, '')
  if (opts.keyword) {
    const kws = String(opts.keyword).split(/\s+/).filter((w) => w.length > 2).map(norm)
    if (kws.length && !kws.some((k) => norm(first).includes(k))) warnings.push(`keyword "${opts.keyword}" not in the first sentence`)
  }
  if (!CTA_RE.test(out)) warnings.push('no call to action')
  if (credit) out = `${out}\n\n${credit.trim()}`
  return { text: out, warnings, hashtags: Math.min(tags.length, HASHTAG_MAX) }
}

/** Keyword-rich pinned comment: lead sentence(s) with the keywords, the closed question, the link line. */
export function pinnedComment(lead: string, question: string, linkLine: string): string {
  return [String(lead ?? '').trim(), String(question ?? '').trim(), '', String(linkLine ?? '').trim()].filter((x, i) => x || i === 2).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ─── weekly review (KPI guide, section 2.4 / 5) ─────────────────────────────
export type ReelRow = { id: string; when: string; title: string; views: number; length: number; avgMs?: number; replays?: number; reach?: number; shares?: number; comments?: number; likes?: number; link?: string }
export type ReelAnalysis = ReelRow & { completion: number | null; kind: string; lang: 'ar' | 'en'; hour: number | null; action: string }
export type GroupRow = { key: string; n: number; medViews: number; medCompletion: number | null; totalViews: number }
export type Review = {
  days: number; count: number; reels: ReelAnalysis[]
  account: { medianViews: number | null; medianCompletion: number | null; medianShareRate: number | null; perDay: number; totalViews: number; totalComments: number; totalReplays: number; insights: boolean }
  actions: string[]; recommendations: string[]
  groups: Array<{ by: 'length' | 'kind' | 'lang' | 'hour'; rows: GroupRow[] }>
}
const pct = (x: number) => `${Math.round(x * 100)} %`
const median = (xs: number[]): number | null => { const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null }
const KIND_LABEL: Record<string, string> = { goal: 'buts (reel de but)', analysis: 'analyses de but « كيف جاء الهدف »', matchday: 'matchs du jour', results: 'résultats / fin de match', barca: '« برشلونة اليوم »', articles: 'articles', story: 'histoires (Football Stories)' }
const kindOf = (title: string) => /كيف جاء/.test(title) ? 'analysis' : /هدف|goal/i.test(title) ? 'goal' : /مباريات اليوم|today'?s matches|match-day|matchday/i.test(title) ? 'matchday' : /نتائج|full time|نهاية المباراة|results/i.test(title) ? 'results' : /برشلونة اليوم/.test(title) ? 'barca' : /📰|news/i.test(title) ? 'articles' : 'story'
const langOf = (title: string): 'ar' | 'en' => (/[\u0600-\u06FF]/.test(title) ? 'ar' : 'en')
const lenBucket = (l: number) => (l < 25 ? '< 25 s' : l < 45 ? '25-45 s' : l < 70 ? '45-70 s' : '> 70 s')
const hourBucket = (h: number | null) => (h == null ? 'inconnu' : h >= 6 && h < 12 ? 'matin 6-12 h' : h >= 12 && h < 17 ? 'midi 12-17 h' : h >= 17 && h < 22 ? 'soirée 17-22 h' : 'nuit 22-6 h')
function groupBy(rows: ReelAnalysis[], key: (r: ReelAnalysis) => string): GroupRow[] {
  const m = new Map<string, ReelAnalysis[]>(); for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) ?? []), r]) }
  return [...m.entries()].map(([k, xs]) => ({ key: k, n: xs.length, medViews: median(xs.map((x) => x.views)) ?? 0, medCompletion: median(xs.filter((x) => x.completion != null).map((x) => x.completion as number)), totalViews: xs.reduce((a, x) => a + x.views, 0) })).sort((a, b) => b.medViews - a.medViews)
}
/** The KPI guide applied to the page's reels: one action per reel, account-level actions, and concrete recommendations
 *  (length, format, language, time slot, hook) computed from the numbers. French, for Mehdi. */
export function analyzeReels(rows: ReelRow[], days = 7): Review {
  const reels: ReelAnalysis[] = rows.map((r) => {
    const completion = r.avgMs != null && r.length > 0 ? Math.min(1.2, r.avgMs / 1000 / r.length) : null
    const hour = r.when ? ((new Date(r.when).getUTCHours() + 1) % 24) : null   // Africa/Casablanca = UTC+1
    return { ...r, completion, kind: kindOf(r.title), lang: langOf(r.title), hour, action: '' }
  })
  const mViews = median(reels.map((r) => r.views)), mComp = median(reels.filter((r) => r.completion != null).map((r) => r.completion as number))
  const shareRates = reels.filter((r) => r.views > 0 && r.shares != null).map((r) => (r.shares as number) / r.views), mShare = median(shareRates)
  for (const r of reels) {
    const a: string[] = []
    if (r.completion != null) {
      if (r.completion < 0.35) a.push('complétion faible → raccourcir, hook plus fort dans les 3 s, couper les longueurs')
      else if (r.completion < 0.6) a.push('complétion moyenne → resserrer le milieu, boucle de fin')
      else if (mViews != null && r.views < mViews / 2) a.push('bon contenu, faible distribution → cover + première ligne de légende + heure de publication')
      else a.push('format à garder')
    } else if (mViews != null && r.views < mViews / 2) a.push('vues sous la médiane → vérifier hook, cover et heure')
    if (r.views > 0 && r.shares != null && mShare != null && r.shares / r.views < mShare * 0.5) a.push('peu de partages → donner une raison de partager (émotion, « tague quelqu\'un »)')
    if (r.comments != null && r.views > 200 && r.comments === 0) a.push('0 commentaire → question fermée plus tranchée')
    if (r.replays != null && r.views > 0 && r.replays / r.views >= 0.15) a.push('revu souvent (≥ 15 % de replays) → format à décliner')
    r.action = a.join(' ; ')
  }
  const perDay = reels.length / Math.max(1, days)
  const insights = reels.some((r) => r.completion != null)
  const actions: string[] = []
  if (mComp != null) actions.push(mComp < 0.2 ? `complétion médiane ${pct(mComp)} : l'accroche ne retient pas dans les 3 premières secondes — mettre le fait choc à 0 s (pas de carte-titre avant la voix), viser 30-40 s` : mComp < 0.4 ? `complétion médiane ${pct(mComp)} : le format est trop long ou démarre trop lentement — tester 20-30 s sur les buts, garder 60-75 s seulement pour les récits` : mComp < 0.6 ? `complétion médiane ${pct(mComp)} : correct, viser 70 % en coupant les intros` : `complétion médiane ${pct(mComp)} : au-dessus de la barre, le levier est la distribution (cover, première ligne, heure)`)
  if (perDay > 5) actions.push(`${perDay.toFixed(1)} reels/jour : trop — les rafales divisent les vues, revenir à ≤ 5`)
  if (mShare != null) actions.push(`taux de partage médian ${(mShare * 100).toFixed(2)} % ${mShare < 0.005 ? '(faible : ajouter une raison de partager)' : '(bon)'}`)
  // recommendations from the groups
  const groups: Review['groups'] = [
    { by: 'length', rows: groupBy(reels, (r) => lenBucket(r.length)) },
    { by: 'kind', rows: groupBy(reels, (r) => r.kind) },
    { by: 'lang', rows: groupBy(reels, (r) => r.lang) },
    { by: 'hour', rows: groupBy(reels, (r) => hourBucket(r.hour)) },
  ]
  const rec: string[] = []
  const solid = (rows: GroupRow[]) => rows.filter((g) => g.n >= 2)
  { const rows = solid(groups[0].rows).filter((g) => g.medCompletion != null).sort((a, b) => (b.medCompletion ?? 0) - (a.medCompletion ?? 0))
    if (rows.length >= 2) { const best = rows[0], worst = rows[rows.length - 1]; if ((best.medCompletion ?? 0) >= 1.5 * (worst.medCompletion ?? 0)) rec.push(`Durée : les reels de ${best.key} sont regardés à ${pct(best.medCompletion ?? 0)} contre ${pct(worst.medCompletion ?? 0)} pour ceux de ${worst.key} (${best.n} et ${worst.n} reels) → ramener les formats longs vers ${best.key}.`) } }
  { const rows = solid(groups[1].rows); if (rows.length >= 2) { const best = rows[0], worst = rows[rows.length - 1]; rec.push(`Format : ${KIND_LABEL[best.key] ?? best.key} = ${best.medViews} vues médianes (${best.n} reels) ; ${KIND_LABEL[worst.key] ?? worst.key} = ${worst.medViews} (${worst.n}) → produire plus du premier, revoir l'accroche et la cover du second${worst.medViews * 4 < best.medViews ? ' ou réduire sa fréquence' : ''}.`) } }
  { const ar = groups[2].rows.find((g) => g.key === 'ar'), en = groups[2].rows.find((g) => g.key === 'en'); if (ar && en && ar.n >= 2 && en.n >= 2) { if (ar.medViews >= 3 * en.medViews) rec.push(`Langue : l'arabe fait ${ar.medViews} vues médianes contre ${en.medViews} pour l'anglais (${ar.n} vs ${en.n} reels) → concentrer la production sur l'arabe, garder au plus une version anglaise par jour.`); else if (en.medViews >= 2 * ar.medViews) rec.push(`Langue : l'anglais fait ${en.medViews} vues médianes contre ${ar.medViews} pour l'arabe → tester plus de versions anglaises.`) } }
  { const rows = solid(groups[3].rows).filter((g) => g.key !== 'inconnu'); if (rows.length >= 2) rec.push(`Créneau : ${rows[0].key} = ${rows[0].medViews} vues médianes (${rows[0].n} reels), le moins bon ${rows[rows.length - 1].key} = ${rows[rows.length - 1].medViews} → décaler les publications importantes vers ${rows[0].key}.`) }
  const replayed = reels.filter((r) => r.replays != null && r.views > 0 && r.replays / r.views >= 0.15)
  if (replayed.length) rec.push(`Replays : ${replayed.length} reel(s) sont revus (≥ 15 % de replays) — ${replayed.slice(0, 3).map((r) => `« ${r.title.slice(0, 32)} »`).join(', ')} → décliner ces formats.`)
  const totalComments = reels.reduce((a, r) => a + (r.comments ?? 0), 0)
  if (insights && reels.length >= 5 && totalComments < reels.length / 2) rec.push(`Commentaires : ${totalComments} sur ${reels.length} reels → une question fermée plus tranchée en fin de vidéo, dans la légende et dans le commentaire épinglé, et répondre dans la première heure.`)
  if (mComp != null && mComp < 0.2) rec.push('Hook : la complétion médiane est sous 20 % — supprimer la carte-titre de 2 s en ouverture, faire parler la voix dès l\'image 1 avec le fait choc, et afficher le mot-clé à l\'écran dès la première seconde.')
  if (!insights) rec.push('Statistiques détaillées indisponibles (permission read_insights) : les recommandations ne portent que sur les vues.')
  return { days, count: reels.length, reels, account: { medianViews: mViews, medianCompletion: mComp, medianShareRate: mShare, perDay, totalViews: reels.reduce((a, r) => a + r.views, 0), totalComments, totalReplays: reels.reduce((a, r) => a + (r.replays ?? 0), 0), insights }, actions, recommendations: rec, groups }
}
/** Text version of analyzeReels() for the ops log / e-mail. */
export function reelDiagnostics(rows: ReelRow[], days = 7): string {
  const v = analyzeReels(rows, days)
  if (!v.count) return `Revue playbook : aucun reel sur ${days} jours.`
  const fmt = (r: ReelAnalysis) => `${r.title || r.id} — ${r.views} vues${r.completion != null ? `, complétion ${pct(r.completion)}` : ''}${r.replays != null ? `, ${r.replays} replays` : ''}${r.shares != null ? `, ${r.shares} partages` : ''}${r.comments != null ? `, ${r.comments} comm.` : ''} (${r.length} s) → ${r.action}`
  const byComp = [...v.reels].sort((p, q) => (q.completion ?? -1) - (p.completion ?? -1) || q.views - p.views)
  const top = byComp.slice(0, 3), bottom = byComp.slice(-3).reverse().filter((r) => !top.includes(r))
  return [`Revue playbook — ${v.count} reels sur ${days} jours · vues médianes ${v.account.medianViews ?? '?'}${v.account.medianCompletion != null ? ` · complétion médiane ${pct(v.account.medianCompletion)}` : ' · complétion non disponible (insights)'}`,
    'TOP : ' + top.map(fmt).join(' || '), bottom.length ? 'BAS : ' + bottom.map(fmt).join(' || ') : '', 'COMPTE : ' + (v.actions.join(' ; ') || 'rien à signaler'), v.recommendations.length ? 'RECOMMANDATIONS : ' + v.recommendations.join(' | ') : ''].filter(Boolean).join('\n')
}

/** One-screen summary for the ops endpoint / admin. */
export function playbookSummary(): string {
  return [`Playbook ${PLAYBOOK_VERSION} (sources: ${PLAYBOOK_SOURCE})`, ...Object.entries(PLAYBOOK).map(([k, v]) => `[${k}] ${v}`)].join('\n\n')
}
