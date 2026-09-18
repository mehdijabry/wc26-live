// Content playbook (Mehdi, 2026-09-18): the 2026 TikTok / Pinterest algorithm, virality, SEO, thumbnail, conversion and
// KPI guidance condensed for the engine. Full sources (verbatim research notes, French) live in docs/playbook/*.md;
// the same knowledge is a Claude skill (~/.claude/skills/tiktok-pinterest-playbook). Every prompt that writes a hook,
// a cover, a caption or a narration appends the relevant sections through withPlaybook(); checkCaption() enforces the
// caption rules that can be checked mechanically (hashtag cap, keyword in the first sentence, call to action).
export const PLAYBOOK_VERSION = '2026-09-18'
export const PLAYBOOK_SOURCE = 'docs/playbook/1-tiktok-algorithme-viralite-seo-miniatures.md · 2-pinterest-algorithme-trends-motscles-conversion.md · 3-analyse-kpis-tiktok-pinterest-leviers.md'

export const PLAYBOOK = {
  /** Short vertical video (TikTok / Reels / Shorts): what the algorithm rewards in 2026. */
  reel: `SHORT-VIDEO RULES (2026 algorithms): every video is scored on its own (interest graph, followers are not a ranking factor). The master signal is the COMPLETION RATE (bar ≈ 70 %), then replays, shares (especially in DMs), saves, substantive comments; likes are the weakest signal. So: (1) the first 3 seconds are a HOOK that names the subject / keyword out loud and promises the payoff or opens a tension resolved only at the end; (2) no intro, no dead second — 15 s watched to the end beats 60 s watched to the middle; (3) the last line is a LOOP or an open question that makes people rewatch or answer with a real sentence; (4) give a reason to SAVE (list, numbered steps, figures, "keep for later") or to SHARE (universal emotion, "tag someone who…"); (5) say the main keyword in the first 3-5 seconds and show it on screen; (6) one strong niche community beats a generic viral tone; (7) never a trending sound unrelated to the subject.`,
  /** Cover / thumbnail (profile grid, search grid, Facebook reel thumbnail). */
  cover: `COVER RULES: sharp image, one focal point, a face with a visible emotion when possible, strong text/background contrast, 3-6 words that give the context (a number, a paradox, a name — never a full sentence), vertical 9:16 with the essentials in the central 3:4 area, constant brand chart (same colours, type, logo place) and one template per series. The cover must promise exactly what the video delivers.`,
  /** Caption / description (indexed like a mini article by TikTok Search, Facebook and Google). */
  caption: `CAPTION RULES: the first sentence contains the main keyword (name of the player, club, story) in natural language — no keyword stuffing; write 2-3 short lines that create curiosity without giving the ending; one explicit call to action (a question that invites a real answer, follow the page, link in the comments); 3 to 5 hashtags maximum, mixing one or two broad community tags with two or three precise niche tags — never more; no line of emojis. The caption, the cover and the video must make the same promise.`,
  /** Pinterest pin (image or video). */
  pin: `PIN RULES: 2:3 format 1000×1500 px (video 1080×1920), never square; bright sharp photo, high-contrast colours, one focal point, the final result shown first; short bold overlay text (big heavy type, few words); title with the main keyword in the first 30-60 characters; description whose first sentence is brand + keyword, with an explicit call to action; alt text filled; board titles with generic keywords, long-tail keywords per pin; seasonal pins published 45-60 days before the peak; the landing page keeps the exact promise of the pin.`,
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
  return { text: out, warnings, hashtags: Math.min(tags.length, HASHTAG_MAX) }
}

/** One-screen summary for the ops endpoint / admin. */
export function playbookSummary(): string {
  return [`Playbook ${PLAYBOOK_VERSION} (sources: ${PLAYBOOK_SOURCE})`, ...Object.entries(PLAYBOOK).map(([k, v]) => `[${k}] ${v}`)].join('\n\n')
}
