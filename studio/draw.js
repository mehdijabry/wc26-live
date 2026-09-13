// Pressing 90' studio — server-side card drawing (node-canvas).
// Same "Match Night" designs as the admin studio (src/lib/newsCards.ts),
// ported to node-canvas so the worker can publish without a browser.
// Automation is ENGLISH ONLY (Mehdi's rule) — `lang` kept for parity.
import { createCanvas, loadImage, registerFont } from 'canvas'
import QRCode from 'qrcode'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// ─── Themes (Mehdi, 2026-09-13) ──────────────────────────────────────────
// 'p90'   = the original navy / gold / green identity (kept for the future
//           general page and its sub-brands);
// 'barca' = « nuit blaugrana » for this page, born as a Barça fan page: deeper
//           blue night, garnet instead of green, warmer gold, a blaugrana chip
//           next to the wordmark and a Barça tagline.
// Only the palette, tagline and chip change — logo, layouts and typography are
// shared. The official crest is NEVER part of the brand mark (trademark): it
// only appears inside match graphics (ESPN crests), like any other club.
export const THEMES = {
  p90:   { NIGHT: '#071B30', CREAM: '#F3EFE6', GOLD: '#D9B54A', RED: '#FF4D5E', GREEN: '#41C97C', LOSER: '#FF4D5E', PHOTO: '#12314F', rgb: { night: '7,27,48', gold: '217,181,74', accent: '65,201,124', flash: '120,255,180' }, tagline: 'L I V E   F O O T B A L L   S C O R E S', chip: null },
  barca: { NIGHT: '#0B1F4B', CREAM: '#F3EFE6', GOLD: '#E4B93E', RED: '#FF4D5E', GREEN: '#D0103A', LOSER: 'rgba(243,239,230,0.5)', PHOTO: '#173463', rgb: { night: '11,31,75', gold: '228,185,62', accent: '208,16,58', flash: '255,150,170' }, tagline: 'B A R Ç A   ·   L I V E   S C O R E S   ·   N E W S', chip: ['#004D98', '#A50044'] },
}
export let THEME = 'barca'
export let NIGHT = THEMES.barca.NIGHT, CREAM = THEMES.barca.CREAM, GOLD = THEMES.barca.GOLD, RED = THEMES.barca.RED, GREEN = THEMES.barca.GREEN, LOSER = THEMES.barca.LOSER, PHOTO = THEMES.barca.PHOTO
let RGB = THEMES.barca.rgb, TAGLINE = THEMES.barca.tagline, CHIP = THEMES.barca.chip
export function setTheme(name) {
  const key = THEMES[name] ? name : 'barca'
  const t = THEMES[key]
  THEME = key; NIGHT = t.NIGHT; CREAM = t.CREAM; GOLD = t.GOLD; RED = t.RED; GREEN = t.GREEN; LOSER = t.LOSER; PHOTO = t.PHOTO; RGB = t.rgb; TAGLINE = t.tagline; CHIP = t.chip
  return key
}
setTheme(process.env.P90_THEME || 'barca')
const night = (a) => `rgba(${RGB.night},${a})`
const gold = (a) => `rgba(${RGB.gold},${a})`
const accent = (a) => `rgba(${RGB.accent},${a})`
const flashTint = (a) => `rgba(${RGB.flash},${a})`
const SITE = process.env.SITE_URL || 'https://pressing90.live'

/** 2D context with the best resampling / anti-aliasing node-canvas offers. */
function ctx2d(canvas) {
  const ctx = canvas.getContext('2d')
  ctx.quality = 'best'
  ctx.patternQuality = 'best'
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.antialias = 'subpixel'
  return ctx
}

let fontsReady = false
export function registerBrandFonts() {
  if (fontsReady) return
  const f = (file, opts) => { try { registerFont(path.join(__dirname, 'fonts', file), opts) } catch (e) { console.warn('font', file, e.message) } }
  f('Anton.ttf', { family: 'Anton' })
  f('Archivo.ttf', { family: 'Archivo' })
  f('Tajawal-Bold.ttf', { family: 'Tajawal', weight: 'bold' })
  f('Tajawal-Medium.ttf', { family: 'Tajawal', weight: '500' })
  f('IBMPlexMono.ttf', { family: 'IBM Plex Mono' })
  fontsReady = true
}

const imgCache = new Map()
/** Fetch with a browser UA (ESPN's CDN + press sites 403 bare clients),
 *  decode with node-canvas. null on any failure → caller falls back. */
export async function loadImg(src) {
  if (!src) return null
  if (imgCache.has(src)) return imgCache.get(src)
  try {
    const r = await fetch(src, {
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36', accept: 'image/avif,image/webp,image/png,image/jpeg,*/*' },
      signal: AbortSignal.timeout(15000),
    })
    if (!r.ok) throw new Error('http ' + r.status)
    const img = await loadImage(Buffer.from(await r.arrayBuffer()))
    if (imgCache.size > 40) imgCache.clear()
    // Bounded cache: decoded photos are 5-8 MB each; unbounded growth across consecutive renders
    // pushed the 512 MB instance over the limit (restart on 2026-09-11 11:08).
    if (imgCache.size >= 6) imgCache.clear()
    imgCache.set(src, img)
    return img
  } catch (e) { console.warn('img', src.slice(0, 80), e.message); return null }
}

/** Brand mark drawn natively (mirror of public/p90-logo.svg): navy tile,
 *  gold "90’", pitch line + centre circle. */
export function paintLogo(ctx, x, y, size) {
  const s = size / 512
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  if (THEME === 'barca') {
    // Our own mark, inspired by the Senyera (Mehdi, 2026-09-13): 9 bands — 5 gold,
    // 4 red — under a night-blue "90’". Not a club crest, not the official flag.
    roundedPath(ctx, 0, 0, 512, 512, 96); ctx.save(); ctx.clip()
    ctx.fillStyle = '#F2C230'; ctx.fillRect(0, 0, 512, 512)
    ctx.fillStyle = '#C8102E'
    for (let i = 1; i < 9; i += 2) ctx.fillRect(0, Math.round(i * 512 / 9), 512, Math.round(512 / 9) + 1)
    ctx.restore()
    ctx.font = '236px Anton'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    ctx.shadowColor = 'rgba(0,0,0,0.30)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5
    ctx.lineJoin = 'round'; ctx.lineWidth = 10; ctx.strokeStyle = '#0B1F4B'; ctx.strokeText('90’', 250, 344)
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#0B1F4B'; ctx.fillText('90’', 250, 344)
    ctx.restore()
    return
  }
  roundedPath(ctx, 0, 0, 512, 512, 96)
  ctx.fillStyle = '#0a2540'; ctx.fill()
  ctx.fillStyle = '#d4af37'
  ctx.font = '210px Anton'
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.fillText('90’', 256, 300)
  ctx.globalAlpha = 0.55
  roundedPath(ctx, 96, 368, 320, 10, 5); ctx.fill()
  ctx.beginPath(); ctx.arc(256, 373, 16, 0, Math.PI * 2)
  ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 8; ctx.stroke()
  ctx.restore()
}

export function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ''
  let overflow = false
  for (const w of words) {
    const probe = cur ? cur + ' ' + w : w
    if (!cur || ctx.measureText(probe).width <= maxWidth) { cur = probe; continue }
    if (lines.length === maxLines - 1) { overflow = true; break }
    lines.push(cur)
    cur = w
  }
  if (!overflow && cur) lines.push(cur)
  const ellipsize = (s) => {
    let l = s
    while (l.length > 1 && ctx.measureText(l + '…').width > maxWidth) l = l.slice(0, -1).trimEnd()
    return l + '…'
  }
  if (overflow) lines[lines.length - 1] = ellipsize(cur ? lines[lines.length - 1] : lines[lines.length - 1])
  // A single word wider than the box (rare, e.g. very long club names) still gets clipped cleanly.
  return lines.map((l) => (ctx.measureText(l).width > maxWidth ? ellipsize(l) : l))
}

/** One-line text that shrinks (down to minSize) before it truncates —
 *  for team names in list rows. Sets ctx.font; returns the text to draw. */
export function fitLine(ctx, text, maxWidth, family, size, minSize) {
  for (let s = size; s >= minSize; s -= 2) {
    ctx.font = `${s}px ${family}`
    if (ctx.measureText(text).width <= maxWidth) return text
  }
  ctx.font = `${minSize}px ${family}`
  return wrapLines(ctx, text, maxWidth, 1)[0]
}

export function roundedPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function paintGround(ctx, W, H) {
  ctx.fillStyle = NIGHT
  ctx.fillRect(0, 0, W, H)
  const g1 = ctx.createRadialGradient(140, -100, 0, 140, -100, 900)
  g1.addColorStop(0, gold(0.16)); g1.addColorStop(1, gold(0))
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H)
  const g2 = ctx.createRadialGradient(W, H, 0, W, H, 1100)
  g2.addColorStop(0, gold(0.10)); g2.addColorStop(1, gold(0))
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H)
}

export async function paintBrandRow(ctx, x = 60, y = 70, size = 110) {
  paintLogo(ctx, x, y, size)
  const s = size / 110
  ctx.textAlign = 'left'
  ctx.fillStyle = CREAM
  ctx.font = `${Math.round(64 * s)}px Anton`
  const tx = x + size + 30 * s
  const ty = y + 60 * s
  ctx.fillText('Pressing', tx, ty)
  const pw = ctx.measureText('Pressing ').width
  ctx.fillStyle = GOLD
  ctx.fillText('90’', tx + pw, ty)
  if (CHIP) {   // blaugrana chip: two bars, our own mark — not the club crest
    const cx = tx + pw + ctx.measureText('90’').width + 26 * s, cy = ty - 46 * s, bw = 12 * s, bh = 50 * s
    ctx.fillStyle = CHIP[0]; roundedPath(ctx, cx, cy, bw, bh, 4 * s); ctx.fill()
    ctx.fillStyle = CHIP[1]; roundedPath(ctx, cx + bw + 6 * s, cy, bw, bh, 4 * s); ctx.fill()
  }
  ctx.fillStyle = 'rgba(243,239,230,0.55)'
  ctx.font = `${Math.round(26 * s)}px "IBM Plex Mono"`
  ctx.fillText(TAGLINE, tx + 2, ty + 42 * s)
}

/** Gold monogram for clubs ESPN has no crest for (same idea as the site). */
export function monogram(name, size = 300) {
  const c = createCanvas(size, size)
  const ctx = ctx2d(c)
  ctx.fillStyle = '#0D2C4B'
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = GOLD; ctx.lineWidth = size * 0.03; ctx.stroke()
  const initials = String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
  ctx.fillStyle = GOLD
  ctx.font = `${Math.round(size * 0.42)}px Anton`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initials, size / 2, size / 2 + size * 0.02)
  return c
}

