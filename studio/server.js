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
import { drawScoreCard, drawMatchdayPost, drawMatchStory, drawMatchSlide, drawArticlePost, drawArticleStory, drawGoalSlide, drawGoalLayers, drawMatchLayers, drawArticleLayers, drawGoalAnimSpec, drawTaleBeatLayers, drawTaleCover, drawLineupPost, drawStoryCover, registerBrandFonts, setTheme } from './draw.js'
import { renderReel, renderGoalAnim, renderAnimatedReel, renderTaleReel, musicPath } from './video.js'
import edgePkg from 'msedge-tts'
import { spawn as spawnChild } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
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
// Scorer nationality (Mehdi, 2026-09-14: goal reels only for Barça matches and Moroccan scorers) — ESPN athlete profile, cached per id.
const athleteCache = new Map()
async function citizenship(id) {
  if (!id) return ''
  if (athleteCache.has(id)) return athleteCache.get(id)
  let c = ''
  try {
    const r = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/${encodeURIComponent(id)}`, { headers: { 'user-agent': UA, accept: 'application/json', referer: 'https://www.espn.com/' }, signal: AbortSignal.timeout(6000) })
    if (r.ok) { const j = await r.json(); c = String((j.athlete || j).citizenship || '') }
  } catch { /* unknown */ }
  if (athleteCache.size > 2000) athleteCache.clear()
  athleteCache.set(id, c)
  return c
}
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
      scorer: (k.participants || [])[0]?.athlete?.displayName || '', scorerId: (k.participants || [])[0]?.athlete?.id || '', assist: (k.participants || [])[1]?.athlete?.displayName || '',
      text: (k.text || '').slice(0, 220), ownGoal: /own goal/i.test(k.type?.text || '') || /own goal/i.test(k.text || ''), penalty: /penalty/i.test(k.type?.text || ''),
      // ESPN play coordinates (2026-09-18, goal recreations): X 0→100 towards the opponent goal, Y 0→100 right→left (attacker's view), Y2 = where it crossed the line.
      x: k.fieldPositionX ?? null, y: k.fieldPositionY ?? null, x2: k.fieldPosition2X ?? null, y2: k.fieldPosition2Y ?? null, playId: k.id || '',
    }))
    // Compact play-by-play with coordinates (the goal recreation reads the plays before the goal: rebounds, blocks, corners).
    const plays = (j.commentary || []).map((c) => { const p = c.play || {}; return { t: c.time?.displayValue || '', type: p.type?.text || '', id: p.id || '', team: p.team?.displayName || '', text: (c.text || '').slice(0, 200), x: p.fieldPositionX ?? null, y: p.fieldPositionY ?? null, x2: p.fieldPosition2X ?? null, y2: p.fieldPosition2Y ?? null } }).filter((p) => p.type)
    for (const g of goals) g.nationality = await citizenship(g.scorerId)
    // Lineups + venue for the editorial posts (2026-09-14): starters with ESPN position codes + formation per side.
    const rosters = (j.rosters || []).map((r) => ({
      side: r.homeAway, team: r.team?.displayName || '', abbr: r.team?.abbreviation || '', formation: r.formation || '',
      players: (r.roster || []).filter((p) => p.starter).map((p) => ({ name: p.athlete?.shortName || p.athlete?.displayName || '', full: p.athlete?.displayName || '', jersey: p.jersey || '', pos: p.position?.abbreviation || '', place: p.formationPlace || 0 })),
      bench: (r.roster || []).filter((p) => !p.starter).map((p) => ({ name: p.athlete?.shortName || p.athlete?.displayName || '', full: p.athlete?.displayName || '', jersey: p.jersey || '', pos: p.position?.abbreviation || '', in: !!p.subbedIn })),
    }))
    const comp = j.header?.competitions?.[0]
    const teams = (comp?.competitors || []).map((t) => ({ side: t.homeAway, id: t.id, name: t.team?.displayName, abbr: t.team?.abbreviation, logo: t.team?.logos?.[0]?.href, score: t.score, color: t.team?.color || '', altColor: t.team?.alternateColor || '' }))
    res.json({ status: 200, goals, plays: String(req.query.plays || '') === '1' ? plays : undefined, rosters, teams, venue: j.gameInfo?.venue?.fullName || '', attendance: j.gameInfo?.attendance || 0, date: comp?.date || '', state: comp?.status?.type?.state || '' })
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
        case 'matchday-post': canvas = await drawMatchdayPost(data.matches, data.dateLabel, { featured: !!data.featured }); break
        case 'tale-cover': canvas = await drawTaleCover(data); break
        case 'matchday-story': canvas = await drawMatchStory(data.matches, data.dateLabel, data.page || 1, data.pages || 1, { featured: !!data.featured }); break
        case 'article-post': canvas = await drawArticlePost(data); break
        case 'article-story': canvas = await drawArticleStory(data); break
        case 'lineup-post': canvas = await drawLineupPost(data); break          // editorial lineup (2026-09-14)
        case 'fulltime-post': canvas = await drawScoreCard(data); break         // editorial full-time poster (scorers + player bust)
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
// Generated assets for the Barça special (rendered locally, hosted on Supabase; cached on disk per boot).
const GOAL_ASSETS = {
  music: 'https://ssvvojhxyotlbcdosiog.supabase.co/storage/v1/object/public/media/music-quake-aavirall.mp3',   // « Quake » (aavirall, Uppbeat) — credit line required in every caption (see worker)
}
const BARCA_ASSETS = {
  confetti: 'https://ssvvojhxyotlbcdosiog.supabase.co/storage/v1/object/public/media/barca-confetti-paper.mp4',   // paper-toned loops (editorial redesign, 2026-09-14)
  roar: 'https://ssvvojhxyotlbcdosiog.supabase.co/storage/v1/object/public/media/sfx-goal-roar.mp3',
  calm: 'https://ssvvojhxyotlbcdosiog.supabase.co/storage/v1/object/public/media/barca-bokeh-paper.mp4',
}
async function cachedAsset(url, name) {
  const p = path.join(os.tmpdir(), name)
  try { const st = await fs.stat(p); if (st.size > 1000) return p } catch { /* download */ }
  const r = await fetch(url); if (!r.ok) throw new Error(`asset ${name} fetch failed ${r.status}`)
  await fs.writeFile(p, Buffer.from(await r.arrayBuffer()))
  return p
}
async function buildReel({ type, data, voiceUrl, seconds, theme }) {
  setTheme(theme || (data && data.theme) || process.env.P90_THEME || 'barca')
      registerBrandFonts()
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reel-'))
      // ── Goal recreation « كيف جاء الهدف » (2026-09-18): scene spec + one voice clip per beat ──
      if (type === 'goal-anim') {
        const spec = data.spec
        if (!spec || !Array.isArray(spec.actors || null) && typeof spec.actors !== 'object') throw new Error('goal-anim: spec required')
        const urls = data.voiceUrls || []
        if (!urls.length) throw new Error('goal-anim: voiceUrls required')
        const voices = []
        for (let i = 0; i < urls.length; i++) { const r = await fetch(urls[i]); if (!r.ok) throw new Error(`voice ${i} fetch failed ${r.status}`); const p = path.join(dir, `v${i}.mp3`); await fs.writeFile(p, Buffer.from(await r.arrayBuffer())); voices.push(p) }
        const music = await cachedAsset(GOAL_ASSETS.music, 'p90-music-quake.mp3')
        const roar = data.roar === false ? null : await cachedAsset(BARCA_ASSETS.roar, 'p90-goal-roar.mp3')
        const confetti = spec.card && spec.card.special === 'barca' ? await cachedAsset(BARCA_ASSETS.confetti, 'p90-barca-confetti-paper.mp4') : null
        const out = path.join(dir, 'reel.mp4')
        // Rendered in a child process (2026-09-18): the frame loop is CPU-bound for ~20-30 min on this 0.1-CPU box; in-process it starved the
        // event loop, /health stopped answering and Render restarted the instance mid-render (job lost, no callback).
        const jobFile = path.join(dir, 'job.json')
        await fs.writeFile(jobFile, JSON.stringify({ spec, voices, music, roar, confetti, dir, out, fps: data.fps || 20, scale: data.scale || 1, upscale: !!data.upscale }))
        await new Promise((resolve, reject) => {
          // `nice -n 19` (2026-09-18): the child still competes for the same 0.1 CPU — at full priority the Express loop lost the race, /health
          // timed out after 5 s and Render restarted the instance mid-render again (Olise, 22:35 UTC). Lowest priority keeps /health answering.
          const child = spawnChild('nice', ['-n', '19', process.execPath, '--max-old-space-size=256', path.join(__dirname, 'goalanim-cli.js'), jobFile], { stdio: ['ignore', 'inherit', 'inherit'] })
          const killer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* ignore */ } }, 100 * 60_000)
          child.on('error', (e) => { clearTimeout(killer); reject(e) })
          child.on('close', (code) => { clearTimeout(killer); code === 0 ? resolve() : reject(new Error('goal-anim child exited ' + code)) })
        })
        const result = JSON.parse(await fs.readFile(out + '.json', 'utf8'))
        if (result.error) throw new Error('goal-anim: ' + result.error.slice(0, 400))
        const { seconds: len, qa } = result
        const buf = await fs.readFile(out)
        const base = `${(spec.id || 'goal').replace(/[^a-z0-9-]/gi, '').slice(0, 40)}-${stamp()}`
        const url = await upload(`reel-goalanim-${base}.mp4`, buf, 'video/mp4')
        // Cover frame (2026-09-19): TikTok drafts arrive with no text and no thumbnail, so the e-mail kit carries one to download.
        // Taken from the hook card unless the job asks for another timestamp.
        let coverUrl
        try {
          const cover = path.join(dir, 'cover.jpg')
          await new Promise((resolve, reject) => {
            const t = Math.max(0, Number(data.coverMs ?? 1200) / 1000)
            const c = spawnChild('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-i', out, '-frames:v', '1', '-q:v', '3', cover], { stdio: ['ignore', 'inherit', 'inherit'] })
            c.on('error', reject); c.on('close', (code) => (code === 0 ? resolve() : reject(new Error('cover ' + code))))
          })
          coverUrl = await upload(`cover-goalanim-${base}.jpg`, await fs.readFile(cover), 'image/jpeg')
        } catch (e) { console.log('[goal-anim] cover frame failed:', String(e).slice(0, 120)) }
        await fs.rm(dir, { recursive: true, force: true })
        return { url, coverUrl, seconds: len, qa }
      }
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
        const calm = await cachedAsset(BARCA_ASSETS.calm, 'p90-barca-bokeh-paper.mp4')   // paper bokeh loop behind every text beat (2026-09-16: kinetic text when there is no photo)
        // Cover variants (2026-09-16): N thumbnails for the same reel body → N files (urls[])
        const coverPngs = []
        for (const [k, cv] of ((data.covers || []).slice(0, 6)).entries()) { const c = await drawStoryCover({ ...cv, lang }); const p = path.join(dir, `cover${k}.png`); await fs.writeFile(p, c.toBuffer('image/png')); coverPngs.push(p) }
        const { seconds: len, outs } = await renderTaleReel({ beats, music, out, covers: coverPngs, buildSpec: async (i, progress, timing) => {
          const L = await drawTaleBeatLayers({ ...beatsIn[i], first: i === 0 }, lang, labels, progress, timing, { bgVideo: calm })
          const layers = {}
          for (const [k, buf] of Object.entries(L.layers)) { layers[k] = path.join(dir, `t${i}-${k}.png`); await fs.writeFile(layers[k], buf) }
          return { layers, anims: L.anims, bgVideo: L.bgVideo }
        } })
        const urls = []
        for (const f of (outs && outs.length ? outs : [out])) urls.push(await upload(`reel-tale-${lang}-${stamp()}.mp4`, await fs.readFile(f), 'video/mp4'))
        await fs.rm(dir, { recursive: true, force: true })
        return { url: urls[0], urls, seconds: len }
      }
      // ── Animated reels (Mehdi, 2026-09-09: one visual language for all reels) ──
      if (['matchday', 'goal', 'article', 'articles'].includes(type)) {
        const specs = []
        if (type === 'matchday') {
          const ms = (data.matches || []).slice(0, 10)
          if (data.special === 'barca' && ms[0] && ms[0].feature) ms[0].bgVideo = await cachedAsset(BARCA_ASSETS.calm, 'p90-barca-bokeh-paper.mp4')   // « يوم برشلونة » slide
          for (let i = 0; i < ms.length; i++) specs.push(await drawMatchLayers(ms[i], i, ms.length, data.heading, data.lang))
        }
        else if (type === 'goal') {
          // Barça special (2026-09-14): looping confetti video under the card + stadium roar at t=0
          if (data.special === 'barca') { data.bgVideo = await cachedAsset(BARCA_ASSETS.confetti, 'p90-barca-confetti-paper.mp4') }
          specs.push(await drawGoalAnimSpec(data))
        }
        else if (type === 'article') specs.push(await drawArticleLayers(data))
        else { const arts = (data.articles || []).slice(0, 4); for (let i = 0; i < arts.length; i++) specs.push(await drawArticleLayers({ ...arts[i], first: i === 0 }, data.heading, data.lang)) }
        if (specs.length === 0) throw new Error('no scenes')
        const slides = []
        for (let i = 0; i < specs.length; i++) {
          const layers = {}
          for (const [k, buf] of Object.entries(specs[i].layers)) { layers[k] = path.join(dir, `s${i}-${k}.png`); await fs.writeFile(layers[k], buf) }
          slides.push({ layers, anims: specs[i].anims, bgVideo: specs[i].bgVideo })   // bgVideo: Barça special (was dropped here → black background, 2026-09-14)
        }
        let voice = null
        if (voiceUrl) { const r = await fetch(voiceUrl); if (!r.ok) throw new Error('voice fetch failed ' + r.status); voice = path.join(dir, 'voice.mp3'); await fs.writeFile(voice, Buffer.from(await r.arrayBuffer())) }
        const music = await musicPath(type === 'matchday' || type === 'goal' ? 'matchday' : 'article')
        const out = path.join(dir, 'reel.mp4')
        const dflt = type === 'goal' ? 9 : type === 'article' ? 12 : type === 'articles' ? 10 * slides.length : 4 * slides.length
        const sfx = type === 'goal' && data.special === 'barca' && data.sfx !== false ? await cachedAsset(BARCA_ASSETS.roar, 'p90-goal-roar.mp3') : null
        const { seconds: len } = await renderAnimatedReel({ slides, voice, music, musicGain: voice ? 0.22 : sfx ? 0.55 : 0.9, seconds: seconds || dflt, out, sfx })
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
          ? await drawMatchStory(data.matches, data.dateLabel, data.page || 1, data.pages || 1, { featured: !!data.featured })
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
// Debug (2026-09-19, missing narration on Render): real-condition mix — the real Edge voice clip (?voice=URL) twice
// (at 0.3 s and 7 s), the real music at 0.16, the roar at 5 s, exactly the goal-anim chain, 15 s → uploaded to media
// so the worker can transcribe it. Async spawn only (a sync probe starved the health check earlier tonight).
app.get('/debug/audio', async (req, res) => {
  if (!SECRET || req.get('x-studio-secret') !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  const { spawn } = await import('node:child_process')
  const sh = (cmd, args) => new Promise((resolve) => { const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let o = '', e = ''; p.stdout.on('data', (d) => { o += d }); p.stderr.on('data', (d) => { e += d; if (e.length > 20000) e = e.slice(-20000) }); p.on('close', (code) => resolve({ code, out: o, err: e })); p.on('error', (err) => resolve({ code: -1, out: '', err: String(err) })) })
  const out = { ffmpeg: (await sh('ffmpeg', ['-version'])).out.split('\n')[0] }
  try {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dbg-'))
    const voiceUrl = String(req.query.voice || '')
    if (!/^https:/.test(voiceUrl)) return res.status(400).json({ error: 'voice url required' })
    const voice = path.join(dir, 'v0.mp3'); const r0 = await fetch(voiceUrl); await fs.writeFile(voice, Buffer.from(await r0.arrayBuffer()))
    const music = await cachedAsset(GOAL_ASSETS.music, 'p90-music-quake.mp3'), roar = await cachedAsset(BARCA_ASSETS.roar, 'p90-goal-roar.mp3')
    out.probeVoice = (await sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'csv=p=0', voice])).out.trim()
    out.probeMusic = (await sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', music])).out.trim()
    const video = path.join(dir, 'full.mp4')
    await sh('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=10:d=15', '-c:v', 'libx264', '-preset', 'ultrafast', video])
    const ms = (x) => Math.round(x * 1000)
    const fc = [
      '[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.16,afade=t=in:st=0:d=0.6,afade=t=out:st=13.5:d=1.5[m]',
      '[2:a]aresample=48000,aformat=channel_layouts=stereo,adelay=' + ms(0.3) + '|' + ms(0.3) + '[v0]',
      '[3:a]aresample=48000,aformat=channel_layouts=stereo,adelay=' + ms(7) + '|' + ms(7) + '[v1]',
      '[4:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.3,afade=t=out:st=2.2:d=1.6,adelay=' + ms(5) + '|' + ms(5) + '[fx]',
      '[v0][v1][m][fx]amix=inputs=4:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95[mix]',
    ]
    const mixed = path.join(dir, 'mix.mp4')
    const r = await sh('ffmpeg', ['-y', '-loglevel', 'warning', '-threads', '1', '-i', video, '-stream_loop', '-1', '-i', music, '-i', voice, '-i', voice, '-i', roar, '-filter_complex', fc.join(';'), '-map', '0:v', '-map', '[mix]', '-t', '15', '-c:v', 'copy', '-ar', '48000', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mixed])
    out.mixCode = r.code; out.mixStderr = r.err.slice(-800)
    const vd = async (f, pre = []) => { const q = await sh('ffmpeg', ['-hide_banner', ...pre, '-i', f, '-af', 'volumedetect', '-f', 'null', '-']); return (q.err.match(/mean_volume:\s*(-?[\d.]+)/) || [])[1] ?? null }
    out.mean_0_5 = await vd(mixed, ['-ss', '0', '-t', '5']); out.mean_9_14 = await vd(mixed, ['-ss', '9', '-t', '5']); out.mean_voice = await vd(voice)
    out.url = await upload('dbg-realmix-' + stamp() + '.mp4', await fs.readFile(mixed), 'video/mp4')
    await fs.rm(dir, { recursive: true, force: true })
  } catch (e) { out.error = String(e && e.stack || e).slice(0, 600) }
  res.json(out)
})
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
