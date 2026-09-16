// Pressing 90' studio — server-side card drawing (node-canvas).
// Same "Match Night" designs as the admin studio (src/lib/newsCards.ts),
// ported to node-canvas so the worker can publish without a browser.
// Automation is ENGLISH ONLY (Mehdi's rule) — `lang` kept for parity.
import { createCanvas, loadImage, registerFont } from 'canvas'
import QRCode from 'qrcode'
import * as ed from './editorial.js'
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
  ed.registerEditorialFonts()
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
  if (overflow) { if (lines.length === 0) lines.push(ellipsize(cur)); else lines[lines.length - 1] = ellipsize(lines[lines.length - 1]) }   // maxLines 1 + a wide first word used to crash (2026-09-14)
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
/** Page mark (editorial): Senyera logo with PRESSING 90’ under it, right-aligned at x. mode 'light' on photos. */
/** One clipped line measured with an explicit font (spaced labels add tracking → measure at ~70 % of the box). */
function oneLine(ctx, text, maxW, font) { ctx.font = font; return wrapLines(ctx, String(text ?? ''), maxW, 1)[0] || '' }
/** Display title: Arabic → Aref Ruqaa, Latin → Playfair; shrinks to maxW; garnet→blue ink gradient (+ optional outline). */
function displayTitle(ctx, txt, x, y, { size = 100, maxW = 900, align = 'center', stroke = null } = {}) {
  const ar = /[؀-ۿ]/.test(txt); let sz = size
  for (;;) { ctx.font = ar ? `bold ${sz}px Aref` : `900 ${sz}px Playfair`; if (ctx.measureText(txt).width <= maxW || sz <= 30) break; sz -= 4 }
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'
  const w = ctx.measureText(txt).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
  if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(6, sz * 0.08); ctx.strokeStyle = stroke; ctx.strokeText(txt, x, y) }
  ctx.fillStyle = ed.inkGradient(ctx, x0, w); ctx.fillText(txt, x, y)
}
/** Small label: Latin → spaced caps (Cairo), Arabic → Tajawal (letter-spacing would break the joins). */
function labelText(ctx, text, x, y, { size = 18, align = 'left', color = ed.E.NAVY, tracking = 0.3 } = {}) {
  const t = String(text ?? '')
  if (/[؀-ۿ]/.test(t)) { ctx.font = `bold ${Math.round(size * 1.5)}px Tajawal`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color; ctx.fillText(t, x, y); return }
  ed.spaced(ctx, t, x, y, { size, align, color, tracking })
}
let pageLogoImg = null
/** Page mark (Mehdi, 2026-09-16: « mets le nouveau logo sur les reels ») = the page's profile logo (navy circle, crest, PRESSING 90’), right-aligned at x. Falls back to the Senyera mark. */
async function pageMark(ctx, x, y, mode = 'dark') {
  if (pageLogoImg === null) { try { pageLogoImg = await loadImage(path.join(__dirname, 'assets', 'logo-page.png')) } catch { pageLogoImg = false } }
  if (pageLogoImg) {
    const s = 104, cx = x - s / 2, cy = y - 8 + s / 2
    ctx.save(); ctx.shadowColor = 'rgba(17,28,79,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; ctx.fillStyle = '#0B1F4B'; ctx.beginPath(); ctx.arc(cx, cy, s / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, s / 2, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(pageLogoImg, x - s, y - 8, s, s); ctx.restore()   // the profile PNG is square: shown as the round badge
    return
  }
  paintLogo(ctx, x - 72, y, 72); ctx.fillStyle = mode === 'light' ? ed.E.CREAM : ed.E.NAVY; ctx.font = '22px Anton'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillText('PRESSING 90’', x, y + 100)
}

// ─── 1. Full-time poster 1080×1350 (editorial, 2026-09-14) ─────────────────
// m: {home, away, homeLogo, awayLogo, homeScore, awayScore, league, venue?, status?, dateLabel?, lang?,
//     goals?: [{side:'home'|'away', scorer, minute, penalty?, ownGoal?}], player?: cutout key | playerNames?: [...]}
const LEAGUE_LOGO = { 'LaLiga': 15, 'Premier League': 23, 'UEFA Champions League': 2, 'Serie A': 12, 'Bundesliga': 10, 'Ligue 1': 9 }
async function leagueMark(ctx, league, x, y, size, align = 'left') {
  const id = LEAGUE_LOGO[league]
  const img = id ? await loadImg(`https://a.espncdn.com/i/leaguelogos/soccer/500/${id}.png`) : null
  if (img) { ed.crestAt(ctx, img, align === 'right' ? x - size / 2 : x + size / 2, y + size / 2, size); return }
  ed.spaced(ctx, String(league || '').toUpperCase(), x, y + size * 0.6, { size: 15, align, tracking: 0.42 })
}
function scorerLine(g) { const who = String(g.scorer || 'Goal').split(' ').slice(-1)[0]; return { label: `${who.toUpperCase()}  ${String(g.minute || '').replace(/'/g, '')}'${g.penalty ? ' (P)' : ''}${g.ownGoal ? ' (OG)' : ''}`, n: who.length } }
function scorerList(ctx, goals, x, y, align = 'center', size = 19) {
  goals.slice(0, 5).forEach((g, i) => { const { label, n } = scorerLine(g); ed.spaced(ctx, label, x, y + i * (size + 15), { size, align, tracking: 0.28, fills: [...label].map((_, j) => (j > n ? ed.E.GRANA : ed.E.NAVY)) }) })
}
export async function drawScoreCard(m) {
  registerBrandFonts()
  const W = 1080, H = 1350
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  const ar = m.lang !== 'en'
  const goals = Array.isArray(m.goals) ? m.goals : []
  const player = m.player || ed.pickCutout(m.playerNames || goals.filter((g) => !g.ownGoal).map((g) => g.scorer))
  ed.backdrop(ctx, W, H, { stripe: true })
  await ed.stadium(ctx, W, H, { top: H - 330 })
  const [hImg, aImg] = await Promise.all([crest(m.homeLogo, m.home), crest(m.awayLogo, m.away)])
  const hs = Number(m.homeScore ?? 0), as = Number(m.awayScore ?? 0)
  const hCol = hs >= as ? ed.E.NAVY : ed.E.GRANA, aCol = as > hs ? ed.E.GRANA : as === hs ? ed.E.NAVY : ed.E.NAVY
  if (player) {
    await leagueMark(ctx, m.league, 60, 34, 74)
    ed.stack(ctx, ['BARÇA', 'FIRST'], 48, 150, { size: 15 })
    ed.spaced(ctx, `${m.home} V ${m.away}`.toUpperCase().slice(0, 26), 48, 290, { size: 22, tracking: 0.42 })
    if (ar) ed.titleAr(ctx, 'نهاية', 'المباراة', 48, 440, 150, { align: 'left', lat: m.status && m.status !== 'FT' ? m.status : 'FULL TIME' })
    else ed.titleLat(ctx, 'FULL', 'TIME', 48, 440, 150, { align: 'left' })
    const cx1 = 135, cx2 = 355, cy = 690
    ed.crestAt(ctx, hImg, cx1, cy, 130); ed.crestAt(ctx, aImg, cx2, cy, 124); ctx.fillStyle = ed.navy(0.25); ctx.fillRect(245, cy - 60, 2, 120)
    ed.spaced(ctx, fitLine(ctx, m.home, 200, 'Cairo', 20, 14).toUpperCase(), cx1, cy + 118, { size: 18, align: 'center', tracking: 0.3 }); ed.spaced(ctx, fitLine(ctx, m.away, 200, 'Cairo', 20, 14).toUpperCase(), cx2, cy + 118, { size: 18, align: 'center', tracking: 0.3 })
    ed.digits(ctx, hs, cx1, 985, 190, hCol); ed.digits(ctx, as, cx2, 985, 190, aCol); ctx.fillStyle = ed.navy(0.25); ctx.fillRect(245, 840, 2, 150)
    scorerList(ctx, goals.filter((g) => g.side === 'home'), cx1, 1040); scorerList(ctx, goals.filter((g) => g.side === 'away'), cx2, 1040)
    await ed.bust(ctx, player, { cx: 800, crownY: 110, headPx: 270, W, H })
  } else {
    await leagueMark(ctx, m.league, W / 2 - 37, 34, 74)
    ed.stack(ctx, ['BARÇA', 'FIRST'], 48, 62, { size: 15 })
    if (ar) ed.titleAr(ctx, 'نهاية', 'المباراة', W / 2, 330, 150, { lat: m.status && m.status !== 'FT' ? m.status : 'FULL TIME' })
    else ed.titleLat(ctx, 'FULL', 'TIME', W / 2, 330, 150)
    const cy = 700, cx1 = 270, cx2 = W - 270
    ed.crestAt(ctx, hImg, cx1, cy, 250); ed.crestAt(ctx, aImg, cx2, cy, 250)
    ed.spaced(ctx, fitLine(ctx, m.home, 360, 'Cairo', 24, 16).toUpperCase(), cx1, cy + 180, { size: 22, align: 'center', tracking: 0.3 }); ed.spaced(ctx, fitLine(ctx, m.away, 360, 'Cairo', 24, 16).toUpperCase(), cx2, cy + 180, { size: 22, align: 'center', tracking: 0.3 })
    ed.digits(ctx, hs, W / 2 - 110, cy + 80, 230, hCol); ed.digits(ctx, as, W / 2 + 110, cy + 80, 230, aCol); ctx.fillStyle = ed.navy(0.25); ctx.fillRect(W / 2 - 1, cy - 90, 2, 190)
    scorerList(ctx, goals.filter((g) => g.side === 'home'), cx1, 940); scorerList(ctx, goals.filter((g) => g.side === 'away'), cx2, 940)
    if (m.homePens && m.awayPens) ed.spaced(ctx, `PENS ${m.homePens} – ${m.awayPens}`, W / 2, 1170, { size: 20, align: 'center', color: ed.E.GRANA, tracking: 0.42 })
  }
  await pageMark(ctx, W - 48, 44)
  if (m.venue) { ctx.save(); ctx.translate(70, 1300); ctx.rotate(-0.16); ed.spaced(ctx, oneLine(ctx, String(m.venue).toUpperCase(), 520, 'bold 22px Cairo'), 0, 0, { size: 22, color: 'rgba(244,239,230,0.9)', tracking: 0.42 }); ctx.restore() }
  ed.grain(ctx, W, H)
  return c
}

