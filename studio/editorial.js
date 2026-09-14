// Pressing 90' studio — the « editorial » design kit (Mehdi, 2026-09-14:
// « inspire-toi très fortement de ce design … fais-en la base des designs de
// tous les posts »). Cream paper, blue / garnet ink washes, a stadium in
// duotone at the foot of the page, Arabic display titles in Aref Ruqaa with a
// garnet→blue gradient, Playfair Display for Latin display and digits, spaced
// small caps in Cairo for labels, two-tone (blue + garnet) underline bars,
// vector jerseys on a light pitch for lineups, crown-aligned player busts.
// Every renderer in draw.js is built on these helpers.
import { createCanvas, loadImage, registerFont } from 'canvas'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const E = {
  NAVY: '#111C4F', GRANA: '#B1113F', BLUE: '#2B4BC9', CREAM: '#F4EFE6', LINE: '#D3CCBF', GOLD: '#E8C25A', AQUA: '#A6DCEA',
  INK: '#2A2F45', MUTED: 'rgba(17,28,79,0.55)', PAPER_DARK: '#E9E2D5', GREEN: '#2E8B57',
}
const navy = (a) => `rgba(17,28,79,${a})`
export { navy }

let ready = false
export function registerEditorialFonts() {
  if (ready) return
  const f = (file, opts) => { try { registerFont(path.join(__dirname, 'fonts', file), opts) } catch (e) { console.warn('font', file, e.message) } }
  f('ArefRuqaa-Bold.ttf', { family: 'Aref', weight: 'bold' })
  f('PlayfairDisplay-Black.ttf', { family: 'Playfair', weight: '900' })
  f('Cairo-Bold.ttf', { family: 'Cairo', weight: 'bold' })
  f('Cairo-Black.ttf', { family: 'Cairo', weight: '900' })
  ready = true
}