async function crest(url, name) {
  const img = url ? await loadImg(url) : null
  return img ?? monogram(name)
}

async function drawQR(ctx, text, x, y, size) {
  const qr = createCanvas(360, 360)
  await QRCode.toCanvas(qr, text, { width: 360, margin: 1, color: { dark: NIGHT, light: '#FFFFFF' } })
  roundedPath(ctx, x, y, size, size, 22)
  ctx.fillStyle = '#FFFFFF'; ctx.fill()
  ctx.drawImage(qr, x + 10, y + 10, size - 20, size - 20)
}

// ─── 1. Final score post 1080×1350 ─────────────────────────────────
// m: {home, away, homeLogo, awayLogo, homeScore, awayScore, league, venue?, status?: 'FT'|'AET'|'PEN'}
export async function drawScoreCard(m) {
  registerBrandFonts()
  const W = 1080, H = 1350
  const c = createCanvas(W, H)
  const ctx = ctx2d(c)
  paintGround(ctx, W, H)
  await paintBrandRow(ctx)
  ctx.textAlign = 'right'
  ctx.fillStyle = GOLD
  ctx.font = '30px "IBM Plex Mono"'
  ctx.fillText('F U L L   T I M E', W - 60, 130)
  // League
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(243,239,230,0.7)'
  ctx.font = '34px "IBM Plex Mono"'
  ctx.fillText(m.league || '', W / 2, 300)
  // Crests + score
  const size = 300
  const cy = 620
  const [h, a] = await Promise.all([crest(m.homeLogo, m.home), crest(m.awayLogo, m.away)])
  ctx.drawImage(h, 90, cy - size / 2, size, size)
  ctx.drawImage(a, W - 90 - size, cy - size / 2, size, size)
  const hs = Number(m.homeScore ?? 0), as = Number(m.awayScore ?? 0)
  const hCol = hs === as ? CREAM : hs > as ? GREEN : LOSER
  const aCol = hs === as ? CREAM : as > hs ? GREEN : LOSER
  ctx.font = '190px Anton'
  ctx.textAlign = 'center'
  ctx.fillStyle = hCol; ctx.fillText(String(hs), W / 2 - 120, cy + 68)
  ctx.fillStyle = GOLD; ctx.font = '110px Anton'; ctx.fillText('–', W / 2, cy + 50)
  ctx.font = '190px Anton'; ctx.fillStyle = aCol; ctx.fillText(String(as), W / 2 + 120, cy + 68)
  if (m.status && m.status !== 'FT') {
    ctx.fillStyle = GOLD; ctx.font = '28px "IBM Plex Mono"'; ctx.fillText(m.status, W / 2, cy + 120)
  }
  // Names
  ctx.fillStyle = CREAM
  ctx.font = '46px Anton'
  wrapLines(ctx, m.home, 320, 2).forEach((l, i) => ctx.fillText(l, 90 + size / 2, cy + size / 2 + 70 + i * 52))
  wrapLines(ctx, m.away, 320, 2).forEach((l, i) => ctx.fillText(l, W - 90 - size / 2, cy + size / 2 + 70 + i * 52))
  // Venue
  if (m.venue) {
    ctx.fillStyle = 'rgba(243,239,230,0.5)'
    ctx.font = '26px "IBM Plex Mono"'
    ctx.fillText(wrapLines(ctx, m.venue, 900, 1)[0], W / 2, 1120)
  }
  // Footer pill
  ctx.fillStyle = GOLD
  roundedPath(ctx, W / 2 - 180, H - 110, 360, 60, 30); ctx.fill()
  ctx.fillStyle = NIGHT; ctx.font = '30px "IBM Plex Mono"'
  ctx.fillText('pressing90.live', W / 2, H - 69)
  return c
}

// ─── 2. Match-day post 1080×1350 (list, ≤6 rows) ───────────────────
export async function drawMatchdayPost(matches, dateLabel) {
  registerBrandFonts()
  const W = 1080, H = 1350
  const c = createCanvas(W, H)
  const ctx = ctx2d(c)
  paintGround(ctx, W, H)
  await paintBrandRow(ctx, 60, 60, 96)
  ctx.textAlign = 'center'
  ctx.fillStyle = GOLD; ctx.font = '72px Anton'
  ctx.fillText("TODAY'S MATCHES", W / 2, 290)
  ctx.fillStyle = 'rgba(243,239,230,0.7)'; ctx.font = '28px "IBM Plex Mono"'
  ctx.fillText(dateLabel || '', W / 2, 340)
  const top = 380, rowH = 138, cr = 84
  const rows = matches.slice(0, 6)
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i]; const y = top + i * rowH; const cy = y + (rowH - 18) / 2
    roundedPath(ctx, 48, y, W - 96, rowH - 18, 24)
    ctx.fillStyle = 'rgba(13,44,75,0.85)'; ctx.fill()
    ctx.strokeStyle = 'rgba(243,239,230,0.10)'; ctx.lineWidth = 2; ctx.stroke()
    const [h, a] = await Promise.all([crest(m.homeLogo, m.home), crest(m.awayLogo, m.away)])
    ctx.drawImage(h, 76, cy - cr / 2 - 6, cr, cr)
    ctx.drawImage(a, W - 76 - cr, cy - cr / 2 - 6, cr, cr)
    ctx.fillStyle = CREAM
    ctx.textAlign = 'left'; ctx.fillText(fitLine(ctx, m.home, 270, 'Anton', 34, 24), 76 + cr + 16, cy + 4)
    ctx.textAlign = 'right'; ctx.fillText(fitLine(ctx, m.away, 270, 'Anton', 34, 24), W - 76 - cr - 16, cy + 4)
    const label = m.time || 'VS'
    ctx.font = '26px "IBM Plex Mono"'
    const pw = Math.max(140, ctx.measureText(label).width + 44)
    roundedPath(ctx, W / 2 - pw / 2, cy - 34, pw, 54, 27); ctx.fillStyle = GOLD; ctx.fill()
    ctx.fillStyle = NIGHT; ctx.textAlign = 'center'; ctx.fillText(label, W / 2, cy + 6)
    ctx.fillStyle = 'rgba(243,239,230,0.55)'; ctx.font = '20px "IBM Plex Mono"'
    ctx.fillText(wrapLines(ctx, m.league || '', 400, 1)[0], W / 2, cy + 52)
  }
  ctx.fillStyle = GOLD
  roundedPath(ctx, W / 2 - 180, H - 100, 360, 58, 29); ctx.fill()
  ctx.fillStyle = NIGHT; ctx.font = '30px "IBM Plex Mono"'; ctx.textAlign = 'center'
  ctx.fillText('pressing90.live', W / 2, H - 61)
  return c
}

