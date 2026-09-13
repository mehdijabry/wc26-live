// Pressing 90' studio — HTTP render service driven by the Cloudflare worker.
//   POST /render/image  {type, data}            → {url}
//   POST /render/reel   {type, data, voiceUrl?} → {url, seconds}
//   GET  /health
// Auth: header x-studio-secret (shared with the worker's STUDIO_SECRET).
// Renders are serialized (one at a time) — the free instance has 0.1 CPU.
import express from 'express'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { drawScoreCard, drawMatchdayPost, drawMatchStory, drawMatchSlide, drawArticlePost, drawArticleStory, drawGoalSlide, drawGoalLayers, drawMatchLayers, drawArticleLayers, drawGoalAnimSpec, drawTaleBeatLayers, drawTaleCover, registerBrandFonts, setTheme } from './draw.js'
import { renderReel, renderGoalAnim, renderAnimatedReel, renderTaleReel, musicPath } from './video.js'
import edgePkg from 'msedge-tts'
const { MsEdgeTTS, OUTPUT_FORMAT } = edgePkg

const PORT = process.env.PORT || 10000
const SECRET = process.env.STUDIO_SECRET || ''
const WORKER = process.env.WORKER_URL || 'https://wc26-api.nameless-violet-5dc1.workers.dev'

const app = express()
app.use(express.json({ limit: '2mb' }))

let queue = Promise.resolve()
let pending = 0
const serialize = (fn) => {
  pending++
  const p = queue.then(fn).finally(() => { pending-- })
  queue = p.catch(() => {})
  return p
}

app.get('/health', (_req, res) => res.json({ ok: true, pending, uptime: Math.round(process.uptime()) }))

// ESPN proxy — ESPN's site API 403s Cloudflare Workers egress IPs, so the
// worker's automation reads today's scoreboards through this box
// (Render/AWS IPs are fine). GET /espn/today?date=YYYYMMDD&leagues=a,b,c
// → {date, competitions:[{slug, events}]}. 60 s in-memory cache per key.
const espnCache = new Map()
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
// Diagnostic: fetch any URL from this box (auth) → {status, head}. Used to
// find which sports endpoints let datacenter IPs through.
app.get('/probe', async (req, res) => {
  if (!SECRET || req.get('x-studio-secret') !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  const url = String(req.query.url || '')
  if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: 'url' })
  const headers = { 'user-agent': UA, accept: 'application/json,text/plain,*/*', 'accept-language': 'en-US,en;q=0.9', referer: 'https://www.espn.com/', origin: 'https://www.espn.com' }
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
    const text = await r.text()
    res.json({ status: r.status, ct: r.headers.get('content-type'), len: text.length, head: text.slice(0, 300) })
  } catch (e) { res.json({ error: String(e.message || e) }) }
})

// Article fetch for the news pipeline — press sites (footmercato.net,
// ESPN, BBC…) often 403 Cloudflare Workers; Render's IPs get through.
// GET /html?url=… → {status, head (first 60 KB), text (main paragraphs)}
const htmlCache = new Map()
app.get('/html', async (req, res) => {
  if (!SECRET || req.get('x-studio-secret') !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  const url = String(req.query.url || '')
  if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: 'url' })
  const hit = htmlCache.get(url)
  if (hit && Date.now() - hit.t < 600_000) return res.json(hit.body)
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(15000) })
    const html = (await r.text()).slice(0, 400_000)
    const head = html.slice(0, 60_000)
    // Main text: <p> paragraphs with a bit of substance, scripts/styles stripped.
    const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    const paras = [...stripped.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 60)
    const text = paras.join('\n\n').slice(0, 6000)
    const body = { status: r.status, url: r.url, head, text }
    htmlCache.set(url, { t: Date.now(), body })
    if (htmlCache.size > 100) htmlCache.delete(htmlCache.keys().next().value)
    res.json(body)
  } catch (e) { res.json({ status: 0, error: String(e.message || e) }) }
})