// ─── paper ──────────────────────────────────────────────────────────────────
const noise = (() => {
  const c = createCanvas(256, 256), x = c.getContext('2d'), id = x.createImageData(256, 256)
  let s = 7
  for (let i = 0; i < id.data.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const v = 200 + ((s >>> 16) & 55); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255 }
  x.putImageData(id, 0, 0); return c
})()
function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath() }
const hex8 = (c, a) => c + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')
/** Soft ink wash: a polygon with a directional gradient + grain, drawn three times with a jitter for a brushed edge. */
export function wash(ctx, W, H, pts, color, a, grad = [[0, 0], [1, 1]]) {
  for (const [dx, dy, k] of [[0, 0, 1], [14, -8, 0.45], [-10, 12, 0.35]]) {
    ctx.save(); poly(ctx, pts.map(([x, y]) => [x + dx, y + dy])); ctx.clip()
    const [x0, y0] = pts[0], [x1, y1] = pts[2]
    const g = ctx.createLinearGradient(x0 + (x1 - x0) * grad[0][0], y0 + (y1 - y0) * grad[0][1], x0 + (x1 - x0) * grad[1][0], y0 + (y1 - y0) * grad[1][1])
    g.addColorStop(0, hex8(color, a * k)); g.addColorStop(1, hex8(color, 0))
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.5; ctx.fillStyle = ctx.createPattern(noise, 'repeat'); ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }
}
/** Cream paper with the blue (top-left) and garnet (top-right) washes; `stripe` adds the long garnet ribbon (full-time, goal). */
export function backdrop(ctx, W, H, { stripe = false, tone = 'paper' } = {}) {
  ctx.fillStyle = E.CREAM; ctx.fillRect(0, 0, W, H)
  const v = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H * 0.45, Math.max(W, H)); v.addColorStop(0, 'rgba(255,255,255,0.35)'); v.addColorStop(1, 'rgba(210,200,185,0.25)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
  const k = W / 1080
  wash(ctx, W, H, [[-150 * k, -60], [430 * k, -60], [120 * k, H * 0.56], [-260 * k, H * 0.56]], E.BLUE, tone === 'blue' ? 0.4 : 0.30, [[0, 0], [0.9, 0.9]])
  wash(ctx, W, H, [[W - 380 * k, -60], [W + 200, -60], [W + 200, H * 0.42], [W - 40 * k, H * 0.42]], E.GRANA, tone === 'grana' ? 0.34 : 0.22, [[1, 0], [0.1, 1]])
  wash(ctx, W, H, [[-80, H * 0.62], [260 * k, H * 0.55], [80 * k, H + 40], [-200, H + 40]], E.BLUE, 0.16, [[0, 0], [1, 1]])
  if (stripe) wash(ctx, W, H, [[W * 0.60, -80], [W * 0.82, -80], [W * 0.16, H + 80], [W * -0.06, H + 80]], E.GRANA, 0.78, [[0.5, 0], [0.5, 1]])
}
let stadiumImg = null
async function stadiumImage() {
  if (stadiumImg) return stadiumImg
  stadiumImg = await loadImage(path.join(__dirname, 'assets', 'stadium-montjuic.jpg'))
  return stadiumImg
}
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
/** Duotone stadium (Estadi Olímpic, Wikimedia Commons CC BY 3.0 — Elemaki) fading in from `top` to the bottom edge. */
export async function stadium(ctx, W, H, { top, dark = '#0B1543', light = '#8FA5E8', alpha = 0.95, fadeTo = 0.55 } = {}) {
  const img = await stadiumImage()
  const h = H - top, t = createCanvas(W, h), tc = t.getContext('2d')
  const sc = Math.max(W / img.width, h / img.height), iw = img.width * sc, ih = img.height * sc
  tc.drawImage(img, (W - iw) / 2, h - ih, iw, ih)
  const id = tc.getImageData(0, 0, W, h), p = id.data, D = hex(dark), L = hex(light)
  for (let i = 0; i < p.length; i += 4) { const l = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) / 255; const q = Math.pow(l, 1.1); p[i] = D[0] + (L[0] - D[0]) * q; p[i + 1] = D[1] + (L[1] - D[1]) * q; p[i + 2] = D[2] + (L[2] - D[2]) * q }
  tc.putImageData(id, 0, 0)
  tc.globalCompositeOperation = 'destination-in'; const g = tc.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(fadeTo, 'rgba(0,0,0,1)'); tc.fillStyle = g; tc.fillRect(0, 0, W, h)
  ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(t, 0, top); ctx.restore()
}
/** Film grain — call last. */
export function grain(ctx, W, H, k = 0.28) {
  const id = ctx.getImageData(0, 0, W, H), p = id.data; let s = 11
  for (let i = 0; i < p.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const nz = (((s >>> 16) & 31) - 16) * k; p[i] += nz; p[i + 1] += nz; p[i + 2] += nz }
  ctx.putImageData(id, 0, 0)
}