// ─── 3. Match-day story page 1080×1920 (≤6 rows) ───────────────────
export async function drawMatchStory(matches, dateLabel, page, pages) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const c = createCanvas(W, H)
  const ctx = ctx2d(c)
  paintGround(ctx, W, H)
  await paintBrandRow(ctx, 60, 70, 96)
  if (pages > 1) { ctx.textAlign = 'right'; ctx.fillStyle = GOLD; ctx.font = '30px "IBM Plex Mono"'; ctx.fillText(`${page} / ${pages}`, W - 60, 130) }
  ctx.textAlign = 'center'
  ctx.fillStyle = GOLD; ctx.font = '78px Anton'; ctx.fillText("TODAY'S MATCHES", W / 2, 330)
  ctx.fillStyle = 'rgba(243,239,230,0.7)'; ctx.font = '30px "IBM Plex Mono"'; ctx.fillText(dateLabel || '', W / 2, 392)
  const top = 470, rowH = 190, cr = 96
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]; const y = top + i * rowH; const cy = y + (rowH - 22) / 2
    roundedPath(ctx, 48, y, W - 96, rowH - 22, 28)
    ctx.fillStyle = 'rgba(13,44,75,0.85)'; ctx.fill()
    ctx.strokeStyle = m.live ? 'rgba(255,77,94,0.55)' : 'rgba(243,239,230,0.10)'; ctx.lineWidth = 2; ctx.stroke()
    const [h, a] = await Promise.all([crest(m.homeLogo, m.home), crest(m.awayLogo, m.away)])
    ctx.drawImage(h, 78, cy - cr / 2 - 8, cr, cr)
    ctx.drawImage(a, W - 78 - cr, cy - cr / 2 - 8, cr, cr)
    ctx.fillStyle = CREAM
    ctx.textAlign = 'left'; ctx.fillText(fitLine(ctx, m.home, 265, 'Anton', 38, 26), 78 + cr + 18, cy + 4)
    ctx.textAlign = 'right'; ctx.fillText(fitLine(ctx, m.away, 265, 'Anton', 38, 26), W - 78 - cr - 18, cy + 4)
    const label = m.score ?? m.time ?? 'VS'
    ctx.font = m.score ? '44px Anton' : '30px "IBM Plex Mono"'
    const pw = Math.max(150, ctx.measureText(label).width + 48)
    roundedPath(ctx, W / 2 - pw / 2, cy - 40, pw, 62, 31); ctx.fillStyle = m.live ? RED : GOLD; ctx.fill()
    ctx.fillStyle = m.live ? '#FFFFFF' : NIGHT; ctx.textAlign = 'center'; ctx.fillText(label, W / 2, cy + (m.score ? 12 : 10))
    ctx.fillStyle = 'rgba(243,239,230,0.55)'; ctx.font = '22px "IBM Plex Mono"'
    ctx.fillText(wrapLines(ctx, m.league || '', 420, 1)[0], W / 2, cy + 66)
  }
  const footY = Math.max(top + matches.length * rowH + 30, 1620)
  await drawQR(ctx, `${SITE}/today?ref=fb-story`, W - 60 - 180, footY, 180)
  ctx.fillStyle = GOLD; roundedPath(ctx, 60, footY + 20, 360, 60, 30); ctx.fill()
  ctx.fillStyle = NIGHT; ctx.font = '30px "IBM Plex Mono"'; ctx.textAlign = 'center'; ctx.fillText('pressing90.live', 240, footY + 60)
  ctx.fillStyle = 'rgba(243,239,230,0.7)'; ctx.textAlign = 'left'; ctx.font = 'bold 26px Archivo'
  wrapLines(ctx, 'Live scores: scan or visit our profile', 520, 2).forEach((l, i) => ctx.fillText(l, 60, footY + 128 + i * 36))
  return c
}

// ─── 4. Reel slide 1080×1920 (one match) ───────────────────────────
export async function drawMatchSlide(m, idx, total, heading) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const c = createCanvas(W, H)
  const ctx = ctx2d(c)
  ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, W, H)
  const g1 = ctx.createRadialGradient(W / 2, 500, 0, W / 2, 500, 1100)
  g1.addColorStop(0, gold(0.14)); g1.addColorStop(1, gold(0))
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H)
  paintLogo(ctx, W / 2 - 55, 120, 110)
  ctx.textAlign = 'center'; ctx.fillStyle = CREAM; ctx.font = '58px Anton'; ctx.fillText('Pressing 90’', W / 2, 310)
  ctx.fillStyle = GOLD; ctx.font = '44px "IBM Plex Mono"'; ctx.fillText(heading || "TODAY'S MATCHES", W / 2, 400)
  ctx.fillStyle = 'rgba(243,239,230,0.65)'; ctx.font = '34px "IBM Plex Mono"'; ctx.fillText(m.league || '', W / 2, 560)
  const size = 300, cy = 850
  const [h, a] = await Promise.all([crest(m.homeLogo, m.home), crest(m.awayLogo, m.away)])
  ctx.drawImage(h, 120, cy - size / 2, size, size)
  ctx.drawImage(a, W - 120 - size, cy - size / 2, size, size)
  ctx.fillStyle = GOLD; ctx.font = '90px Anton'; ctx.fillText(m.score ?? 'VS', W / 2, cy + 30)
  ctx.fillStyle = CREAM; ctx.font = '44px Anton'
  wrapLines(ctx, m.home, 380, 2).forEach((l, i) => ctx.fillText(l, 120 + size / 2, cy + size / 2 + 80 + i * 52))
  wrapLines(ctx, m.away, 380, 2).forEach((l, i) => ctx.fillText(l, W - 120 - size / 2, cy + size / 2 + 80 + i * 52))
  if (m.live) {
    ctx.fillStyle = RED; roundedPath(ctx, W / 2 - 140, 1380, 280, 90, 45); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = '48px Anton'; ctx.fillText('LIVE', W / 2, 1442)
  } else if (m.time) {
    ctx.fillStyle = GOLD; roundedPath(ctx, W / 2 - 170, 1380, 340, 90, 45); ctx.fill()
    ctx.fillStyle = NIGHT; ctx.font = '30px "IBM Plex Mono"'; ctx.fillText(m.time, W / 2, 1440)
  }
  ctx.fillStyle = 'rgba(243,239,230,0.5)'; ctx.font = '28px "IBM Plex Mono"'; ctx.fillText('pressing90.live', W / 2, 1700)
  ctx.fillStyle = GOLD; ctx.font = '26px "IBM Plex Mono"'; ctx.fillText(`${idx + 1} / ${total}`, W / 2, 1760)
  return c
}

// ─── 5. Article post 1080×1350 (split: photo + generated panel + QR) ─
export async function drawArticlePost(a) {
  registerBrandFonts()
  const W = 1080, H = 1350, PHOTO_H = 700
  const c = createCanvas(W, H)
  const ctx = ctx2d(c)
  paintGround(ctx, W, H)
  const img = await loadImg(a.image_url)
  if (img) {
    const s = Math.max(W / img.width, PHOTO_H / img.height)
    const dw = img.width * s, dh = img.height * s
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, PHOTO_H); ctx.clip()
    ctx.drawImage(img, (W - dw) / 2, (PHOTO_H - dh) / 2, dw, dh); ctx.restore()
    const fade = ctx.createLinearGradient(0, PHOTO_H - 240, 0, PHOTO_H)
    fade.addColorStop(0, night(0)); fade.addColorStop(1, night(1))
    ctx.fillStyle = fade; ctx.fillRect(0, PHOTO_H - 240, W, 240)
  }
  await paintBrandRow(ctx, 60, 728, 78)
  ctx.fillStyle = GOLD; ctx.textAlign = 'right'; ctx.font = '28px "IBM Plex Mono"'; ctx.fillText('N E W   A R T I C L E', W - 64, 782)
  const titleTop = 910
  if (a.lang === 'ar') {
    // Arabic headline: Tajawal, right-aligned, gold bar on the right
    ctx.fillStyle = GOLD; ctx.fillRect(W - 70, titleTop - 50, 10, 168)
    ctx.fillStyle = CREAM; ctx.font = 'bold 60px Tajawal'; ctx.textAlign = 'right'
    wrapLines(ctx, a.title, W - 220, 3).forEach((l, i) => ctx.fillText(l, W - 104, titleTop + i * 80))
    ctx.textAlign = 'left'
  } else {
    ctx.fillStyle = GOLD; ctx.fillRect(60, titleTop - 50, 10, 168)
    ctx.fillStyle = CREAM; ctx.font = '62px Anton'; ctx.textAlign = 'left'
    wrapLines(ctx, a.title, W - 220, 3).forEach((l, i) => ctx.fillText(l, 104, titleTop + i * 80))
  }
  const qrCard = 190, qrX = W - 60 - qrCard, qrY = H - 60 - qrCard
  await drawQR(ctx, `${SITE}/news/${a.slug}?ref=fb-post`, qrX, qrY, qrCard)
  ctx.fillStyle = GOLD; roundedPath(ctx, 60, qrY + 30, 340, 58, 29); ctx.fill()
  ctx.fillStyle = NIGHT; ctx.font = '30px "IBM Plex Mono"'; ctx.textAlign = 'center'; ctx.fillText('pressing90.live', 230, qrY + 68)
  ctx.fillStyle = 'rgba(243,239,230,0.6)'; ctx.font = '24px "IBM Plex Mono"'; ctx.textAlign = 'left'
  ctx.fillText('full article → link in post · or scan', 60, qrY + 140)
  return c
}

// ─── 6. Article story 1080×1920 (QR + visit our profile) ────────────
export async function drawArticleStory(a) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const c = createCanvas(W, H)
  const ctx = ctx2d(c)
  paintGround(ctx, W, H)
  await paintBrandRow(ctx)
  ctx.textAlign = 'left'; ctx.fillStyle = GOLD; ctx.font = '36px "IBM Plex Mono"'; ctx.fillText('N E W   A R T I C L E', 64, 300)
  const img = await loadImg(a.image_url)
  if (img) {
    const y = 340, h = 760
    roundedPath(ctx, 60, y, W - 120, h, 36); ctx.save(); ctx.clip()
    const s = Math.max((W - 120) / img.width, h / img.height)
    const dw = img.width * s, dh = img.height * s
    ctx.drawImage(img, 60 + ((W - 120) - dw) / 2, y + (h - dh) / 2, dw, dh)
    const fade = ctx.createLinearGradient(0, y + h - 260, 0, y + h)
    fade.addColorStop(0, night(0)); fade.addColorStop(1, night(0.92))
    ctx.fillStyle = fade; ctx.fillRect(60, y, W - 120, h); ctx.restore()
  }
  const titleTop = 1190
  ctx.fillStyle = GOLD; ctx.fillRect(60, titleTop - 58, 10, 190)
  ctx.fillStyle = CREAM; ctx.font = '72px Anton'; ctx.textAlign = 'left'
  wrapLines(ctx, a.title, W - 220, 3).forEach((l, i) => ctx.fillText(l, 104, titleTop + i * 92))
  const cardY = 1500, cardH = 320
  roundedPath(ctx, 60, cardY, W - 120, cardH, 36); ctx.fillStyle = '#FFFFFF'; ctx.fill()
  const qr = createCanvas(480, 480)
  await QRCode.toCanvas(qr, `${SITE}/news/${a.slug}?ref=fb-story`, { width: 480, margin: 1, color: { dark: NIGHT, light: '#FFFFFF' } })
  ctx.drawImage(qr, 96, cardY + 35, 250, 250)
  const tx = 96 + 250 + 44
  ctx.fillStyle = NIGHT; ctx.font = '52px Anton'; ctx.textAlign = 'left'; ctx.fillText('Scan the QR code', tx, cardY + 105)
  ctx.fillStyle = '#3A4C63'; ctx.font = 'bold 34px Archivo'
  wrapLines(ctx, 'or visit our profile to read the full article', (W - 96) - tx, 2).forEach((l, i) => ctx.fillText(l, tx, cardY + 170 + i * 46))
  ctx.fillStyle = GOLD; roundedPath(ctx, tx, cardY + 232, 340, 56, 28); ctx.fill()
  ctx.fillStyle = NIGHT; ctx.font = '30px "IBM Plex Mono"'; ctx.textAlign = 'center'; ctx.fillText('pressing90.live', tx + 170, cardY + 270)
  return c
}