// ─── 1b. Lineup post 1080×1350 (predicted / confirmed) ────────────────────
// d: {home, away, homeLogo, awayLogo, league, venue?, dateLabel?, matchday?, team:'home'|'away', formation, players:[{name, jersey, pos, place}], predicted?, kit?:'home'|'away'}
export async function drawLineupPost(d) {
  registerBrandFonts()
  const W = 1080, H = 1350
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  ed.backdrop(ctx, W, H)
  await ed.stadium(ctx, W, H, { top: H - 420, dark: '#8A8FA6', light: '#F4EFE6', alpha: 0.75, fadeTo: 0.6 })
  ed.stack(ctx, ['BARÇA', 'FIRST'], 48, 62, { size: 15 })
  const h = String(d.home || ''), a = String(d.away || '')
  ed.stack(ctx, [fitLine(ctx, h, 300, 'Cairo', 20, 14).toUpperCase(), `v ${fitLine(ctx, a, 280, 'Cairo', 20, 14).toUpperCase()}`], 48, 208, { size: 20, gap: 28 })
  if (d.venue) ed.spaced(ctx, oneLine(ctx, String(d.venue).toUpperCase(), 300, 'bold 13px Cairo'), 48, 284, { size: 13, tracking: 0.42 })
  if (d.dateLabel) ed.spaced(ctx, String(d.dateLabel).toUpperCase(), 48, 308, { size: 13, tracking: 0.42 })
  await pageMark(ctx, W - 48, 44)
  ctx.textAlign = 'right'; ctx.fillStyle = ed.E.NAVY; ctx.font = 'bold 30px Tajawal'
  ctx.fillText(d.matchdayAr || `${d.leagueAr || d.league || ''}`, W - 48, 240)
  if (d.matchday) ed.spaced(ctx, String(d.matchday).toUpperCase(), W - 48, 268, { size: 14, align: 'right', tracking: 0.42 })
  ed.bar(ctx, W - 108, 280)
  await leagueMark(ctx, d.league, W / 2 - 37, 34, 74)
  const [hImg, aImg] = await Promise.all([crest(d.homeLogo, d.home), crest(d.awayLogo, d.away)])
  ed.crestAt(ctx, hImg, W / 2 - 100, 190, 110); ed.crestAt(ctx, aImg, W / 2 + 100, 190, 104); ed.spaced(ctx, 'v', W / 2, 200, { size: 26, align: 'center' })
  const predicted = d.predicted !== false
  ed.titleAr(ctx, 'التشكيلة', predicted ? 'المتوقعة' : 'الرسمية', W / 2, 425, 148, { lat: predicted ? 'PREDICTED LINEUP' : 'CONFIRMED LINEUP' })
  ed.vtext(ctx, String(d.teamLabel || 'FC BARCELONA'), 46, 760); ed.vtext(ctx, String(d.season || '2026 / 27'), W - 46, 760, { dir: 1 })
  const X = ed.pitch(ctx, 120, 665, 840, 585, { topW: 0.88 })
  const rows = ed.lineupRows(d.players || [], d.formation)
  const ys = [1165, 1015, 868, 722].slice(0, rows.length)
  rows.forEach((row, ri) => {
    const n = row.length, sp = n === 1 ? 0 : Math.min(230, 700 / (n - 1))
    row.forEach((p, i) => { const u = 0.5 + ((i - (n - 1) / 2) * sp) / 840; ed.jersey(ctx, X(u, ys[ri]), ys[ri] - 90, 128, { kind: ri === 0 ? 'gk' : (d.kit || 'home'), number: p.jersey || '', name: fitLine(ctx, ed.surname(p.name), 200, 'Cairo', 22, 15) }) })
  })
  ed.stack(ctx, ['VISCA', 'BARÇA'], 48, 1270, { size: 15 })
  ctx.textAlign = 'right'; ctx.fillStyle = ed.E.NAVY; ctx.font = 'bold 26px Tajawal'; ctx.fillText('برشلونة أولاً · pressing90.live', W - 48, 1300)
  ed.grain(ctx, W, H)
  return c
}

// ─── 2. Match-day post 1080×1350 (editorial) ───────────────────────────────
async function paintFeatured(ctx, m, x, y, w, h) {
  const [hi, ai] = await Promise.all([crest(m.homeLogo, m.home), crest(m.awayLogo, m.away)])
  const cy = y + h * 0.42, cr = Math.round(h * 0.55)
  ed.crestAt(ctx, hi, x + w * 0.22, cy, cr); ed.crestAt(ctx, ai, x + w * 0.78, cy, cr)
  ed.spaced(ctx, fitLine(ctx, m.home, w * 0.34, 'Cairo', 22, 14).toUpperCase(), x + w * 0.22, y + h * 0.86, { size: 20, align: 'center', tracking: 0.3 })
  ed.spaced(ctx, fitLine(ctx, m.away, w * 0.34, 'Cairo', 22, 14).toUpperCase(), x + w * 0.78, y + h * 0.86, { size: 20, align: 'center', tracking: 0.3 })
  ctx.textAlign = 'center'
  if (m.score) ed.digits(ctx, m.score.replace('–', ' – '), x + w / 2, cy + h * 0.13, Math.round(h * 0.3), m.live ? ed.E.GRANA : ed.E.NAVY)
  else { ctx.font = `900 ${Math.round(h * 0.22)}px Playfair`; ctx.fillStyle = ed.inkGradient(ctx, x + w / 2 - 60, 120); ctx.fillText('VS', x + w / 2, cy + h * 0.1) }
  const label = m.live ? 'LIVE' : (m.time || '')
  if (label) { ctx.font = 'bold 22px Cairo'; const pw = ctx.measureText(label).width + 56; roundedPath(ctx, x + w / 2 - pw / 2, cy + h * 0.2, pw, 44, 22); ctx.fillStyle = m.live ? ed.E.GRANA : ed.E.NAVY; ctx.fill(); ctx.fillStyle = ed.E.CREAM; ctx.fillText(label, x + w / 2, cy + h * 0.2 + 31) }
  ed.spaced(ctx, oneLine(ctx, String(m.league || '').toUpperCase(), w * 0.36, 'bold 13px Cairo'), x + w / 2, y + h * 0.98, { size: 13, align: 'center', color: ed.E.MUTED, tracking: 0.42 })
}
function matchRow(ctx, m, x, y, w, h, hi, ai) {
  roundedPath(ctx, x, y, w, h, 18); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill(); ctx.strokeStyle = ed.E.LINE; ctx.lineWidth = 2; ctx.stroke()
  const cr = Math.round(h * 0.62), cy = y + h / 2
  ed.crestAt(ctx, hi, x + 24 + cr / 2, cy, cr); ed.crestAt(ctx, ai, x + w - 24 - cr / 2, cy, cr)
  ctx.fillStyle = ed.E.NAVY; ctx.textAlign = 'left'; ctx.fillText(fitLine(ctx, m.home, w * 0.26, 'Cairo', 28, 18), x + 24 + cr + 16, cy + 10)
  ctx.textAlign = 'right'; ctx.fillText(fitLine(ctx, m.away, w * 0.26, 'Cairo', 28, 18), x + w - 24 - cr - 16, cy + 10)
  ctx.textAlign = 'center'
  if (m.score) ed.digits(ctx, m.score.replace('–', ' – '), x + w / 2, cy + 16, 44, m.live ? ed.E.GRANA : ed.E.NAVY)
  else { const label = m.time || 'VS'; ctx.font = 'bold 20px Cairo'; const pw = Math.max(110, ctx.measureText(label).width + 40); roundedPath(ctx, x + w / 2 - pw / 2, cy - 21, pw, 42, 21); ctx.fillStyle = ed.E.NAVY; ctx.fill(); ctx.fillStyle = ed.E.CREAM; ctx.fillText(label, x + w / 2, cy + 8) }
  ed.spaced(ctx, oneLine(ctx, String(m.league || '').toUpperCase(), 220, 'bold 11px Cairo'), x + w / 2, y + h - 10, { size: 11, align: 'center', color: ed.E.MUTED, tracking: 0.36 })
}
export async function drawMatchdayPost(matches, dateLabel, opts = {}) {
  registerBrandFonts()
  const W = 1080, H = 1350
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  ed.backdrop(ctx, W, H)
  await ed.stadium(ctx, W, H, { top: H - 360, dark: '#8A8FA6', light: '#F4EFE6', alpha: 0.7, fadeTo: 0.6 })
  ed.stack(ctx, ['BARÇA', 'FIRST'], 48, 62, { size: 15 })
  await pageMark(ctx, W - 48, 44)
  if (dateLabel) ed.spaced(ctx, String(dateLabel).toUpperCase(), 48, 150, { size: 13, tracking: 0.42 })
  const featured = opts.featured && matches[0]
  const results = !!opts.results
  if (featured) ed.titleAr(ctx, 'يوم', 'برشلونة', W / 2, 250, 130, { lat: 'BARÇA DAY' })
  else if (results) ed.titleAr(ctx, 'نتائج', opts.yesterday ? 'الأمس' : 'اليوم', W / 2, 250, 130, { lat: opts.yesterday ? "YESTERDAY'S RESULTS" : "TODAY'S RESULTS" })
  else ed.titleAr(ctx, 'مباريات', 'اليوم', W / 2, 250, 130, { lat: "TODAY'S MATCHES" })
  let top = 460
  if (featured) { await paintFeatured(ctx, matches[0], 48, 430, W - 96, 300); top = 770 }
  const rows = featured ? matches.slice(1, 5) : matches.slice(0, 6)
  const rowH = featured ? 118 : 128, gap = 12
  const imgs = await Promise.all(rows.map((m) => Promise.all([crest(m.homeLogo, m.home), crest(m.awayLogo, m.away)])))
  rows.forEach((m, i) => matchRow(ctx, m, 48, top + i * (rowH + gap), W - 96, rowH, imgs[i][0], imgs[i][1]))
  ed.stack(ctx, ['VISCA', 'BARÇA'], 48, 1270, { size: 15 })
  ctx.textAlign = 'right'; ctx.fillStyle = ed.E.NAVY; ctx.font = 'bold 26px Tajawal'; ctx.fillText('برشلونة أولاً · pressing90.live', W - 48, 1300)
  ed.grain(ctx, W, H)
  return c
}