// ─── type ───────────────────────────────────────────────────────────────────
/** Spaced small caps (node-canvas has no letterSpacing). `fills` = per-character colours. Returns the drawn width. */
export function spaced(ctx, text, x, y, { size = 20, family = 'Cairo', weight = 'bold', color = E.NAVY, tracking = 0.3, align = 'left', fills } = {}) {
  ctx.font = `${weight} ${size}px ${family}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  const chars = [...String(text)], widths = chars.map((c) => ctx.measureText(c).width), track = size * tracking
  const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  chars.forEach((c, i) => { ctx.fillStyle = (fills && fills[i]) || color; ctx.fillText(c, cx, y); cx += widths[i] + track })
  return total
}
/** Two-tone underline bar (blue 60 % + garnet 40 %). */
export function bar(ctx, x, y, w = 60, h = 5) { ctx.fillStyle = E.BLUE; ctx.fillRect(x, y, w * 0.6, h); ctx.fillStyle = E.GRANA; ctx.fillRect(x + w * 0.6, y, w * 0.4, h) }
/** Small stacked label ("BARÇA / FIRST") with its bar. */
export function stack(ctx, lines, x, y, { size = 16, gap = 26, align = 'left', color = E.NAVY } = {}) {
  lines.forEach((l, i) => spaced(ctx, l, x, y + i * gap, { size, align, color }))
  bar(ctx, align === 'right' ? x - 60 : x, y + lines.length * gap - 6)
}
/** Vertical spaced label on a page edge (dir -1 reads bottom→top). */
export function vtext(ctx, text, x, y, { size = 15, dir = -1, color = E.NAVY } = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(dir * Math.PI / 2); spaced(ctx, text, 0, 0, { size, align: 'center', color, tracking: 0.42 }); ctx.restore()
  ctx.save(); ctx.translate(x, y + (dir < 0 ? 40 : -40)); bar(ctx, -3, dir < 0 ? 0 : -60, 5, 60); ctx.restore()
}
/** Garnet → blue → garnet text gradient across [x0, x0+w]. */
export function inkGradient(ctx, x0, w) { const g = ctx.createLinearGradient(x0, 0, x0 + w, 0); g.addColorStop(0, E.GRANA); g.addColorStop(0.5, E.BLUE); g.addColorStop(1, E.GRANA); return g }
/** Arabic display title: line 1 navy, line 2 in the ink gradient, optional spaced Latin sub-label. */
export function titleAr(ctx, l1, l2, x, y, size = 150, { align = 'center', lat, latSize = 20 } = {}) {
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.font = `bold ${size}px Aref`; ctx.fillStyle = E.NAVY
  if (l1) ctx.fillText(l1, x, y)
  const y2 = l1 ? y + size * 0.95 : y
  if (l2) {
    const w = ctx.measureText(l2).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
    ctx.fillStyle = inkGradient(ctx, x0, w); ctx.fillText(l2, x, y2)
  }
  if (lat) { const w = ctx.measureText(l2 || l1).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x; spaced(ctx, lat, align === 'center' ? x : align === 'right' ? x : x0, y2 + size * 0.27, { size: latSize, align, tracking: 0.5 }) }
  return y2
}
/** Latin display title (Playfair): line 1 navy, line 2 gradient. */
export function titleLat(ctx, l1, l2, x, y, size = 150, { align = 'center' } = {}) {
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.font = `900 ${size}px Playfair`; ctx.fillStyle = E.NAVY
  if (l1) ctx.fillText(l1, x, y)
  const y2 = l1 ? y + size * 0.92 : y
  if (l2) { const w = ctx.measureText(l2).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x; ctx.fillStyle = inkGradient(ctx, x0, w); ctx.fillText(l2, x, y2) }
  return y2
}
/** Big Playfair digits (scores). */
export function digits(ctx, text, x, y, size, color = E.NAVY, align = 'center') { ctx.font = `900 ${size}px Playfair`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color; ctx.fillText(String(text), x, y) }

// ─── furniture ──────────────────────────────────────────────────────────────
/** Crest with a soft drop shadow, centred on (x, y), fitted in s×s. */
export function crestAt(ctx, img, x, y, s) {
  if (!img) return
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6
  const r = Math.min(s / img.width, s / img.height); ctx.drawImage(img, x - img.width * r / 2, y - img.height * r / 2, img.width * r, img.height * r); ctx.restore()
}
/** Vector jersey: kind home (blaugrana stripes, gold number) | away (aqua, navy number) | gk (green). Top-centre at (x, y). */
export function jersey(ctx, x, y, s, { kind = 'home', number = '', name = '', nameSize = 22 } = {}) {
  const u = s / 100; ctx.save(); ctx.translate(x - s / 2, y)
  const p = () => { ctx.beginPath(); ctx.moveTo(30 * u, 8 * u); ctx.lineTo(42 * u, 2 * u); ctx.quadraticCurveTo(50 * u, 14 * u, 58 * u, 2 * u); ctx.lineTo(70 * u, 8 * u); ctx.lineTo(96 * u, 22 * u); ctx.lineTo(86 * u, 46 * u); ctx.lineTo(73 * u, 40 * u); ctx.lineTo(74 * u, 100 * u); ctx.lineTo(26 * u, 100 * u); ctx.lineTo(27 * u, 40 * u); ctx.lineTo(14 * u, 46 * u); ctx.lineTo(4 * u, 22 * u); ctx.closePath() }
  ctx.shadowColor = 'rgba(17,28,79,0.25)'; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 6 * u
  p(); ctx.fillStyle = kind === 'gk' ? E.GREEN : kind === 'away' ? E.AQUA : E.BLUE; ctx.fill(); ctx.shadowColor = 'transparent'
  ctx.save(); p(); ctx.clip()
  if (kind === 'home') { ctx.fillStyle = E.GRANA; for (const sx of [12, 34, 56, 78]) ctx.fillRect(sx * u, 0, 11 * u, 100 * u) }
  if (kind === 'away') { ctx.fillStyle = 'rgba(17,28,79,0.9)'; ctx.fillRect(0, 0, 100 * u, 6 * u) }
  ctx.fillStyle = 'rgba(17,28,79,0.85)'; ctx.fillRect(4 * u, 18 * u, 12 * u, 9 * u); ctx.fillRect(84 * u, 18 * u, 12 * u, 9 * u)
  ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(74 * u, 0, 30 * u, 100 * u)
  ctx.restore()
  ctx.strokeStyle = 'rgba(17,28,79,0.35)'; ctx.lineWidth = 1.5 * u; p(); ctx.stroke()
  ctx.fillStyle = kind === 'home' ? E.GOLD : kind === 'gk' ? '#FFFFFF' : E.NAVY; ctx.font = `900 ${40 * u}px Cairo`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  if (kind === 'home') { ctx.strokeStyle = E.NAVY; ctx.lineWidth = 4 * u; ctx.lineJoin = 'round'; ctx.strokeText(String(number), 50 * u, 60 * u) }
  ctx.fillText(String(number), 50 * u, 60 * u); ctx.textBaseline = 'alphabetic'
  ctx.restore()
  if (name) spaced(ctx, String(name).toUpperCase(), x, y + s + nameSize * 1.55, { size: nameSize, align: 'center', tracking: 0.12 })
}
/** Light pitch outline (slight perspective). Returns X(u, y): pitch-relative u ∈ [0,1] → canvas x at row y. */
export function pitch(ctx, x0, y0, w, h, { topW = 0.88, color = E.LINE } = {}) {
  const X = (u, y) => { const t = (y - y0) / h; const cw = w * (topW + (1 - topW) * t); return x0 + w / 2 + (u - 0.5) * cw }
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'
  const quad = (u0, u1, ya, yb) => { ctx.beginPath(); ctx.moveTo(X(u0, ya), ya); ctx.lineTo(X(u0, yb), yb); ctx.lineTo(X(u1, yb), yb); ctx.lineTo(X(u1, ya), ya); ctx.closePath(); ctx.stroke() }
  quad(0, 1, y0, y0 + h)
  ctx.beginPath(); ctx.moveTo(X(0, y0 + h / 2), y0 + h / 2); ctx.lineTo(X(1, y0 + h / 2), y0 + h / 2); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(X(0.5, y0 + h / 2), y0 + h / 2, w * 0.13, h * 0.09, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(X(0.5, y0 + h / 2), y0 + h / 2, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
  const pd = h * 0.165, gd = h * 0.06, yb = y0 + h
  const box = (ya, dir) => {
    ctx.beginPath(); ctx.moveTo(X(0.21, ya), ya); ctx.lineTo(X(0.21, ya + dir * pd), ya + dir * pd); ctx.lineTo(X(0.79, ya + dir * pd), ya + dir * pd); ctx.lineTo(X(0.79, ya), ya); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(X(0.36, ya), ya); ctx.lineTo(X(0.36, ya + dir * gd), ya + dir * gd); ctx.lineTo(X(0.64, ya + dir * gd), ya + dir * gd); ctx.lineTo(X(0.64, ya), ya); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(X(0.5, ya + dir * pd), ya + dir * pd, w * 0.11, h * 0.07, 0, dir > 0 ? 0.15 * Math.PI : 1.15 * Math.PI, dir > 0 ? 0.85 * Math.PI : 1.85 * Math.PI); ctx.stroke()
  }
  box(y0, 1); box(yb, -1)
  ctx.restore(); return X
}

// ─── players (AI-edited Wikimedia cutouts, credits on /credits) ─────────────
const CUT_DIR = path.join(__dirname, 'assets', 'cutouts')
let HEADS = null
export function cutoutKeys() { if (!HEADS) { try { HEADS = JSON.parse(fs.readFileSync(path.join(CUT_DIR, 'heads.json'), 'utf8')) } catch { HEADS = {} } } return Object.keys(HEADS) }
/** First cutout whose key appears in one of the names (surname match), e.g. ['Lamine Yamal'] → 'yamal'. */
export function pickCutout(names) {
  const keys = cutoutKeys()
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const n of names || []) { const k = keys.find((key) => norm(n).includes(key)); if (k) return k }
  return null
}
const cutCache = new Map()
async function cutoutImage(key) { if (!cutCache.has(key)) cutCache.set(key, await loadImage(path.join(CUT_DIR, `${key}.png`))); return cutCache.get(key) }
/** Crown-aligned bust of a cutout: head `headPx` tall with the crown on `crownY`, centred on `cx`,
 *  cut by a vertical fade between `fadeFrom` and `fadeTo` (canvas rows). Same recipe as the page cover. */
export async function bust(ctx, key, { cx, crownY, headPx = 270, cropW = 3.4, fadeFrom, fadeTo, shadow = true, W, H }) {
  cutoutKeys(); const hm = HEADS[key]; if (!hm) return false
  const img = await cutoutImage(key)
  const sc = headPx / hm.size, sw = Math.min(img.width, hm.size * cropW), sx = Math.max(0, Math.min(img.width - sw, hm.cx - sw / 2))
  const sy = Math.max(0, hm.crown - hm.size * 0.12), sh = Math.min(img.height - sy, ((fadeTo ?? H) - crownY) / sc + (hm.crown - sy))
  const t = createCanvas(W, H), tc = t.getContext('2d')
  tc.drawImage(img, sx, sy, sw, sh, cx - sw * sc / 2, crownY - (hm.crown - sy) * sc, sw * sc, sh * sc)
  if (fadeFrom != null && fadeTo != null) {
    const g = tc.createLinearGradient(0, fadeFrom, 0, fadeTo); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)')
    tc.globalCompositeOperation = 'destination-out'; tc.fillStyle = g; tc.fillRect(0, fadeFrom, W, fadeTo - fadeFrom); tc.fillStyle = '#000'; tc.fillRect(0, fadeTo, W, H - fadeTo)
  }
  ctx.save(); if (shadow) { ctx.shadowColor = 'rgba(17,28,79,0.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetX = -12 } ctx.drawImage(t, 0, 0); ctx.restore()
  return true
}

// ─── lineup helpers ─────────────────────────────────────────────────────────
const depth = (ab) => { ab = String(ab || '').toUpperCase(); if (ab === 'G' || ab === 'GK') return 0; if (/B|CD|^D/.test(ab)) return 1; if (/DM/.test(ab)) return 2; if (/^CM/.test(ab) || ab === 'M') return 3; if (/^[LR]M/.test(ab)) return 3.5; if (/AM/.test(ab)) return 4; if (/^[LR][WF]/.test(ab)) return 5; return 6 }
const side = (ab) => { ab = String(ab || '').toUpperCase(); return /^L/.test(ab) ? -2 : /-L/.test(ab) ? -1 : /^R/.test(ab) ? 2 : /-R/.test(ab) ? 1 : 0 }
/** Starters [{name, jersey, pos, place}] + formation "4-3-3" → rows from the keeper up: [[gk], [defence…], …]. */
export function lineupRows(players, formation) {
  const st = players.slice(), gk = st.find((p) => depth(p.pos) === 0) || st[0]
  const out = st.filter((p) => p !== gk).sort((a, b) => depth(a.pos) - depth(b.pos) || (a.place || 0) - (b.place || 0))
  const sizes = String(formation || '4-3-3').split('-').map(Number).filter((n) => n > 0)
  const rows = [[gk]]; let i = 0
  for (const n of sizes) { const row = out.slice(i, i + n); i += n; row.sort((a, b) => side(a.pos) - side(b.pos) || depth(a.pos) - depth(b.pos) || (a.place || 0) - (b.place || 0)); if (row.length) rows.push(row) }
  if (i < out.length) rows.push(out.slice(i))
  return rows
}
export const surname = (n) => { n = String(n || ''); return n.includes('. ') ? n.split('. ').slice(1).join(' ') : n }
