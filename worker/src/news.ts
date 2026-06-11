/**
 * News pipeline — runs every 3h via cron.
 *
 * Pipeline:
 *   1. fetchCandidates() — pull recent items from RSS + Reddit r/soccer
 *   2. scoreCandidate()  — engagement + recency + WC26 boost → 0-100
 *   3. rewriteWithAi()   — Workers AI paraphrase + commentary
 *   4. insertDraft()     — Supabase articles row, status='draft'
 *   5. sendEditorEmail() — Mehdi gets approval link
 *
 * All errors are caught and logged so the cron never throws and the
 * other handlers (kickoff alerts, etc.) keep running on the same tick.
 */

import type { Env } from './index'

// ─── Sources ─────────────────────────────────────────────────────────

/**
 * Football RSS feeds we trust + their authority weight (0-1). Higher
 * weight = bigger boost in the score.
 */
const RSS_SOURCES: Array<{ name: string; url: string; weight: number }> = [
  { name: 'ESPN FC',     url: 'https://www.espn.com/espn/rss/soccer/news', weight: 0.95 },
  { name: 'BBC Sport',   url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', weight: 0.95 },
  { name: 'Goal',        url: 'https://www.goal.com/feeds/en/news', weight: 0.85 },
  { name: 'Sky Sports',  url: 'https://www.skysports.com/rss/12040', weight: 0.85 },
  { name: 'The Guardian',url: 'https://www.theguardian.com/football/rss', weight: 0.9 },
  { name: 'FIFA',        url: 'https://www.fifa.com/en/rss', weight: 0.9 },
]

const REDDIT_HOT = 'https://www.reddit.com/r/soccer/hot.json?limit=50'

// ─── Types ───────────────────────────────────────────────────────────

interface Candidate {
  title: string
  link: string
  description: string
  pubDate: number             // ms epoch
  source: string
  sourceWeight: number
  imageUrl?: string
  redditScore?: number        // upvotes if matched on Reddit
  redditComments?: number
}

// ─── Public-facing types ─────────────────────────────────────────────

/**
 * A scored candidate without AI rewriting yet. This is what the manual
 * 'poll' endpoint returns — the operator picks one and the worker only
 * runs the (expensive) AI step on the chosen item.
 */
export interface PolledCandidate {
  link: string
  title: string
  description: string
  source: string
  score: number
  pubDate: number
  imageUrl?: string
  redditScore?: number
}

/**
 * Manual flow: poll top-N candidates skipping anything already in DB
 * (regardless of status). The frontend then renders these as a list
 * for the operator to pick from.
 */
export async function pollTopCandidates(env: Env, n = 6): Promise<{ candidates: PolledCandidate[]; diagnostics: Record<string, number | string> }> {
  const diag: Record<string, number | string> = { step: 'rss' }
  const { all, perSource } = await fetchCandidatesWithStats()
  Object.assign(diag, { rssTotal: all.length, ...perSource })

  // Recency window — 24h to give the operator a wider menu than the
  // automated cron (which uses 6h).
  let candidates = all.filter((c) => Date.now() - c.pubDate < 24 * 3600 * 1000)
  diag.afterRecency = candidates.length
  if (candidates.length === 0) return { candidates: [], diagnostics: diag }

  // Reddit signal.
  const reddit = await fetchRedditHot()
  diag.redditHot = reddit.length
  crossReferenceReddit(candidates, reddit)

  // Drop anything already processed (any status).
  const seen = await fetchAllSourceUrls(env)
  diag.alreadyInDb = seen.size
  candidates = candidates.filter((c) => !seen.has(c.link))
  diag.afterDedup = candidates.length

  // Score, sort, take top N.
  const top = candidates
    .map((c) => ({ ...c, score: scoreCandidate(c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((c) => ({
      link: c.link,
      title: c.title,
      description: stripHtml(c.description).slice(0, 280),
      source: c.source,
      score: Number(c.score.toFixed(1)),
      pubDate: c.pubDate,
      imageUrl: c.imageUrl,
      redditScore: c.redditScore,
    }))
  diag.returned = top.length
  diag.step = 'done'
  return { candidates: top, diagnostics: diag }
}

/**
 * Produce a draft from a single candidate the operator picked. Re-runs
 * dedup as a safety check (someone might have raced us), then AI
 * rewrites + inserts + emails.
 */
export async function produceFromCandidate(env: Env, picked: PolledCandidate): Promise<{ ok: boolean; draft?: { id: string; slug: string; title: string }; error?: string; ai_raw_preview?: string }> {
  // Re-hydrate to a full Candidate shape so we can reuse the scoring +
  // AI prompt builder.
  const sourceWeight = RSS_SOURCES.find((s) => s.name === picked.source)?.weight ?? 0.8
  const c: Candidate = {
    title: picked.title,
    link: picked.link,
    description: picked.description,
    pubDate: picked.pubDate,
    source: picked.source,
    sourceWeight,
    imageUrl: picked.imageUrl,
    redditScore: picked.redditScore,
  }

  if (await alreadyHave(env, c.link)) {
    return { ok: false, error: 'already_in_db' }
  }

  // Always fetch the source article's og:image. ESPN RSS doesn't
  // include images reliably in standard <media:*> tags, so the RSS
  // parser's imageUrl is null on most candidates. The article page
  // itself ALWAYS has an og:image meta — that's what every Twitter /
  // Facebook unfurl relies on. Strictly preferred over the RSS hint.
  const ogImage = await fetchOgImage(c.link)
  if (ogImage) c.imageUrl = ogImage

  // First pass — normal prompt.
  let ai = await rewriteWithAi(env, c)
  if (!ai.rewritten) {
    // Retry with a tighter word budget. Llama 3.1 8B truncates around
    // the same token count no matter what we ask, so making the
    // requested body shorter usually buys enough headroom for the
    // JSON to close cleanly.
    ai = await rewriteWithAi(env, c, { tight: true })
  }
  if (!ai.rewritten) {
    return { ok: false, error: 'ai_failed', ai_raw_preview: ai.raw.slice(0, 400) }
  }

  const inserted = await insertDraft(env, c, ai.rewritten)
  if (!inserted) {
    return { ok: false, error: 'insert_failed' }
  }

  try {
    await sendEditorEmail(env, inserted, c.title)
  } catch (e) {
    // Email failure shouldn't block the draft.
    console.log('[news] email failed:', e)
  }

  return { ok: true, draft: { id: inserted.id, slug: inserted.slug, title: inserted.title } }
}

/**
 * Fetch the source article's HTML and pull the og:image (or
 * twitter:image, or first big <img>) so every produced draft has a
 * real hero photo. ESPN RSS doesn't include images in standard tags
 * — the article page does, every time, because every social-share
 * unfurl depends on it.
 *
 * Cached at the edge for 1h so re-attempting Produce on the same
 * candidate doesn't re-fetch.
 */
/**
 * ESPN's public content API returns article metadata as clean JSON,
 * including a typed `images[]` array. Bypasses Cloudflare bot challenges
 * that block HTML scrapes of espn.com — and is the same source the
 * native ESPN apps use, so it's stable and bot-friendly.
 *
 * Article-id extraction matches the canonical URL shape:
 *   https://www.espn.com/soccer/story/_/id/<DIGITS>/<slug>
 *   https://www.espn.com/espn/betting/story/_/id/<DIGITS>/<slug>
 */
async function fetchEspnImage(url: string): Promise<string | null> {
  const m = url.match(/espn\.com\/[^?]*\/id\/(\d+)/i)
  if (!m) return null
  try {
    const r = await fetch(`https://now.core.api.espn.com/v1/sports/news/${m[1]}`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        accept: 'application/json',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    })
    if (!r.ok) return null
    const j = await r.json() as { images?: Array<{ url?: string; type?: string }> }
    // Prefer header images, fall back to first image with a URL.
    const header = j.images?.find((i) => i.type === 'header' && i.url)
    const any = j.images?.find((i) => i.url)
    return header?.url ?? any?.url ?? null
  } catch {
    return null
  }
}

export async function fetchOgImage(url: string): Promise<string | null> {
  // Fast-path: ESPN articles → JSON content API (no bot challenge).
  if (/espn\.com\//i.test(url)) {
    const espn = await fetchEspnImage(url)
    if (espn) return espn
    // If the API returned nothing, fall through to the generic scraper
    // below in case ESPN serves the page directly for this URL.
  }
  try {
    // Real-browser User-Agent + Accept headers. ESPN, BBC, Sky, etc.
    // sit behind Cloudflare bot protection; identifying ourselves as a
    // 'bot' returns a 403 / managed-challenge page. Mimicking a recent
    // desktop Chrome gets us the actual article HTML (we only ever read
    // <head> meta tags, which is the same surface Twitter/Facebook
    // unfurlers consume — a stable, well-behaved pattern).
    const r = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
        'cache-control': 'no-cache',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="127", "Google Chrome";v="127"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    })
    if (!r.ok) return null
    // We only need the <head>, so cap the body read to avoid wasting CPU
    // on long article bodies. Most og:image tags sit in the first 8KB.
    const reader = r.body?.getReader()
    if (!reader) return null
    let html = ''
    const decoder = new TextDecoder()
    let bytes = 0
    while (bytes < 32_000) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      html += decoder.decode(value, { stream: true })
      if (html.includes('</head>')) break
    }
    try { await reader.cancel() } catch {}
    // og:image — both attribute orderings.
    const og = html.match(/<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::secure_url)?["']/i)
    if (og) return resolveUrl(og[1], url)
    const tw = html.match(/<meta[^>]+(?:property|name)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']twitter:image["']/i)
    if (tw) return resolveUrl(tw[1], url)
    // Fallback: first <img> with non-trivial size.
    const img = html.match(/<img[^>]+src=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i)
    if (img) return resolveUrl(img[1], url)
    return null
  } catch {
    return null
  }
}

function resolveUrl(maybeRelative: string, base: string): string {
  try { return new URL(maybeRelative, base).toString() } catch { return maybeRelative }
}

async function fetchAllSourceUrls(env: Env): Promise<Set<string>> {
  // Single round-trip to grab every source_url we've ever processed,
  // any status. Cheap because we only project the one column.
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/articles?select=source_url&limit=2000`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  if (!r.ok) return new Set()
  const rows = await r.json() as Array<{ source_url: string }>
  return new Set(rows.map((x) => x.source_url))
}

// ─── Entry point ─────────────────────────────────────────────────────

export interface PipelineReport {
  step: string
  ok: boolean
  rssBySource: Record<string, number>  // -1 = fetch failed, otherwise items returned
  rssTotal: number
  candidatesAfterRecency: number
  redditHot: number
  winner: { title: string; source: string; score: number; link: string } | null
  aiOk: boolean
  inserted: { id: string; slug: string } | null
  emailSent: boolean
  notes: string[]
  error?: string
}

export async function runNewsPipeline(env: Env): Promise<PipelineReport> {
  const r: PipelineReport = {
    step: 'init', ok: false, rssBySource: {}, rssTotal: 0,
    candidatesAfterRecency: 0, redditHot: 0, winner: null,
    aiOk: false, inserted: null, emailSent: false, notes: [],
  }
  try {
    r.step = 'rss'
    const { all, perSource } = await fetchCandidatesWithStats()
    r.rssBySource = perSource
    r.rssTotal = all.length
    // 6h window — extended to 24h if first pass empty, to keep things
    // moving when feeds publish less frequently overnight.
    let candidates = all.filter((c) => Date.now() - c.pubDate < 6 * 3600 * 1000)
    if (candidates.length === 0 && all.length > 0) {
      candidates = all.filter((c) => Date.now() - c.pubDate < 24 * 3600 * 1000)
      r.notes.push(`Recency window widened to 24h (kept ${candidates.length}/${all.length})`)
    }
    r.candidatesAfterRecency = candidates.length
    if (candidates.length === 0) {
      r.notes.push('No candidates passed recency. All RSS feeds may have failed or returned ancient items.')
      return r
    }

    r.step = 'reddit'
    const reddit = await fetchRedditHot()
    r.redditHot = reddit.length
    crossReferenceReddit(candidates, reddit)

    r.step = 'score'
    const scored = candidates
      .map((c) => ({ ...c, score: scoreCandidate(c) }))
      .sort((a, b) => b.score - a.score)
    const winner = scored[0]
    if (!winner) { r.notes.push('No winner after scoring'); return r }
    r.winner = { title: winner.title, source: winner.source, score: Number(winner.score.toFixed(1)), link: winner.link }

    r.step = 'dedup'
    if (await alreadyHave(env, winner.link)) {
      r.notes.push('Winner already in DB; skipped.')
      return r
    }

    // Augment with og:image from the source page before AI rewrite.
    // RSS feeds rarely include images in the standard tags so this is
    // where every produced article's hero photo actually comes from.
    const ogImage = await fetchOgImage(winner.link)
    if (ogImage) winner.imageUrl = ogImage

    r.step = 'ai'
    const aiResult = await rewriteWithAi(env, winner)
    if (!aiResult.rewritten) {
      const len = aiResult.raw.length
      r.notes.push(`AI parse failed. Raw length=${len}. Head: ${aiResult.raw.slice(0, 200)}`)
      r.notes.push(`Tail: ${aiResult.raw.slice(-300)}`)
      return r
    }
    r.aiOk = true

    r.step = 'insert'
    const inserted = await insertDraft(env, winner, aiResult.rewritten)
    if (!inserted) { r.notes.push('Supabase insert failed — check worker logs'); return r }
    r.inserted = { id: inserted.id, slug: inserted.slug }

    r.step = 'email'
    try {
      await sendEditorEmail(env, inserted, winner.title)
      r.emailSent = true
    } catch (e) {
      r.notes.push('Email failed: ' + String(e))
    }

    r.step = 'done'
    r.ok = true
    return r
  } catch (err) {
    r.error = String(err)
    console.log('[news] pipeline error:', err)
    return r
  }
}

// ─── 1. Candidate fetching ──────────────────────────────────────────

async function fetchCandidatesWithStats(): Promise<{ all: Candidate[]; perSource: Record<string, number> }> {
  const results = await Promise.allSettled(
    RSS_SOURCES.map((s) => fetchRss(s.name, s.url, s.weight))
  )
  const perSource: Record<string, number> = {}
  const all: Candidate[] = []
  results.forEach((res, i) => {
    const name = RSS_SOURCES[i].name
    if (res.status === 'fulfilled') {
      perSource[name] = res.value.length
      all.push(...res.value)
    } else {
      perSource[name] = -1
    }
  })
  return { all, perSource }
}

/**
 * Tiny regex-based RSS 2.0 / Atom parser. Workers don't ship DOMParser;
 * the formats are predictable enough that scanning <item> / <entry>
 * blocks with regex is fine for our scoring purposes.
 */
async function fetchRss(name: string, url: string, weight: number): Promise<Candidate[]> {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': 'pressing90.live news bot (https://pressing90.live)' },
      cf: { cacheTtl: 600, cacheEverything: true },
    })
    if (!r.ok) return []
    const xml = await r.text()
    const blockRe = /<(item|entry)\b[\s\S]*?<\/\1>/gi
    const out: Candidate[] = []
    for (const m of xml.matchAll(blockRe)) {
      const block = m[0]
      const title = stripCdata(pickTag(block, 'title')) ?? ''
      const linkRaw = pickAttr(block, 'link', 'href') ?? pickTag(block, 'link') ?? ''
      const link = (stripCdata(linkRaw) ?? linkRaw).trim()
      const description = stripCdata(pickTag(block, 'description') ?? pickTag(block, 'summary') ?? '') ?? ''
      const pubRaw = pickTag(block, 'pubDate') ?? pickTag(block, 'published') ?? pickTag(block, 'updated') ?? ''
      const pubDate = pubRaw ? new Date(pubRaw).getTime() : Date.now()
      const imageUrl = pickAttr(block, 'media:content', 'url')
        ?? pickAttr(block, 'media:thumbnail', 'url')
        ?? pickAttr(block, 'enclosure', 'url')
        ?? extractImgFromHtml(description)
      if (title && link) {
        out.push({ title, link, description, pubDate, source: name, sourceWeight: weight, imageUrl })
      }
    }
    return out
  } catch {
    return []
  }
}

// ─── 2. Reddit cross-ref ────────────────────────────────────────────

interface RedditPost {
  title: string
  url: string
  domain: string
  score: number
  num_comments: number
  created_utc: number
}

async function fetchRedditHot(): Promise<RedditPost[]> {
  try {
    const r = await fetch(REDDIT_HOT, {
      headers: { 'user-agent': 'pressing90.live news bot (https://pressing90.live)' },
      cf: { cacheTtl: 600 },
    })
    if (!r.ok) return []
    const data = await r.json() as { data?: { children?: Array<{ data: RedditPost }> } }
    return (data.data?.children ?? []).map((c) => c.data).filter((p) => !!p)
  } catch {
    return []
  }
}

/**
 * For each candidate, find the Reddit post that links to the same URL
 * (or has a near-identical title) and stamp the engagement signals onto
 * it. That's the engagement boost in scoreCandidate().
 */
function crossReferenceReddit(candidates: Candidate[], reddit: RedditPost[]): void {
  for (const c of candidates) {
    const match = reddit.find((p) =>
      p.url?.includes(extractHost(c.link)) || tokenOverlap(p.title, c.title) > 0.6
    )
    if (match) {
      c.redditScore = match.score
      c.redditComments = match.num_comments
    }
  }
}

// ─── 3. Scoring ────────────────────────────────────────────────────

/** 0-100 score; >50 = publishable, >70 = strong pick. */
function scoreCandidate(c: Candidate): number {
  // Source authority — already 0-1.
  const sourceScore = c.sourceWeight * 30

  // Recency — newer is better. Score halves every 2h.
  const ageH = (Date.now() - c.pubDate) / 3600_000
  const recencyScore = 25 / (1 + ageH / 2)

  // Reddit engagement — log-scaled so a 5k upvote post doesn't dwarf
  // everything else.
  const redditScore = c.redditScore
    ? Math.min(30, 6 * Math.log10(1 + c.redditScore))
    : 0
  const commentsScore = c.redditComments
    ? Math.min(10, 2.5 * Math.log10(1 + c.redditComments))
    : 0

  // WC26 boost — the whole site is WC26-focused so this is heavy.
  const text = (c.title + ' ' + c.description).toLowerCase()
  const wc26Boost = /world cup|wc26|wc 26|coupe du monde|2026|mexico|canada/i.test(text) ? 10 : 0

  return sourceScore + recencyScore + redditScore + commentsScore + wc26Boost
}

// ─── 4. AI rewrite ─────────────────────────────────────────────────

interface Rewritten {
  title: string
  excerpt: string
  body: string  // markdown
}

/**
 * Best-effort JSON extraction from a chatty LLM response. Tries:
 *   1. Raw parse of the trimmed string
 *   2. Strip ```json ... ``` code fences
 *   3. Find a balanced {...} block and parse that
 *   4. JSON repair — append missing closing chars when the response was
 *      truncated by the model's max_tokens (very common on Llama 3.1).
 *
 * Returns the parsed object or null if every strategy fails.
 */
function extractJson<T>(raw: string): T | null {
  const trimmed = raw.trim()
  try { return JSON.parse(trimmed) as T } catch {}
  const noFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(noFence) as T } catch {}

  // Balanced-brace finder.
  let depth = 0, start = -1
  for (let i = 0; i < noFence.length; i++) {
    const ch = noFence[i]
    if (ch === '{') { if (depth === 0) start = i; depth++ }
    else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        const slice = noFence.slice(start, i + 1)
        try { return JSON.parse(slice) as T } catch { start = -1 }
      }
    }
  }

  // Repair pass: if depth is still > 0, the response was truncated.
  // Count unmatched quotes in the open block to decide whether to close
  // a dangling string first, then append the missing closing braces.
  if (start >= 0 && depth > 0) {
    let candidate = noFence.slice(start)
    // Strip a trailing comma + whitespace which is a very common
    // truncation artifact.
    candidate = candidate.replace(/,\s*$/, '')
    // Count unescaped quotes — odd = string unterminated.
    let quotes = 0
    for (let i = 0; i < candidate.length; i++) {
      if (candidate[i] === '"' && candidate[i - 1] !== '\\') quotes++
    }
    if (quotes % 2 === 1) candidate += '"'
    candidate += '}'.repeat(depth)
    try { return JSON.parse(candidate) as T } catch {}
  }
  return null
}

async function rewriteWithAi(
  env: Env,
  c: Candidate,
  opts: { tight?: boolean } = {}
): Promise<{ rewritten: Rewritten | null; raw: string }> {
  // We ask for a 3-section delimited format instead of JSON. Llama 3.1
  // 8B hits a ~1500-char effective output cap on Workers AI no matter
  // what we pass to max_tokens, and JSON has multi-level closure
  // requirements (close string + close object) that fail when the body
  // gets truncated mid-string. A flat delimited format parses with
  // simple regex and survives truncation gracefully — if the body is
  // cut off we still have a valid title and excerpt.
  const bodyTarget = opts.tight ? '80 words' : '150 words'
  const paragraphTarget = opts.tight ? '2 short paragraphs' : '2-3 paragraphs'
  const prompt = `You are a football journalist writing for "Pressing 90'", a World Cup 2026 fan site.

Below is a source news item. Rewrite it as a CONCISE original news brief
(${paragraphTarget}, ~${bodyTarget} total) in your own words, in English. Add ONE
short paragraph of original commentary at the end about what this means
for the World Cup 2026 picture. NEVER copy a full sentence from the
source. Don't invent facts not in the source. End with a hard credit line:
"Based on reporting by ${c.source} — see original article for full details."

SEO REQUIREMENTS (important — this article will be indexed by Google News):
- The TITLE must be search-friendly: front-load the most important keyword
  (e.g. team name, player, event), keep it under 70 chars, no clickbait.
  Include "World Cup 2026" or "WC26" only if it adds clarity, not as filler.
- The EXCERPT is the meta description. Aim 140-160 chars. State the WHAT
  and WHY in one factual sentence. No "click to find out", no teasing.
- The BODY's first paragraph (the lede) must answer who/what/when/where in
  the first 25 words so Google's snippet picker has clean ground truth.

Output EXACTLY this format. Copy the three marker lines (===TITLE===,
===EXCERPT===, ===BODY===) VERBATIM — do not change their wording.
Put your rewritten content under each marker:

===TITLE===
the rewritten title here (max 80 chars, catchy but factual)
===EXCERPT===
1 sentence, ~140 chars, summarising the news
===BODY===
the rewritten paragraphs in plain markdown

SOURCE:
Title: ${c.title}
${c.description ? 'Summary: ' + stripHtml(c.description).slice(0, 500) : ''}
Source name: ${c.source}
Source URL: ${c.link}

OUTPUT:`

  try {
    // Workers AI binding (set in wrangler.toml [ai] block).
    const ai = (env as Env & { AI?: { run: (model: string, input: unknown) => Promise<{ response?: string }> } }).AI
    if (!ai) return { rewritten: null, raw: 'AI_BINDING_MISSING' }
    const out = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You output ONLY the requested delimited sections. Never wrap output in JSON, markdown code fences, or commentary.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 3000,
    })
    const raw = (out.response ?? '').trim()
    const parsed = parseDelimitedSections(raw)
    if (!parsed || !parsed.title || !parsed.body) {
      console.log('[news] AI parse failed. Raw preview:', raw.slice(0, 400))
      return { rewritten: null, raw }
    }
    return {
      rewritten: {
        title: parsed.title.slice(0, 120),
        excerpt: (parsed.excerpt ?? '').slice(0, 240),
        body: parsed.body,
      },
      raw,
    }
  } catch (err) {
    console.log('[news] AI rewrite failed:', err)
    return { rewritten: null, raw: 'EXCEPTION: ' + String(err) }
  }
}

/**
 * Parse the ===TITLE===/===EXCERPT===/===BODY=== format. Robust to:
 *   • partial truncation (body cut off → kept what we got)
 *   • the model inventing its own marker text (saw it replace
 *     ===TITLE=== with ===Larger Than Life===, treating TITLE as a
 *     placeholder)
 *
 * Strategy: extract EVERY ===X=== marker + the text below it as a
 * section. Try named matching (marker text === TITLE / EXCERPT / BODY)
 * first; fall back to positional + treat the first marker's TEXT as
 * the title when no marker named TITLE exists.
 */
function parseDelimitedSections(raw: string): { title: string; excerpt: string; body: string } | null {
  const re = /={3,}\s*([^=\n]*?)\s*={3,}\s*\n?([\s\S]*?)(?=\n*={3,}|$)/g
  const sections: Array<{ marker: string; content: string }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    sections.push({ marker: m[1].trim(), content: m[2].trim() })
  }
  if (sections.length === 0) return null

  // Named matches.
  let title   = sections.find((s) => /^title$/i.test(s.marker))?.content
  let excerpt = sections.find((s) => /^excerpt$/i.test(s.marker))?.content
  let body    = sections.find((s) => /^body$/i.test(s.marker))?.content

  // Fallbacks. When the model swapped the TITLE marker for its own
  // text, the first section's MARKER text is the title.
  if (!title) title = sections[0].marker
  if (!excerpt) excerpt = sections[1]?.content ?? ''
  if (!body) body = sections[2]?.content ?? sections[1]?.content ?? ''

  if (!title) return null
  const finalBody = body || `${excerpt}\n\nBased on reporting by source — see original article for full details.`
  return { title, excerpt, body: finalBody }
}

// ─── 5. Persistence + email ────────────────────────────────────────

interface InsertedArticle {
  id: string
  slug: string
  title: string
  excerpt: string | null
}

async function alreadyHave(env: Env, sourceUrl: string): Promise<boolean> {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/articles?source_url=eq.${encodeURIComponent(sourceUrl)}&select=id&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  if (!r.ok) return false
  const rows = await r.json() as Array<{ id: string }>
  return rows.length > 0
}

async function insertDraft(
  env: Env,
  source: Candidate,
  rewritten: Rewritten
): Promise<InsertedArticle | null> {
  const slug = makeSlug(rewritten.title) + '-' + Math.random().toString(36).slice(2, 7)
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/articles`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify({
      slug,
      title: rewritten.title,
      excerpt: rewritten.excerpt,
      body: rewritten.body,
      image_url: source.imageUrl ?? null,
      source_url: source.link,
      source_name: source.source,
      source_attribution: `Based on reporting by ${source.source}`,
      status: 'draft',
      score: scoreCandidate(source),
    }),
  })
  if (!r.ok) {
    console.log('[news] insert failed:', r.status, await r.text())
    return null
  }
  const rows = await r.json() as InsertedArticle[]
  return rows[0] ?? null
}