// ─── 3. Match-day story page 1080×1920 (editorial) ─────────────────────────
export async function drawMatchStory(matches, dateLabel, page, pages, opts = {}) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  ed.backdrop(ctx, W, H)
  await ed.stadium(ctx, W, H, { top: H - 520, dark: '#8A8FA6', light: '#F4EFE6', alpha: 0.7, fadeTo: 0.6 })
  ed.stack(ctx, ['BARÇA', 'FIRST'], 48, 92, { size: 15 })
  await pageMark(ctx, W - 48, 70)
  if (pages > 1) ed.spaced(ctx, `${page} / ${pages}`, W - 48, 220, { size: 14, align: 'right', tracking: 0.42 })
  if (dateLabel) ed.spaced(ctx, String(dateLabel).toUpperCase(), 48, 180, { size: 13, tracking: 0.42 })
  const featured = opts.featured && page === 1 && matches[0]
  if (featured) ed.titleAr(ctx, 'يوم', 'برشلونة', W / 2, 380, 150, { lat: 'BARÇA DAY' })
  else ed.titleAr(ctx, 'مباريات', 'اليوم', W / 2, 380, 150, { lat: "TODAY'S MATCHES" })
  let top = 640
  if (featured) { await paintFeatured(ctx, matches[0], 48, 610, W - 96, 340); top = 990 }
  const list = featured ? matches.slice(1, 6) : matches.slice(0, 6)
  const rowH = 132, gap = 14
  const imgs = await Promise.all(list.map((m) => Promise.all([crest(m.homeLogo, m.home), crest(m.awayLogo, m.away)])))
  list.forEach((m, i) => matchRow(ctx, m, 48, top + i * (rowH + gap), W - 96, rowH, imgs[i][0], imgs[i][1]))
  const footY = 1660
  await drawQR(ctx, `${SITE}/today?ref=fb-story`, W - 60 - 170, footY, 170)
  ed.stack(ctx, ['VISCA', 'BARÇA'], 48, footY + 20, { size: 15 })
  ctx.textAlign = 'left'; ctx.fillStyle = ed.E.NAVY; ctx.font = 'bold 30px Tajawal'; ctx.fillText('النتائج مباشرة · pressing90.live', 48, footY + 130)
  ed.grain(ctx, W, H)
  return c
}

// ─── 4. Reel slide 1080×1920 (legacy single-frame slide, editorial) ────────
export async function drawMatchSlide(m, idx, total, heading) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  ed.backdrop(ctx, W, H)
  await ed.stadium(ctx, W, H, { top: H - 520, dark: '#8A8FA6', light: '#F4EFE6', alpha: 0.7, fadeTo: 0.6 })
  await pageMark(ctx, W - 48, 70); ed.stack(ctx, ['BARÇA', 'FIRST'], 48, 92, { size: 15 })
  ed.titleAr(ctx, '', heading || 'مباريات اليوم', W / 2, 420, 110)
  await paintFeatured(ctx, m, 48, 620, W - 96, 480)
  ed.spaced(ctx, `${idx + 1} / ${total}`, W / 2, 1760, { size: 14, align: 'center', tracking: 0.42 })
  ed.grain(ctx, W, H)
  return c
}

// ─── 5. Article post 1080×1350 (editorial: photo + paper panel + QR) ───────
export async function drawArticlePost(a) {
  registerBrandFonts()
  const W = 1080, H = 1350, PHOTO_H = 720
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  ed.backdrop(ctx, W, H)
  const img = await loadImg(a.image_url)
  if (img) {
    const s = Math.max(W / img.width, PHOTO_H / img.height), dw = img.width * s, dh = img.height * s
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, PHOTO_H); ctx.clip()
    ctx.drawImage(img, (W - dw) / 2, (PHOTO_H - dh) / 2, dw, dh); ctx.restore()
    const fade = ctx.createLinearGradient(0, PHOTO_H - 220, 0, PHOTO_H); fade.addColorStop(0, 'rgba(244,239,230,0)'); fade.addColorStop(1, ed.E.CREAM); ctx.fillStyle = fade; ctx.fillRect(0, PHOTO_H - 220, W, 220)
    const top = ctx.createLinearGradient(0, 0, 0, 200); top.addColorStop(0, 'rgba(17,28,79,0.45)'); top.addColorStop(1, 'rgba(17,28,79,0)'); ctx.fillStyle = top; ctx.fillRect(0, 0, W, 200)
  }
  ed.stack(ctx, ['BARÇA', 'FIRST'], 48, 62, { size: 15, color: img ? ed.E.CREAM : ed.E.NAVY })
  await pageMark(ctx, W - 48, 44, img ? 'light' : 'dark')
  const ar = a.lang === 'ar'
  const kicker = a.kicker || (ar ? 'خبر جديد' : 'NEW ARTICLE')
  if (ar) { ctx.textAlign = 'right'; ctx.font = 'bold 54px Aref'; ctx.fillStyle = ed.inkGradient(ctx, W - 48 - ctx.measureText(kicker).width, ctx.measureText(kicker).width); ctx.fillText(kicker, W - 48, 800); ed.bar(ctx, W - 108, 818) }
  else { ed.titleLat(ctx, '', kicker, 48, 800, 54, { align: 'left' }); ed.bar(ctx, 48, 818) }
  const titleTop = 900
  if (ar) {
    ctx.fillStyle = ed.E.NAVY; ctx.font = '900 56px Cairo'; ctx.textAlign = 'right'
    wrapLines(ctx, a.title, W - 130, 3).forEach((l, i) => ctx.fillText(l, W - 48, titleTop + i * 78))
  } else {
    ctx.fillStyle = ed.E.NAVY; ctx.font = '900 58px Playfair'; ctx.textAlign = 'left'
    wrapLines(ctx, a.title, W - 130, 3).forEach((l, i) => ctx.fillText(l, 48, titleTop + i * 74))
  }
  const qr = 150, qrX = W - 48 - qr, qrY = H - 48 - qr
  await drawQR(ctx, `${SITE}/news/${a.slug}?${ar ? 'lang=ar&' : ''}ref=fb-post`, qrX, qrY, qr)
  ed.stack(ctx, ['VISCA', 'BARÇA'], 48, qrY + 30, { size: 15 })
  ctx.textAlign = 'left'; ctx.fillStyle = ed.E.NAVY; ctx.font = 'bold 26px Tajawal'; ctx.fillText(ar ? 'المقال كاملاً: الرابط في التعليق · pressing90.live' : 'Full article: link in the comments · pressing90.live', 48, qrY + 140)
  ed.grain(ctx, W, H)
  return c
}

