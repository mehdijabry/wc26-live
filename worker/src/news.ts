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
import { withPlaybook } from './playbook'

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
  // FIFA and Goal no longer publish RSS (both URLs return HTML/404) —
  // they are covered by the SEARCH_SUPPLEMENTS below instead.
  { name: 'Footmercato', url: 'https://www.footmercato.net/flux-rss', weight: 0.8 },
]

/**
 * Bing news-search supplements: sources without a usable RSS feed
 * (FIFA, Goal) and a backup for Footmercato. Results carry Bing's
 * indexing lag (hours), so the RSS feed is what gives "at publication
 * time" freshness for Footmercato; the search only fills gaps.
 */
const SEARCH_SUPPLEMENTS: Array<{ name: string; query: string; weight: number }> = [
  { name: 'Footmercato', query: 'site:footmercato.net', weight: 0.8 },
  { name: 'FIFA',        query: 'site:fifa.com',        weight: 0.9 },
  { name: 'Goal',        query: 'site:goal.com',        weight: 0.85 },
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
  // Set to true when the candidate was fetched via a Bing News
  // keyword search. The substring filter further down trusts Bing's
  // fuzzy match for these and skips re-checking — otherwise a Bing
  // article that mentions the keyword only in the article body
  // (not in title/description) gets wrongly dropped.
  fromKeywordSearch?: boolean
  // Main article text fetched through the studio (Render) — press sites
  // block Cloudflare IPs. Feeds the AI rewrite with real facts instead
  // of a 2-line RSS snippet.
  bodyText?: string
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
 *
 * The optional `keyword` parameter narrows the selection to candidates
 * whose title OR description contains the term (case-insensitive,
 * substring match). The base scoring + RSS source mix is untouched —
 * keyword is an ADDITIVE filter that runs AFTER dedup, so the same
 * editorial signals still decide ranking inside the matching subset.
 */
// Botola Pro (Moroccan D1) source pool — none of the big RSS feeds
// above covers it, and Moroccan outlets' own RSS is unreliable from CF
// datacenter IPs, so the Botola poll runs entirely on the multi-
// provider news-search path (same pattern as the Footmercato
// supplement). Three highly credible Moroccan outlets:
//   Le360 Sport   — leading FR-language news site, strong sports desk
//   Hespress      — biggest Moroccan news site (AR), dedicated sport section
//   Al Mountakhab — the country's sports-only daily, Botola-first
const BOTOLA_SEARCHES: Array<{ name: string; query: string; weight: number }> = [
  { name: 'Le360 Sport',   query: 'site:le360.ma botola',                weight: 0.9 },
  { name: 'Hespress',      query: 'site:hespress.com البطولة الاحترافية', weight: 0.9 },
  { name: 'Al Mountakhab', query: 'site:almountakhab.com',              weight: 0.85 },
]

export async function pollTopCandidates(
  env: Env,
  n = 10,
  keyword?: string,
  sources?: string[],
  mode?: 'botola'
): Promise<{ candidates: PolledCandidate[]; diagnostics: Record<string, number | string> }> {
  const diag: Record<string, number | string> = { step: 'rss' }
  setStudioEnv(env)

  // Source filtering — when the caller specifies a subset, restrict the
  // RSS pool to only those source names. Empty / undefined = all sources.
  // Botola mode skips the general RSS pool entirely.
  const activeSources = mode === 'botola'
    ? []
    : sources && sources.length > 0
      ? RSS_SOURCES.filter((s) => sources.includes(s.name))
      : RSS_SOURCES
  diag.activeSources = activeSources.length
  if (mode) diag.mode = mode

  // Footmercato Bing supplement: footmercato.net/feed is unreliable
  // from CF datacenter IPs (returns empty or 403), so when Footmercato
  // is in the active source list we always fire a parallel Bing
  // site: search. Results are relabeled so the panel shows 'Footmercato'
  // as the source rather than the Bing-inferred SLD.
  const includeFootmercato = activeSources.some((s) => s.name === 'Footmercato')
  const footmercatoPromise: Promise<Candidate[]> = includeFootmercato
    ? fetchGoogleNews('site:footmercato.net', 0.8, { sortByDate: true }).then((res) =>
        res.map((c) => ({ ...c, source: 'Footmercato', sourceWeight: 0.8 }))
      ).catch(() => [])
    : Promise.resolve([])

  // Botola mode: fan out the three Moroccan site-searches in parallel.
  const botolaPromise: Promise<Candidate[]> = mode === 'botola'
    ? Promise.all(
        BOTOLA_SEARCHES.map((s) =>
          fetchGoogleNews(s.query, s.weight, { sortByDate: true }).then((res) =>
            res.map((c) => ({ ...c, source: s.name, sourceWeight: s.weight }))
          ).catch(() => [] as Candidate[])
        )
      ).then((lists) => lists.flat())
    : Promise.resolve([])

  const [{ all, perSource }, footmercatoExtra, botolaExtra] = await Promise.all([
    activeSources.length > 0
      ? fetchCandidatesWithStats(activeSources)
      : Promise.resolve({ all: [] as Candidate[], perSource: {} as Record<string, number> }),
    footmercatoPromise,
    botolaPromise,
  ])
  Object.assign(diag, { rssTotal: all.length, ...perSource })
  if (includeFootmercato) diag.footmercatoRaw = footmercatoExtra.length
  if (mode === 'botola') diag.botolaRaw = botolaExtra.length

  // Recency window — 12h so the pool is large enough to survive DB +
  // KV dedup. Freshness is handled by the scoring formula (recency
  // score halves every 2h) rather than a hard cutoff, so recent
  // articles naturally float to the top while older ones only appear
  // when nothing fresher is available. Keyword search widens to 7
  // days: the operator is hunting specific coverage that may be days
  // old. Botola coverage is thinner than European football, so its
  // base window is 48h.
  const isKeyword = !!(keyword && keyword.trim())
  const recencyMs = isKeyword
    ? 7 * 24 * 3600 * 1000
    : (mode === 'botola' ? 48 : 12) * 3600 * 1000
  let candidates = [
    ...all.filter((c) => Date.now() - c.pubDate < recencyMs),
    ...footmercatoExtra.filter((c) => Date.now() - c.pubDate < recencyMs),
    ...botolaExtra.filter((c) => Date.now() - c.pubDate < recencyMs),
  ]
  diag.afterRecency = candidates.length

  // Keyword expansion — when the operator typed a search term, tap
  // Bing News too. The curated RSS feeds miss African / French coverage,
  // so a search like 'ayoub bouaddi' would return nothing from the
  // static pool. Bing pulls in SO FOOT, Hespress and similar within seconds.
  if (keyword && keyword.trim()) {
    const extra = await fetchGoogleNews(keyword.trim())
    diag.bingNewsRaw = extra.length
    const recentExtra = extra.filter((c) => Date.now() - c.pubDate < 7 * 24 * 3600 * 1000)
    diag.bingNewsRecent = recentExtra.length
    candidates = candidates.concat(recentExtra)
  }

  if (candidates.length === 0) return { candidates: [], diagnostics: diag }

  // Reddit signal.
  const reddit = await fetchRedditHot()
  diag.redditHot = reddit.length
  crossReferenceReddit(candidates, reddit)

  // Drop anything already processed (any status). Rejected candidates
  // get a minimal row inserted with status='archived' (see
  // rejectCandidate below), so this same dedup pass swallows them.
  // This is the right default even for keyword search: a rejected
  // article shouldn't reappear when the operator searches the same
  // topic again — that's exactly what reject is supposed to prevent.
  const seen = await fetchAllSourceUrls(env)
  diag.alreadyInDb = seen.size
  candidates = candidates.filter((c) => !seen.has(c.link))
  diag.afterDedup = candidates.length

  // Anti-redundancy: load URLs shown in recent polls from KV so that
  // re-polling always surfaces fresh candidates. TTL = 6h — articles
  // cycle back the next day. We keep the last 200 shown URLs so the
  // list doesn't grow unbounded across many poll sessions.
  const SHOWN_KV_KEY = 'poll:candidates:shown:v1'
  let recentlyShown: string[] = []
  try {
    const raw = await env.CACHE.get(SHOWN_KV_KEY)
    if (raw) recentlyShown = JSON.parse(raw) as string[]
  } catch { /* non-blocking — degrade gracefully if KV unavailable */ }
  if (recentlyShown.length > 0) {
    const shownSet = new Set(recentlyShown)
    const afterKV = candidates.filter((c) => !shownSet.has(c.link))
    // Only apply the KV filter if it leaves at least half a panel's
    // worth of candidates. If it would empty the panel, skip it so
    // the operator always gets something to work with.
    if (afterKV.length >= Math.ceil(n / 2)) {
      candidates = afterKV
      diag.afterShownDedup = candidates.length
    } else {
      diag.afterShownDedup = 'bypassed'
    }
  }

  // Optional keyword filter — narrows to title/description matches but
  // doesn't change the scoring formula or source weights. Bing-
  // fetched candidates (fromKeywordSearch=true) skip the substring
  // check: Bing already matched them on the keyword via fuzzy search
  // (full-body indexing), and a strict title/description substring
  // would drop legitimate hits that only mention the keyword deeper
  // in the article. Static RSS candidates still pass through.
  if (keyword && keyword.trim()) {
    const needle = keyword.trim().toLowerCase()
    candidates = candidates.filter((c) => {
      if (c.fromKeywordSearch) return true
      const hay = (c.title + ' ' + (c.description ?? '')).toLowerCase()
      return hay.includes(needle)
    })
    diag.keyword = keyword.trim()
    diag.afterKeyword = candidates.length
  }

  // Image gate: only present candidates with a thumbnail — an article
  // without an image can't be published attractively. If at least n
  // candidates have images use that pool exclusively; otherwise fall
  // back to the full set so the panel doesn't return empty-handed.
  const withImage = candidates.filter((c) => !!c.imageUrl)
  const pool = withImage.length >= n ? withImage : candidates
  diag.withImage = withImage.length
  diag.pool = pool.length

  // Score, sort, take top N.
  const top = pool
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

  // Persist these URLs as "shown" in KV so re-polling always gives
  // the operator a fresh batch. Slice to -200 to cap memory usage.
  if (top.length > 0) {
    const next = [...recentlyShown, ...top.map((c) => c.link)].slice(-200)
    try {
      await env.CACHE.put(SHOWN_KV_KEY, JSON.stringify(next), { expirationTtl: 6 * 3600 })
    } catch { /* non-blocking */ }
  }

  return { candidates: top, diagnostics: diag }
}

/**
 * Produce a draft from a single candidate the operator picked. Re-runs
 * dedup as a safety check (someone might have raced us), then AI
 * rewrites + inserts + emails.
 */
/**
 * Mark a polled candidate as rejected so it stops resurfacing on every
 * future /poll. Inserts a minimal articles row with status='archived' —
 * the existing dedup pass at fetchAllSourceUrls() picks up source_url
 * across ALL statuses, so the URL never reappears in the candidate
 * stream. No AI runs; no editor email.
 *
 * Operator's flow: they click ✕ Reject on a candidate row in the poll
 * panel. The candidate disappears from the UI immediately, and the
 * worker persists a 'don't show this again' marker.
 */
export async function rejectCandidate(
  env: Env,
  picked: { link: string; title: string; source: string }
): Promise<{ ok: boolean; reason?: string }> {
  if (!picked.link) return { ok: false, reason: 'missing_link' }
  // Idempotent: if a row already exists for this source_url we leave
  // it alone — could be a previously-produced article the operator
  // re-rejected by mistake, in which case touching status would mess
  // up the publish state.
  if (await alreadyHave(env, picked.link)) return { ok: true, reason: 'already_in_db' }
  const slug = 'rejected-' + Math.random().toString(36).slice(2, 8) +
               '-' + Date.now().toString(36)
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/articles`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      slug,
      title: (picked.title || 'rejected candidate').slice(0, 200),
      excerpt: '',
      body: '',
      image_url: null,
      source_url: picked.link,
      source_name: picked.source || 'unknown',
      score: 0,
      status: 'archived',
      archived_at: new Date().toISOString(),
    }),
  })
  if (!r.ok) {
    return { ok: false, reason: `insert_failed_${r.status}` }
  }
  return { ok: true }
}

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
  await enrichCandidate(env, c)

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
  return (await fetchEspnStory(url)).image
}
/** ESPN content API — hero image AND the article body (their HTML pages
 *  bot-challenge every datacenter IP, the JSON API doesn't). */
async function fetchEspnStory(url: string): Promise<{ image: string | null; text: string | null }> {
  const m = url.match(/espn\.com\/[^?]*\/id\/(\d+)/i)
  if (!m) return { image: null, text: null }
  try {
    const r = await fetch(`https://now.core.api.espn.com/v1/sports/news/${m[1]}`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        accept: 'application/json',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    })
    if (!r.ok) return { image: null, text: null }
    // ESPN's content API serves the article object two ways depending
    // on the entry point: bare {…images:[]} OR wrapped in
    // {headlines:[{images:[]}]} (a list endpoint shape they sometimes
    // reuse for single-article reads). Probe both — keeps us robust
    // when ESPN rotates between shapes.
    const j = await r.json() as
      | { images?: unknown[]; story?: string; headlines?: Array<{ images?: unknown[]; story?: string }> }
    const candidates: unknown[] = []
    if (Array.isArray(j.images)) candidates.push(...j.images)
    if (Array.isArray(j.headlines)) {
      for (const h of j.headlines) {
        if (Array.isArray(h.images)) candidates.push(...h.images)
      }
    }
    const storyHtml = j.story ?? j.headlines?.find((h) => typeof h.story === 'string')?.story ?? ''
    const text = storyHtml
      ? storyHtml.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000)
      : ''
    return { image: pickImageUrl(candidates), text: text.length > 200 ? text : null }
  } catch {
    return { image: null, text: null }
  }
}

