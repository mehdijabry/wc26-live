import fs from 'node:fs'
import { createCanvas, loadImage, registerFont } from '/Users/Mehdi/Desktop/wc2026-hub/studio/node_modules/canvas/index.js'
const d = await import('/Users/Mehdi/Desktop/wc2026-hub/studio/draw.js')
const K = '/private/tmp/claude-501/-Users-Mehdi-Desktop-site-dev/2aec4bb9-b6c7-40c0-96a1-999b2a085370/scratchpad/kash'
const CUT = '/Users/Mehdi/Desktop/wc2026-hub/assets/barca/players-cutouts'
d.setTheme('barca'); d.registerBrandFonts()
for (const [f, fam, w] of [['Playfair900', 'Playfair', '900'], ['Bodoni900', 'Bodoni', '900'], ['Abril', 'Abril', 'normal'], ['Amiri700', 'Amiri', 'bold'], ['Aref700', 'Aref', 'bold'], ['Cairo900', 'Cairo', '900'], ['Cairo700', 'Cairo', 'bold']]) registerFont(`${K}/fonts/${f}.ttf`, { family: fam, weight: w })
const AR_FONT = process.argv[2] || 'Aref'
const W = 1080, H = 1350
const NAVY = '#111C4F', GRANA = '#B1113F', BLUE = '#2B4BC9', CREAM = '#F4EFE6', LINE = '#D3CCBF', GOLD = '#E8C25A', AQUA = '#A6DCEA'
const S = JSON.parse(fs.readFileSync(`${K}/summary.json`, 'utf8'))
const teams = Object.fromEntries(S.boxscore.teams.map((t) => [t.team.abbreviation, t.team]))
const logo = async (u) => await d.loadImg(u)
const IMG = { lev: await logo(teams.LEV.logo), fcb: await logo(teams.BAR.logo), liga: await logo('https://a.espncdn.com/i/leaguelogos/soccer/500/15.png'), stadium: await loadImage(`${K}/montjuic2.jpg`), yamal: await loadImage(`${CUT}/yamal.png`) }
const HEADS = JSON.parse(fs.readFileSync(`${CUT}/heads-auto.json`, 'utf8'))

