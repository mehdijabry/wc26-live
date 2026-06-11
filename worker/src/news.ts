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

// ─── Entry point ─────────────────────────────────────────────────────

export async function runNewsPipeline(env: Env): Promise<void> {
  try {
    console.log('[news] pipeline start')
    const candidates = await fetchCandidates()
    console.log(`[news] ${candidates.length} candidates fetched`)
    if (candidates.length === 0) return

    // Boost any candidate that also appears in Reddit hot.
    const reddit = await fetchRedditHot()
    crossReferenceReddit(candidates, reddit)

    // Score and pick the best one.
    const scored = candidates
      .map((c) => ({ ...c, score: scoreCandidate(c) }))
      .sort((a, b) => b.score - a.score)
    const winner = scored[0]
    if (!winner) return
    console.log(`[news] winner: "${winner.title}" — score ${winner.score.toFixed(1)} (${winner.source})`)

    // Skip if we already have an article with the same source_url
    // (de-dupe across cron ticks).
    if (await alreadyHave(env, winner.link)) {
      console.log('[news] already in DB, skipping')
      return
    }

    // AI rewrite.
    const rewritten = await rewriteWithAi(env, winner)
    if (!rewritten) {
      console.log('[news] AI returned nothing — abort')
      return
    }

    // Persist as draft.
    const inserted = await insertDraft(env, winner, rewritten)
    if (!inserted) return
    console.log(`[news] draft inserted: ${inserted.slug}`)

    // Notify editor.
    await sendEditorEmail(env, inserted, winner.title)
  } catch (err) {
    console.log('[news] pipeline error:', err)
  }
}

// ─── 1. Candidate fetching ──────────────────────────────────────────

async function fetchCandidates(): Promise<Candidate[]> {
  const results = await Promise.allSettled(
    RSS_SOURCES.map((s) => fetchRss(s.name, s.url, s.weight))
  )
  return results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    // Last 6 hours only — we run every 3, this keeps a safe overlap.
    .filter((c) => Date.now() - c.pubDate < 6 * 3600 * 1000)
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
      const link = pickAttr(block, 'link', 'href') ?? pickTag(block, 'link') ?? ''
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

async function rewriteWithAi(env: Env, c: Candidate): Promise<Rewritten | null> {
  // Build a prompt that asks for paraphrased news + commentary, with
  // the source kept attributed at the end. Explicitly forbid quoting
  // more than a single short phrase to stay on the safe side of fair
  // use.
  const prompt = `You are a football journalist writing for "Pressing 90'", a World Cup 2026 fan site.

Below is a source news item. Rewrite it as a SHORT original news brief
(3-4 paragraphs, ~250 words) in your own words, in English. Add one
paragraph of original commentary at the end about what this means for
the World Cup 2026 picture. NEVER copy a full sentence from the source.
Don't invent facts not in the source. End with a hard credit line:
"Based on reporting by ${c.source} — see original article for full
details."

Output strict JSON with keys: title (string, max 80 chars, catchy but
factual), excerpt (string, 1 sentence ~140 chars summarising the news),
body (markdown string, the 3-4 paragraphs + commentary + credit line).

SOURCE:
Title: ${c.title}
${c.description ? 'Summary: ' + stripHtml(c.description).slice(0, 800) : ''}
Source name: ${c.source}
Source URL: ${c.link}

JSON OUTPUT:`

  try {
    // Workers AI binding (set in wrangler.toml [ai] block).
    const ai = (env as Env & { AI?: { run: (model: string, input: unknown) => Promise<{ response?: string }> } }).AI
    if (!ai) return null
    const out = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You output ONLY valid minified JSON, no markdown code fences, no commentary.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1500,
    })
    const raw = (out.response ?? '').trim()
    // Defensive: some models wrap JSON in ```json ... ```.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    const json = JSON.parse(cleaned) as Partial<Rewritten>
    if (!json.title || !json.body) return null
    return {
      title: json.title.slice(0, 120),
      excerpt: (json.excerpt ?? '').slice(0, 240),
      body: json.body,
    }
  } catch (err) {
    console.log('[news] AI rewrite failed:', err)
    return null
  }
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