function pickImageUrl(arr: unknown[]): string | null {
  // ESPN image entries:
  //   { id, type: 'header'|'inline'|'photo', url, width, height, … }
  // Prefer 'header' (the article hero); fall back to anything with a
  // valid url.
  const items = arr.filter((x): x is { type?: string; url?: string } => !!x && typeof x === 'object')
  const header = items.find((i) => i.type === 'header' && typeof i.url === 'string')
  if (header?.url) return header.url
  const any = items.find((i) => typeof i.url === 'string')
  return any?.url ?? null
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

/**
 * Source ladder for the automated pipeline (Mehdi, 2026-09-06): mainly
 * Footmercato, then ESPN, then FIFA, then the rest by reliability and
 * popularity. Each cron run takes the freshest unpublished article of
 * the highest tier that has one; lower tiers only when the upper ones
 * are exhausted. Unknown sources rank last.
 */
export const SOURCE_PRIORITY = ['Footmercato', 'ESPN FC', 'FIFA', 'BBC Sport', 'The Guardian', 'Sky Sports', 'Goal']
/** Only pick articles younger than this — "at publication time". */
export const MAX_PICK_AGE_MS = 3 * 3600 * 1000
/** Live-match pages, score tickers, quizzes… are not articles. */
export function isJunkTitle(title: string): boolean {
  return /\ben direct\b|\blive\b|^match\s|\bcompo(s)?\b.*officielle|\bscore\b.*\ben direct|quiz|\bpronostic|\bstreaming\b|\bsondage\b/i.test(title)
}
export function sourceTier(source: string): number {
  const i = SOURCE_PRIORITY.indexOf(source)
  return i === -1 ? SOURCE_PRIORITY.length : i
}

function extractOgImage(html: string, base: string): string | null {
  const og = html.match(/<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::secure_url)?["']/i)
  if (og) return resolveUrl(og[1], base)
  const tw = html.match(/<meta[^>]+(?:property|name)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']twitter:image["']/i)
  if (tw) return resolveUrl(tw[1], base)
  return null
}

/** Fetch the article through the studio (Render IPs reach footmercato,
 *  ESPN, BBC… where Cloudflare's get 403). Returns og image + main text. */
async function fetchArticleViaStudio(env: Env, url: string): Promise<{ image: string | null; text: string | null }> {
  if (!env.STUDIO_URL || !env.STUDIO_SECRET) return { image: null, text: null }
  try {
    const r = await fetch(`${env.STUDIO_URL}/html?url=${encodeURIComponent(url)}`, {
      headers: { 'x-studio-secret': env.STUDIO_SECRET, 'user-agent': 'p90-worker/1.0' }, signal: AbortSignal.timeout(25000),
    })
    if (!r.ok) return { image: null, text: null }
    const j = await r.json() as { status?: number; url?: string; head?: string; text?: string }
    if (!j.status || j.status >= 400) return { image: null, text: null }
    const image = j.head ? extractOgImage(j.head, j.url || url) : null
    const text = j.text && j.text.length > 200 ? j.text : null
    return { image, text }
  } catch { return { image: null, text: null } }
}

/** Image (og:image) + body text for a candidate: direct fetch first
 *  (works for ESPN's JSON API, some feeds), then the studio proxy. */
export async function enrichCandidate(env: Env, c: Candidate): Promise<void> {
  // The page's og:image (1200 px+) is ALWAYS preferred over the RSS /
  // Bing thumbnail (often 240 px — that is what made the cards blurry
  // on 2026-09-07). The thumbnail only stays as a last resort.
  const thumb = c.imageUrl
  c.imageUrl = undefined
  if (/espn\.com\//i.test(c.link)) {
    const espn = await fetchEspnStory(c.link)
    if (espn.image) c.imageUrl = espn.image
    if (!c.bodyText && espn.text) c.bodyText = espn.text
  }
  if (!c.imageUrl) {
    const direct = await fetchOgImage(c.link)
    if (direct) c.imageUrl = direct
  }
  if (!c.bodyText || !c.imageUrl) {
    const via = await fetchArticleViaStudio(env, c.link)
    if (!c.imageUrl && via.image) c.imageUrl = via.image
    if (!c.bodyText && via.text) c.bodyText = via.text
  }
  if (!c.imageUrl) c.imageUrl = thumb
}

/** Re-fetch the full-size og:image for articles whose image_url is a
 *  thumbnail (ops repair after the 2026-09-07 regression). */
export async function refreshArticleImages(env: Env, sinceIso: string, limit = 5): Promise<string> {
  // ≤ 5 articles per call: each one costs up to 4 subrequests and a
  // Worker invocation is capped at 50.
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?select=id,slug,source_url,image_url&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.asc&limit=${Math.min(8, limit)}`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  })
  const rows = await r.json().catch(() => []) as Array<{ id: string; slug: string; source_url: string; image_url: string | null }>
  const out: string[] = []
  for (const row of rows) {
    const c: Candidate = { title: row.slug, link: row.source_url, description: '', pubDate: Date.now(), source: '', sourceWeight: 0.8, imageUrl: row.image_url ?? undefined }
    await enrichCandidate(env, c)
    if (c.imageUrl && c.imageUrl !== row.image_url) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH', headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify({ image_url: c.imageUrl }),
      })
      out.push(`${row.slug}: updated`)
    } else out.push(`${row.slug}: unchanged`)
  }
  const last = rows[rows.length - 1]
  return out.join(' | ') + (rows.length ? ` || next: since=${(await fetch(`${env.SUPABASE_URL}/rest/v1/articles?select=created_at&id=eq.${encodeURIComponent(last.id)}`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }).then((x) => x.json()).catch(() => [{}]) as Array<{ created_at?: string }>)[0]?.created_at ?? ''}` : ' || done')
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

export async function runNewsPipeline(env: Env, opts: { skipEmail?: boolean } = {}): Promise<PipelineReport> {
  const r: PipelineReport = {
    step: 'init', ok: false, rssBySource: {}, rssTotal: 0,
    candidatesAfterRecency: 0, redditHot: 0, winner: null,
    aiOk: false, inserted: null, emailSent: false, notes: [],
  }
  try {
    r.step = 'rss'
    setStudioEnv(env)
    // RSS pool + the Footmercato search supplement (its RSS feed is
    // unreliable from Cloudflare IPs — same trick as the manual poll).
    const [{ all: rssAll, perSource }, ...supplements] = await Promise.all([
      fetchCandidatesWithStats(),
      ...SEARCH_SUPPLEMENTS.map((s) =>
        fetchGoogleNews(s.query, s.weight, { sortByDate: true })
          .then((res) => res.map((c) => ({ ...c, source: s.name, sourceWeight: s.weight })))
          .catch(() => [] as Candidate[])
      ),
    ])
    // RSS items win over search duplicates of the same URL (better dates).
    const seenLinks = new Set(rssAll.map((c) => c.link))
    const all = [...rssAll]
    r.rssBySource = { ...perSource }
    SEARCH_SUPPLEMENTS.forEach((s, i) => {
      const extra = supplements[i].filter((c) => !seenLinks.has(c.link))
      extra.forEach((c) => seenLinks.add(c.link))
      all.push(...extra)
      r.rssBySource[`${s.name} (search)`] = extra.length
    })
    r.rssTotal = all.length
    // 12h window (Bing indexes Footmercato with a few hours of lag) —
    // extended to 24h if the first pass is empty, to keep things moving
    // when feeds publish less frequently overnight.
    let candidates = all.filter((c) => Date.now() - c.pubDate < 12 * 3600 * 1000)
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
      .filter((c) => c.title.trim().length >= 20 && !isJunkTitle(c.title))
      .map((c) => ({ ...c, score: scoreCandidate(c) }))
      .sort((a, b) => b.score - a.score)

    // Dedup against everything already in DB (any status), then walk
    // the source ladder: Footmercato → ESPN → FIFA → others. Freshness
    // rule (Mehdi): an article is taken close to its publication time —
    // within each tier the NEWEST article wins and it must be younger
    // than MAX_PICK_AGE; older ones are left alone (the cron comes back
    // every 30 min, so nothing fresh = nothing published this round).
    r.step = 'dedup'
    const seen = await fetchAllSourceUrls(env)
    const now = Date.now()
    const fresh = scored.filter((c) => !seen.has(c.link) && now - c.pubDate < MAX_PICK_AGE_MS).sort((a, b) => b.pubDate - a.pubDate)
    let winner: (typeof scored)[number] | undefined
    for (let t = 0; t <= SOURCE_PRIORITY.length; t++) {
      const name = SOURCE_PRIORITY[t] ?? 'other sources'
      const tierPool = fresh.filter((c) => sourceTier(c.source) === t)
      const total = scored.filter((c) => sourceTier(c.source) === t).length
      if (tierPool.length === 0) { r.notes.push(`${name}: nothing fresh (${total} in window, none new & < ${MAX_PICK_AGE_MS / 3600000}h)`); continue }
      winner = tierPool[0]
      r.notes.push(`${name}: picked "${winner.title.slice(0, 70)}" (${Math.round((now - winner.pubDate) / 60000)} min old, ${tierPool.length} fresh)`)
      break
    }
    if (!winner) { r.notes.push('Nothing fresh anywhere — waiting for the next run.'); return r }
    r.winner = { title: winner.title, source: winner.source, score: Number(winner.score.toFixed(1)), link: winner.link }

    // Hero image (og:image) + article text, via the studio when the
    // press site blocks Cloudflare. Image is mandatory for auto-publish.
    await enrichCandidate(env, winner)
    if (winner.bodyText) r.notes.push(`Article text fetched (${winner.bodyText.length} chars)`)

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
    if (opts.skipEmail) {
      r.notes.push('Editor email skipped (automation on)')
    } else {
      try {
        await sendEditorEmail(env, inserted, winner.title)
        r.emailSent = true
      } catch (e) {
        r.notes.push('Email failed: ' + String(e))
      }
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

let studioEnvForRss: Env | null = null
export function setStudioEnv(env: Env): void { studioEnvForRss = env }
async function fetchCandidatesWithStats(pool = RSS_SOURCES): Promise<{ all: Candidate[]; perSource: Record<string, number> }> {
  const results = await Promise.allSettled(
    pool.map((s) => fetchRss(s.name, s.url, s.weight))
  )
  const perSource: Record<string, number> = {}
  const all: Candidate[] = []
  results.forEach((res, i) => {
    const name = pool[i].name
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
    let xml = ''
    try {
      const r = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8' },
        cf: { cacheTtl: 300, cacheEverything: true },
      })
      if (r.ok) xml = await r.text()
    } catch { /* fall through to the studio */ }
    // Blocked / empty from Cloudflare → read the feed through the studio (Render IPs).
    if (!/<(item|entry)\b/i.test(xml) && studioEnvForRss?.STUDIO_URL && studioEnvForRss.STUDIO_SECRET) {
      try {
        const sr = await fetch(`${studioEnvForRss.STUDIO_URL}/raw?url=${encodeURIComponent(url)}`, {
          headers: { 'x-studio-secret': studioEnvForRss.STUDIO_SECRET, 'user-agent': 'p90-worker/1.0' }, signal: AbortSignal.timeout(20000),
        })
        const j = await sr.json() as { status?: number; body?: string }
        if (j.status && j.status < 400 && j.body) xml = j.body
      } catch { /* ignore */ }
    }
    if (!xml) return []
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

/**
 * On-demand source expansion via Google News RSS. Only fires when the
 * operator typed a keyword into the poll input — covers any topic the
 * curated 6 RSS feeds miss (e.g. an 18-year-old Lille midfielder having
 * a breakout WC26 game gets 50+ French / North-African articles within
 * hours, none of which surface on ESPN / BBC / Goal / Sky / Guardian /
 * FIFA).
 *
 * Google News returns titled "Title - Source.com" — we extract the
 * source name from the dedicated <source> tag and strip it from the
 * end of the title so the headline reads cleanly when shown in the
 * poll panel.
 *
 * The link is a Google News redirect URL. Cloudflare's fetch follows
 * redirects by default, so downstream fetchOgImage + the AI rewrite
 * land on the real article without extra handling.
 *
 * hl=fr + gl=FR + ceid=FR:fr biases toward French-language coverage,
 * which is exactly what the operator wants for an Atlas Lions
 * (Morocco) audience. Switch to hl=en if the keyword ever needs an
 * English angle.
 */
async function fetchGoogleNews(keyword: string, weight = 0.8, opts: { sortByDate?: boolean } = {}): Promise<Candidate[]> {
  // Multi-provider fan-out. Google News RSS returns 503 to Cloudflare
  // Worker datacenter IPs, so we run Bing (2 pages for depth), Google,
  // and Yahoo in parallel, then dedup by URL. Bing's pagination doubles
  // the keyword-specific pool when it's the only one answering, and
  // running providers concurrently rather than sequentially shaves ~1s
  // off the operator's wait when they're testing several keywords.
  const q = encodeURIComponent(keyword.trim())
  if (!q) return []
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

  const tryFetch = async (url: string, label: string): Promise<string | null> => {
    try {
      // 5s hard cap — Bing/Google/Yahoo occasionally hang for 20-30s
      // when our CF datacenter hits their soft throttling, dragging
      // the operator's poll wait from <2s to >20s. AbortSignal.timeout
      // gives every provider the same budget; one slow tail won't
      // hold up the rest.
      //
      // 5-min Cloudflare edge cache per URL. Bing aggressively rate-
      // limits repeated requests from the same datacenter IP and will
      // start returning empty <channel> bodies (raw=0) when polled
      // more than ~3x per minute. Caching the RSS at our edge means
      // repeated polls of the same keyword hit cache (instant, free,
      // no rate-limit) and Bing only sees one request per 5 minutes.
      const r = await fetch(url, {
        headers: { 'user-agent': ua, accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' },
        signal: AbortSignal.timeout(5000),
        cf: { cacheTtl: 300, cacheEverything: true },
      })
      if (!r.ok) {
        console.log(`[news] ${label} HTTP ${r.status} for "${keyword}"`)
        return null
      }
      return await r.text()
    } catch (e) {
      console.log(`[news] ${label} threw: ${(e as Error).message}`)
      return null
    }
  }

  // EN + FR Bing in parallel. The site renders in English because the
  // AI rewrite prompt forces English output — the SOURCE article's
  // language doesn't matter, Llama translates as it paraphrases. So
  // we sweep both: EN catches the BBC / Guardian / Worldsoccertalk
  // universe Bing already ranks for our CF US datacenter; FR catches
  // SoFoot / Hespress / MaliActu / RMC coverage that's the only
  // place where African breakout players (Atlas Lions, Algerian
  // Lions) get written about until they cross to a Premier League
  // club. Without FR, niche francophone keywords return empty.
  //
  // Google + Yahoo dropped: Google 503s our CF IP every call; Yahoo's
  // RSS endpoint started returning empty <channel> bodies in mid-2026.
  const sort = opts.sortByDate ? '&sortby=Date' : ''
  const providers: Array<{ label: string; url: string }> = [
    { label: 'Bing EN p1', url: `https://www.bing.com/news/search?q=${q}&format=rss&setlang=en&cc=us&first=1${sort}` },
    { label: 'Bing EN p2', url: `https://www.bing.com/news/search?q=${q}&format=rss&setlang=en&cc=us&first=11${sort}` },
    { label: 'Bing FR p1', url: `https://www.bing.com/news/search?q=${q}&format=rss&setlang=fr&first=1${sort}` },
    { label: 'Bing FR p2', url: `https://www.bing.com/news/search?q=${q}&format=rss&setlang=fr&first=11${sort}` },
  ]

  const responses = await Promise.allSettled(providers.map((p) => tryFetch(p.url, p.label)))
  const all: Candidate[] = []
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i]
    const res = responses[i]
    if (res.status !== 'fulfilled' || !res.value) continue
    const xml = res.value
    const blockRe = /<item\b[^>]*>[\s\S]*?<\/item>/gi
    const out: Candidate[] = []
    for (const m of xml.matchAll(blockRe)) {
      const block = m[0]
      const titleRaw = stripCdata(pickTag(block, 'title')) ?? ''
      const linkRaw = stripCdata(pickTag(block, 'link')) ?? ''
      const description = stripCdata(pickTag(block, 'description') ?? '') ?? ''
      const pubRaw = pickTag(block, 'pubDate') ?? ''
      const pubDate = pubRaw ? new Date(pubRaw).getTime() : Date.now()
      // Prefer the RSS <source> tag (Google News fills it). When absent
      // (Bing, Yahoo), infer the publisher from the link host — strips
      // 'www.' and TLD so 'sofoot.com' becomes 'sofoot'.
      // Bing News and Yahoo wrap article links in a tracking redirect
      // (bing.com/news/apiclick.aspx?...&url=REAL or r.search.yahoo.com/
      // RV=2/RE=.../RU=REAL/RK=2/RS=...) — unwrap so downstream
      // fetchOgImage hits the real article and the publisher inferred
      // from the host is meaningful (sofoot.com not bing.com).
      //
      // HTML-decode the link FIRST so '&amp;' becomes '&' before URL
      // parsing — otherwise URLSearchParams treats the whole tail as
      // one giant param and can't find 'url'.
      const realLink = unwrapNewsLink(decodeHtmlEntities(linkRaw.trim()))
      const sourceFromTag = stripCdata(pickTag(block, 'source'))
      const sourceTag = sourceFromTag ?? publisherFromUrl(realLink) ?? p.label
      const title = titleRaw
        .replace(new RegExp(`\\s*[-|]\\s*${escapeRegex(sourceTag)}\\s*$`, 'i'), '')
        .replace(/\s*-\s*[^-]{1,40}\.(com|net|fr|ma|dz|tn|sn|ci)\s*$/i, '')
        .trim()
      // Bing News RSS exposes the article thumbnail as a Bing-hosted
      // CDN URL on either <News:Image>...</News:Image> (the
      // News:-prefixed RSS extension Bing publishes) or as a
      // media:thumbnail / enclosure node. These URLs are stable
      // image proxies (bing.com/th?id=...) so we can show them
      // directly in the poll candidate row — no extra fetch needed.
      const imageUrl = pickTag(block, 'News:Image')
        ?? pickAttr(block, 'media:thumbnail', 'url')
        ?? pickAttr(block, 'media:content', 'url')
        ?? pickAttr(block, 'enclosure', 'url')
      if (title && realLink) {
        out.push({
          title: decodeHtmlEntities(title),
          link: realLink,
          description: decodeHtmlEntities(description),
          pubDate,
          source: sourceTag,
          sourceWeight: weight,
          imageUrl: imageUrl ? decodeHtmlEntities(imageUrl) : undefined,
          fromKeywordSearch: true,
        })
      }
    }
    console.log(`[news] ${p.label} parsed=${out.length} for "${keyword}"`)
    all.push(...out)
  }
  // Dedup by realLink across all providers. When Bing p1+p2+Google all
  // surface the same SoFoot article, we want the highest-quality source
  // label to win — prefer entries with a non-Bing/non-Google publisher
  // tag (i.e. Google News fills <source>SoFoot</source> properly).
  const seen = new Map<string, Candidate>()
  for (const c of all) {
    const existing = seen.get(c.link)
    if (!existing) {
      seen.set(c.link, c)
      continue
    }
    // Prefer entries with a real publisher name (from <source> tag) over
    // the URL-inferred SLD fallback — the <source> tag is more accurate.
    // Both are now just the clean publisher name; this check keeps the
    // first-seen entry by default, which is fine.
    if (c.source.length > existing.source.length) {
      seen.set(c.link, c)
    }
  }
  return Array.from(seen.values())
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function unwrapNewsLink(url: string): string {
  try {
    const u = new URL(url)
    // Bing News: /news/apiclick.aspx?...&url=<encoded>
    if (u.hostname.endsWith('bing.com')) {
      const inner = u.searchParams.get('url')
      if (inner) return inner
    }
    // Yahoo News: redirect path /RV=2/RE=.../RU=<encoded>/RK=...
    if (u.hostname.includes('yahoo.com')) {
      const m = u.pathname.match(/\/RU=([^/]+)/)
      if (m) {
        try { return decodeURIComponent(m[1]) } catch { /* fallthrough */ }
      }
    }
    return url
  } catch {
    return url
  }
}