// ─── 7. GOAL alert slide 1080×1920 ─────────────────────────────────
// g: {home, away, homeLogo, awayLogo, homeScore, awayScore, league, scorer, minute, scoringSide:'home'|'away', ownGoal?, penalty?}
// ─── Animated slide layers (Mehdi, 2026-09-09: « tous les reels animés du même style ») ─
// Each builder returns transparent PNG layers + an `anims` timeline that
// video.js turns into an ffmpeg graph (see animSlide). Timings in seconds.
const PNG = (c) => c.toBuffer('image/png')

/** Match slide (matchday / results): bg + home + away + score + pill. */
export async function drawMatchLayers(m, idx, total, heading, lang) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const bg = createCanvas(W, H); { const ctx = ctx2d(bg)
    ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, W, H)
    const g1 = ctx.createRadialGradient(W / 2, 500, 0, W / 2, 500, 1100)
    g1.addColorStop(0, gold(0.14)); g1.addColorStop(1, gold(0))
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H)
    paintLogo(ctx, W / 2 - 55, 120, 110)
    ctx.textAlign = 'center'; ctx.fillStyle = CREAM; ctx.font = '58px Anton'; ctx.fillText('Pressing 90’', W / 2, 310)
    ctx.fillStyle = 'rgba(243,239,230,0.65)'; ctx.font = '34px "IBM Plex Mono"'; ctx.fillText(m.league || '', W / 2, 560)
    ctx.fillStyle = 'rgba(243,239,230,0.5)'; ctx.font = '28px "IBM Plex Mono"'; ctx.fillText('pressing90.live', W / 2, 1700)
    ctx.fillStyle = GOLD; ctx.font = '26px "IBM Plex Mono"'; ctx.fillText(`${idx + 1} / ${total}`, W / 2, 1760) }
  const head = createCanvas(900, 70); { const ctx = ctx2d(head)
    ctx.textAlign = 'center'; ctx.fillStyle = GOLD; ctx.font = lang === 'ar' ? 'bold 46px Tajawal' : '44px "IBM Plex Mono"'; ctx.fillText(heading || "TODAY'S MATCHES", 450, 52) }
  const size = 300
  const [hImg, aImg] = await Promise.all([crest(m.homeLogo, m.home), crest(m.awayLogo, m.away)])
  const team = (img, name) => { const c = createCanvas(360, 440); const ctx = ctx2d(c)
    ctx.drawImage(img, 30, 0, size, size)
    ctx.textAlign = 'center'; ctx.fillStyle = CREAM; ctx.font = '44px Anton'
    wrapLines(ctx, name, 380, 2).forEach((l, i) => ctx.fillText(l, 180, size + 80 + i * 52)); return c }
  const home = team(hImg, m.home), away = team(aImg, m.away)
  const score = createCanvas(500, 200); { const ctx = ctx2d(score)
    ctx.textAlign = 'center'; ctx.fillStyle = GOLD; ctx.font = '90px Anton'
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6
    ctx.fillText(m.score ?? 'VS', 250, 150) }
  const pill = createCanvas(400, 100); { const ctx = ctx2d(pill); ctx.textAlign = 'center'
    if (m.live) { ctx.fillStyle = RED; roundedPath(ctx, 60, 0, 280, 90, 45); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '48px Anton'; ctx.fillText('LIVE', 200, 62) }
    else if (m.time) { ctx.fillStyle = GOLD; roundedPath(ctx, 30, 0, 340, 90, 45); ctx.fill(); ctx.fillStyle = NIGHT; ctx.font = '30px "IBM Plex Mono"'; ctx.fillText(m.time, 200, 60) } }
  return {
    layers: { bg: PNG(bg), head: PNG(head), home: PNG(home), away: PNG(away), score: PNG(score), pill: PNG(pill) },
    // First slide: everything readable from the first frame (audit: viewers leave within 3 s), later slides animate in.
    anims: idx === 0 ? [
      { layer: 'head', x: 90, y: 352, w: 900, h: 70, fade: { st: 0, d: 0.1 } },
      { layer: 'home', x: 90, y: 700, fade: { st: 0, d: 0.1 } },
      { layer: 'away', x: 630, y: 700, fade: { st: 0, d: 0.1 } },
      { layer: 'score', x: 290, y: 730, w: 500, h: 200, pop: { from: 1.6, st: 0.05, d: 0.3 }, fade: { st: 0, d: 0.1 } },
      { layer: 'pill', x: 340, y: 1380, fade: { st: 0.2, d: 0.2 } },
    ] : [
      { layer: 'head', x: 90, y: 352, w: 900, h: 70, pop: { from: 1.6, st: 0.05, d: 0.35 }, fade: { st: 0.05, d: 0.2 } },
      { layer: 'home', x: 90, y: 700, slide: { dx: -460, dy: 0, st: 0.2, d: 0.55 }, fade: { st: 0.2, d: 0.25 } },
      { layer: 'away', x: 630, y: 700, slide: { dx: 460, dy: 0, st: 0.2, d: 0.55 }, fade: { st: 0.2, d: 0.25 } },
      { layer: 'score', x: 290, y: 730, w: 500, h: 200, pop: { from: 2.4, st: 0.6, d: 0.4 }, fade: { st: 0.6, d: 0.15 } },
      { layer: 'pill', x: 340, y: 1380, slide: { dx: 0, dy: 90, st: 1.0, d: 0.4 }, fade: { st: 1.0, d: 0.3 } },
    ],
  }
}

/** Article slide (article reels): bg + kicker + photo + title + QR card. */
// heading + lang (2026-09-13): the Arabic « برشلونة اليوم » digest reuses this
// layout with Tajawal, right-to-left title and an Arabic QR card.
export async function drawArticleLayers(a, heading, lang) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const ar = lang === 'ar'
  const bg = createCanvas(W, H); { const ctx = ctx2d(bg); paintGround(ctx, W, H); await paintBrandRow(ctx) }
  const kicker = createCanvas(900, 70); { const ctx = ctx2d(kicker)
    if (ar) { ctx.textAlign = 'right'; ctx.fillStyle = GOLD; ctx.font = 'bold 44px Tajawal'; ctx.fillText(heading || 'خبر جديد', 900, 54) }
    else { ctx.textAlign = 'left'; ctx.fillStyle = GOLD; ctx.font = '36px "IBM Plex Mono"'; ctx.fillText(heading || 'N E W   A R T I C L E', 0, 50) } }
  const pw = W - 120, ph = 760
  const photo = createCanvas(pw, ph); { const ctx = ctx2d(photo)
    const img = await loadImg(a.image_url)
    roundedPath(ctx, 0, 0, pw, ph, 36); ctx.save(); ctx.clip()
    if (img) { const s = Math.max(pw / img.width, ph / img.height); const dw = img.width * s, dh = img.height * s; ctx.drawImage(img, (pw - dw) / 2, (ph - dh) / 2, dw, dh) }
    else { ctx.fillStyle = PHOTO; ctx.fillRect(0, 0, pw, ph) }
    const fade = ctx.createLinearGradient(0, ph - 260, 0, ph)
    fade.addColorStop(0, night(0)); fade.addColorStop(1, night(0.92))
    ctx.fillStyle = fade; ctx.fillRect(0, 0, pw, ph); ctx.restore() }
  const title = createCanvas(960, 340); { const ctx = ctx2d(title)
    if (ar) {
      ctx.fillStyle = GOLD; ctx.fillRect(950, 0, 10, 190)
      ctx.fillStyle = CREAM; ctx.font = 'bold 64px Tajawal'; ctx.textAlign = 'right'
      wrapLines(ctx, a.title, W - 220, 3).forEach((l, i) => ctx.fillText(l, 916, 62 + i * 92))
    } else {
      ctx.fillStyle = GOLD; ctx.fillRect(0, 0, 10, 190)
      ctx.fillStyle = CREAM; ctx.font = '72px Anton'; ctx.textAlign = 'left'
      wrapLines(ctx, a.title, W - 220, 3).forEach((l, i) => ctx.fillText(l, 44, 58 + i * 92))
    } }
  const card = createCanvas(960, 320); { const ctx = ctx2d(card)
    roundedPath(ctx, 0, 0, 960, 320, 36); ctx.fillStyle = '#FFFFFF'; ctx.fill()
    const qr = createCanvas(480, 480)
    await QRCode.toCanvas(qr, `${SITE}/news/${a.slug}?${ar ? 'lang=ar&' : ''}ref=fb-story`, { width: 480, margin: 1, color: { dark: NIGHT, light: '#FFFFFF' } })
    ctx.drawImage(qr, 36, 35, 250, 250)
    const tx = 36 + 250 + 44
    if (ar) {
      ctx.fillStyle = NIGHT; ctx.font = 'bold 50px Tajawal'; ctx.textAlign = 'right'; ctx.fillText('امسح الرمز', 924, 100)   // no Latin inside the Arabic line (bidi flips it)
      ctx.fillStyle = '#3A4C63'; ctx.font = '500 34px Tajawal'
      wrapLines(ctx, 'أو ادخل إلى موقعنا لقراءة الخبر كاملاً', 960 - 36 - tx, 2).forEach((l, i) => ctx.fillText(l, 924, 165 + i * 46))
    } else {
      ctx.fillStyle = NIGHT; ctx.font = '52px Anton'; ctx.textAlign = 'left'; ctx.fillText('Scan the QR code', tx, 105)
      ctx.fillStyle = '#3A4C63'; ctx.font = 'bold 34px Archivo'
      wrapLines(ctx, 'or visit our profile to read the full article', 960 - 36 - tx, 2).forEach((l, i) => ctx.fillText(l, tx, 170 + i * 46))
    }
    ctx.fillStyle = GOLD; roundedPath(ctx, tx, 232, 340, 56, 28); ctx.fill()
    ctx.fillStyle = NIGHT; ctx.font = '30px "IBM Plex Mono"'; ctx.textAlign = 'center'; ctx.fillText('pressing90.live', tx + 170, 270) }
  return {
    layers: { bg: PNG(bg), kicker: PNG(kicker), photo: PNG(photo), title: PNG(title), card: PNG(card) },
    anims: [
      { layer: 'photo', x: 60, y: 340, slide: { dx: 0, dy: 70, st: 0.1, d: 0.7 }, fade: { st: 0.1, d: 0.45 } },
      { layer: 'kicker', x: 64, y: 250, w: 900, h: 70, pop: { from: 1.8, st: 0.55, d: 0.35 }, fade: { st: 0.55, d: 0.15 } },
      { layer: 'title', x: 60, y: 1132, slide: { dx: -90, dy: 0, st: 0.85, d: 0.5 }, fade: { st: 0.85, d: 0.3 } },
      { layer: 'card', x: 60, y: 1500, slide: { dx: 0, dy: 130, st: 1.35, d: 0.5 }, fade: { st: 1.35, d: 0.3 } },
    ],
  }
}