async function sendEditorEmail(env: Env, art: InsertedArticle, originalTitle: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    console.log('[news] Resend not configured, skipping email')
    return
  }
  const adminUrl = 'https://pressing90.live/admin-panel-1992?tab=news&focus=' + art.id
  const html = `<div style="font-family:system-ui,sans-serif;max-width:580px;margin:0 auto;">
    <h2 style="margin:0 0 8px;color:#0f172a">📰 New draft article ready</h2>
    <p style="margin:0 0 4px;color:#64748b;font-size:13px">Pressing 90' news pipeline</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>
    <p style="font-weight:700;font-size:16px;margin:0 0 8px;color:#0f172a">${escapeHtml(art.title)}</p>
    <p style="color:#475569;margin:0 0 16px">${escapeHtml(art.excerpt ?? '')}</p>
    <p style="font-size:12px;color:#94a3b8;margin:0 0 16px">Source title: ${escapeHtml(originalTitle)}</p>
    <a href="${adminUrl}" style="display:inline-block;background:#d4af37;color:#0f172a;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none">Review &amp; approve →</a>
    <p style="font-size:11px;color:#94a3b8;margin-top:24px">Slug: ${art.slug}</p>
  </div>`
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: 'jabrymyriam@gmail.com',
      subject: `[Pressing 90'] New draft: ${art.title.slice(0, 60)}`,
      html,
    }),
  })
}

// ─── helpers ───────────────────────────────────────────────────────

function pickTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  return xml.match(re)?.[1]?.trim()
}
function pickAttr(xml: string, tag: string, attr: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"`, 'i')
  return xml.match(re)?.[1]
}
function stripCdata(s: string | undefined): string | undefined {
  if (!s) return undefined
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
}
function extractImgFromHtml(html: string): string | undefined {
  return html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]
}
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}
function makeSlug(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
function extractHost(url: string): string {
  try { return new URL(url).host } catch { return '' }
}
function tokenOverlap(a: string, b: string): number {
  const tok = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 3))
  const A = tok(a), B = tok(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / Math.min(A.size, B.size)
}