// ---------- helpers ----------
const noise = (() => { const c = createCanvas(256, 256), x = c.getContext('2d'), id = x.createImageData(256, 256); let s = 7; for (let i = 0; i < id.data.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const v = 200 + ((s >>> 16) & 55); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255 } x.putImageData(id, 0, 0); return c })()
function poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath() }
/** soft ink wash: polygon filled with a directional gradient + grain, drawn thrice with jitter for a brushed edge */
function wash(ctx, pts, color, a, grad = [[0, 0], [1, 1]]) {
  for (const [dx, dy, k] of [[0, 0, 1], [14, -8, 0.45], [-10, 12, 0.35]]) {
    ctx.save(); poly(ctx, pts.map(([x, y]) => [x + dx, y + dy])); ctx.clip()
    const [x0, y0] = pts[0], [x1, y1] = pts[2]
    const g = ctx.createLinearGradient(x0 + (x1 - x0) * grad[0][0], y0 + (y1 - y0) * grad[0][1], x0 + (x1 - x0) * grad[1][0], y0 + (y1 - y0) * grad[1][1])
    g.addColorStop(0, color + Math.round(a * k * 255).toString(16).padStart(2, '0')); g.addColorStop(1, color + '00')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.5; ctx.fillStyle = ctx.createPattern(noise, 'repeat'); ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }
}
function backdrop(ctx, { stripe = false } = {}) {
  ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, H)
  const v = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H * 0.45, W); v.addColorStop(0, 'rgba(255,255,255,0.35)'); v.addColorStop(1, 'rgba(210,200,185,0.25)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
  wash(ctx, [[-150, -60], [430, -60], [120, 760], [-260, 760]], BLUE, 0.30, [[0, 0], [0.9, 0.9]])
  wash(ctx, [[W - 380, -60], [W + 200, -60], [W + 200, 560], [W - 40, 560]], GRANA, 0.22, [[1, 0], [0.1, 1]])
  wash(ctx, [[-80, H * 0.62], [260, H * 0.55], [80, H + 40], [-200, H + 40]], BLUE, 0.16, [[0, 0], [1, 1]])
  if (stripe) { wash(ctx, [[W * 0.60, -80], [W * 0.82, -80], [W * 0.16, H + 80], [W * -0.06, H + 80]], GRANA, 0.78, [[0.5, 0], [0.5, 1]]) }
}
function stadium(ctx, img, { top, dark, light, alpha = 1, fadeTo = 0.55 }) {
  const h = H - top, t = createCanvas(W, h), tc = t.getContext('2d')
  const sc = Math.max(W / img.width, h / img.height), iw = img.width * sc, ih = img.height * sc
  tc.drawImage(img, (W - iw) / 2, h - ih, iw, ih)
  const id = tc.getImageData(0, 0, W, h), p = id.data, D = hex(dark), L = hex(light)
  for (let i = 0; i < p.length; i += 4) { const l = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) / 255; const q = Math.pow(l, 1.1); p[i] = D[0] + (L[0] - D[0]) * q; p[i + 1] = D[1] + (L[1] - D[1]) * q; p[i + 2] = D[2] + (L[2] - D[2]) * q }
  tc.putImageData(id, 0, 0)
  tc.globalCompositeOperation = 'destination-in'; const g = tc.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(fadeTo, 'rgba(0,0,0,1)'); tc.fillStyle = g; tc.fillRect(0, 0, W, h)
  ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(t, 0, top); ctx.restore()
}
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
function spaced(ctx, text, x, y, { size = 20, family = 'Cairo', weight = 'bold', color = NAVY, tracking = 0.3, align = 'left', fills } = {}) {
  ctx.font = `${weight} ${size}px ${family}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  const chars = [...text], widths = chars.map((c) => ctx.measureText(c).width), track = size * tracking
  const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  chars.forEach((c, i) => { ctx.fillStyle = (fills && fills[i]) || color; ctx.fillText(c, cx, y); cx += widths[i] + track })
  return total
}
function bar(ctx, x, y, w = 60, h = 5) { ctx.fillStyle = BLUE; ctx.fillRect(x, y, w * 0.6, h); ctx.fillStyle = GRANA; ctx.fillRect(x + w * 0.6, y, w * 0.4, h) }
function stack(ctx, lines, x, y, { size = 16, gap = 26, align = 'left', color = NAVY } = {}) { lines.forEach((l, i) => spaced(ctx, l, x, y + i * gap, { size, align, color })); bar(ctx, align === 'right' ? x - 60 : x, y + lines.length * gap - 6) }
function vtext(ctx, text, x, y, { size = 15, dir = -1, color = NAVY } = {}) { ctx.save(); ctx.translate(x, y); ctx.rotate(dir * Math.PI / 2); spaced(ctx, text, 0, 0, { size, align: 'center', color, tracking: 0.42 }); ctx.restore(); ctx.save(); ctx.translate(x, y + (dir < 0 ? 40 : -40)); bar(ctx, -3, dir < 0 ? 0 : -60, 5, 60); ctx.restore() }
function titleAr(ctx, l1, l2, x, y, size = 150, { align = 'center', lat } = {}) {
  ctx.textAlign = align; ctx.font = `bold ${size}px ${AR_FONT}`; ctx.fillStyle = NAVY; ctx.fillText(l1, x, y)
  const w = ctx.measureText(l2).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0); g.addColorStop(0, GRANA); g.addColorStop(0.5, BLUE); g.addColorStop(1, GRANA)
  ctx.fillStyle = g; ctx.fillText(l2, x, y + size * 0.95)
  if (lat) spaced(ctx, lat, align === 'center' ? x : align === 'right' ? x : x0, y + size * 1.22, { size: 20, align, tracking: 0.5 })
}
function jersey(ctx, x, y, s, { kind = 'home', number = '', name = '' }) {
  const u = s / 100; ctx.save(); ctx.translate(x - s / 2, y)
  const path = () => { ctx.beginPath(); ctx.moveTo(30 * u, 8 * u); ctx.lineTo(42 * u, 2 * u); ctx.quadraticCurveTo(50 * u, 14 * u, 58 * u, 2 * u); ctx.lineTo(70 * u, 8 * u); ctx.lineTo(96 * u, 22 * u); ctx.lineTo(86 * u, 46 * u); ctx.lineTo(73 * u, 40 * u); ctx.lineTo(74 * u, 100 * u); ctx.lineTo(26 * u, 100 * u); ctx.lineTo(27 * u, 40 * u); ctx.lineTo(14 * u, 46 * u); ctx.lineTo(4 * u, 22 * u); ctx.closePath() }
  ctx.shadowColor = 'rgba(17,28,79,0.25)'; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 6 * u
  path(); ctx.fillStyle = kind === 'gk' ? '#2E8B57' : kind === 'away' ? AQUA : BLUE; ctx.fill(); ctx.shadowColor = 'transparent'
  ctx.save(); path(); ctx.clip()
  if (kind === 'home') { ctx.fillStyle = GRANA; for (const sx of [12, 34, 56, 78]) ctx.fillRect(sx * u, 0, 11 * u, 100 * u) }
  if (kind === 'away') { ctx.fillStyle = 'rgba(17,28,79,0.9)'; ctx.fillRect(0, 0, 100 * u, 6 * u); ctx.fillRect(0, 38 * u, 100 * u, 0) }
  ctx.fillStyle = 'rgba(17,28,79,0.85)'; ctx.fillRect(4 * u, 18 * u, 12 * u, 9 * u); ctx.fillRect(84 * u, 18 * u, 12 * u, 9 * u) // cuffs
  ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(74 * u, 0, 30 * u, 100 * u) // shade
  ctx.restore()
  ctx.strokeStyle = 'rgba(17,28,79,0.35)'; ctx.lineWidth = 1.5 * u; path(); ctx.stroke()
  ctx.fillStyle = kind === 'home' ? GOLD : kind === 'gk' ? '#FFFFFF' : NAVY; ctx.font = `900 ${40 * u}px Cairo`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  if (kind === 'home') { ctx.strokeStyle = NAVY; ctx.lineWidth = 4 * u; ctx.strokeText(String(number), 50 * u, 60 * u) }
  ctx.fillText(String(number), 50 * u, 60 * u); ctx.textBaseline = 'alphabetic'
  ctx.restore()
  if (name) spaced(ctx, name.toUpperCase(), x, y + s + 34, { size: 22, align: 'center', tracking: 0.12 })
}
function pitch(ctx, x0, y0, w, h, { topW = 0.9 } = {}) {
  const X = (u, y) => { const t = (y - y0) / h; const cw = w * (topW + (1 - topW) * t); return x0 + w / 2 + (u - 0.5) * cw }
  ctx.save(); ctx.strokeStyle = LINE; ctx.lineWidth = 3; ctx.lineJoin = 'round'
  const box = (u0, u1, ya, yb) => { ctx.beginPath(); ctx.moveTo(X(u0, ya), ya); ctx.lineTo(X(u0, yb), yb); ctx.lineTo(X(u1, yb), yb); ctx.lineTo(X(u1, ya), ya); ctx.closePath(); ctx.stroke() }
  box(0, 1, y0, y0 + h)
  ctx.beginPath(); ctx.moveTo(X(0, y0 + h / 2), y0 + h / 2); ctx.lineTo(X(1, y0 + h / 2), y0 + h / 2); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(X(0.5, y0 + h / 2), y0 + h / 2, w * 0.13, h * 0.09, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(X(0.5, y0 + h / 2), y0 + h / 2, 4, 0, Math.PI * 2); ctx.fillStyle = LINE; ctx.fill()
  const pd = h * 0.165, gd = h * 0.06
  ctx.beginPath(); ctx.moveTo(X(0.21, y0), y0); ctx.lineTo(X(0.21, y0 + pd), y0 + pd); ctx.lineTo(X(0.79, y0 + pd), y0 + pd); ctx.lineTo(X(0.79, y0), y0); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(X(0.36, y0), y0); ctx.lineTo(X(0.36, y0 + gd), y0 + gd); ctx.lineTo(X(0.64, y0 + gd), y0 + gd); ctx.lineTo(X(0.64, y0), y0); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(X(0.5, y0 + pd), y0 + pd, w * 0.11, h * 0.07, 0, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke()
  const yb = y0 + h
  ctx.beginPath(); ctx.moveTo(X(0.21, yb), yb); ctx.lineTo(X(0.21, yb - pd), yb - pd); ctx.lineTo(X(0.79, yb - pd), yb - pd); ctx.lineTo(X(0.79, yb), yb); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(X(0.36, yb), yb); ctx.lineTo(X(0.36, yb - gd), yb - gd); ctx.lineTo(X(0.64, yb - gd), yb - gd); ctx.lineTo(X(0.64, yb), yb); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(X(0.5, yb - pd), yb - pd, w * 0.11, h * 0.07, 0, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke()
  ctx.restore(); return X
}
function grain(ctx, k = 0.28) { const id = ctx.getImageData(0, 0, W, H), p = id.data; let s = 11; for (let i = 0; i < p.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const nz = (((s >>> 16) & 31) - 16) * k; p[i] += nz; p[i + 1] += nz; p[i + 2] += nz } ctx.putImageData(id, 0, 0) }
function pageMark(ctx, x, y) { d.paintLogo(ctx, x - 72, y, 72); ctx.fillStyle = NAVY; ctx.font = '22px Anton'; ctx.textAlign = 'right'; ctx.fillText('PRESSING 90’', x, y + 100) }
function crest(ctx, img, x, y, s) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6; const r = Math.min(s / img.width, s / img.height); ctx.drawImage(img, x - img.width * r / 2, y - img.height * r / 2, img.width * r, img.height * r); ctx.restore() }

// ---------- lineup ----------
function lineupRows(roster, formation) {
  const st = roster.filter((p) => p.starter), gk = st.find((p) => p.position?.abbreviation === 'G')
  const depth = (p) => { const ab = (p.position?.abbreviation || '').toUpperCase(); if (ab === 'G') return 0; if (/B|CD|^D/.test(ab)) return 1; if (/DM/.test(ab)) return 2; if (/^CM/.test(ab) || ab === 'M') return 3; if (/^[LR]M/.test(ab)) return 3.5; if (/AM/.test(ab)) return 4; if (/^[LR][WF]/.test(ab)) return 5; return 6 }
  const side = (p) => { const ab = (p.position?.abbreviation || '').toUpperCase(); return /^L/.test(ab) ? -2 : /-L/.test(ab) ? -1 : /^R/.test(ab) ? 2 : /-R/.test(ab) ? 1 : 0 }
  const out = st.filter((p) => p !== gk).sort((a, b) => depth(a) - depth(b) || a.formationPlace - b.formationPlace)
  const rows = [[gk]]; let i = 0
  for (const n of formation.split('-').map(Number)) { const row = out.slice(i, i + n); i += n; row.sort((a, b) => side(a) - side(b) || depth(a) - depth(b) || a.formationPlace - b.formationPlace); rows.push(row) }
  return rows
}
const surname = (p) => { const n = (p.athlete.shortName || p.athlete.displayName); return n.includes('. ') ? n.split('. ').slice(1).join(' ') : n }
async function lineup(file, { predicted = true }) {
  const c = createCanvas(W, H), ctx = c.getContext('2d'); ctx.quality = 'best'
  backdrop(ctx); stadium(ctx, IMG.stadium, { top: H - 420, dark: '#8A8FA6', light: '#F4EFE6', alpha: 0.75, fadeTo: 0.6 })
  stack(ctx, ['BARÇA', 'FIRST'], 48, 62, { size: 15 })
  stack(ctx, ['LEVANTE', 'v BARÇA'], 48, 208, { size: 20, gap: 28 })
  spaced(ctx, 'ESTADI CIUTAT DE VALÈNCIA', 48, 284, { size: 13, tracking: 0.42 }); spaced(ctx, '13 SEPTEMBER 2026', 48, 308, { size: 13, tracking: 0.42 })
  pageMark(ctx, W - 48, 44)
  ctx.textAlign = 'right'; ctx.fillStyle = NAVY; ctx.font = 'bold 30px Tajawal'; ctx.fillText('الجولة 5 · الليغا', W - 48, 240); spaced(ctx, 'MATCHDAY 5', W - 48, 268, { size: 14, align: 'right', tracking: 0.42 }); bar(ctx, W - 108, 280)
  crest(ctx, IMG.liga, W / 2, 70, 74); crest(ctx, IMG.lev, W / 2 - 100, 190, 110); crest(ctx, IMG.fcb, W / 2 + 100, 190, 104); spaced(ctx, 'v', W / 2, 200, { size: 26, align: 'center' })
  titleAr(ctx, 'التشكيلة', predicted ? 'المتوقعة' : 'الرسمية', W / 2, 425, 148, { lat: predicted ? 'PREDICTED LINEUP' : 'CONFIRMED LINEUP' })
  vtext(ctx, 'FC BARCELONA', 46, 760); vtext(ctx, '2026 / 27', W - 46, 760, { dir: 1 })
  const X = pitch(ctx, 120, 665, 840, 585, { topW: 0.88 })
  const r = S.rosters.find((t) => t.team.abbreviation === 'BAR'); const rows = lineupRows(r.roster, r.formation)
  const ys = [1165, 1015, 868, 722].slice(0, rows.length)
  rows.forEach((row, ri) => { const n = row.length, sp = n === 1 ? 0 : Math.min(230, 700 / (n - 1)); row.forEach((p, i) => { const u = 0.5 + ((i - (n - 1) / 2) * sp) / 840; jersey(ctx, X(u, ys[ri]), ys[ri] - 90, 128, { kind: ri === 0 ? 'gk' : 'away', number: p.jersey, name: surname(p) }) }) })
  stack(ctx, ['VISCA', 'BARÇA'], 48, 1270, { size: 15 }); ctx.textAlign = 'right'; ctx.fillStyle = NAVY; ctx.font = 'bold 26px Tajawal'; ctx.fillText('برشلونة أولاً · pressing90.live', W - 48, 1300)
  grain(ctx); fs.writeFileSync(file, c.toBuffer('image/png'))
}
// ---------- full time ----------
async function fulltime(file) {
  const c = createCanvas(W, H), ctx = c.getContext('2d'); ctx.quality = 'best'
  backdrop(ctx, { stripe: true }); stadium(ctx, IMG.stadium, { top: H - 330, dark: '#0B1543', light: '#8FA5E8', alpha: 0.95, fadeTo: 0.55 })
  crest(ctx, IMG.liga, 96, 70, 74); stack(ctx, ['BARÇA', 'FIRST'], 48, 150, { size: 15 })
  spaced(ctx, 'LEVANTE V BARÇA', 48, 290, { size: 22, tracking: 0.42 })
  titleAr(ctx, 'نهاية', 'المباراة', 48, 440, 150, { align: 'left', lat: 'FULL TIME' })
  const cx1 = 135, cx2 = 355, cy = 690
  crest(ctx, IMG.lev, cx1, cy, 130); crest(ctx, IMG.fcb, cx2, cy, 124); ctx.fillStyle = 'rgba(17,28,79,0.25)'; ctx.fillRect(245, cy - 60, 2, 120)
  spaced(ctx, 'LEVANTE', cx1, cy + 118, { size: 20, align: 'center', tracking: 0.42 }); spaced(ctx, 'BARÇA', cx2, cy + 118, { size: 20, align: 'center', tracking: 0.42 })
  const home = S.header.competitions[0].competitors.find((t) => t.homeAway === 'home'), away = S.header.competitions[0].competitors.find((t) => t.homeAway === 'away')
  ctx.font = '900 190px Playfair'; ctx.textAlign = 'center'; ctx.fillStyle = NAVY; ctx.fillText(home.score, cx1, 985); ctx.fillStyle = GRANA; ctx.fillText(away.score, cx2, 985); ctx.fillStyle = 'rgba(17,28,79,0.25)'; ctx.fillRect(245, 840, 2, 150)
  const goals = S.keyEvents.filter((k) => k.scoringPlay).map((k) => ({ team: k.team.id, who: (k.participants?.[0]?.athlete?.displayName || '').split(' ').slice(-1)[0], min: k.clock.displayValue.replace(/'/g, ''), pen: /Penalty/.test(k.type?.text || '') }))
  const list = (tid, x, y) => goals.filter((g) => g.team === tid).forEach((g, i) => { const label = `${g.who.toUpperCase()}  ${g.min}'${g.pen ? ' (P)' : ''}`; const n = g.who.length; spaced(ctx, label, x, y + i * 34, { size: 19, align: 'center', tracking: 0.28, fills: [...label].map((_, j) => (j > n ? GRANA : NAVY)) }) })
  list(home.id, cx1, 1040); list(away.id, cx2, 1040)
  // player: crown-aligned bust from the cutout
  const hm = HEADS.yamal, img = IMG.yamal, sc = 270 / hm.size, sw = Math.min(img.width, hm.size * 3.4), sx = Math.max(0, Math.min(img.width - sw, hm.cx - sw / 2)), sy = Math.max(0, hm.crown - hm.size * 0.12), sh = Math.min(img.height - sy, (H - 110) / sc + (hm.crown - sy))
  ctx.save(); ctx.shadowColor = 'rgba(17,28,79,0.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetX = -12; ctx.drawImage(img, sx, sy, sw, sh, 800 - sw * sc / 2, 110 - (hm.crown - sy) * sc, sw * sc, sh * sc); ctx.restore()
  pageMark(ctx, W - 48, 44)
  ctx.save(); ctx.translate(70, 1300); ctx.rotate(-0.16); spaced(ctx, 'ESTADI CIUTAT DE VALÈNCIA', 0, 0, { size: 22, color: 'rgba(244,239,230,0.9)', tracking: 0.42 }); ctx.restore()
  grain(ctx); fs.writeFileSync(file, c.toBuffer('image/png'))
}
await lineup(`${K}/lineup-${AR_FONT}.png`, { predicted: true })
await fulltime(`${K}/fulltime-${AR_FONT}.png`)
console.log('done', AR_FONT)
