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
import { drawScoreCard, drawMatchdayPost, drawMatchStory, drawMatchSlide, drawArticlePost, drawArticleStory, registerBrandFonts } from './draw.js'
import { renderReel, musicPath } from './video.js'

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

app.get('/espn/today', async (req, res) => {
  if (!SECRET || req.get('x-studio-secret') !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  const date = String(req.query.date || '').replace(/[^0-9]/g, '').slice(0, 8)
  const leagues = String(req.query.leagues || '').split(',').map((l) => l.trim()).filter((l) => /^[a-z0-9._-]{2,40}$/i.test(l)).slice(0, 40)
  if (!date || leagues.length === 0) return res.status(400).json({ error: 'date + leagues required' })
  const key = date + '|' + leagues.join(',')
  const hit = espnCache.get(key)
  if (hit && Date.now() - hit.t < 60_000) return res.json(hit.body)
  const competitions = await Promise.all(leagues.map(async (slug) => {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${date}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(12000) })
      if (!r.ok) return { slug, events: [], error: r.status }
      const j = await r.json()
      return { slug, events: j.events || [] }
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
  const { type, data } = req.body || {}
  try {
    const url = await serialize(async () => {
      registerBrandFonts()
      let canvas
      switch (type) {
        case 'score': canvas = await drawScoreCard(data); break
        case 'matchday-post': canvas = await drawMatchdayPost(data.matches, data.dateLabel); break
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
async function buildReel({ type, data, voiceUrl, seconds }) {
      registerBrandFonts()
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reel-'))
      const scenes = []
      if (type === 'matchday') {
        const ms = (data.matches || []).slice(0, 8)
        for (let i = 0; i < ms.length; i++) {
          const c = await drawMatchSlide(ms[i], i, ms.length)
          const p = path.join(dir, `s${i}.png`)
          await fs.writeFile(p, c.toBuffer('image/png'))
          scenes.push(p)
        }
      } else if (type === 'article') {
        const c = await drawArticleStory(data)
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
      const music = await musicPath(type === 'matchday' ? 'matchday' : 'article')
      const out = path.join(dir, 'reel.mp4')
      const { seconds: len } = await renderReel({
        scenes, voice, music,
        musicGain: voice ? 0.22 : 0.9,
        seconds: seconds || 20,
        out,
      })
      const buf = await fs.readFile(out)
      const url = await upload(`reel-${type}-${stamp()}.mp4`, buf, 'video/mp4')
      await fs.rm(dir, { recursive: true, force: true })
      return { url, seconds: len }
}

// Async mode (the worker's cron can't wait minutes for ffmpeg on 0.1 CPU):
// with `callbackUrl` we answer 202 at once and POST the result to the
// worker when done. Without it, the render is synchronous (handy for tests).
app.post('/render/reel', async (req, res) => {
  const { type, data, voiceUrl, seconds, callbackUrl, jobId } = req.body || {}
  if (!type) return res.status(400).json({ error: 'missing type' })
  if (callbackUrl && jobId) {
    res.status(202).json({ ok: true, queued: true, jobId, pending })
    serialize(() => buildReel({ type, data, voiceUrl, seconds }))
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
    const result = await serialize(() => buildReel({ type, data, voiceUrl, seconds }))
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.listen(PORT, () => console.log(`p90-studio listening on ${PORT}`))