// ─── 6. Article story 1080×1920 (editorial, QR card) ───────────────────────
export async function drawArticleStory(a) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  ed.backdrop(ctx, W, H)
  await ed.stadium(ctx, W, H, { top: H - 420, dark: '#8A8FA6', light: '#F4EFE6', alpha: 0.6, fadeTo: 0.6 })
  ed.stack(ctx, ['BARÇA', 'FIRST'], 48, 92, { size: 15 }); await pageMark(ctx, W - 48, 70)
  const ar = a.lang === 'ar'
  const kicker = a.kicker || (ar ? 'خبر جديد' : 'NEW ARTICLE')
  if (ar) { ctx.textAlign = 'right'; ctx.font = 'bold 60px Aref'; const kw = ctx.measureText(kicker).width; ctx.fillStyle = ed.inkGradient(ctx, W - 48 - kw, kw); ctx.fillText(kicker, W - 48, 300); ed.bar(ctx, W - 108, 318) }
  else { ed.titleLat(ctx, '', kicker, 48, 300, 60, { align: 'left' }); ed.bar(ctx, 48, 318) }
  const img = await loadImg(a.image_url)
  const y = 370, h = 760
  roundedPath(ctx, 60, y, W - 120, h, 24); ctx.save(); ctx.clip()
  if (img) { const s = Math.max((W - 120) / img.width, h / img.height); const dw = img.width * s, dh = img.height * s; ctx.drawImage(img, 60 + ((W - 120) - dw) / 2, y + (h - dh) / 2, dw, dh) }
  else { ctx.fillStyle = ed.E.PAPER_DARK; ctx.fillRect(60, y, W - 120, h) }
  ctx.restore(); roundedPath(ctx, 60, y, W - 120, h, 24); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4; ctx.stroke()
  const titleTop = 1230
  ctx.fillStyle = ed.E.NAVY
  if (ar) { ctx.font = '900 60px Cairo'; ctx.textAlign = 'right'; wrapLines(ctx, a.title, W - 130, 3).forEach((l, i) => ctx.fillText(l, W - 48, titleTop + i * 84)) }
  else { ctx.font = '900 62px Playfair'; ctx.textAlign = 'left'; wrapLines(ctx, a.title, W - 130, 3).forEach((l, i) => ctx.fillText(l, 48, titleTop + i * 78)) }
  const cardY = 1530, cardH = 300
  roundedPath(ctx, 60, cardY, W - 120, cardH, 24); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill(); ctx.strokeStyle = ed.E.LINE; ctx.lineWidth = 2; ctx.stroke()
  const qr = createCanvas(480, 480)
  await QRCode.toCanvas(qr, `${SITE}/news/${a.slug}?${ar ? 'lang=ar&' : ''}ref=fb-story`, { width: 480, margin: 1, color: { dark: ed.E.NAVY, light: '#FFFFFF' } })
  ctx.drawImage(qr, 90, cardY + 30, 240, 240)
  if (ar) { ctx.fillStyle = ed.E.NAVY; ctx.font = 'bold 44px Tajawal'; ctx.textAlign = 'right'; ctx.fillText('امسح الرمز', W - 90, cardY + 110); ctx.fillStyle = ed.E.INK; ctx.font = '500 30px Tajawal'; wrapLines(ctx, 'أو ادخل إلى موقعنا لقراءة الخبر كاملاً', 560, 2).forEach((l, i) => ctx.fillText(l, W - 90, cardY + 170 + i * 42)) }
  else { ctx.fillStyle = ed.E.NAVY; ctx.font = '900 40px Playfair'; ctx.textAlign = 'left'; ctx.fillText('Scan the QR code', 370, cardY + 105); ctx.fillStyle = ed.E.INK; ctx.font = 'bold 28px Cairo'; wrapLines(ctx, 'or visit our profile to read the full article', 560, 2).forEach((l, i) => ctx.fillText(l, 370, cardY + 165 + i * 40)) }
  ed.spaced(ctx, 'PRESSING90.LIVE', ar ? W - 90 : 370, cardY + 262, { size: 16, align: ar ? 'right' : 'left', tracking: 0.42, color: ed.E.GRANA })
  ed.grain(ctx, W, H)
  return c
}

// ─── 7. GOAL alert slide 1080×1920 ─────────────────────────────────
// g: {home, away, homeLogo, awayLogo, homeScore, awayScore, league, scorer, minute, scoringSide:'home'|'away', ownGoal?, penalty?}
// ─── Animated slide layers (Mehdi, 2026-09-09: « tous les reels animés du même style ») ─
// Each builder returns transparent PNG layers + an `anims` timeline that
// video.js turns into an ffmpeg graph (see animSlide). Timings in seconds.
const PNG = (c) => c.toBuffer('image/png')
/** Reel ground 1080×1920 (editorial): paper + stadium + furniture. `transparent` = furniture only (a paper loop video sits underneath). */
async function paperReel(ctx, { stripe = false, tone = 'paper', dark = false, transparent = false, footer = 'PRESSING90.LIVE', label = ['BARÇA', 'FIRST'] } = {}) {
  const W = 1080, H = 1920
  if (!transparent) { ed.backdrop(ctx, W, H, { stripe, tone }); await ed.stadium(ctx, W, H, dark ? { top: H - 520, alpha: 0.95, fadeTo: 0.55 } : { top: H - 520, dark: '#8A8FA6', light: '#F4EFE6', alpha: 0.7, fadeTo: 0.6 }) }
  await pageMark(ctx, W - 48, 70); ed.stack(ctx, label, 48, 92, { size: 15 })
  labelText(ctx, footer, W / 2, 1800, { size: 16, align: 'center', color: dark && !transparent ? ed.E.CREAM : ed.E.NAVY })
}

