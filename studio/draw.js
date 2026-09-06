// Pressing 90' studio — server-side card drawing (node-canvas).
// Same "Match Night" designs as the admin studio (src/lib/newsCards.ts),
// ported to node-canvas so the worker can publish without a browser.
// Automation is ENGLISH ONLY (Mehdi's rule) — `lang` kept for parity.
import { createCanvas, loadImage, registerFont } from 'canvas'
import QRCode from 'qrcode'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const NIGHT = '#071B30'
export const CREAM = '#F3EFE6'
export const GOLD = '#D9B54A'
export const RED = '#FF4D5E'
export const GREEN = '#41C97C'
const SITE = process.env.SITE_URL || 'https://pressing90.live'

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
    if (imgCache.size > 300) imgCache.clear()
    imgCache.set(src, img)
    return img
  } catch (e) { console.warn('img', src.slice(0, 80), e.message); return null }
}

/** Brand mark drawn natively (mirror of public/p90-logo.svg): navy tile,
 *  gold "90’", pitch line + centre circle. */
function paintLogo(ctx, x, y, size) {
  const s = size / 512
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
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
  for (const w of words) {
    const probe = cur ? cur + ' ' + w : w
    if (ctx.measureText(probe).width <= maxWidth || !cur) cur = probe
    else { lines.push(cur); cur = w; if (lines.length === maxLines - 1) break }
  }
  if (cur && lines.length < maxLines) lines.push(cur)
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'
  return lines
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
  g1.addColorStop(0, 'rgba(217,181,74,0.16)'); g1.addColorStop(1, 'rgba(217,181,74,0)')
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H)
  const g2 = ctx.createRadialGradient(W, H, 0, W, H, 1100)
  g2.addColorStop(0, 'rgba(217,181,74,0.10)'); g2.addColorStop(1, 'rgba(217,181,74,0)')
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H)
}

async function paintBrandRow(ctx, x = 60, y = 70, size = 110) {
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
  ctx.fillStyle = 'rgba(243,239,230,0.55)'
  ctx.font = `${Math.round(26 * s)}px "IBM Plex Mono"`
  ctx.fillText('L I V E   F O O T B A L L   S C O R E S', tx + 2, ty + 42 * s)
}