// Raw fetch (RSS feeds etc.) — GET /raw?url=… → {status, ct, body (≤400 KB)}
app.get('/raw', async (req, res) => {
  if (!SECRET || req.get('x-studio-secret') !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  const url = String(req.query.url || '')
  if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: 'url' })
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(15000) })
    const body = (await r.text()).slice(0, 400_000)
    res.json({ status: r.status, ct: r.headers.get('content-type'), body })
  } catch (e) { res.json({ status: 0, error: String(e.message || e) }) }
})

// Match summary (key events: goals with scorer/minute) — site.web.api works from here.
app.get('/espn/summary', async (req, res) => {
  if (!SECRET || req.get('x-studio-secret') !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  const league = String(req.query.league || ''); const event = String(req.query.event || '').replace(/[^0-9]/g, '')
  if (!/^[a-z0-9._-]{2,40}$/i.test(league) || !event) return res.status(400).json({ error: 'league + event required' })
  try {
    const r = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(league)}/summary?event=${event}`, { headers: { 'user-agent': UA, accept: 'application/json', referer: 'https://www.espn.com/' }, signal: AbortSignal.timeout(12000) })
    if (!r.ok) return res.json({ status: r.status, goals: [] })
    const j = await r.json()
    const goals = (j.keyEvents || []).filter((k) => k.scoringPlay || /goal/i.test(k.type?.text || '')).map((k) => ({
      minute: k.clock?.displayValue || '', type: k.type?.text || '', team: k.team?.displayName || '', teamId: k.team?.id || '',
      scorer: (k.participants || [])[0]?.athlete?.displayName || '', assist: (k.participants || [])[1]?.athlete?.displayName || '',
      text: (k.text || '').slice(0, 220), ownGoal: /own goal/i.test(k.type?.text || '') || /own goal/i.test(k.text || ''), penalty: /penalty/i.test(k.type?.text || ''),
    }))
    res.json({ status: 200, goals })
  } catch (e) { res.json({ status: 0, goals: [], error: String(e.message || e) }) }
})

app.get('/espn/today', async (req, res) => {
  if (!SECRET || req.get('x-studio-secret') !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  const date = String(req.query.date || '').replace(/[^0-9]/g, '').slice(0, 8)
  const leagues = String(req.query.leagues || '').split(',').map((l) => l.trim()).filter((l) => /^[a-z0-9._-]{2,40}$/i.test(l)).slice(0, 40)
  if (!date || leagues.length === 0) return res.status(400).json({ error: 'date + leagues required' })
  const key = date + '|' + leagues.join(',')
  const hit = espnCache.get(key)
  if (hit && Date.now() - hit.t < 60_000) return res.json(hit.body)
  // site.api.espn.com 403s datacenter IPs; the "header" scoreboard on
  // site.web.api.espn.com does not. Its events are reshaped into the
  // site-API layout (competitions[0].competitors[].team…) the worker parses.
  const competitions = await Promise.all(leagues.map(async (slug) => {
    try {
      const r = await fetch(`https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=soccer&league=${encodeURIComponent(slug)}&dates=${date}`, { headers: { 'user-agent': UA, accept: 'application/json', referer: 'https://www.espn.com/' }, signal: AbortSignal.timeout(12000) })
      if (!r.ok) return { slug, events: [], error: r.status }
      const j = await r.json()
      const lg = ((j.sports || [])[0]?.leagues || []).find((l) => l.slug === slug) || (j.sports || [])[0]?.leagues?.[0]
      const events = (lg?.events || []).map((e) => ({
        id: String(e.id),
        date: e.date,
        status: { type: { state: e.fullStatus?.type?.state || e.status || 'pre', completed: !!e.fullStatus?.type?.completed, name: e.fullStatus?.type?.name || '' }, displayClock: e.fullStatus?.displayClock || '' },
        competitions: [{
          venue: e.location ? { fullName: e.location } : undefined,
          competitors: (e.competitors || []).map((c) => ({
            homeAway: c.homeAway, score: c.score ?? '', winner: !!c.winner,
            team: { displayName: c.displayName, shortDisplayName: c.name || c.displayName, abbreviation: c.abbreviation, logo: c.logo },
          })),
        }],
      }))
      return { slug, label: lg?.name, events }
    } catch (e) { return { slug, events: [], error: String(e.message || e) } }
  }))
  const body = { date, competitions, fetchedAt: new Date().toISOString() }
  espnCache.set(key, { t: Date.now(), body })
  if (espnCache.size > 50) espnCache.delete(espnCache.keys().next().value)
  res.json(body)
})

app.use((req, res, next) => {
  if (req.path === '/health') return next()
  if (!SECRET || req.get('x-studio-secret') !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  next()
})

/** Upload a rendered asset through the worker (which owns the storage key). */
async function upload(key, buf, contentType) {
  const r = await fetch(`${WORKER}/studio/media/${key}`, {
    method: 'PUT',
    headers: { 'x-studio-secret': SECRET, 'content-type': contentType, 'user-agent': 'p90-studio/1.0' },
    body: buf,
  })
  if (!r.ok) throw new Error('upload failed ' + r.status + ' ' + (await r.text()).slice(0, 200))
  return (await r.json()).url
}

const stamp = () => new Date().toISOString().slice(0, 10) + '-' + Math.random().toString(36).slice(2, 8)

app.post('/render/image', async (req, res) => {
  const { type, data, theme } = req.body || {}
  try {
    const url = await serialize(async () => {
      registerBrandFonts()
      setTheme(theme || (data && data.theme) || process.env.P90_THEME || 'barca')
      let canvas
      switch (type) {
        case 'score': canvas = await drawScoreCard(data); break
        case 'matchday-post': canvas = await drawMatchdayPost(data.matches, data.dateLabel); break
        case 'tale-cover': canvas = await drawTaleCover(data); break
        case 'matchday-story': canvas = await drawMatchStory(data.matches, data.dateLabel, data.page || 1, data.pages || 1); break
        case 'article-post': canvas = await drawArticlePost(data); break
        case 'article-story': canvas = await drawArticleStory(data); break
        default: throw new Error('unknown image type')
      }
      return upload(`${type}-${stamp()}.png`, canvas.toBuffer('image/png'), 'image/png')
    })
    res.json({ ok: true, url })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

/** Full reel render (scenes → ffmpeg → upload). Shared by sync + async modes. */
async function buildReel({ type, data, voiceUrl, seconds, theme }) {
  setTheme(theme || (data && data.theme) || process.env.P90_THEME || 'barca')
      registerBrandFonts()
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reel-'))
      // ── Football Stories (Mehdi, 2026-09-10): beats with their own voice clips ──
      if (type === 'tale') {
        const lang = data.lang || 'en'
        const labels = data.labels || { like: 'LIKE', comment: 'COMMENT', follow: 'FOLLOW', full: 'Full story → pressing90.live', weekly: 'New story every week' }
        const beatsIn = (data.beats || []).slice(0, 14)
        if (beatsIn.length === 0) throw new Error('no beats')
        const beats = []
        for (let i = 0; i < beatsIn.length; i++) {
          let voice = null
          if (beatsIn[i].voiceUrl) { const r = await fetch(beatsIn[i].voiceUrl); if (!r.ok) throw new Error(`voice ${i} fetch failed ${r.status}`); voice = path.join(dir, `tv${i}.mp3`); await fs.writeFile(voice, Buffer.from(await r.arrayBuffer())) }
          beats.push({ voice, min: beatsIn[i].min })
        }
        const music = await musicPath('tale')
        const out = path.join(dir, 'reel.mp4')
        const { seconds: len } = await renderTaleReel({ beats, music, out, buildSpec: async (i, progress, timing) => {
          const L = await drawTaleBeatLayers({ ...beatsIn[i], first: i === 0 }, lang, labels, progress, timing)
          const layers = {}
          for (const [k, buf] of Object.entries(L.layers)) { layers[k] = path.join(dir, `t${i}-${k}.png`); await fs.writeFile(layers[k], buf) }
          return { layers, anims: L.anims }
        } })
        const buf = await fs.readFile(out)
        const url = await upload(`reel-tale-${lang}-${stamp()}.mp4`, buf, 'video/mp4')
        await fs.rm(dir, { recursive: true, force: true })
        return { url, seconds: len }
      }
      // ── Animated reels (Mehdi, 2026-09-09: one visual language for all reels) ──
      if (['matchday', 'goal', 'article', 'articles'].includes(type)) {
        const specs = []
        if (type === 'matchday') { const ms = (data.matches || []).slice(0, 10); for (let i = 0; i < ms.length; i++) specs.push(await drawMatchLayers(ms[i], i, ms.length, data.heading, data.lang)) }
        else if (type === 'goal') specs.push(await drawGoalAnimSpec(data))
        else if (type === 'article') specs.push(await drawArticleLayers(data))
        else for (const art of (data.articles || []).slice(0, 4)) specs.push(await drawArticleLayers(art, data.heading, data.lang))
        if (specs.length === 0) throw new Error('no scenes')
        const slides = []
        for (let i = 0; i < specs.length; i++) {
          const layers = {}
          for (const [k, buf] of Object.entries(specs[i].layers)) { layers[k] = path.join(dir, `s${i}-${k}.png`); await fs.writeFile(layers[k], buf) }
          slides.push({ layers, anims: specs[i].anims })
        }
        let voice = null
        if (voiceUrl) { const r = await fetch(voiceUrl); if (!r.ok) throw new Error('voice fetch failed ' + r.status); voice = path.join(dir, 'voice.mp3'); await fs.writeFile(voice, Buffer.from(await r.arrayBuffer())) }
        const music = await musicPath(type === 'matchday' || type === 'goal' ? 'matchday' : 'article')
        const out = path.join(dir, 'reel.mp4')
        const dflt = type === 'goal' ? 9 : type === 'article' ? 12 : type === 'articles' ? 10 * slides.length : 4 * slides.length
        const { seconds: len } = await renderAnimatedReel({ slides, voice, music, musicGain: voice ? 0.22 : 0.9, seconds: seconds || dflt, out })
        const buf = await fs.readFile(out)
        const url = await upload(`reel-${type}-${stamp()}.mp4`, buf, 'video/mp4')
        await fs.rm(dir, { recursive: true, force: true })
        return { url, seconds: len }
      }
      const scenes = []
      if (type === 'matchday') {
        const ms = (data.matches || []).slice(0, 10)
        for (let i = 0; i < ms.length; i++) {
          const c = await drawMatchSlide(ms[i], i, ms.length, data.heading)
          const p = path.join(dir, `s${i}.png`)
          await fs.writeFile(p, c.toBuffer('image/png'))
          scenes.push(p)
        }
      } else if (type === 'article') {
        const c = await drawArticleStory(data)
        const p = path.join(dir, 's0.png')
        await fs.writeFile(p, c.toBuffer('image/png'))
        scenes.push(p)
      } else if (type === 'goal') {
        // Animated goal reel: layered PNGs composited by ffmpeg (renderGoalAnim).
        const L = await drawGoalLayers(data)
        const layers = {}
        for (const k of ['bg', 'flash', 'goal', 'home', 'away', 'score', 'scorer', 'minute']) { layers[k] = path.join(dir, `${k}.png`); await fs.writeFile(layers[k], L[k]) }
        let voice = null
        if (voiceUrl) { const r = await fetch(voiceUrl); if (!r.ok) throw new Error('voice fetch failed ' + r.status); voice = path.join(dir, 'voice.mp3'); await fs.writeFile(voice, Buffer.from(await r.arrayBuffer())) }
        const music = await musicPath('matchday')
        const out = path.join(dir, 'reel.mp4')
        const { seconds: len } = await renderGoalAnim({ layers, rest: L.rest, seconds: seconds || 9, music, musicGain: voice ? 0.22 : 0.9, voice, out })
        const buf = await fs.readFile(out)
        const url = await upload(`reel-goal-${stamp()}.mp4`, buf, 'video/mp4')
        await fs.rm(dir, { recursive: true, force: true })
        return { url, seconds: len }
      } else if (type === 'articles') {
        // Article digest reel: one story card per article (2 by default).
        const list = (data.articles || []).slice(0, 4)
        for (let i = 0; i < list.length; i++) {
          const c = await drawArticleStory(list[i])
          const p = path.join(dir, `s${i}.png`)
          await fs.writeFile(p, c.toBuffer('image/png'))
          scenes.push(p)
        }
      } else if (type === 'story-match' || type === 'story-article') {
        // Video story: one still (the story card) with Ken Burns + the
        // stories jingle, 12 s by default. Posted through /video_stories.
        const c = type === 'story-match'
          ? await drawMatchStory(data.matches, data.dateLabel, data.page || 1, data.pages || 1)
          : await drawArticleStory(data)
        const p = path.join(dir, 's0.png')
        await fs.writeFile(p, c.toBuffer('image/png'))
        scenes.push(p)
      } else throw new Error('unknown reel type')
      if (scenes.length === 0) throw new Error('no scenes')
      let voice = null
      if (voiceUrl) {
        const r = await fetch(voiceUrl)
        if (!r.ok) throw new Error('voice fetch failed ' + r.status)
        voice = path.join(dir, 'voice.mp3')
        await fs.writeFile(voice, Buffer.from(await r.arrayBuffer()))
      }
      const isStory = type.startsWith('story-')
      const music = await musicPath(isStory ? 'story' : (type === 'matchday' || type === 'goal') ? 'matchday' : 'article')
      const out = path.join(dir, 'reel.mp4')
      const { seconds: len } = await renderReel({
        scenes, voice, music,
        musicGain: voice ? 0.22 : 0.9,
        seconds: seconds || (isStory ? 12 : type === 'articles' ? 10 * scenes.length : 20),
        out,
      })
      const buf = await fs.readFile(out)
      const url = await upload(`${isStory ? 'story' : 'reel'}-${type}-${stamp()}.mp4`, buf, 'video/mp4')
      await fs.rm(dir, { recursive: true, force: true })
      return { url, seconds: len }
}

// Async mode (the worker's cron can't wait minutes for ffmpeg on 0.1 CPU):
// with `callbackUrl` we answer 202 at once and POST the result to the
// worker when done. Without it, the render is synchronous (handy for tests).
// Free neural voices (Microsoft Edge "read aloud" endpoint, no key) — Mehdi,
// 2026-09-10: Arabic (ar-MA-JamalNeural), English (en-US-AndrewMultilingualNeural),
// French (fr-FR-HenriNeural). Unofficial endpoint → the worker keeps fallbacks.
app.post('/tts', async (req, res) => {
  if (!SECRET || req.get('x-studio-secret') !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  const { text, voice = 'en-US-AndrewMultilingualNeural', rate } = req.body || {}
  if (!text) return res.status(400).json({ error: 'missing text' })
  let tts
  try {
    tts = new MsEdgeTTS()
    await tts.setMetadata(String(voice), OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
    const r = tts.toStream(String(text).slice(0, 3000), rate ? { rate: Number(rate) } : undefined)
    const chunks = []
    for await (const c of (r.audioStream || r)) chunks.push(c)
    const buf = Buffer.concat(chunks)
    if (buf.length < 1000) throw new Error('empty audio')
    res.setHeader('content-type', 'audio/mpeg'); res.send(buf)
  } catch (e) { res.status(502).json({ error: String(e && e.message || e) }) }
  finally { try { tts && tts.close && tts.close() } catch { /* ignore */ } }
})

app.post('/render/reel', async (req, res) => {
  const { type, data, voiceUrl, seconds, callbackUrl, jobId, theme } = req.body || {}
  if (!type) return res.status(400).json({ error: 'missing type' })
  if (callbackUrl && jobId) {
    res.status(202).json({ ok: true, queued: true, jobId, pending })
    serialize(() => buildReel({ type, data, voiceUrl, seconds, theme }))
      .then((r) => ({ jobId, ok: true, ...r }))
      .catch((e) => ({ jobId, ok: false, error: String(e.message || e) }))
      .then(async (payload) => {
        try {
          await fetch(callbackUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-studio-secret': SECRET, 'user-agent': 'p90-studio/1.0' }, body: JSON.stringify(payload) })
        } catch (e) { console.error('callback failed', jobId, e.message) }
      })
    return
  }
  try {
    const result = await serialize(() => buildReel({ type, data, voiceUrl, seconds, theme }))
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.listen(PORT, () => console.log(`p90-studio listening on ${PORT}`))