function publisherFromUrl(url: string): string | null {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '')
    const parts = h.split('.')
    // Take the SLD (e.g. 'sofoot' from 'sofoot.com', 'lemonde' from
    // 'www.lemonde.fr'). For uk.tv-style cases the SLD is still the
    // recognizable name, so taking parts[parts.length - 2] is correct.
    const sld = parts.length >= 2 ? parts[parts.length - 2] : parts[0]
    return sld.charAt(0).toUpperCase() + sld.slice(1)
  } catch {
    return null
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
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
${c.bodyText ? 'Article text (facts to use — paraphrase, never copy a sentence):\n' + c.bodyText.slice(0, opts.tight ? 1500 : 2600) : ''}
Source name: ${c.source}
Source URL: ${c.link}

OUTPUT:`

  try {
    // Workers AI binding (set in wrangler.toml [ai] block).
    const ai = (env as Env & { AI?: { run: (model: string, input: unknown) => Promise<{ response?: string }> } }).AI
    if (!ai) return { rewritten: null, raw: 'AI_BINDING_MISSING' }
    // llama-3.1-8b-instruct (no suffix) was deprecated on 2026-05-30 with
    // AiError 5028. -fast is the official drop-in replacement: same
    // architecture, same 8B size, same instruction-following quality,
    // just lower latency. No prompt changes needed.
    const out = await ai.run('@cf/meta/llama-3.1-8b-instruct-fast', {
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
 * Translate an English article into Modern Standard Arabic (فصحى).
 *
 * Uses gpt-oss-120b (same model as the AI chat) — Llama 8B is fine for
 * English rewrites but produces stilted, error-prone Arabic. Register:
 * pan-Arab sports journalism (beIN / Kooora style), NOT dialect. Team,
 * player and competition names use their established Arabic media forms.
 * Same 3-marker delimited output as rewriteWithAi so the parser is shared.
 *
 * Returns null on any failure — the caller publishes EN-only rather than
 * blocking the article on a translation hiccup.
 */
export async function translateArticleToArabic(
  env: Env,
  a: { title: string; excerpt: string; body: string }
): Promise<{ title_ar: string; excerpt_ar: string; body_ar: string } | null> {
  const prompt = `أنت مترجم رياضي محترف. ترجم المقال التالي من الإنجليزية إلى العربية الفصحى الحديثة بأسلوب الصحافة الرياضية العربية (beIN Sports، Kooora، الجزيرة الرياضية).

═══ القاعدة الأهم: أسماء الأعلام ═══
أسماء اللاعبين والمدربين والأندية والملاعب تُكتب بالشكل المتداول في الإعلام الرياضي العربي. إذا لم تكن متأكداً من الشكل المتداول، اكتب الاسم بنقل صوتي حرفي دقيق من نطقه الأصلي، حرفاً بحرف، ولا تخترع اسماً مشابهاً أبداً. الخطأ في اسم لاعب خطأ فادح.
- انقل كل مقطع صوتي من الاسم اللاتيني: Ferran → فيران (وليس فوزان)، Rodri → رودري، Vinícius → فينيسيوس، Haaland → هالاند، Bellingham → بيلينغهام، Yamal → يامال، Rashford → راشفورد، Engels → إنغلز، Gakpo → غاكبو.
- إذا ذُكر الاسم أكثر من مرة، اكتبه بنفس الشكل في كل مرة.
- عند نهاية عملك، أعد قراءة كل اسم عَلَم كتبته وقارنه بالاسم اللاتيني في الأصل حرفاً بحرف قبل التسليم.

مرجع الأشكال المتداولة (انسخها كما هي):
- الأندية: Real Madrid → ريال مدريد، Barcelona → برشلونة، Atlético Madrid → أتلتيكو مدريد، Manchester City → مانشستر سيتي، Manchester United → مانشستر يونايتد، Liverpool → ليفربول، Arsenal → أرسنال، Chelsea → تشيلسي، Tottenham → توتنهام، Bayern Munich → بايرن ميونخ، Borussia Dortmund → بوروسيا دورتموند، PSG / Paris St-Germain → باريس سان جيرمان، Juventus → يوفنتوس، Inter Milan → إنتر ميلان، AC Milan → ميلان، Napoli → نابولي، Al Hilal → الهلال، Al Nassr → النصر، Al Ahly → الأهلي، Wydad → الوداد، Raja → الرجاء، Celtic → سيلتيك، West Ham → وست هام، Ajax → أياكس، Benfica → بنفيكا، Porto → بورتو.
- اللاعبون: Mbappé → مبابي، Messi → ميسي، Ronaldo → رونالدو، Salah → صلاح، Hakimi → حكيمي، Ziyech → زياش، Bounou → بونو، En-Nesyri → النصيري، Diaz → دياز، Vinícius Jr → فينيسيوس جونيور، Lewandowski → ليفاندوفسكي، Kane → كين، Saka → ساكا، Foden → فودين، Pedri → بيدري، Gavi → غافي، Lamine Yamal → لامين يامال، Ferran Torres → فيران توريس، Bruno Fernandes → برونو فرنانديز.
- البطولات: World Cup → كأس العالم، Champions League → دوري أبطال أوروبا، Europa League → الدوري الأوروبي، Premier League → الدوري الإنجليزي الممتاز، LaLiga → الدوري الإسباني (الليغا)، Serie A → الدوري الإيطالي، Bundesliga → الدوري الألماني، Ligue 1 → الدوري الفرنسي، Copa del Rey → كأس ملك إسبانيا، FA Cup → كأس الاتحاد الإنجليزي، Community Shield → الدرع الخيرية، Euro → كأس أمم أوروبا، AFCON → كأس الأمم الأفريقية، Copa América → كوبا أمريكا، Club World Cup → كأس العالم للأندية، Saudi Pro League → دوري روشن السعودي، MLS → الدوري الأمريكي.
- عام: transfer → انتقال/صفقة، loan → إعارة، contract → عقد، striker → مهاجم، winger → جناح، midfielder → لاعب وسط، defender → مدافع، goalkeeper → حارس مرمى، head coach → المدرب، preseason → التحضيرات الصيفية / فترة الإعداد، injury → إصابة، fixture → مباراة، matchday → جولة، clean sheet → شباك نظيفة، hat-trick → هاتريك.

═══ قواعد الترجمة ═══
- ترجمة أمينة للمعنى بصياغة عربية طبيعية (ليست حرفية). لا تضف معلومات غير موجودة في الأصل ولا تحذف أي معلومة.
- الأرقام والنتائج والمبالغ بالأرقام العربية الغربية (0-9) كما في الأصل، والعملات كما هي (£22m → 22 مليون جنيه إسترليني، €50m → 50 مليون يورو).
- لا لهجات محلية. لا تشكيل إلا للضرورة.
- العنوان: أقل من 70 حرفاً، يبدأ بالكلمة المفتاحية الأهم (اسم النادي أو اللاعب).
- المقتطف: جملة واحدة إخبارية، 120-160 حرفاً.
- المتن: نفس عدد الفقرات وبنفس التنسيق (markdown بسيط). السطر الأخير (المصدر) يُترجم بصيغة: "استناداً إلى تقرير [اسم المصدر كما هو بالإنجليزية] — راجع المقال الأصلي للتفاصيل الكاملة."

═══ شكل الإخراج ═══
لا تُخرج أي شرح أو تعليق أو مقدمة. فقط الأقسام الثلاثة أدناه، مع نسخ أسطر العلامات حرفياً:

===TITLE===
العنوان المترجم
===EXCERPT===
المقتطف المترجم
===BODY===
المتن المترجم

═══ المقال الأصلي ═══
Title: ${a.title}
Excerpt: ${a.excerpt}
Body:
${a.body}

الإخراج:`
  try {
    type GptOut = { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>; response?: string }
    const ai = (env as Env & { AI?: { run: (model: string, input: unknown) => Promise<GptOut> } }).AI
    if (!ai) return null
    // Same Responses-API call shape ai-chat.ts uses for gpt-oss-120b.
    const out = await ai.run('@cf/openai/gpt-oss-120b', {
      instructions: 'You are a professional Arabic sports translator. Output ONLY the three delimited sections requested — no preamble, no JSON, no code fences.',
      input: [{ role: 'user', content: prompt }],
      max_output_tokens: 4500,
      // 'medium' — the prompt asks the model to re-check every proper
      // noun against the Latin original before answering; 'low' skipped
      // that and produced فوزان for Ferran on the first live test.
      reasoning: { effort: 'medium' },
    })
    let raw = ''
    for (const item of out.output ?? []) {
      if (item.type !== 'message') continue // skip 'reasoning' scratchpad
      for (const c of item.content ?? []) {
        if ((c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string') raw += c.text
      }
    }
    raw = raw.trim() || (out.response ?? '').trim()
    const parsed = parseDelimitedSections(raw)
    if (!parsed || !parsed.title || !parsed.body) {
      console.log('[news:ar] parse failed. Raw preview:', raw.slice(0, 300))
      return null
    }
    // Sanity: the output must actually be Arabic (guards against the
    // model echoing English back).
    const arabicRatio = (parsed.body.match(/[؀-ۿ]/g) ?? []).length / Math.max(1, parsed.body.length)
    if (arabicRatio < 0.3) {
      console.log('[news:ar] output not Arabic enough (ratio', arabicRatio.toFixed(2), ')')
      return null
    }
    return {
      title_ar: parsed.title.slice(0, 160),
      excerpt_ar: (parsed.excerpt ?? '').slice(0, 300),
      body_ar: parsed.body,
    }
  } catch (err) {
    console.log('[news:ar] translation failed:', err)
    return null
  }
}

/**
 * Generate a ready-to-post Facebook caption from a free-form topic.
 * Always written to promote Pressing 90 (pressing90.live). Used by the
 * admin "Social" generator section — the operator types a subject and
 * gets back an engaging post they can edit, schedule or publish.
 */
export async function generateSocialPost(
  env: Env,
  topic: string
): Promise<{ message: string | null; raw: string }> {
  const prompt = [
    'You are the social media manager for "Pressing 90" — a World Cup 2026 live-scores and football news site at pressing90.live.',
    'Write ONE engaging Facebook post about the topic below.',
    'Rules:',
    '- Strong hook on the first line (a question, bold claim, or stat).',
    '- 2 to 4 short punchy sentences total.',
    '- 1 to 3 relevant emojis, used naturally (not every line).',
    '- End with a call to action that drives readers to Pressing 90 for live scores, brackets and news.',
    '- Add 2 to 4 relevant hashtags on the last line (include #WorldCup2026 and #Pressing90).',
    '- Write in English. Output ONLY the post text — no quotes, no preamble, no markdown.',
    '',
    `Topic: ${topic}`,
  ].join('\n')

  try {
    const ai = (env as Env & { AI?: { run: (model: string, input: unknown) => Promise<{ response?: string }> } }).AI
    if (!ai) return { message: null, raw: 'AI_BINDING_MISSING' }
    const out = await ai.run('@cf/meta/llama-3.1-8b-instruct-fast', {
      messages: [
        { role: 'system', content: withPlaybook('You are a concise, high-energy social media copywriter. Output ONLY the post text, no commentary, no surrounding quotes.', 'caption') },
        { role: 'user', content: prompt },
      ],
      max_tokens: 600,
    })
    let msg = (out.response ?? '').trim()
    // Strip accidental surrounding quotes / code fences Llama sometimes adds.
    msg = msg.replace(/^```[a-z]*\n?/i, '').replace(/```$/,'').trim()
    if ((msg.startsWith('"') && msg.endsWith('"')) || (msg.startsWith('“') && msg.endsWith('”'))) {
      msg = msg.slice(1, -1).trim()
    }
    if (!msg) return { message: null, raw: out.response ?? '' }
    return { message: msg, raw: out.response ?? '' }
  } catch (err) {
    console.log('[news] social generate failed:', err)
    return { message: null, raw: 'EXCEPTION: ' + String(err) }
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