/** Goal slide as a generic animated spec (same timings as the validated goal reel). */
export async function drawGoalAnimSpec(g) {
  const L = await drawGoalLayers(g)
  const r = L.rest
  return {
    layers: { bg: L.bg, flash: L.flash, goal: L.goal, home: L.home, away: L.away, score: L.score, scorer: L.scorer, minute: L.minute },
    // Audit 2026-09-13: 80-85 % of viewers leave before 3 s and the scorer used to
    // appear at 1.9 s — the whole payoff (GOAL, teams, score, scorer, minute) is
    // now on screen within half a second, the motion is only an accent.
    anims: [
      { layer: 'flash', x: 0, y: 0, fade: { st: 0, d: 0.06 }, out: { st: 0.12, d: 0.6 } },
      { layer: 'goal', x: r.goal[0], y: r.goal[1], w: 1000, h: 320, pop: { from: 2.2, st: 0, d: 0.35 }, fade: { st: 0, d: 0.1 } },
      { layer: 'home', x: r.home[0], y: r.home[1], slide: { dx: -260, dy: 0, st: 0.05, d: 0.4 }, fade: { st: 0.05, d: 0.15 } },
      { layer: 'away', x: r.away[0], y: r.away[1], slide: { dx: 260, dy: 0, st: 0.05, d: 0.4 }, fade: { st: 0.05, d: 0.15 } },
      { layer: 'score', x: r.score[0], y: r.score[1], slide: { dx: 0, dy: 50, st: 0.1, d: 0.35 }, fade: { st: 0.1, d: 0.2 } },
      { layer: 'scorer', x: r.scorer[0], y: r.scorer[1], slide: { dx: 0, dy: 80, st: 0.15, d: 0.4 }, fade: { st: 0.15, d: 0.2 } },
      { layer: 'minute', x: r.minute[0], y: r.minute[1], fade: { st: 0.2, d: 0.25 } },
    ],
  }
}

