import fs from 'node:fs'
import { createCanvas, loadImage } from '/Users/Mehdi/Desktop/wc2026-hub/studio/node_modules/canvas/index.js'
const d = await import('/Users/Mehdi/Desktop/wc2026-hub/studio/draw.js')
d.setTheme('barca'); d.registerBrandFonts()
const W = '/private/tmp/claude-501/-Users-Mehdi-Desktop-site-dev/2aec4bb9-b6c7-40c0-96a1-999b2a085370/scratchpad/btid'
const P = { night: '#071033', royal: '#1F3BC0', grana: '#B1113F', gold: '#E8C25A', white: '#FFFFFF', red: '#C8102E' }
const FCB = await loadImage(Buffer.from(await (await fetch('https://a.espncdn.com/i/teamlogos/soccer/500/83.png')).arrayBuffer()))
const RMA = await loadImage(Buffer.from(await (await fetch('https://a.espncdn.com/i/teamlogos/soccer/500/86.png')).arrayBuffer()))
const order = [['kounde', 'KOUNDÉ', 23], ['cubarsi', 'CUBARSÍ', 5], ['pedri', 'PEDRI', 8], ['yamal', 'YAMAL', 10], ['raphinha', 'RAPHINHA', 11], ['olmo', 'OLMO', 20], ['gavi', 'GAVI', 6]]
const cut = {}; for (const [k] of order) cut[k] = await loadImage(`${W}/cut/${k}.png`)
const rr = (ctx, x, y, w, h, r) => d.roundedPath(ctx, x, y, w, h, r)
// draw a cutout scaled so its head sits at headY and its width fits maxW; fades out at the bottom
function placeCut(ctx, img, cx, topY, targetH, maxW, fadeFrom) {
  let s = targetH / img.height; if (img.width * s > maxW) s = maxW / img.width
  const w = img.width * s, h = img.height * s, x = cx - w / 2
  ctx.save(); ctx.drawImage(img, x, topY, w, h); ctx.restore()
  return { x, y: topY, w, h }
}
// ── COVER v5 1640×924: 8 columns = 7 unified busts + crest column ──
{ const CW = 1640, CH = 924; const c = createCanvas(CW, CH); const ctx = c.getContext('2d')
  ctx.fillStyle = P.night; ctx.fillRect(0, 0, CW, CH)
  const PH = 780, cols = [['cubarsi'], ['pedri'], ['yamal'], ['__crest'], ['raphinha'], ['olmo'], ['gavi']], n = cols.length, pw = CW / n
  const NUM = { kounde: 23, cubarsi: 5, pedri: 8, yamal: 10, raphinha: 11, olmo: 20, gavi: 6 }, NAME = { kounde: 'KOUNDÉ', cubarsi: 'CUBARSÍ', pedri: 'PEDRI', yamal: 'YAMAL', raphinha: 'RAPHINHA', olmo: 'OLMO', gavi: 'GAVI' }
  // bust crop = fraction of the cutout height kept from the top (full-body shots cut at the waist)
  cols.forEach(([k], i) => { const x = i * pw; const crestCol = k === '__crest'
    ctx.fillStyle = crestCol ? P.night : (i % 2 ? P.grana : P.royal); ctx.fillRect(x, 0, pw + 1, PH)
    const g = ctx.createLinearGradient(0, 0, 0, PH); g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(7,16,51,0.85)'); ctx.fillStyle = g; ctx.fillRect(x, 0, pw + 1, PH) })
  const dl = ctx.createLinearGradient(0, 0, CW, PH); dl.addColorStop(0, 'rgba(255,255,255,0.06)'); dl.addColorStop(0.5, 'rgba(255,255,255,0)'); dl.addColorStop(1, 'rgba(255,255,255,0.05)'); ctx.fillStyle = dl; ctx.fillRect(0, 0, CW, PH)
  // unified busts: every HEAD is the same size (120 px) on the same line; bodies are clipped by the bottom fade
  const HEADS = JSON.parse(fs.readFileSync(`${W}/heads-auto.json`, 'utf8'))
  const TOP = 100, HEAD_PX = 150, FADE0 = 440, FADE1 = 560
  cols.forEach(([k], i) => { if (k === '__crest') return
    const img = cut[k], hm = HEADS[k]
    // auto-measured head (crown row + head size): same head size, crown on the same line, same bust length, same bottom fade
    const sc = HEAD_PX / hm.size
    const sw = Math.min(img.width, hm.size * 3.2), sx = Math.max(0, Math.min(img.width - sw, hm.cx - sw / 2))
    const sy = Math.max(0, hm.crown - hm.size * 0.12), sh = Math.min(img.height - sy, (FADE1 - TOP) / sc + (hm.crown - sy))
    const w = sw * sc, h = sh * sc, cx = i * pw + pw / 2, y0 = TOP - (hm.crown - sy) * sc
    const t = createCanvas(CW, PH), tc = t.getContext('2d')
    tc.drawImage(img, sx, sy, sw, sh, cx - w / 2, y0, w, h)
    const fg = tc.createLinearGradient(0, FADE0, 0, FADE1); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,1)')
    tc.globalCompositeOperation = 'destination-out'; tc.fillStyle = fg; tc.fillRect(0, FADE0, CW, FADE1 - FADE0); tc.fillStyle = '#000'; tc.fillRect(0, FADE1, CW, PH - FADE1)
    ctx.save(); ctx.beginPath(); ctx.rect(i * pw - pw * 0.15, 0, pw * 1.3, PH); ctx.clip()
    ctx.shadowColor = 'rgba(232,194,90,0.45)'; ctx.shadowBlur = 28
    ctx.drawImage(t, 0, 0); ctx.restore() })
  // effects: flares, diagonal light, vignette, grain
  for (const [fx, fy, r, a] of [[160, 120, 520, 0.28], [CW - 200, 160, 560, 0.24], [CW / 2, PH, 700, 0.16]]) { const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, r); g.addColorStop(0, `rgba(47,107,255,${a})`); g.addColorStop(1, 'rgba(47,107,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, PH) }
  { const g = ctx.createLinearGradient(0, PH, CW * 0.7, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.48, 'rgba(255,255,255,0)'); g.addColorStop(0.52, 'rgba(255,255,255,0.10)'); g.addColorStop(0.56, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, PH) }
  { const v = ctx.createRadialGradient(CW / 2, PH / 2, PH * 0.45, CW / 2, PH / 2, CW * 0.72); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.38)'); ctx.fillStyle = v; ctx.fillRect(0, 0, CW, PH) }
  { const id = ctx.getImageData(0, 0, CW, PH); const d8 = id.data; let seed = 3; for (let i = 0; i < d8.length; i += 4) { seed = (seed * 1664525 + 1013904223) >>> 0; const nz = ((seed >>> 16) & 31) - 16; d8[i] += nz * 0.35; d8[i + 1] += nz * 0.35; d8[i + 2] += nz * 0.35 } ctx.putImageData(id, 0, 0) }
  const bf = ctx.createLinearGradient(0, PH - 340, 0, PH); bf.addColorStop(0, 'rgba(7,16,51,0)'); bf.addColorStop(0.55, 'rgba(7,16,51,0.85)'); bf.addColorStop(1, 'rgba(7,16,51,0.98)'); ctx.fillStyle = bf; ctx.fillRect(0, PH - 340, CW, 340)
  cols.forEach(([k], i) => { const x = i * pw; ctx.fillStyle = 'rgba(232,194,90,0.9)'; ctx.fillRect(x + pw - 1, 0, 2, PH); if (k === '__crest') return
    ctx.textAlign = 'center'; ctx.fillStyle = P.gold; ctx.font = '50px Anton'; ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 14; ctx.fillText(String(NUM[k]), x + pw / 2, PH - 72); ctx.fillStyle = P.white; ctx.font = '26px Anton'; ctx.fillText(NAME[k], x + pw / 2, PH - 30); ctx.shadowBlur = 0 })
  // crest column: ring + crest + Arabic line
  { const cx = 3 * pw + pw / 2, cy = 330
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 260); g.addColorStop(0, 'rgba(47,107,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(3 * pw, 0, pw, PH)
    ctx.beginPath(); ctx.arc(cx, cy, 92, 0, Math.PI * 2); ctx.strokeStyle = P.gold; ctx.lineWidth = 6; ctx.stroke()
    ctx.beginPath(); ctx.arc(cx, cy, 82, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2; ctx.stroke()
    ctx.drawImage(FCB, cx - 62, cy - 72, 124, 124)
    ctx.textAlign = 'center'; ctx.fillStyle = P.white; ctx.font = 'bold 30px Tajawal'; ctx.fillText('برشلونة أولاً', cx, PH - 60)
    ctx.fillStyle = P.gold; ctx.font = '18px "IBM Plex Mono"'; ctx.fillText('B A R Ç A', cx, PH - 30) }
  // white strip with gold + credit line
  ctx.fillStyle = P.white; ctx.fillRect(0, PH, CW, CH - PH); ctx.fillStyle = P.gold; ctx.fillRect(0, PH, CW, 8)
  d.paintLogo(ctx, 40, PH + 30, 90)
  ctx.textAlign = 'left'; ctx.fillStyle = P.night; ctx.font = '62px Anton'; ctx.fillText('PRESSING 90’', 150, PH + 94); ctx.fillStyle = P.gold; ctx.fillRect(150, PH + 108, 380, 6)
  ctx.textAlign = 'right'; ctx.fillStyle = P.night; ctx.font = 'bold 40px Tajawal'; ctx.fillText('أخبار برشلونة بالعربية · نتائج مباشرة', CW - 40, PH + 84)
  ctx.fillStyle = P.grana; ctx.font = '24px "IBM Plex Mono"'; ctx.fillText('B A R Ç A   F I R S T  ·  p r e s s i n g 9 0 . l i v e', CW - 40, PH + 128)
  ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(7,16,51,0.65)'; ctx.font = '13px "IBM Plex Mono"'
  ctx.fillText('Photos: Bryan Berlin · Biso · Rccousins (Wikimedia Commons, CC BY 4.0 / CC BY-SA 4.0), AI-edited kits · pressing90.live/credits', 150, PH + 138)
  fs.writeFileSync(`${W}/2-cover-v5.png`, c.toBuffer('image/png')) }
// ── GOAL card with cutout 1080×1920 ──
{ const CW = 1080, CH = 1920; const c = createCanvas(CW, CH); const ctx = c.getContext('2d')
  ctx.fillStyle = P.night; ctx.fillRect(0, 0, CW, CH)
  // split blocks diagonal
  ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(CW * 0.62, 0); ctx.lineTo(CW * 0.38, CH); ctx.lineTo(0, CH); ctx.closePath(); ctx.fillStyle = P.royal; ctx.fill(); ctx.restore()
  ctx.save(); ctx.beginPath(); ctx.moveTo(CW, 0); ctx.lineTo(CW * 0.62, 0); ctx.lineTo(CW * 0.38, CH); ctx.lineTo(CW, CH); ctx.closePath(); ctx.fillStyle = P.grana; ctx.fill(); ctx.restore()
  const g = ctx.createRadialGradient(CW / 2, 700, 0, CW / 2, 700, 900); g.addColorStop(0, 'rgba(47,107,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH)
  const v = ctx.createLinearGradient(0, 900, 0, CH); v.addColorStop(0, 'rgba(7,16,51,0)'); v.addColorStop(1, 'rgba(7,16,51,0.95)'); ctx.fillStyle = v; ctx.fillRect(0, 0, CW, CH)
  d.paintLogo(ctx, 40, 50, 80); ctx.fillStyle = P.white; ctx.font = '44px Anton'; ctx.textAlign = 'left'; ctx.fillText('Pressing 90’', 136, 106)
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, CW, 1250); ctx.clip(); { const img = cut.yamal; const w = 1180; const sc = w / img.width; ctx.drawImage(img, CW / 2 - w / 2, 120, w, img.height * sc) } ctx.restore()
  const v2 = ctx.createLinearGradient(0, 1000, 0, 1260); v2.addColorStop(0, 'rgba(7,16,51,0)'); v2.addColorStop(1, 'rgba(7,16,51,1)'); ctx.fillStyle = v2; ctx.fillRect(0, 1000, CW, 260)
  ctx.textAlign = 'center'; ctx.fillStyle = P.gold; ctx.font = '230px Anton'; ctx.lineJoin = 'round'; ctx.lineWidth = 16; ctx.strokeStyle = P.grana; ctx.strokeText('GOAL!', CW / 2, 1350); ctx.fillText('GOAL!', CW / 2, 1350)
  ctx.fillStyle = P.white; ctx.font = 'bold 60px Tajawal'; ctx.fillText('هدف التقدم!', CW / 2, 1430)
  ctx.drawImage(FCB, 170, 1490, 170, 170); ctx.drawImage(RMA, CW - 340, 1490, 170, 170)
  ctx.fillStyle = P.white; ctx.font = '150px Anton'; ctx.fillText('2', 450, 1630); ctx.fillText('1', 630, 1630); ctx.fillStyle = P.gold; ctx.fillRect(525, 1575, 30, 8)
  rr(ctx, 190, 1700, 700, 90, 45); ctx.fillStyle = P.gold; ctx.fill(); ctx.fillStyle = P.night; ctx.font = '50px Anton'; ctx.fillText("LAMINE YAMAL · 27'", CW / 2, 1764)
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '26px "IBM Plex Mono"'; ctx.fillText('Assist · Pedri  ·  LaLiga  ·  AI-edited photo · CC BY 4.0', CW / 2, 1840)
  fs.writeFileSync(`${W}/5-goal-v3.png`, c.toBuffer('image/png')) }
console.log('ok')