/** Match slide (matchday / results): bg + home + away + score + pill. */
export async function drawMatchLayers(m, idx, total, heading, lang) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const ft = !!m.feature   // « يوم برشلونة » slide: paper bokeh loop behind (server.js), bigger crests
  const bg = createCanvas(W, H); { const ctx = ctx2d(bg)
    await paperReel(ctx, { transparent: !!(ft && m.bgVideo), tone: ft ? 'blue' : 'paper' })
    ed.spaced(ctx, `${idx + 1} / ${total}`, W / 2, 1760, { size: 14, align: 'center', tracking: 0.42 })
    ed.spaced(ctx, oneLine(ctx, String(m.league || '').toUpperCase(), 480, 'bold 16px Cairo'), W / 2, 600, { size: 16, align: 'center', tracking: 0.42, color: ed.E.MUTED }) }
  const head = createCanvas(900, 200); { const ctx = ctx2d(head)
    const txt = ft ? 'يوم برشلونة' : (heading || (lang === 'ar' ? 'مباريات اليوم' : "TODAY'S MATCHES"))
    displayTitle(ctx, txt, 450, 130, { size: /[؀-ۿ]/.test(txt) ? 100 : 78, maxW: 880 }) }
  const size = 300
  const [hImg, aImg] = await Promise.all([crest(m.homeLogo, m.home), crest(m.awayLogo, m.away)])
  const team = (img, name) => { const c = createCanvas(360, 440); const ctx = ctx2d(c)
    ed.crestAt(ctx, img, 180, 160, ft ? 320 : size)
    labelText(ctx, fitLine(ctx, name, 330, 'Cairo', 24, 15).toUpperCase(), 180, size + 90, { size: 22, align: 'center' }); return c }
  const home = team(hImg, m.home), away = team(aImg, m.away)
  const score = createCanvas(500, 200); { const ctx = ctx2d(score)
    if (m.score) ed.digits(ctx, String(m.score).replace('–', ' – '), 250, 150, ft ? 130 : 100, m.live ? ed.E.GRANA : ed.E.NAVY)
    else { ctx.textAlign = 'center'; ctx.font = `900 ${ft ? 120 : 96}px Playfair`; ctx.fillStyle = ed.inkGradient(ctx, 160, 180); ctx.fillText('VS', 250, 150) } }
  const pill = createCanvas(400, 100); { const ctx = ctx2d(pill); ctx.textAlign = 'center'
    if (m.live) { roundedPath(ctx, 90, 10, 220, 76, 38); ctx.fillStyle = ed.E.GRANA; ctx.fill(); ctx.fillStyle = ed.E.CREAM; ctx.font = 'bold 34px Cairo'; ctx.fillText('LIVE', 200, 60) }
    else if (m.time) { ctx.font = 'bold 30px Cairo'; const pw = Math.max(200, ctx.measureText(m.time).width + 70); roundedPath(ctx, 200 - pw / 2, 10, pw, 76, 38); ctx.fillStyle = ed.E.NAVY; ctx.fill(); ctx.fillStyle = ed.E.CREAM; ctx.fillText(m.time, 200, 59) } }
  return {
    bgVideo: ft && m.bgVideo ? m.bgVideo : undefined,
    layers: { bg: PNG(bg), head: PNG(head), home: PNG(home), away: PNG(away), score: PNG(score), pill: PNG(pill), cover: PNG(coverBand(idx === 0 ? m.cover : null)) },
    // First slide: everything readable from the first frame (audit: viewers leave within 3 s), later slides animate in.
    anims: idx === 0 ? [
      { layer: 'head', x: 90, y: 280, w: 900, h: 200, fade: { st: 0, d: 0 } },
      { layer: 'home', x: 90, y: 700, fade: { st: 0, d: 0 } },
      { layer: 'away', x: 630, y: 700, fade: { st: 0, d: 0 } },
      { layer: 'score', x: 290, y: 730, w: 500, h: 200, pop: { from: 1.3, st: 0, d: 0.3 }, fade: { st: 0, d: 0 } },
      { layer: 'pill', x: 340, y: 1380, fade: { st: 0, d: 0 } },
      { layer: 'cover', x: 40, y: 1160, fade: { st: 0, d: 0 }, out: { st: 2.6, d: 0.4 } },
    ] : [
      { layer: 'head', x: 90, y: 280, w: 900, h: 200, pop: { from: 1.6, st: 0.05, d: 0.35 }, fade: { st: 0.05, d: 0.2 } },
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
  const bg = createCanvas(W, H); { const ctx = ctx2d(bg); await paperReel(ctx) }
  const kicker = createCanvas(900, 100); { const ctx = ctx2d(kicker)
    const txt = heading || (ar ? 'خبر جديد' : 'NEW ARTICLE')
    displayTitle(ctx, txt, ar ? 900 : 0, 68, { size: ar ? 56 : 40, maxW: 880, align: ar ? 'right' : 'left' }) }
  const pw = W - 120, ph = 760
  const photo = createCanvas(pw, ph); { const ctx = ctx2d(photo)
    const img = await loadImg(a.image_url)
    roundedPath(ctx, 0, 0, pw, ph, 24); ctx.save(); ctx.clip()
    if (img) { const s = Math.max(pw / img.width, ph / img.height); const dw = img.width * s, dh = img.height * s; ctx.drawImage(img, (pw - dw) / 2, (ph - dh) / 2, dw, dh) }
    else { ctx.fillStyle = ed.E.PAPER_DARK; ctx.fillRect(0, 0, pw, ph) }
    ctx.restore(); roundedPath(ctx, 0, 0, pw, ph, 24); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 4; ctx.stroke() }
  const title = createCanvas(960, 340); { const ctx = ctx2d(title)
    ctx.fillStyle = ed.E.NAVY
    if (ar) { ctx.font = '900 58px Cairo'; ctx.textAlign = 'right'; wrapLines(ctx, a.title, 940, 3).forEach((l, i) => ctx.fillText(l, 950, 62 + i * 84)) }
    else { ctx.font = '900 60px Playfair'; ctx.textAlign = 'left'; wrapLines(ctx, a.title, 940, 3).forEach((l, i) => ctx.fillText(l, 10, 58 + i * 78)) } }
  const card = createCanvas(960, 320); { const ctx = ctx2d(card)
    roundedPath(ctx, 0, 0, 960, 320, 24); ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.fill(); ctx.strokeStyle = ed.E.LINE; ctx.lineWidth = 2; ctx.stroke()
    const qr = createCanvas(480, 480)
    await QRCode.toCanvas(qr, `${SITE}/news/${a.slug}?${ar ? 'lang=ar&' : ''}ref=fb-story`, { width: 480, margin: 1, color: { dark: ed.E.NAVY, light: '#FFFFFF' } })
    ctx.drawImage(qr, 36, 35, 250, 250)
    const tx = 36 + 250 + 44
    if (ar) {
      ctx.fillStyle = ed.E.NAVY; ctx.font = 'bold 46px Tajawal'; ctx.textAlign = 'right'; ctx.fillText('امسح الرمز', 924, 100)   // no Latin inside the Arabic line (bidi flips it)
      ctx.fillStyle = ed.E.INK; ctx.font = '500 32px Tajawal'
      wrapLines(ctx, 'أو ادخل إلى موقعنا لقراءة الخبر كاملاً', 960 - 36 - tx, 2).forEach((l, i) => ctx.fillText(l, 924, 165 + i * 44))
      ed.spaced(ctx, 'PRESSING90.LIVE', 924, 275, { size: 16, align: 'right', tracking: 0.42, color: ed.E.GRANA })
    } else {
      ctx.fillStyle = ed.E.NAVY; ctx.font = '900 42px Playfair'; ctx.textAlign = 'left'; ctx.fillText('Scan the QR code', tx, 105)
      ctx.fillStyle = ed.E.INK; ctx.font = 'bold 28px Cairo'
      wrapLines(ctx, 'or visit our profile to read the full article', 960 - 36 - tx, 2).forEach((l, i) => ctx.fillText(l, tx, 165 + i * 40))
      ed.spaced(ctx, 'PRESSING90.LIVE', tx, 275, { size: 16, tracking: 0.42, color: ed.E.GRANA })
    } }
  return {
    layers: { bg: PNG(bg), kicker: PNG(kicker), photo: PNG(photo), title: PNG(title), card: PNG(card), ...(a.cover ? { cover: PNG(coverBand(a.cover)) } : {}) },
    anims: a.first ? [
      // first slide = thumbnail: everything visible from frame 0 (2026-09-14)
      { layer: 'photo', x: 60, y: 340, slide: { dx: 0, dy: 24, st: 0, d: 0.6 }, fade: { st: 0, d: 0 } },
      { layer: 'kicker', x: 64, y: 220, w: 900, h: 100, fade: { st: 0, d: 0 } },
      { layer: 'title', x: 60, y: 1132, fade: { st: 0, d: 0 } },
      { layer: 'card', x: 60, y: 1500, fade: { st: 0, d: 0 } },
      ...(a.cover ? [{ layer: 'cover', x: 40, y: 980, fade: { st: 0, d: 0 }, out: { st: 2.6, d: 0.4 } }] : []),
    ] : [
      { layer: 'photo', x: 60, y: 340, slide: { dx: 0, dy: 70, st: 0.1, d: 0.7 }, fade: { st: 0.1, d: 0.45 } },
      { layer: 'kicker', x: 64, y: 220, w: 900, h: 100, pop: { from: 1.8, st: 0.55, d: 0.35 }, fade: { st: 0.55, d: 0.15 } },
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
    bgVideo: g.bgVideo || undefined,
    layers: { bg: L.bg, flash: L.flash, goal: L.goal, home: L.home, away: L.away, score: L.score, scorer: L.scorer, minute: L.minute, cover: coverBand(g.cover).toBuffer('image/png') },
    // Audit 2026-09-13: 80-85 % of viewers leave before 3 s and the scorer used to
    // appear at 1.9 s — the whole payoff (GOAL, teams, score, scorer, minute) is
    // now on screen within half a second, the motion is only an accent.
    anims: [
      // Frame 0 is the Facebook thumbnail (2026-09-14): no fade-in on the card layers, only a little motion.
      { layer: 'flash', x: 0, y: 0, fade: { st: 0, d: 0.06 }, out: { st: 0.12, d: 0.6 } },
      { layer: 'goal', x: r.goal[0], y: r.goal[1], w: 1000, h: 320, pop: { from: 1.22, st: 0, d: 0.35 }, fade: { st: 0, d: 0 } },
      { layer: 'home', x: r.home[0], y: r.home[1], slide: { dx: -50, dy: 0, st: 0, d: 0.4 }, fade: { st: 0, d: 0 } },
      { layer: 'away', x: r.away[0], y: r.away[1], slide: { dx: 50, dy: 0, st: 0, d: 0.4 }, fade: { st: 0, d: 0 } },
      { layer: 'score', x: r.score[0], y: r.score[1], slide: { dx: 0, dy: 18, st: 0, d: 0.35 }, fade: { st: 0, d: 0 } },
      { layer: 'scorer', x: r.scorer[0], y: r.scorer[1], fade: { st: 0, d: 0 } },
      { layer: 'minute', x: r.minute[0], y: r.minute[1], fade: { st: 0, d: 0 } },
      // thumbnail line: on the first frame, gone after 2.6 s so the card breathes
      { layer: 'cover', x: 40, y: 1160, fade: { st: 0, d: 0 }, out: { st: 2.6, d: 0.4 } },
    ],
  }
}

// ─── FOOTBALL STORIES ("tale") — Mehdi, 2026-09-10: retention reels telling a
// true, strange football story in 10 animated beats, EN / FR / AR. ──────────
const TALE_FONT = (lang, size, bold = true) => lang === 'ar' ? `${bold ? 'bold ' : ''}${size}px Tajawal` : `900 ${Math.round(size * 0.86)}px Playfair`
const TALE_MONO = (lang, size) => lang === 'ar' ? `500 ${size}px Tajawal` : `bold ${Math.round(size * 0.9)}px Cairo`
async function taleBg(glow, transparent = false) {
  const W = 1080, H = 1920
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  if (!transparent) { ed.backdrop(ctx, W, H, { tone: glow === 'gold' ? 'grana' : 'blue' }); await ed.stadium(ctx, W, H, { top: H - 520, dark: '#8A8FA6', light: '#F4EFE6', alpha: 0.7, fadeTo: 0.6 }) }
  await pageMark(ctx, W - 48, 70); ed.stack(ctx, ['FOOTBALL', 'STORIES'], 48, 92, { size: 15 })
  ed.spaced(ctx, 'PRESSING90.LIVE', W / 2, 1800, { size: 16, align: 'center', tracking: 0.42 })
  return c
}
function taleKicker(text, lang) { const c = createCanvas(960, 100); const ctx = ctx2d(c); displayTitle(ctx, String(text || ''), 480, lang === 'ar' ? 72 : 64, { size: lang === 'ar' ? 56 : 40, maxW: 940 }); return c }
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
  if (rtl) t = t.replace(/^(.+?)([.,:;!…،؛]+)$/u, '$2$1')   // Arabic comma / semicolon too (« 16 سنة، » showed the comma on the wrong side)
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
    const words = l.split(' ').filter((w) => taleWord(w, rtl).length > 0)   // an emoji-only word would leave an empty highlight box
    const widths = words.map((w) => ctx.measureText(taleWord(w, rtl)).width)
    const space = ctx.measureText(' ').width
    const total = widths.reduce((s, w) => s + w, 0) + space * (words.length - 1)
    // right-to-left languages: lay the words out from the right edge
    let x = rtl ? 500 + total / 2 : 500 - total / 2
    words.forEach((w, k) => {
      const hot = isHot(w)
      const ww = widths[k]
      const wx = rtl ? x - ww : x
      if (hot) { ctx.save(); ctx.shadowColor = 'transparent'; ctx.fillStyle = hotColor === ed.E.GRANA ? 'rgba(177,17,63,0.14)' : 'rgba(43,75,201,0.14)'; roundedPath(ctx, wx - 10, y - size * 0.86, ww + 20, size * 1.08, 14); ctx.fill(); ctx.restore() }
      ctx.textAlign = 'left'; ctx.shadowColor = 'rgba(17,28,79,0.12)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3
      ctx.fillStyle = hot ? hotColor : ed.E.NAVY
      ctx.fillText(taleWord(w, rtl), wx, y)
      x = rtl ? wx - space : x + ww + space
    })
  })
  return c
}
function taleBadge(code, colors) { const c = createCanvas(220, 220); const ctx = ctx2d(c); const cx = 110, cy = 110
  ctx.beginPath(); ctx.arc(cx, cy, 104, 0, Math.PI * 2); ctx.fillStyle = colors[0]; ctx.fill()
  ctx.beginPath(); ctx.arc(cx, cy, 104, -Math.PI / 2, Math.PI / 2); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fillStyle = colors[1]; ctx.fill()
  ctx.beginPath(); ctx.arc(cx, cy, 104, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke()
  ctx.beginPath(); ctx.arc(cx, cy, 62, 0, Math.PI * 2); ctx.fillStyle = ed.E.NAVY; ctx.fill()
  ctx.textAlign = 'center'; ctx.fillStyle = ed.E.CREAM; ctx.font = '900 40px Cairo'; ctx.fillText(code, cx, cy + 14); return c }
function taleScoreboard(v, lang) { const c = createCanvas(960, 300); const ctx = ctx2d(c)
  roundedPath(ctx, 0, 20, 960, 260, 28); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = ed.E.LINE; ctx.stroke()
  ctx.drawImage(taleBadge(v.hCode, v.hColors), 50, 40, 190, 190); ctx.drawImage(taleBadge(v.aCode, v.aColors), 720, 40, 190, 190)
  const big = String(v.h).length > 2 || String(v.a).length > 2 ? 100 : 140
  ed.digits(ctx, v.h, 390, 195, big, v.hl === 'h' ? ed.E.GRANA : ed.E.NAVY); ed.digits(ctx, v.a, 570, 195, big, v.hl === 'a' ? ed.E.GRANA : ed.E.NAVY)
  ctx.fillStyle = ed.navy(0.25); ctx.fillRect(479, 80, 2, 130)
  labelText(ctx, v.home, 145, 268, { size: 18, align: 'center', color: ed.E.MUTED }); labelText(ctx, v.away, 815, 268, { size: 18, align: 'center', color: ed.E.MUTED })
  if (v.tag) { ctx.fillStyle = ed.E.GRANA; roundedPath(ctx, 380, 0, 200, 44, 22); ctx.fill(); ctx.fillStyle = ed.E.CREAM; ctx.textAlign = 'center'; ctx.font = TALE_FONT(lang, 26); ctx.fillText(v.tag, 480, 31) }
  return c }
function taleMark(text, color) { const t = String(text); const ar = /[؀-ۿ]/.test(t); const size = t.length > 4 ? 240 : t.length > 2 ? 320 : 400; const c = createCanvas(960, 520); const ctx = ctx2d(c); ctx.textAlign = 'center'; ctx.font = ar ? `bold ${size}px Aref` : `900 ${size}px Playfair`; const tw = Math.min(940, ctx.measureText(t).width); const col = color === 'gold' ? ed.E.GOLD : color === 'red' ? ed.E.GRANA : color === 'green' ? ed.E.BLUE : color === 'navy' ? ed.E.NAVY : null; ctx.fillStyle = col || ed.inkGradient(ctx, 480 - tw / 2, tw); ctx.fillText(t, 480, ar ? 380 : 400); return c }
function talePitch(v, lang) { const c = createCanvas(960, 560); const ctx = ctx2d(c)
  roundedPath(ctx, 30, 30, 900, 500, 24); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = ed.E.LINE; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(480, 30); ctx.lineTo(480, 530); ctx.stroke(); ctx.beginPath(); ctx.arc(480, 280, 90, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeRect(30, 150, 120, 260); ctx.strokeRect(810, 150, 120, 260)
  ctx.fillStyle = ed.E.NAVY; ctx.fillRect(18, 220, 12, 120); ctx.fillRect(930, 220, 12, 120)
  const arrow = (x1, y1, x2, y2, col) => { ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); const ang = Math.atan2(y2 - y1, x2 - x1); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 34 * Math.cos(ang - 0.5), y2 - 34 * Math.sin(ang - 0.5)); ctx.lineTo(x2 - 34 * Math.cos(ang + 0.5), y2 - 34 * Math.sin(ang + 0.5)); ctx.closePath(); ctx.fill() }
  if (v.mode === 'both') { arrow(480, 280, 190, 280, ed.E.GRANA); arrow(480, 280, 770, 280, ed.E.GRANA) }
  else if (v.mode === 'one') { arrow(480, 280, 770, 280, ed.E.GRANA) }
  else if (v.mode === 'empty') { ctx.fillStyle = ed.navy(0.35); ctx.font = '900 120px Playfair'; ctx.textAlign = 'center'; ctx.fillText('?', 700, 320) }
  if (v.bottom) labelText(ctx, v.bottom, 480, 480, { size: 22, align: 'center' })
  if (v.top) labelText(ctx, v.top, 480, 90, { size: 18, align: 'center', color: ed.E.GRANA })
  return c }