// ─── FOOTBALL STORIES ("tale") — Mehdi, 2026-09-10: retention reels telling a
// true, strange football story in 10 animated beats, EN / FR / AR. ──────────
const TALE_FONT = (lang, size, bold = true) => lang === 'ar' ? `${bold ? 'bold ' : ''}${size}px Tajawal` : `${size}px Anton`
const TALE_MONO = (lang, size) => lang === 'ar' ? `500 ${size}px Tajawal` : `${size}px "IBM Plex Mono"`
function taleBg(glow) {
  const W = 1080, H = 1920
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, W, H)
  const g = ctx.createRadialGradient(W / 2, 700, 0, W / 2, 700, 1000)
  g.addColorStop(0, glow === 'gold' ? gold(0.16) : accent(0.16)); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  const v = ctx.createRadialGradient(W / 2, H / 2, 500, W / 2, H / 2, 1300); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
  paintLogo(ctx, 60, 100, 84)
  ctx.textAlign = 'left'; ctx.fillStyle = CREAM; ctx.font = '44px Anton'; ctx.fillText('Pressing 90’', 164, 158)
  ctx.fillStyle = 'rgba(243,239,230,0.55)'; ctx.font = '24px "IBM Plex Mono"'; ctx.fillText('F O O T B A L L   S T O R I E S', 164, 194)
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(243,239,230,0.45)'; ctx.font = '28px "IBM Plex Mono"'; ctx.fillText('pressing90.live', W / 2, 1800)
  return c
}
function taleKicker(text, lang) { const c = createCanvas(960, 80); const ctx = ctx2d(c); ctx.textAlign = 'center'; ctx.fillStyle = GOLD; ctx.font = TALE_MONO(lang, lang === 'ar' ? 44 : 40); ctx.fillText(text, 480, 56); return c }
// Coloured subtitles (Mehdi, 2026-09-10): key words pop in the accent colour —
// *marked* words, ALL-CAPS words, numbers / scores / times — with a soft
// highlight behind them, so the eye catches the important word first.
// Words as drawn: no *markers*, no emoji (the studio has no colour-emoji font — a
// 👇 came out as a tofu box on 2026-09-13), and in Arabic a trailing neutral mark
// (. , : ! …) moves to the front of the word: node-canvas lays the isolated word
// out left-to-right, so that is the only way the mark lands at the END of the
// word for a right-to-left reader ("سجل .مدهش" seen on the Adema preview).
const taleWord = (w, rtl) => {
  let t = w.replace(/\*/g, '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim()
  if (rtl) t = t.replace(/^(.+?)([.,:;!…]+)$/u, '$2$1')
  return t
}
function taleCaption(text, lang, size, hotColor) {
  const m = ctx2d(createCanvas(10, 10)); m.font = TALE_FONT(lang, size)
  const lines = []
  for (const para of String(text).split('\n')) lines.push(...wrapLines(m, para, 940, 6))
  const lh = size * (lang === 'ar' ? 1.3 : 1.12)
  const c = createCanvas(1000, Math.min(760, Math.round(lines.length * lh + 30))); const ctx = ctx2d(c)
  ctx.font = TALE_FONT(lang, size)
  const isHot = (w) => /^\*.+\*[^\w]*$/.test(w) || /^[A-ZÀ-ÜÉÈÊ][A-ZÀ-ÜÉÈÊ'’-]{2,}[!?.,…:]*$/.test(w) || /\d+[–\-:]\d+|^\d{2,4}[!?.,:]*$|^[£$€]\s?\d|^\d+\s?[£$€%]|^×\d/.test(w)
  const rtl = lang === 'ar'
  lines.forEach((l, i) => {
    const y = size + i * lh
    const words = l.split(' ').filter(Boolean)
    const widths = words.map((w) => ctx.measureText(taleWord(w, rtl)).width)
    const space = ctx.measureText(' ').width
    const total = widths.reduce((s, w) => s + w, 0) + space * (words.length - 1)
    // right-to-left languages: lay the words out from the right edge
    let x = rtl ? 500 + total / 2 : 500 - total / 2
    words.forEach((w, k) => {
      const hot = isHot(w)
      const ww = widths[k]
      const wx = rtl ? x - ww : x
      if (hot) { ctx.save(); ctx.shadowColor = 'transparent'; ctx.fillStyle = hotColor === GOLD ? gold(0.18) : accent(0.18); roundedPath(ctx, wx - 10, y - size * 0.86, ww + 20, size * 1.08, 14); ctx.fill(); ctx.restore() }
      ctx.textAlign = 'left'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6
      ctx.fillStyle = hot ? hotColor : CREAM
      ctx.fillText(taleWord(w, rtl), wx, y)
      x = rtl ? wx - space : x + ww + space
    })
  })
  return c
}
function taleBadge(code, colors) { const c = createCanvas(220, 220); const ctx = ctx2d(c); const cx = 110, cy = 110
  ctx.beginPath(); ctx.arc(cx, cy, 104, 0, Math.PI * 2); ctx.fillStyle = colors[0]; ctx.fill()
  ctx.beginPath(); ctx.arc(cx, cy, 104, -Math.PI / 2, Math.PI / 2); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fillStyle = colors[1]; ctx.fill()
  ctx.beginPath(); ctx.arc(cx, cy, 104, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke()
  ctx.beginPath(); ctx.arc(cx, cy, 62, 0, Math.PI * 2); ctx.fillStyle = NIGHT; ctx.fill()
  ctx.textAlign = 'center'; ctx.fillStyle = CREAM; ctx.font = '44px Anton'; ctx.fillText(code, cx, cy + 16); return c }
function taleScoreboard(v, lang) { const c = createCanvas(960, 300); const ctx = ctx2d(c)
  roundedPath(ctx, 0, 20, 960, 260, 40); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = gold(0.5); ctx.stroke()
  ctx.drawImage(taleBadge(v.hCode, v.hColors), 50, 40, 190, 190); ctx.drawImage(taleBadge(v.aCode, v.aColors), 720, 40, 190, 190)
  ctx.textAlign = 'center'; ctx.font = String(v.h).length > 2 || String(v.a).length > 2 ? '110px Anton' : '150px Anton'
  ctx.fillStyle = v.hl === 'h' ? GREEN : CREAM; ctx.fillText(String(v.h), 390, 200)
  ctx.fillStyle = GOLD; ctx.font = '90px Anton'; ctx.fillText('–', 480, 185)
  ctx.font = String(v.h).length > 2 || String(v.a).length > 2 ? '110px Anton' : '150px Anton'; ctx.fillStyle = v.hl === 'a' ? GREEN : CREAM; ctx.fillText(String(v.a), 570, 200)
  ctx.fillStyle = 'rgba(243,239,230,0.7)'; ctx.font = TALE_MONO(lang, 26); ctx.fillText(v.home, 145, 268); ctx.fillText(v.away, 815, 268)
  if (v.tag) { ctx.fillStyle = RED; roundedPath(ctx, 380, 0, 200, 44, 22); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = TALE_FONT(lang, 26); ctx.fillText(v.tag, 480, 31) }
  return c }
function taleMark(text, color) { const size = text.length > 4 ? 260 : text.length > 2 ? 340 : 420; const c = createCanvas(960, 520); const ctx = ctx2d(c); ctx.textAlign = 'center'; ctx.fillStyle = color === 'gold' ? GOLD : GREEN; ctx.font = `${size}px Anton`; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30; ctx.fillText(text, 480, 260 + size * 0.38); return c }
function talePitch(v, lang) { const c = createCanvas(960, 560); const ctx = ctx2d(c)
  roundedPath(ctx, 30, 30, 900, 500, 24); ctx.fillStyle = accent(0.10); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(243,239,230,0.6)'; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(480, 30); ctx.lineTo(480, 530); ctx.stroke(); ctx.beginPath(); ctx.arc(480, 280, 90, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeRect(30, 150, 120, 260); ctx.strokeRect(810, 150, 120, 260)
  ctx.fillStyle = GOLD; ctx.fillRect(18, 220, 12, 120); ctx.fillRect(930, 220, 12, 120)
  const arrow = (x1, y1, x2, y2, col) => { ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); const ang = Math.atan2(y2 - y1, x2 - x1); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 34 * Math.cos(ang - 0.5), y2 - 34 * Math.sin(ang - 0.5)); ctx.lineTo(x2 - 34 * Math.cos(ang + 0.5), y2 - 34 * Math.sin(ang + 0.5)); ctx.closePath(); ctx.fill() }
  if (v.mode === 'both') { arrow(480, 280, 190, 280, RED); arrow(480, 280, 770, 280, RED) }
  else if (v.mode === 'one') { arrow(480, 280, 770, 280, RED) }
  else if (v.mode === 'empty') { ctx.fillStyle = 'rgba(243,239,230,0.35)'; ctx.font = '120px Anton'; ctx.textAlign = 'center'; ctx.fillText('?', 700, 320) }
  ctx.textAlign = 'center'; ctx.fillStyle = CREAM; ctx.font = TALE_MONO(lang, 30); if (v.bottom) ctx.fillText(v.bottom, 480, 480)
  ctx.fillStyle = GOLD; ctx.font = TALE_MONO(lang, 24); if (v.top) ctx.fillText(v.top, 480, 90)
  return c }
function taleQuote() { const c = createCanvas(960, 520); const ctx = ctx2d(c); ctx.textAlign = 'center'; ctx.fillStyle = GOLD; ctx.font = '420px Anton'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30; ctx.fillText('”', 480, 430); return c }
function taleCta(labels, lang) { const c = createCanvas(960, 420); const ctx = ctx2d(c); ctx.textAlign = 'center'
  const icon = { heart: (x, y) => { ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.bezierCurveTo(x - 22, y - 14, x - 2, y - 26, x, y - 10); ctx.bezierCurveTo(x + 2, y - 26, x + 22, y - 14, x, y + 8); ctx.closePath(); ctx.fill() },
    bubble: (x, y) => { roundedPath(ctx, x - 18, y - 20, 36, 26, 8); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 8, y + 5); ctx.lineTo(x - 2, y + 14); ctx.lineTo(x + 4, y + 5); ctx.closePath(); ctx.fill() },
    plus: (x, y) => { ctx.fillRect(x - 3, y - 18, 6, 36); ctx.fillRect(x - 18, y - 3, 36, 6) } }
  const pill = (x, label, col, ic) => { roundedPath(ctx, x, 0, 290, 96, 48); ctx.fillStyle = col; ctx.fill(); ctx.fillStyle = NIGHT; icon[ic](x + 46, 48); ctx.font = TALE_FONT(lang, 38); ctx.fillText(label, x + 165, 62) }
  // Mehdi, 2026-09-13: Meta demotes explicit like / comment asks (engagement bait) — only the follow pill stays.
  pill(335, labels.follow, GOLD, 'plus')
  ctx.fillStyle = 'rgba(243,239,230,0.85)'; ctx.font = TALE_MONO(lang, 34); ctx.fillText(labels.full, 480, 190)
  roundedPath(ctx, 130, 240, 700, 120, 30); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.strokeStyle = gold(0.6); ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = GOLD; ctx.font = TALE_MONO(lang, 30); ctx.fillText(labels.weekly, 480, 312); return c }