/** Gold monogram for clubs ESPN has no crest for (same idea as the site). */
export function monogram(name, size = 300) {
  const c = createCanvas(size, size)
  const ctx = c.getContext('2d')
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
  const ctx = c.getContext('2d')
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
  const hCol = hs === as ? CREAM : hs > as ? GREEN : RED
  const aCol = hs === as ? CREAM : as > hs ? GREEN : RED
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
  const ctx = c.getContext('2d')
  paintGround(ctx, W, H)
  await paintBrandRow(ctx, 60, 60, 96)
  ctx.textAlign = 'center'
  ctx.fillStyle = GOLD; ctx.font = '72px Anton'
  ctx.fillText("⚽ TODAY'S MATCHES", W / 2, 290)
  ctx.fillStyle = 'rgba(243,239,230,0.7)'; ctx.font = '28px "IBM Plex Mono"'
  ctx.fillText(dateLabel || '', W / 2, 340)
  const top = 400, rowH = 150, cr = 84
  const rows = matches.slice(0, 6)
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i]; const y = top + i * rowH; const cy = y + (rowH - 18) / 2
    roundedPath(ctx, 48, y, W - 96, rowH - 18, 24)
    ctx.fillStyle = 'rgba(13,44,75,0.85)'; ctx.fill()
    ctx.strokeStyle = 'rgba(243,239,230,0.10)'; ctx.lineWidth = 2; ctx.stroke()
    const [h, a] = await Promise.all([crest(m.homeLogo, m.home), crest(m.awayLogo, m.away)])
    ctx.drawImage(h, 76, cy - cr / 2 - 6, cr, cr)
    ctx.drawImage(a, W - 76 - cr, cy - cr / 2 - 6, cr, cr)
    ctx.fillStyle = CREAM; ctx.font = '34px Anton'
    ctx.textAlign = 'left'; ctx.fillText(wrapLines(ctx, m.home, 250, 1)[0], 76 + cr + 16, cy + 4)
    ctx.textAlign = 'right'; ctx.fillText(wrapLines(ctx, m.away, 250, 1)[0], W - 76 - cr - 16, cy + 4)
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
  const ctx = c.getContext('2d')
  paintGround(ctx, W, H)
  await paintBrandRow(ctx, 60, 70, 96)
  if (pages > 1) { ctx.textAlign = 'right'; ctx.fillStyle = GOLD; ctx.font = '30px "IBM Plex Mono"'; ctx.fillText(`${page} / ${pages}`, W - 60, 130) }
  ctx.textAlign = 'center'
  ctx.fillStyle = GOLD; ctx.font = '78px Anton'; ctx.fillText("⚽ TODAY'S MATCHES", W / 2, 330)
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
    ctx.fillStyle = CREAM; ctx.font = '38px Anton'
    ctx.textAlign = 'left'; ctx.fillText(wrapLines(ctx, m.home, 250, 1)[0], 78 + cr + 18, cy + 4)
    ctx.textAlign = 'right'; ctx.fillText(wrapLines(ctx, m.away, 250, 1)[0], W - 78 - cr - 18, cy + 4)
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
export async function drawMatchSlide(m, idx, total) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const c = createCanvas(W, H)
  const ctx = c.getContext('2d')
  ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, W, H)
  const g1 = ctx.createRadialGradient(W / 2, 500, 0, W / 2, 500, 1100)
  g1.addColorStop(0, 'rgba(217,181,74,0.14)'); g1.addColorStop(1, 'rgba(217,181,74,0)')
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H)
  paintLogo(ctx, W / 2 - 55, 120, 110)
  ctx.textAlign = 'center'; ctx.fillStyle = CREAM; ctx.font = '58px Anton'; ctx.fillText('Pressing 90’', W / 2, 310)
  ctx.fillStyle = GOLD; ctx.font = '44px "IBM Plex Mono"'; ctx.fillText("⚽ TODAY'S MATCHES", W / 2, 400)
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
  const ctx = c.getContext('2d')
  paintGround(ctx, W, H)
  const img = await loadImg(a.image_url)
  if (img) {
    const s = Math.max(W / img.width, PHOTO_H / img.height)
    const dw = img.width * s, dh = img.height * s
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, PHOTO_H); ctx.clip()
    ctx.drawImage(img, (W - dw) / 2, (PHOTO_H - dh) / 2, dw, dh); ctx.restore()
    const fade = ctx.createLinearGradient(0, PHOTO_H - 240, 0, PHOTO_H)
    fade.addColorStop(0, 'rgba(7,27,48,0)'); fade.addColorStop(1, 'rgba(7,27,48,1)')
    ctx.fillStyle = fade; ctx.fillRect(0, PHOTO_H - 240, W, 240)
  }
  await paintBrandRow(ctx, 60, 728, 78)
  ctx.fillStyle = GOLD; ctx.textAlign = 'right'; ctx.font = '28px "IBM Plex Mono"'; ctx.fillText('N E W   A R T I C L E', W - 64, 782)
  const titleTop = 910
  ctx.fillStyle = GOLD; ctx.fillRect(60, titleTop - 50, 10, 168)
  ctx.fillStyle = CREAM; ctx.font = '62px Anton'; ctx.textAlign = 'left'
  wrapLines(ctx, a.title, W - 220, 3).forEach((l, i) => ctx.fillText(l, 104, titleTop + i * 80))
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
  const ctx = c.getContext('2d')
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
    fade.addColorStop(0, 'rgba(7,27,48,0)'); fade.addColorStop(1, 'rgba(7,27,48,0.92)')
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