function taleQuote() { const c = createCanvas(960, 520); const ctx = ctx2d(c); ctx.textAlign = 'center'; ctx.fillStyle = ed.navy(0.14); ctx.font = '900 460px Playfair'; ctx.fillText('“', 480, 520); return c }
function taleCta(labels, lang) { const c = createCanvas(960, 420); const ctx = ctx2d(c); ctx.textAlign = 'center'
  const plus = (x, y) => { ctx.fillRect(x - 3, y - 18, 6, 36); ctx.fillRect(x - 18, y - 3, 36, 6) }
  // Mehdi, 2026-09-13: Meta demotes explicit like / comment asks (engagement bait) — only the follow pill stays.
  roundedPath(ctx, 335, 0, 290, 96, 48); ctx.fillStyle = ed.E.NAVY; ctx.fill(); ctx.fillStyle = ed.E.CREAM; plus(381, 48); ctx.font = TALE_FONT(lang, 36); ctx.fillText(labels.follow, 500, 60)
  ctx.fillStyle = ed.E.NAVY; ctx.font = TALE_MONO(lang, 32); ctx.fillText(labels.full, 480, 190)
  roundedPath(ctx, 130, 240, 700, 120, 24); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fill(); ctx.strokeStyle = ed.E.LINE; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = ed.E.GRANA; ctx.font = TALE_MONO(lang, 30); ctx.fillText(labels.weekly, 480, 312); return c }
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
    const words = l.split(' ').filter((w) => taleWord(w, rtl).length > 0)   // an emoji-only word would leave an empty highlight box
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
      if (p.hot || newest) { ctx.save(); ctx.shadowColor = 'transparent'; ctx.fillStyle = p.hot ? (hotColor === ed.E.GRANA ? 'rgba(177,17,63,0.14)' : 'rgba(43,75,201,0.14)') : 'rgba(17,28,79,0.08)'; roundedPath(ctx, p.x - 10, p.y - size * 0.86, p.ww + 20, size * 1.08, 14); ctx.fill(); ctx.restore() }
      ctx.shadowColor = 'rgba(17,28,79,0.12)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3
      ctx.fillStyle = p.hot ? hotColor : (newest ? ed.E.BLUE : ed.E.NAVY)
      ctx.fillText(p.w, p.x, p.y)
    }
    frames.push(c.toBuffer('image/png'))
  }
  return { frames, H }
}
function taleGlowBlob(color) { const c = createCanvas(1400, 1400); const ctx = ctx2d(c); const col = color === 'gold' ? ed.E.GRANA : ed.E.BLUE; const g = ctx.createRadialGradient(700, 700, 0, 700, 700, 700); g.addColorStop(0, col + '2A'); g.addColorStop(1, col + '00'); ctx.fillStyle = g; ctx.fillRect(0, 0, 1400, 1400); return c }
function taleFlash() { const c = createCanvas(900, 900); const ctx = ctx2d(c); const f = ctx.createRadialGradient(450, 450, 0, 450, 450, 450); f.addColorStop(0, 'rgba(255,255,255,0.7)'); f.addColorStop(0.5, 'rgba(232,194,90,0.2)'); f.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = f; ctx.fillRect(0, 0, 900, 900); return c }
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
  fade.addColorStop(0, 'rgba(244,239,230,0)'); fade.addColorStop(1, ed.E.CREAM)
  ctx.fillStyle = fade; ctx.fillRect(0, 0, W, H)
  const top = ctx.createLinearGradient(0, 0, 0, 260)
  top.addColorStop(0, 'rgba(17,28,79,0.55)'); top.addColorStop(1, 'rgba(17,28,79,0)')
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 260)
  if (credit) { ctx.textAlign = 'left'; ctx.fillStyle = ed.E.MUTED; ctx.font = 'bold 18px Cairo'; ctx.fillText(String(credit).slice(0, 90), 120, H - 24) }
  return c
}
// ─── Comic stories (Mehdi, 2026-09-16: « reel genre bande dessinée ») ─────────
// Illustrations generated per beat (Gemini, house style: flat vector, navy / garnet / cream / gold) sit in a paper
// frame with a slow zoom; the cover (first 2.2 s = the Facebook thumbnail) carries 1-3 bold coloured hook lines.
const isArabic = (t) => /[؀-ۿ]/.test(String(t || ''))
function hookPill(ctx, W, text, y, { size = 118, bg = ed.E.GRANA, fg = ed.E.CREAM, rotate = -0.03 } = {}) {
  const ar = isArabic(text)
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  let sz = ar ? size : Math.round(size * 0.72)
  const font = (z) => ar ? `bold ${z}px Aref` : `900 ${z}px Playfair`
  ctx.font = font(sz); while (ctx.measureText(text).width > 940 && sz > 44) { sz -= 6; ctx.font = font(sz) }
  const w = ctx.measureText(text).width + 90, h = ar ? sz * 1.32 : sz * 1.42
  ctx.translate(W / 2, y); ctx.rotate(rotate)
  ctx.fillStyle = 'rgba(17,28,79,0.55)'; roundedPath(ctx, -w / 2 + 10, -h * 0.74 + 12, w, h, 18); ctx.fill()
  ctx.fillStyle = bg; roundedPath(ctx, -w / 2, -h * 0.74, w, h, 18); ctx.fill()
  ctx.fillStyle = fg; ctx.fillText(text, 0, ar ? 0 : sz * 0.08); ctx.restore()
  return y + h + 10
}
/** Illustration in a white paper frame (1000×960, shadow included) — null when the image cannot be loaded. */
async function comicPanel(url) {
  const img = await loadImg(url); if (!img) return null
  const c = createCanvas(1000, 960); const ctx = ctx2d(c)
  const fx = 20, fy = 10, fw = 960, fh = 900
  ctx.save(); ctx.shadowColor = 'rgba(17,28,79,0.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18; ctx.fillStyle = '#fff'; roundedPath(ctx, fx, fy, fw, fh, 28); ctx.fill(); ctx.restore()
  ctx.save(); roundedPath(ctx, fx + 14, fy + 14, fw - 28, fh - 28, 20); ctx.clip()
  const s = Math.max((fw - 28) / img.width, (fh - 28) / img.height); const dw = img.width * s, dh = img.height * s
  ctx.drawImage(img, fx + 14 + ((fw - 28) - dw) / 2, fy + 14 + ((fh - 28) - dh) / 2, dw, dh); ctx.restore()
  return c
}
/** Story cover 1080×1920: illustration + coloured hook lines, everything inside the 3:4 grid crop (y 240-1680). */
export async function drawStoryCover(d) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  ed.backdrop(ctx, W, H, { stripe: true, tone: 'blue' })
  await ed.stadium(ctx, W, H, { top: H - 420, alpha: 0.9, fadeTo: 0.6 })
  const panel = d.img ? await comicPanel(d.img) : null
  if (panel) ctx.drawImage(panel, 40, 240)
  const tag = d.tag || (d.lang === 'ar' ? 'قصة لا تُصدق' : 'INCREDIBLE STORY')
  ctx.save(); ctx.translate(90, 244); ctx.rotate(-0.06); ctx.font = isArabic(tag) ? 'bold 34px Tajawal' : 'bold 26px Cairo'; const tw = ctx.measureText(tag).width + 50
  ctx.fillStyle = ed.E.GOLD; roundedPath(ctx, 0, -46, tw, 62, 12); ctx.fill(); ctx.fillStyle = ed.E.NAVY; ctx.textAlign = 'left'; ctx.fillText(tag, 25, isArabic(tag) ? 0 : -4); ctx.restore()
  let y = 1300
  if (d.l1) y = hookPill(ctx, W, d.l1, y, { size: 150, bg: ed.E.NAVY, fg: ed.E.GOLD, rotate: -0.03 })
  if (d.l2) y = hookPill(ctx, W, d.l2, y + 30, { size: 104, bg: ed.E.GRANA, fg: ed.E.CREAM, rotate: 0.02 })
  if (d.l3) y = hookPill(ctx, W, d.l3, y + 24, { size: 72, bg: ed.E.CREAM, fg: ed.E.NAVY, rotate: -0.015 })
  await pageMark(ctx, W - 48, 70); ed.stack(ctx, ['FOOTBALL', 'STORIES'], 48, 92, { size: 15 })
  ed.spaced(ctx, 'PRESSING90.LIVE', W / 2, 1830, { size: 16, align: 'center', tracking: 0.42, color: ed.E.CREAM })
  ed.grain(ctx, W, H)
  return c
}
/** One story beat → animated layer spec (+ progress bar layer). timing = { dur, voiceDur }. */
export async function drawTaleBeatLayers(beat, lang, labels, progress, timing = {}, opts = {}) {
  registerBrandFonts()
  // opts.bgVideo (Barça stories, 2026-09-14): beats without a photo sit on the bokeh loop — the ground becomes a transparent vignette + brand.
  const onVideo = !!opts.bgVideo && !beat.imageUrl
  const PNGb = (c) => c.toBuffer('image/png')
  const glow = beat.glow || 'green'
  const hot = glow === 'gold' ? ed.E.GRANA : ed.E.BLUE
  const dur = timing.dur || 6
  const first0 = !!beat.first
  if (beat.comic && beat.imageUrl) {
    // Comic layout: kicker, illustration panel (slow zoom), word-by-word caption under it, scoreboard / CTA below.
    const panel = await comicPanel(beat.imageUrl).catch(() => null)
    if (panel) {
      const layers = { bg: PNGb(await taleBg(glow, onVideo)), panel: PNGb(panel), kicker: PNGb(taleKicker(beat.kicker || '', lang)) }
      if (beat.cover) layers.cover = PNGb(coverBand(beat.cover))
      const anims = [
        { layer: 'panel', x: 40, y: 200, w: 1000, h: 960, pop: { from: 1.06, st: 0, d: Math.max(3, dur) }, fade: { st: 0, d: first0 ? 0 : 0.2 } },
        { layer: 'kicker', x: 60, y: 96, w: 960, h: 100, pop: { from: first0 ? 1.1 : 1.5, st: 0, d: first0 ? 0.2 : 0.3 }, fade: { st: 0, d: first0 ? 0 : 0.1 } },
        ...(beat.cover ? [{ layer: 'cover', x: 40, y: 1080, fade: { st: 0, d: 0 }, out: { st: 2.6, d: 0.4 } }] : []),
      ]
      const capFrames = taleCaptionFrames(beat.caption || '', lang, Math.min(beat.capSize || (lang === 'ar' ? 62 : 66), 66), hot).frames
      const frames = first0 ? [capFrames[capFrames.length - 1]] : capFrames
      const span = Math.min(Math.max(1.2, (timing.voiceDur || dur * 0.7) * 0.65), 6)
      frames.forEach((buf, k) => {
        layers[`w${k}`] = buf
        const st = first0 ? 0 : 0.3 + (k / Math.max(1, frames.length - 1)) * span
        const en = k < frames.length - 1 ? 0.3 + ((k + 1) / Math.max(1, frames.length - 1)) * span : undefined
        anims.push({ layer: `w${k}`, x: 40, y: 1200, show: { st: +st.toFixed(3), en: en != null ? +en.toFixed(3) : undefined } })
      })
      if (beat.visual && (beat.visual.type === 'scoreboard' || beat.visual.type === 'cta')) {
        const vis = taleVisual(beat.visual, lang, labels)
        const vy = beat.visual.type === 'cta' ? 1470 : 1560
        layers.vis = PNGb(vis.c); anims.push({ layer: 'vis', x: 60, y: vy, w: vis.w, h: vis.h, pop: { from: 1.5, st: 0.7, d: 0.4 }, fade: { st: 0.7, d: 0.2 } })
      }
      if (progress) { const bar = createCanvas(1080, 10); const ctx = ctx2d(bar); ctx.fillStyle = ed.E.GRANA; ctx.fillRect(0, 0, 1080, 10); layers.bar = PNGb(bar); anims.push({ layer: 'bar', x: 0, y: 1910, progress }) }
      return { layers, anims, bgVideo: onVideo ? opts.bgVideo : undefined }
    }
  }
  const photo = beat.imageUrl ? await talePhoto(beat.imageUrl, beat.credit).catch(() => null) : null
  const first = !!beat.first   // hook beat: the claim must be readable at frame 0 (average play time was 3 s)
  if (photo) {
    // Reportage layout: photo on top (slow pan), kicker + caption in the lower third, visual only if it is a scoreboard.
    const layers = { bg: PNGb(await taleBg(glow)), photo: PNGb(photo), kicker: PNGb(taleKicker(beat.kicker || '', lang)) }
    if (beat.cover) layers.cover = PNGb(coverBand(beat.cover))   // thumbnail line (all reel types, 2026-09-14)
    const line = createCanvas(320, 6); { const ctx = ctx2d(line); ed.bar(ctx, 0, 0, 320, 6) }
    layers.line = PNGb(line)
    const anims = [
      { layer: 'photo', x: -110, y: 0, drift: { dx: 110, dy: 0, dur: Math.max(4, dur) }, fade: { st: 0, d: first ? 0 : 0.35 } },
      { layer: 'kicker', x: 60, y: 1150, w: 960, h: 100, pop: { from: first ? 1.15 : 1.7, st: first ? 0 : 0.1, d: first ? 0.2 : 0.35 }, fade: { st: 0, d: first ? 0 : 0.1 } },
      { layer: 'line', x: 380, y: 1222, grow: { st: first ? 0 : 0.35, d: 0.45 } },
      ...(beat.cover ? [{ layer: 'cover', x: 40, y: 230, fade: { st: 0, d: 0 }, out: { st: 2.6, d: 0.4 } }] : []),
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
    if (progress) { const bar = createCanvas(1080, 10); const ctx = ctx2d(bar); ctx.fillStyle = ed.E.GRANA; ctx.fillRect(0, 0, 1080, 10); layers.bar = PNGb(bar); anims.push({ layer: 'bar', x: 0, y: 1910, progress }) }
    return { layers, anims }
  }
  const layers = { bg: PNGb(await taleBg(glow, onVideo)), glow: PNGb(taleGlowBlob(glow)), kicker: PNGb(taleKicker(beat.kicker || '', lang)) }
  if (beat.cover) layers.cover = PNGb(coverBand(beat.cover))
  const line = createCanvas(320, 6); { const ctx = ctx2d(line); ed.bar(ctx, 0, 0, 320, 6) }
  layers.line = PNGb(line)
  const anims = [
    { layer: 'glow', x: -160, y: 100, drift: { dx: 400, dy: 260, dur: Math.max(4, dur) } },
    { layer: 'kicker', x: 60, y: 300, w: 960, h: 100, pop: { from: first ? 1.15 : 1.7, st: first ? 0 : 0.05, d: first ? 0.2 : 0.35 }, fade: { st: 0, d: first ? 0 : 0.1 } },
    { layer: 'line', x: 380, y: 372, grow: { st: first ? 0 : 0.3, d: 0.45 } },
    ...(beat.cover ? [{ layer: 'cover', x: 40, y: 1560, fade: { st: 0, d: 0 }, out: { st: 2.6, d: 0.4 } }] : []),
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
    const bar = createCanvas(1080, 10); const ctx = ctx2d(bar); ctx.fillStyle = ed.E.GRANA; ctx.fillRect(0, 0, 1080, 10)
    layers.bar = PNGb(bar)
    anims.push({ layer: 'bar', x: 0, y: 1910, progress })   // {from, to, dur} handled by animSlide
  }
  return { layers, anims, bgVideo: onVideo ? opts.bgVideo : undefined }
}
/** Story cover 1200×675 (site hero / og:image). */
export async function drawTaleCover(d) {
  registerBrandFonts()
  const W = 1200, H = 675
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  ed.backdrop(ctx, W, H, { stripe: true })
  await ed.stadium(ctx, W, H, { top: H - 260, alpha: 0.85, fadeTo: 0.6 })
  await pageMark(ctx, W - 48, 36)
  ed.stack(ctx, ['FOOTBALL', 'STORIES'], 48, 62, { size: 14 })
  const lang = d.lang || 'en', ar = lang === 'ar'
  if (d.kicker) { ctx.textAlign = ar ? 'right' : 'left'; ctx.font = ar ? 'bold 40px Aref' : '900 34px Playfair'; const kw = ctx.measureText(d.kicker).width; ctx.fillStyle = ed.inkGradient(ctx, ar ? W - 60 - kw : 60, kw); ctx.fillText(d.kicker, ar ? W - 60 : 60, 190) }
  ctx.fillStyle = ed.E.NAVY; ctx.font = ar ? '900 54px Cairo' : '900 54px Playfair'; ctx.textAlign = ar ? 'right' : 'left'
  wrapLines(ctx, String(d.hook || ''), 760, 4).forEach((l, i) => ctx.fillText(l, ar ? W - 60 : 60, 270 + i * 68))
  if (d.year) { ctx.textAlign = 'right'; ctx.fillStyle = ed.navy(0.12); ctx.font = '900 200px Playfair'; ctx.fillText(String(d.year), W - 30, H - 30) }
  ed.spaced(ctx, 'PRESSING90.LIVE', 60, H - 40, { size: 14, color: ed.E.CREAM, tracking: 0.42 })
  ed.grain(ctx, W, H)
  return c
}

// ─── GOAL animation layers (Mehdi, 2026-09-08 soir: « une animation de but »)
// Same look as drawGoalSlide, split into transparent PNG layers that
// video.js animates with ffmpeg expressions (slam, slide-ins, pulse).
// Every layer comes with its resting position on the 1080×1920 canvas.
// Cover band (Mehdi, 2026-09-14: « miniatures avec des textes clairs, colorés selon la catégorie, qui créent du
// suspense »): Facebook takes the first frame as the reel thumbnail, so the first ~2.5 s carry a bold coloured
// line derived from the real match context (equaliser, late goal, Barça day…). Tones = category colours.
const COVER_TONES = { goal: () => [ed.E.NAVY, ed.E.CREAM], barca: () => [ed.E.GOLD, ed.E.NAVY], ft: () => [ed.E.GRANA, ed.E.CREAM], matchday: () => [ed.E.BLUE, ed.E.CREAM], results: () => [ed.E.GRANA, ed.E.CREAM], story: () => [ed.E.NAVY, ed.E.CREAM] }
export function coverBand(cover) {
  const c = createCanvas(1000, 110); const ctx = ctx2d(c)
  if (!cover || !cover.text) return c
  const [bg, fg] = (COVER_TONES[cover.tone] || COVER_TONES.goal)()
  ctx.font = 'bold 58px Tajawal'; ctx.textAlign = 'center'
  const w = Math.min(980, ctx.measureText(cover.text).width + 90)
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8
  roundedPath(ctx, 500 - w / 2, 4, w, 100, 50); ctx.fillStyle = bg; ctx.fill()
  ctx.shadowColor = 'transparent'; ctx.fillStyle = fg; ctx.fillText(cover.text, 500, 74)
  return c
}
export async function drawGoalLayers(g) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const png = (c) => c.toBuffer('image/png')
  // Barça special: the card sits on the paper confetti loop (server.js) → ground = furniture only; gold outline on the title, gold scorer pill.
  const sp = g.special === 'barca'
  const bg = createCanvas(W, H); { const ctx = ctx2d(bg)
    await paperReel(ctx, { transparent: sp && !!g.bgVideo, stripe: true, dark: true, footer: g.footer || 'LIVE ON PRESSING90.LIVE' })
    ed.spaced(ctx, oneLine(ctx, String(g.league || '').toUpperCase(), 480, 'bold 16px Cairo'), W / 2, 330, { size: 16, align: 'center', tracking: 0.42, color: ed.E.MUTED }) }
  const flash = createCanvas(W, H); { const ctx = ctx2d(flash)
    const f = ctx.createRadialGradient(W / 2, 540, 0, W / 2, 540, 700)
    f.addColorStop(0, 'rgba(255,255,255,0.9)'); f.addColorStop(0.4, 'rgba(232,194,90,0.3)'); f.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = f; ctx.fillRect(0, 0, W, H) }
  // goal: title 1000×320 → rests at (40, 370). g.title overrides "GOAL!" (Barça full-time card: 'نهاية المباراة')
  const goal = createCanvas(1000, 320); { const ctx = ctx2d(goal)
    const ar = g.titleLang === 'ar' || /[؀-ۿ]/.test(g.title || '')
    const txt = g.title || (ar ? 'هدف!' : 'GOAL!')
    displayTitle(ctx, txt, 500, ar ? 235 : 250, { size: ar ? 170 : 190, maxW: 960, stroke: sp ? ed.E.GOLD : null }) }
  const size = 260
  const [hImg, aImg] = await Promise.all([crest(g.homeLogo, g.home), crest(g.awayLogo, g.away)])
  const dim = (side) => (g.scoringSide && g.scoringSide !== side ? 0.45 : 1)
  const isBarcaName = (n) => /barcelona|barça/i.test(String(n || ''))
  const team = (img, name, side) => { const c = createCanvas(360, 420); const ctx = ctx2d(c)
    const big = sp && isBarcaName(name)
    ctx.globalAlpha = dim(side); ed.crestAt(ctx, img, 180, 140, big ? 300 : size); ctx.globalAlpha = 1
    labelText(ctx, fitLine(ctx, name, 330, 'Cairo', 22, 14).toUpperCase(), 180, size + 70, { size: 20, align: 'center', color: dim(side) < 1 ? ed.E.MUTED : ed.E.NAVY }); return c }
  const home = team(hImg, g.home, 'home'), away = team(aImg, g.away, 'away')
  // score 500×200 → rests at (290, 805)
  const score = createCanvas(500, 200); { const ctx = ctx2d(score)
    ed.digits(ctx, g.homeScore ?? 0, 155, 150, 150, g.scoringSide === 'home' ? ed.E.GRANA : ed.E.NAVY); ed.digits(ctx, g.awayScore ?? 0, 345, 150, 150, g.scoringSide === 'away' ? ed.E.GRANA : ed.E.NAVY)
    ctx.fillStyle = ed.navy(0.25); ctx.fillRect(249, 30, 2, 130) }
  // scorer pill (+ assist line) 1000×200 → rests at (40, 1290)
  const label = `${g.scorer || 'Goal'}${g.ownGoal ? ' (OG)' : ''}${g.penalty ? ' (pen)' : ''}`
  const scorer = createCanvas(1000, 200); { const ctx = ctx2d(scorer)
    ctx.textAlign = 'center'; ctx.font = 'bold 48px Cairo'
    const pw = Math.min(980, Math.max(420, ctx.measureText(label).width + 120))
    roundedPath(ctx, 500 - pw / 2, 0, pw, 110, 55); ctx.fillStyle = sp ? ed.E.GOLD : ed.E.NAVY; ctx.fill()
    ctx.fillStyle = sp ? ed.E.NAVY : ed.E.CREAM; ctx.fillText(wrapLines(ctx, label, pw - 80, 1)[0], 500, 72)
    if (g.assist) labelText(ctx, g.assistLabel === '' ? g.assist : `${g.assistLabel || 'Assist'} · ${g.assist}`, 500, 168, { size: 22, align: 'center', color: ed.E.MUTED }) }
  // minute 400×90 → rests at (340, 1450)
  const minute = createCanvas(400, 90); { const ctx = ctx2d(minute); ed.digits(ctx, g.minute ? `${g.minute}` : '', 200, 70, 60, ed.E.GRANA) }
  return {
    bg: png(bg), flash: png(flash), goal: png(goal), home: png(home), away: png(away), score: png(score), scorer: png(scorer), minute: png(minute),
    rest: { goal: [40, 370], home: [60, 770], away: [660, 770], score: [290, 805], scorer: [40, 1290], minute: [340, 1450] },
  }
}

export async function drawGoalSlide(g) {
  const L = await drawGoalLayers(g)
  const c = createCanvas(1080, 1920); const ctx = ctx2d(c)
  ctx.drawImage(await loadImage(L.bg), 0, 0)
  for (const k of ['goal', 'home', 'away', 'score', 'scorer', 'minute']) ctx.drawImage(await loadImage(L[k]), L.rest[k][0], L.rest[k][1])
  return c
}