function taleVisual(v, lang, labels) {
  if (!v) return null
  if (v.type === 'scoreboard') return { c: taleScoreboard(v, lang), pos: [60, 960], w: 960, h: 300 }
  if (v.type === 'pitch') return { c: talePitch(v, lang), pos: [60, 900], w: 960, h: 560 }
  if (v.type === 'quote') return { c: taleQuote(), pos: [60, 880], w: 960, h: 520 }
  if (v.type === 'cta') return { c: taleCta(labels, lang), pos: [60, 980], w: 960, h: 420 }
  if (v.type === 'mark') return { c: taleMark(String(v.text), v.color), pos: [60, 880], w: 960, h: 520 }
  return null
}
// Word-by-word captions (Mehdi, 2026-09-10: « animer un peu plus pour garder
// l'attention »): the caption layout is computed once, then one cumulative
// image per word is rendered — the newest word in the accent colour with its
// pill, earlier words in their final style. video.js shows image k only in
// its time window, so nothing ever moves: no jitter, just words landing.
function taleCaptionFrames(text, lang, size, hotColor) {
  const m = ctx2d(createCanvas(10, 10)); m.font = TALE_FONT(lang, size)
  const lines = []
  for (const para of String(text).split('\n')) lines.push(...wrapLines(m, para, 940, 6))
  const lh = size * (lang === 'ar' ? 1.3 : 1.12)
  const H = Math.min(760, Math.round(lines.length * lh + 30))
  const isHot = (w) => /^\*.+\*[^\w]*$/.test(w) || /^[A-ZÀ-ÜÉÈÊ][A-ZÀ-ÜÉÈÊ'’-]{2,}[!?.,…:]*$/.test(w) || /\d+[–\-:]\d+|^\d{2,4}[!?.,:]*$|^[£$€]\s?\d|^\d+\s?[£$€%]|^×\d/.test(w)
  const rtl = lang === 'ar'
  // layout pass
  const placed = []
  lines.forEach((l, i) => {
    const y = size + i * lh
    const words = l.split(' ').filter(Boolean)
    const widths = words.map((w) => m.measureText(taleWord(w, rtl)).width)
    const space = m.measureText(' ').width
    const total = widths.reduce((s, w) => s + w, 0) + space * (words.length - 1)
    let x = rtl ? 500 + total / 2 : 500 - total / 2
    words.forEach((w, k) => { const ww = widths[k]; const wx = rtl ? x - ww : x; placed.push({ w: taleWord(w, rtl), hot: isHot(w), x: wx, y, ww }); x = rtl ? wx - space : x + ww + space })
  })
  const frames = []
  // ≤ 8 frames per caption: group words when the caption is long (memory on the 512 MB studio)
  const step = Math.max(1, Math.ceil(placed.length / 8))
  const stops = []
  for (let n = step; n < placed.length; n += step) stops.push(n)
  stops.push(placed.length)
  for (const n of stops) {
    const c = createCanvas(1000, H); const ctx = ctx2d(c); ctx.font = TALE_FONT(lang, size); ctx.textAlign = 'left'
    for (let k = 0; k < n; k++) {
      const p = placed[k]; const newest = k === n - 1
      if (p.hot || newest) { ctx.save(); ctx.shadowColor = 'transparent'; ctx.fillStyle = (p.hot ? hotColor : CREAM) === GOLD ? gold(0.18) : (p.hot ? accent(0.18) : 'rgba(243,239,230,0.12)'); roundedPath(ctx, p.x - 10, p.y - size * 0.86, p.ww + 20, size * 1.08, 14); ctx.fill(); ctx.restore() }
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6
      ctx.fillStyle = p.hot ? hotColor : (newest ? '#FFFFFF' : CREAM)
      ctx.fillText(p.w, p.x, p.y)
    }
    frames.push(c.toBuffer('image/png'))
  }
  return { frames, H }
}
function taleGlowBlob(color) { const c = createCanvas(1400, 1400); const ctx = ctx2d(c); const g = ctx.createRadialGradient(700, 700, 0, 700, 700, 700); g.addColorStop(0, color === 'gold' ? gold(0.22) : accent(0.22)); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 1400, 1400); return c }
function taleFlash() { const c = createCanvas(900, 900); const ctx = ctx2d(c); const f = ctx.createRadialGradient(450, 450, 0, 450, 450, 450); f.addColorStop(0, 'rgba(255,255,255,0.55)'); f.addColorStop(0.4, 'rgba(120,255,180,0.18)'); f.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = f; ctx.fillRect(0, 0, 900, 900); return c }
// "Mini-reportage" photo layer (Mehdi, 2026-09-11): a real, free-licensed
// photo (Wikimedia Commons) fills the top of the frame, darkened towards
// the bottom so the caption reads, with the credit line. 1300 px wide so
// the layer can pan slowly (integer-pixel drift on a photo is invisible).
async function talePhoto(url, credit) {
  const img = await loadImg(url)
  if (!img) return null
  const W = 1300, H = 1180
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  const s = Math.max(W / img.width, H / img.height)
  const dw = img.width * s, dh = img.height * s
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2 - Math.min(0, (dh - H) / 4), dw, dh)
  const fade = ctx.createLinearGradient(0, H - 420, 0, H)
  fade.addColorStop(0, night(0)); fade.addColorStop(1, night(1))
  ctx.fillStyle = fade; ctx.fillRect(0, 0, W, H)
  const top = ctx.createLinearGradient(0, 0, 0, 260)
  top.addColorStop(0, night(0.85)); top.addColorStop(1, night(0))
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 260)
  if (credit) { ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(243,239,230,0.55)'; ctx.font = '20px "IBM Plex Mono"'; ctx.fillText(String(credit).slice(0, 90), 120, H - 24) }
  return c
}
/** One story beat → animated layer spec (+ progress bar layer). timing = { dur, voiceDur }. */
export async function drawTaleBeatLayers(beat, lang, labels, progress, timing = {}) {
  registerBrandFonts()
  const PNGb = (c) => c.toBuffer('image/png')
  const glow = beat.glow || 'green'
  const hot = glow === 'gold' ? GOLD : GREEN
  const dur = timing.dur || 6
  const photo = beat.imageUrl ? await talePhoto(beat.imageUrl, beat.credit).catch(() => null) : null
  const first = !!beat.first   // hook beat: the claim must be readable at frame 0 (average play time was 3 s)
  if (photo) {
    // Reportage layout: photo on top (slow pan), kicker + caption in the lower third, visual only if it is a scoreboard.
    const layers = { bg: PNGb(taleBg(glow)), photo: PNGb(photo), kicker: PNGb(taleKicker(beat.kicker || '', lang)) }
    const line = createCanvas(320, 6); { const ctx = ctx2d(line); ctx.fillStyle = GOLD; ctx.fillRect(0, 0, 320, 6) }
    layers.line = PNGb(line)
    const anims = [
      { layer: 'photo', x: -110, y: 0, drift: { dx: 110, dy: 0, dur: Math.max(4, dur) }, fade: { st: 0, d: first ? 0.05 : 0.35 } },
      { layer: 'kicker', x: 60, y: 1150, w: 960, h: 80, pop: { from: first ? 1.15 : 1.7, st: first ? 0 : 0.1, d: first ? 0.2 : 0.35 }, fade: { st: 0, d: 0.1 } },
      { layer: 'line', x: 380, y: 1222, grow: { st: first ? 0.05 : 0.35, d: 0.45 } },
    ]
    const capFrames = taleCaptionFrames(beat.caption || '', lang, Math.min(beat.capSize || 76, 76), hot).frames
    const frames = first ? [capFrames[capFrames.length - 1]] : capFrames
    const span = Math.min(Math.max(1.2, (timing.voiceDur || dur * 0.7) * 0.65), 6)
    frames.forEach((buf, k) => {
      layers[`w${k}`] = buf
      const st = first ? 0 : 0.4 + (k / Math.max(1, frames.length - 1)) * span
      const en = k < frames.length - 1 ? 0.4 + ((k + 1) / Math.max(1, frames.length - 1)) * span : undefined
      anims.push({ layer: `w${k}`, x: 40, y: 1270, show: { st: +st.toFixed(3), en: en != null ? +en.toFixed(3) : undefined } })
    })
    if (beat.visual && beat.visual.type === 'scoreboard') {
      const vis = taleVisual(beat.visual, lang, labels)
      layers.vis = PNGb(vis.c); anims.push({ layer: 'vis', x: 60, y: 860, w: 960, h: 300, pop: { from: 1.6, st: 0.8, d: 0.4 }, fade: { st: 0.8, d: 0.2 } })
    }
    if (progress) { const bar = createCanvas(1080, 10); const ctx = ctx2d(bar); ctx.fillStyle = GOLD; ctx.fillRect(0, 0, 1080, 10); layers.bar = PNGb(bar); anims.push({ layer: 'bar', x: 0, y: 1910, progress }) }
    return { layers, anims }
  }
  const layers = { bg: PNGb(taleBg(glow)), glow: PNGb(taleGlowBlob(glow)), kicker: PNGb(taleKicker(beat.kicker || '', lang)) }
  const line = createCanvas(320, 6); { const ctx = ctx2d(line); ctx.fillStyle = GOLD; ctx.fillRect(0, 0, 320, 6) }
  layers.line = PNGb(line)
  const anims = [
    { layer: 'glow', x: -160, y: 100, drift: { dx: 400, dy: 260, dur: Math.max(4, dur) } },
    { layer: 'kicker', x: 60, y: 300, w: 960, h: 80, pop: { from: first ? 1.15 : 1.7, st: first ? 0 : 0.05, d: first ? 0.2 : 0.35 }, fade: { st: 0, d: 0.1 } },
    { layer: 'line', x: 380, y: 372, grow: { st: first ? 0.05 : 0.3, d: 0.45 } },
  ]
  // word-by-word caption: words land across the first ~65 % of the voice; the hook beat shows the whole claim at once
  const allFrames = taleCaptionFrames(beat.caption || '', lang, beat.capSize || (lang === 'ar' ? 76 : 84), hot).frames
  const frames = first ? [allFrames[allFrames.length - 1]] : allFrames
  const span = Math.min(Math.max(1.2, (timing.voiceDur || dur * 0.7) * 0.65), 6)
  frames.forEach((buf, k) => {
    layers[`w${k}`] = buf
    const st = first ? 0 : 0.35 + (k / Math.max(1, frames.length - 1)) * span
    const en = k < frames.length - 1 ? 0.35 + ((k + 1) / Math.max(1, frames.length - 1)) * span : undefined
    anims.push({ layer: `w${k}`, x: 40, y: 430, show: { st: +st.toFixed(3), en: en != null ? +en.toFixed(3) : undefined } })
  })
  const vis = taleVisual(beat.visual, lang, labels)
  if (vis) {
    layers.flash = PNGb(taleFlash())
    anims.push({ layer: 'flash', x: 90, y: vis.pos[1] + vis.h / 2 - 450, fade: { st: 0.75, d: 0.1 }, out: { st: 0.9, d: 0.6 } })
    layers.vis = PNGb(vis.c); anims.push({ layer: 'vis', x: vis.pos[0], y: vis.pos[1], w: vis.w, h: vis.h, pop: { from: 1.9, st: 0.75, d: 0.45 }, fade: { st: 0.75, d: 0.2 } })
  }
  if (progress) {
    const bar = createCanvas(1080, 10); const ctx = ctx2d(bar); ctx.fillStyle = GOLD; ctx.fillRect(0, 0, 1080, 10)
    layers.bar = PNGb(bar)
    anims.push({ layer: 'bar', x: 0, y: 1910, progress })   // {from, to, dur} handled by animSlide
  }
  return { layers, anims }
}
/** Story cover 1200×675 (site hero / og:image). */
export async function drawTaleCover(d) {
  registerBrandFonts()
  const W = 1200, H = 675
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, W, H)
  const g = ctx.createRadialGradient(W * 0.3, H * 0.5, 0, W * 0.3, H * 0.5, 800); g.addColorStop(0, accent(0.18)); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  paintLogo(ctx, 60, 50, 70)
  ctx.textAlign = 'left'; ctx.fillStyle = CREAM; ctx.font = '36px Anton'; ctx.fillText('Pressing 90’', 146, 96)
  ctx.fillStyle = 'rgba(243,239,230,0.55)'; ctx.font = '20px "IBM Plex Mono"'; ctx.fillText('F O O T B A L L   S T O R I E S', 146, 126)
  const lang = d.lang || 'en'
  ctx.fillStyle = GOLD; ctx.font = TALE_MONO(lang, 30); ctx.textAlign = lang === 'ar' ? 'right' : 'left'; ctx.fillText(d.kicker || '', lang === 'ar' ? W - 60 : 60, 230)
  ctx.fillStyle = CREAM; ctx.font = TALE_FONT(lang, 64)
  const lines = wrapLines(ctx, String(d.hook || ''), 760, 4)
  lines.forEach((l, i) => ctx.fillText(l, lang === 'ar' ? W - 60 : 60, 310 + i * 76))
  if (d.year) { ctx.textAlign = 'right'; ctx.fillStyle = gold(0.25); ctx.font = '220px Anton'; ctx.fillText(String(d.year), W - 40, H - 40) }
  ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(243,239,230,0.45)'; ctx.font = '22px "IBM Plex Mono"'; ctx.fillText('pressing90.live', 60, H - 40)
  return c
}

// ─── GOAL animation layers (Mehdi, 2026-09-08 soir: « une animation de but »)
// Same look as drawGoalSlide, split into transparent PNG layers that
// video.js animates with ffmpeg expressions (slam, slide-ins, pulse).
// Every layer comes with its resting position on the 1080×1920 canvas.
export async function drawGoalLayers(g) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const png = (c) => c.toBuffer('image/png')
  // bg: night + glow + brand + league + footer (opaque)
  const bg = createCanvas(W, H); { const ctx = ctx2d(bg)
    ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, W, H)
    const glow = ctx.createRadialGradient(W / 2, 760, 0, W / 2, 760, 900)
    glow.addColorStop(0, accent(0.22)); glow.addColorStop(1, accent(0))
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)
    paintLogo(ctx, W / 2 - 55, 110, 110)
    ctx.textAlign = 'center'; ctx.fillStyle = CREAM; ctx.font = '52px Anton'; ctx.fillText('Pressing 90’', W / 2, 290)
    ctx.fillStyle = 'rgba(243,239,230,0.65)'; ctx.font = '32px "IBM Plex Mono"'; ctx.fillText(wrapLines(ctx, g.league || '', 900, 1)[0], W / 2, 370)
    ctx.fillStyle = 'rgba(243,239,230,0.55)'; ctx.font = '28px "IBM Plex Mono"'; ctx.fillText(g.footer || 'LIVE on pressing90.live', W / 2, 1740) }
  // flash: white radial burst behind GOAL! (faded in/out by ffmpeg)
  const flash = createCanvas(W, H); { const ctx = ctx2d(flash)
    const f = ctx.createRadialGradient(W / 2, 540, 0, W / 2, 540, 700)
    f.addColorStop(0, 'rgba(255,255,255,0.85)'); f.addColorStop(0.35, flashTint(0.35)); f.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = f; ctx.fillRect(0, 0, W, H) }
  // goal: "GOAL!" 1000×320, baseline 250 → rests at (40, 370)
  const goal = createCanvas(1000, 320); { const ctx = ctx2d(goal)
    ctx.textAlign = 'center'; ctx.fillStyle = GREEN
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8
    // g.title overrides "GOAL!" (Barça full-time card, 2026-09-13: 'نهاية المباراة' in Tajawal)
    if (g.title && g.titleLang === 'ar') { ctx.font = 'bold 150px Tajawal'; ctx.fillText(g.title, 500, 235) }
    else { ctx.font = '210px Anton'; ctx.fillText(g.title || 'GOAL!', 500, 250) } }
  // crests + names 360×420 each (crest 260 at (50,0), names below)
  const size = 260
  const [hImg, aImg] = await Promise.all([crest(g.homeLogo, g.home), crest(g.awayLogo, g.away)])
  const dim = (side) => (g.scoringSide && g.scoringSide !== side ? 0.45 : 1)
  const team = (img, name, side) => { const c = createCanvas(360, 420); const ctx = ctx2d(c)
    ctx.globalAlpha = dim(side); ctx.drawImage(img, 50, 0, size, size); ctx.globalAlpha = 1
    ctx.textAlign = 'center'; ctx.fillStyle = CREAM; ctx.font = '40px Anton'
    wrapLines(ctx, name, 330, 2).forEach((l, i) => ctx.fillText(l, 180, size + 62 + i * 46)); return c }
  const home = team(hImg, g.home, 'home'), away = team(aImg, g.away, 'away')
  // score 500×200, baseline 150 → rests at (290, 805)
  const score = createCanvas(500, 200); { const ctx = ctx2d(score)
    ctx.textAlign = 'center'; ctx.font = '150px Anton'
    ctx.fillStyle = g.scoringSide === 'home' ? GREEN : CREAM; ctx.fillText(String(g.homeScore ?? 0), 250 - 95, 150)
    ctx.fillStyle = GOLD; ctx.font = '90px Anton'; ctx.fillText('–', 250, 135)
    ctx.font = '150px Anton'; ctx.fillStyle = g.scoringSide === 'away' ? GREEN : CREAM; ctx.fillText(String(g.awayScore ?? 0), 250 + 95, 150) }
  // scorer pill (+ assist line) 1000×200 → rests at (40, 1290)
  const label = `${g.scorer || 'Goal'}${g.ownGoal ? ' (OG)' : ''}${g.penalty ? ' (pen)' : ''}`
  const scorer = createCanvas(1000, 200); { const ctx = ctx2d(scorer)
    ctx.textAlign = 'center'; ctx.font = '60px Anton'
    const pw = Math.min(980, Math.max(420, ctx.measureText(label).width + 120))
    roundedPath(ctx, 500 - pw / 2, 0, pw, 110, 55); ctx.fillStyle = GREEN; ctx.fill()
    ctx.fillStyle = NIGHT; ctx.fillText(wrapLines(ctx, label, pw - 80, 1)[0], 500, 77)
    if (g.assist) { ctx.fillStyle = 'rgba(243,239,230,0.8)'; ctx.font = '34px "IBM Plex Mono"'; ctx.fillText(wrapLines(ctx, g.assistLabel === '' ? g.assist : `${g.assistLabel || 'Assist'} · ${g.assist}`, 900, 1)[0], 500, 170) } }
  // minute 400×90, baseline 70 → rests at (340, 1450)
  const minute = createCanvas(400, 90); { const ctx = ctx2d(minute)
    ctx.textAlign = 'center'; ctx.fillStyle = GOLD; ctx.font = '64px "IBM Plex Mono"'; ctx.fillText(g.minute ? `${g.minute}` : '', 200, 70) }
  return {
    bg: png(bg), flash: png(flash), goal: png(goal), home: png(home), away: png(away), score: png(score), scorer: png(scorer), minute: png(minute),
    rest: { goal: [40, 370], home: [60, 770], away: [660, 770], score: [290, 805], scorer: [40, 1290], minute: [340, 1450] },
  }
}

export async function drawGoalSlide(g) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const c = createCanvas(W, H)
  const ctx = ctx2d(c)
  ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 760, 0, W / 2, 760, 900)
  glow.addColorStop(0, accent(0.22)); glow.addColorStop(1, accent(0))
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)
  paintLogo(ctx, W / 2 - 55, 110, 110)
  ctx.textAlign = 'center'; ctx.fillStyle = CREAM; ctx.font = '52px Anton'; ctx.fillText('Pressing 90’', W / 2, 290)
  ctx.fillStyle = 'rgba(243,239,230,0.65)'; ctx.font = '32px "IBM Plex Mono"'; ctx.fillText(wrapLines(ctx, g.league || '', 900, 1)[0], W / 2, 370)
  // GOAL!
  ctx.fillStyle = GREEN; ctx.font = '210px Anton'; ctx.fillText('GOAL!', W / 2, 620)
  // crests + score, scoring side highlighted
  const size = 260, cy = 900
  const [h, a] = await Promise.all([crest(g.homeLogo, g.home), crest(g.awayLogo, g.away)])
  const dim = (side) => (g.scoringSide && g.scoringSide !== side ? 0.45 : 1)
  ctx.globalAlpha = dim('home'); ctx.drawImage(h, 110, cy - size / 2, size, size)
  ctx.globalAlpha = dim('away'); ctx.drawImage(a, W - 110 - size, cy - size / 2, size, size)
  ctx.globalAlpha = 1
  ctx.font = '150px Anton'
  ctx.fillStyle = g.scoringSide === 'home' ? GREEN : CREAM; ctx.fillText(String(g.homeScore ?? 0), W / 2 - 95, cy + 55)
  ctx.fillStyle = GOLD; ctx.font = '90px Anton'; ctx.fillText('–', W / 2, cy + 40)
  ctx.font = '150px Anton'; ctx.fillStyle = g.scoringSide === 'away' ? GREEN : CREAM; ctx.fillText(String(g.awayScore ?? 0), W / 2 + 95, cy + 55)
  ctx.fillStyle = CREAM; ctx.font = '40px Anton'
  wrapLines(ctx, g.home, 330, 2).forEach((l, i) => ctx.fillText(l, 110 + size / 2, cy + size / 2 + 62 + i * 46))
  wrapLines(ctx, g.away, 330, 2).forEach((l, i) => ctx.fillText(l, W - 110 - size / 2, cy + size / 2 + 62 + i * 46))
  // scorer pill
  const label = `${g.scorer || 'Goal'}${g.ownGoal ? ' (OG)' : ''}${g.penalty ? ' (pen)' : ''}`
  ctx.font = '60px Anton'
  const pw = Math.min(980, Math.max(420, ctx.measureText(label).width + 120))
  roundedPath(ctx, W / 2 - pw / 2, 1290, pw, 110, 55); ctx.fillStyle = GREEN; ctx.fill()
  ctx.fillStyle = NIGHT; ctx.fillText(wrapLines(ctx, label, pw - 80, 1)[0], W / 2, 1367)
  ctx.fillStyle = GOLD; ctx.font = '64px "IBM Plex Mono"'; ctx.fillText(g.minute ? `${g.minute}` : '', W / 2, 1500)
  ctx.fillStyle = 'rgba(243,239,230,0.55)'; ctx.font = '28px "IBM Plex Mono"'; ctx.fillText('LIVE on pressing90.live', W / 2, 1740)
  return c
}
