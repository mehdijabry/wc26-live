// Goal recreation reels — « كيف جاء الهدف » (Mehdi, 2026-09-18): a narrated, schematic
// re-enactment of a goal on the editorial pitch, driven by a scene spec (actors with
// keyframes, ball segments, camera keys, tags, captions, overlays; times as expressions
// "B3", "B3e", anchors, max()). Broadcast-style overlays (glow ribbons, flowing chevrons,
// ground discs, ripples), automatic layout QA (marker repulsion, label placement, viewport
// fit) and audio QA (voice clips, overlaps, loudness → loudnorm). The shot origin and the
// target come from ESPN play coordinates; the scorer's run always ends on the origin.
// Frames are drawn with node-canvas and piped raw into ffmpeg (memory-flat).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, execFileSync, spawnSync } from 'node:child_process'
import { createCanvas, loadImage } from 'canvas'
import * as d from './draw.js'
import * as ed from './editorial.js'
import { animSlide } from './video.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Render one goal recreation: spec (scene), voices (local mp3 paths, one per beat), music / roar / confetti (local paths), dir (scratch), out (final mp4). */
export async function renderGoalRecreation({ spec, voices, music, roar, confetti, dir, out, fps = 20 }) {
  d.registerBrandFonts(); ed.registerEditorialFonts()
  const E = ed.E, W = 1080, H = 1920, FPS = fps
  const ID = spec.id || 'goal'
  const scenePath = path.join(dir, 'scene.mp4')
  const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())
  const VD = voices.map(dur), GAP = spec.gap ?? 0.3
  // ── time expressions: numbers, "B3" (beat start), "B3e" (beat voice end), anchors, "+/-" offsets, max(a,b) ──
  const memoS = {}, memoA = {}
  function S(i) { if (i in memoS) return memoS[i]; const o = spec.beatStarts && spec.beatStarts[i]; memoS[i] = o != null ? T(o) : i === 0 ? (spec.start ?? 0.3) : S(i - 1) + VD[i - 1] + GAP; return memoS[i] }
  function T(e) {
    if (typeof e === 'number') return e
    e = String(e).trim(); if (/^-?[\d.]+$/.test(e)) return parseFloat(e)
    if (e.startsWith('max(')) return Math.max(...e.slice(4, -1).split(',').map(T))
    const m = e.match(/^([A-Za-z_]\w*)\s*(?:([+-])\s*([\d.]+))?$/); if (!m) throw new Error('bad time ' + e)
    let base; const bm = m[1].match(/^B(\d+)(e?)$/)
    if (bm) base = S(+bm[1]) + (bm[2] ? VD[+bm[1]] : 0)
    else { if (!(m[1] in memoA)) { if (!(m[1] in (spec.anchors || {}))) throw new Error('unknown anchor ' + m[1]); memoA[m[1]] = T(spec.anchors[m[1]]) } base = memoA[m[1]] }
    return base + (m[2] ? (m[2] === '-' ? -1 : 1) * parseFloat(m[3]) : 0)
  }
  for (const k of Object.keys(spec.anchors || {})) T(k)
  const BEATS = spec.voices.map((_, i) => S(i))
  const tShot = T(spec.shot), tGoal = T(spec.goal), tEnd = T(spec.end)
  const c01 = (p) => Math.max(0, Math.min(1, p))
  const eio = (p) => { p = c01(p); return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2 }
  const eo = (p) => 1 - Math.pow(1 - c01(p), 3)
  function kf(keys, t) {
    if (t <= keys[0].t) return [keys[0].u, keys[0].v]
    for (let i = 1; i < keys.length; i++) if (t <= keys[i].t) { const a = keys[i - 1], b = keys[i]; const p = eio((t - a.t) / Math.max(1e-6, b.t - a.t)); return [a.u + (b.u - a.u) * p, a.v + (b.v - a.v) * p] }
    const l = keys[keys.length - 1]; return [l.u, l.v]
  }
  function kf3(keys, t) {
    if (t <= keys[0][0]) return keys[0].slice(1)
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const a = keys[i - 1], b = keys[i]; const p = eio((t - a[0]) / Math.max(1e-6, b[0] - a[0])); return [1, 2, 3].map((k) => a[k] + (b[k] - a[k]) * p) }
    return keys[keys.length - 1].slice(1)
  }
  // ── pitch ──
  const x0 = 110, y0 = 560, pw = 860, ph = 940, topW = 0.88, yb = y0 + ph
  const X = (u, y) => { const t = (y - y0) / ph; const cw = pw * (topW + (1 - topW) * t); return x0 + pw / 2 + (u - 0.5) * cw }
  const P = (u, v) => { const y = y0 + v * ph; return [X(u, y), y] }
  // ── actors ──
  const ACT = {}
  for (const [k, a] of Object.entries(spec.actors)) ACT[k] = { ...a, K: a.keys.map(([t, u, v]) => ({ t: T(t), u, v })).sort((p, q) => p.t - q.t) }
  // ESPN play coordinates (attacking frame): X 0→100 towards the opponent goal, Y 0→100 right→left. Our pitch: u = 1 - Y/100, v = 1 - X/100.
  let SHOT_ORIGIN = null, SHOT_TARGET_U = null
  if (spec.espn) {
    SHOT_ORIGIN = [1 - spec.espn.Y / 100, 1 - spec.espn.X / 100]
    if (spec.espn.Y2 != null) SHOT_TARGET_U = Math.max(0.445, Math.min(0.555, 1 - spec.espn.Y2 / 100))
    ACT._SHOT = { kind: 'home', number: '', name: '', K: [{ t: 0, u: SHOT_ORIGIN[0], v: SHOT_ORIGIN[1] }] }
    if (spec.scorer && spec.scorerArrive) {   // the scorer's run always ends exactly where ESPN places the shot
      const K = ACT[spec.scorer].K, ta = T(spec.scorerArrive)
      const [au, av] = kf(K, ta); const du = SHOT_ORIGIN[0] - au, dv = SHOT_ORIGIN[1] - av
      for (const k of K) if (k.t >= ta - 1e-6) { k.u += du; k.v += dv }
      if (!K.some((k) => Math.abs(k.t - ta) < 1e-6)) { K.push({ t: ta, u: SHOT_ORIGIN[0], v: SHOT_ORIGIN[1] }); K.sort((p, q) => p.t - q.t) }
      console.log('scorer snapped to ESPN origin', SHOT_ORIGIN.map((x) => +x.toFixed(3)), 'target u', SHOT_TARGET_U)
    }
  }
  const ORDER = (spec.order || Object.keys(ACT)).filter((id) => !id.startsWith('_'))
  const pos = (id, t, du = 0, dv = 0) => { const [u, v] = kf(ACT[id].K, t); return P(u + du, v + dv) }
  const ptUV = (p, t) => { if (typeof p[0] === 'string') { const b = pos(p[0], t), o = pos(p[0], t, p[1] || 0, p[2] || 0); const c = (CUR && CUR[p[0]]) || b; return [c[0] + o[0] - b[0], c[1] + o[1] - b[1]] } return P(p[0], p[1]) }
  const ptPx = (p, t) => { if (typeof p[0] === 'string') { const c = (CUR && CUR[p[0]]) || pos(p[0], t); return [c[0] + (p[1] || 0), c[1] + (p[2] || 0)] } return P(p[0], p[1]) }
  const win = (o, t) => { const a = T(o.from), b = o.to != null ? T(o.to) : Infinity; if (t < a || t > b + 0.3) return 0; return c01((t - a) / (o.fadeIn ?? 0.2)) * (t <= b ? 1 : 1 - (t - b) / 0.3) }
  // ── ball ──
  const BALL = spec.ball.map((s) => ({ ...s, until: s.until != null ? T(s.until) : Infinity }))
  if (SHOT_TARGET_U != null && spec.autoTarget !== false) for (const s of BALL) { if (s.shot) s.shot = [SHOT_TARGET_U, s.shot[1] ?? -0.012]; if (s.rest) s.rest = [SHOT_TARGET_U, s.rest[1] ?? -0.025] }
  function ballAt(t) {
    let start = 0
    for (const s of BALL) {
      if (t < s.until) {
        if (s.carry) { const [x, y] = pos(s.carry, t, s.du ?? 0.035, s.dv ?? -0.012); const bob = (s.bob || []).some(([a, b]) => t >= T(a) && t <= T(b)); return [x, y, bob ? Math.abs(Math.sin(t * 14)) * 3 : 0] }
        if (s.at) { const [x, y] = P(s.at[0], s.at[1]); return [x, y, 0] }
        if (s.pass || s.shot) {
          const p0 = c01((t - start) / Math.max(1e-6, s.until - start)); const p = s.shot || s.ease === 'lin' ? p0 : eo(p0)
          const a = s.from ? ptUV(s.from, start) : ballAt(start - 1e-4), b = ptUV(s.pass ? s.to : s.shot, s.until)
          return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, Math.sin(Math.PI * p) * (s.arc ?? 30)]
        }
        if (s.rest) { const [x, y] = P(s.rest[0], s.rest[1]); const k = t - start; return [x, y, Math.abs(Math.sin(k * 12)) * 14 * Math.exp(-k * 3)] }
      }
      start = s.until
    }
    const l = BALL[BALL.length - 1]; const [x, y] = P(l.rest ? l.rest[0] : 0.5, l.rest ? l.rest[1] : -0.02); return [x, y, 0]
  }
  const passSegs = []; { let start = 0; for (const s of BALL) { if (s.pass) passSegs.push({ start, end: s.until, s }); start = s.until } }
  const shotSeg = (() => { let start = 0; for (const s of BALL) { if (s.shot) return { start, end: s.until, s }; start = s.until } })()
  const trailFrom = spec.trailFrom != null ? T(spec.trailFrom) : 0
  const runTrail = spec.runTrail ? { from: T(spec.runTrail.from), to: T(spec.runTrail.to), pts: [] } : null
  if (runTrail) for (let t = runTrail.from; t <= runTrail.to; t += 0.06) { const [x, y] = ballAt(t); runTrail.pts.push([t, x, y]) }
  const CAM = spec.camera.map(([t, u, v, s]) => [T(t), u, v, s])
  const TAGS = spec.tags.map(([t, u, v, n, l]) => [T(t), u, v, n, l])
  const CAPS = spec.captions.map(([t, a, b]) => [T(t), a, b])
  const HI = (spec.highlights || []).map(([a, f, t]) => [a, T(f), T(t)])
  const col = (c) => (E[c] || c)
  ;(spec.overlays || []).forEach((o, i) => { o._i = i })
  // ── automatic layout QA: marker repulsion, label placement with collision avoidance, viewport fit ──
  const QA = { markerCollisions: 0, labelMoves: 0, unresolved: 0, viewportFits: 0, events: [] }
  const qaEvent = (t, what) => { if (QA.events.length < 80) QA.events.push({ t: +t.toFixed(2), what }) }
  const OFF = new Map(), SIDE = new Map(); let CUR = {}, RECTS = [], VIEW = null, VSCALE = null
  const carriersAt = (t) => { const fixed = new Set(); let start = 0
    for (const sg of BALL) { if (sg.carry && t >= start - 0.3 && t < sg.until + 0.3) fixed.add(sg.carry)
      if (sg.pass && typeof sg.to[0] === 'string' && t >= start - 0.5 && t < sg.until + 1.0) fixed.add(sg.to[0])
      if (sg.from && typeof sg.from[0] === 'string' && t >= start - 0.5 && t < sg.until + 0.5) fixed.add(sg.from[0]); start = sg.until }
    for (const [a, f, to] of HI) if (t > f && t < to) fixed.add(a)
    return fixed }
  function layoutActors(t) {
    const ids = ORDER, fixed = carriersAt(t), MIN = 86
    const p = {}, push = {}; for (const id of ids) { p[id] = pos(id, t); push[id] = [0, 0] }
    for (let it = 0; it < 3; it++) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j]; const ax = p[a][0] + push[a][0], ay = p[a][1] + push[a][1], bx = p[b][0] + push[b][0], by = p[b][1] + push[b][1]
      let dx = bx - ax, dy = by - ay; const d = Math.hypot(dx, dy) || 1; if (d >= MIN) continue
      const ov = MIN - d; dx /= d; dy /= d; const fa = fixed.has(a), fb = fixed.has(b)
      if (fa && fb) { if (it === 0) { QA.unresolved++; qaEvent(t, `markers ${a}/${b} overlap, both locked`) } continue }
      if (fa) { push[b][0] += dx * ov; push[b][1] += dy * ov } else if (fb) { push[a][0] -= dx * ov; push[a][1] -= dy * ov } else { push[a][0] -= dx * ov / 2; push[a][1] -= dy * ov / 2; push[b][0] += dx * ov / 2; push[b][1] += dy * ov / 2 }
      if (it === 0) QA._hit = true
    }
    if (QA._hit) { QA.markerCollisions++; QA._hit = false }
    CUR = {}
    for (const id of ids) { const prev = OFF.get(id) || [0, 0]; const nx = prev[0] + (push[id][0] - prev[0]) * 0.25, ny = prev[1] + (push[id][1] - prev[1]) * 0.25; OFF.set(id, [nx, ny]); CUR[id] = [p[id][0] + nx, p[id][1] + ny] }
    RECTS = ids.map((id) => ({ id, x: CUR[id][0] - 62, y: CUR[id][1] - 40, w: 124, h: 112 }))
  }
  const posCur = (id) => CUR[id] || null
  const inter = (r, q) => Math.max(0, Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x)) * Math.max(0, Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y))
  function place(key, cands, w, h, t) {
    const hard = (c) => { const r = { x: c[0], y: c[1], w, h }; let sc = 0; for (const q of RECTS) sc += inter(r, q); return sc }
    const score = (c) => { const r = { x: c[0], y: c[1], w, h }; let sc = hard(c); if (VIEW) sc += (w * h - inter(r, VIEW)) * 2; return sc }
    const prev = SIDE.get(key)
    if (prev != null && prev < cands.length && score(cands[prev]) === 0) { const c = cands[prev]; RECTS.push({ id: key, x: c[0], y: c[1], w, h }); return c }
    let best = 0, bs = Infinity; for (let i = 0; i < cands.length; i++) { const sc = score(cands[i]); if (sc < bs) { bs = sc; best = i } if (sc === 0) break }
    if (prev != null && prev !== best) QA.labelMoves++
    const hb = hard(cands[best]); if (hb > 200) { QA.unresolved++; qaEvent(t, `label "${key}" still overlaps (${Math.round(hb)} px²)`) }
    SIDE.set(key, best); const c = cands[best]; RECTS.push({ id: key, x: c[0], y: c[1], w, h }); return c
  }
  function smartPill(ctx, key, text, cx, cy, t, opts = {}) {
    const font = opts.font || 'bold 24px Tajawal'; ctx.font = font; const pad = opts.pad ?? 16
    const w = ctx.measureText(text).width + pad * 2, h = parseInt(font.match(/(\d+)px/)[1]) * 1.5
    const cands = [[cx - w / 2, cy - h / 2], [cx - w / 2, cy - h / 2 - 66], [cx - w / 2, cy - h / 2 + 66], [cx - w / 2 - 140, cy - h / 2], [cx - w / 2 + 140, cy - h / 2], [cx - w / 2 - 140, cy - h / 2 - 66], [cx - w / 2 + 140, cy - h / 2 - 66]]
    const c = place(key, cands, w, h, t); pill(ctx, text, c[0], c[1] + h / 2, { ...opts, align: 'left' })
  }
  // ── drawing helpers (broadcast style) ──
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath() }
  function quad(ctx, u0, u1, ya, yb2) { ctx.beginPath(); ctx.moveTo(X(u0, ya), ya); ctx.lineTo(X(u1, ya), ya); ctx.lineTo(X(u1, yb2), yb2); ctx.lineTo(X(u0, yb2), yb2); ctx.closePath() }
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})` }
  function bezPts(a, b, k = 0.18, n = 40) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
    const cx = mx - dy / L * k * L, cy = my + dx / L * k * L
    const pts = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; pts.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]) } return pts
  }
  function smooth(pts, n = 3) { if (pts.length < 3) return pts; const out = [pts[0]]; for (let i = 1; i < pts.length - 1; i++) { const a = pts[i - 1], b = pts[i], c = pts[i + 1]; for (let k = 1; k <= n; k++) { const t = k / (n + 1); out.push([(1 - t) * ((a[0] + b[0]) / 2) + t * ((b[0] + c[0]) / 2), (1 - t) * ((a[1] + b[1]) / 2) + t * ((b[1] + c[1]) / 2)]) } } out.push(pts[pts.length - 1]); return out }
  function glowPath(ctx, pts, { c0 = E.BLUE, c1 = E.AQUA, core = '#FFFFFF', width = 5, p = 1, flow = null, alpha = 1, arrow = true, dashed = false } = {}) {
    const n = Math.max(2, Math.round(pts.length * c01(p))); const P2 = pts.slice(0, n); if (P2.length < 2) return
    const a = P2[0], b = P2[P2.length - 1]
    const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]); g.addColorStop(0, hexA(c0, 0.15)); g.addColorStop(0.55, c0); g.addColorStop(1, c1)
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const path = () => { ctx.beginPath(); ctx.moveTo(P2[0][0], P2[0][1]); for (let i = 1; i < P2.length; i++) ctx.lineTo(P2[i][0], P2[i][1]) }
    if (dashed) ctx.setLineDash([12, 16])
    for (const [w, al] of [[width * 4.2, 0.10], [width * 2.2, 0.22], [width, 0.95]]) { ctx.strokeStyle = g; ctx.globalAlpha = alpha * al; ctx.lineWidth = w; path(); ctx.stroke() }
    ctx.setLineDash([]); ctx.globalAlpha = alpha * 0.85; ctx.strokeStyle = core; ctx.lineWidth = Math.max(1.2, width * 0.28); path(); ctx.stroke()
    if (flow != null) { ctx.globalAlpha = alpha; ctx.strokeStyle = core; ctx.lineWidth = Math.max(2, width * 0.7); ctx.setLineDash([5, 26]); ctx.lineDashOffset = -flow * 150; path(); ctx.stroke(); ctx.setLineDash([]) }
    if (arrow && p >= 0.999) {
      const q = P2[Math.max(0, P2.length - 4)], ang = Math.atan2(b[1] - q[1], b[0] - q[0]), L = width * 4.5
      const head = () => { ctx.beginPath(); ctx.moveTo(b[0] - L * Math.cos(ang - 0.5), b[1] - L * Math.sin(ang - 0.5)); ctx.lineTo(b[0], b[1]); ctx.lineTo(b[0] - L * Math.cos(ang + 0.5), b[1] - L * Math.sin(ang + 0.5)) }
      ctx.lineWidth = width * 2.4; ctx.strokeStyle = hexA(c1, 0.25); head(); ctx.stroke(); ctx.lineWidth = width * 0.9; ctx.strokeStyle = c1; head(); ctx.stroke(); ctx.lineWidth = Math.max(1.2, width * 0.3); ctx.strokeStyle = core; head(); ctx.stroke()
    }
    ctx.restore()
  }
  function disc(ctx, x, y, color, { hi = 0, t = 0 } = {}) {
    ctx.save(); ctx.translate(x, y + 30); ctx.scale(1, 0.38)
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 60); g.addColorStop(0, hexA(color, 0.45)); g.addColorStop(1, hexA(color, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = hexA(color, 0.9); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke()
    if (hi > 0) {
      const gg = ctx.createRadialGradient(0, 0, 10, 0, 0, 120); gg.addColorStop(0, hexA(E.GOLD, 0.35 * hi)); gg.addColorStop(1, hexA(E.GOLD, 0)); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, 120, 0, Math.PI * 2); ctx.fill()
      const r = 48 + 6 * Math.sin(t * 7); ctx.strokeStyle = hexA(E.GOLD, 0.95 * hi); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = hexA('#FFFFFF', 0.7 * hi); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r + 9, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.restore()
  }
  function ripples(ctx, x, y, t0, t, color, { n = 3, period = 0.55, rmax = 110, ry = 0.42 } = {}) {
    for (let i = 0; i < n; i++) { const k = ((t - t0) / period - i * 0.28); if (k < 0 || k > 1) continue; ctx.save(); ctx.translate(x, y + 8); ctx.scale(1, ry); ctx.strokeStyle = hexA(color, 0.85 * (1 - k)); ctx.lineWidth = 4 * (1 - k) + 1; ctx.beginPath(); ctx.arc(0, 0, 12 + rmax * eo(k), 0, Math.PI * 2); ctx.stroke(); ctx.restore() }
  }
  function pill(ctx, text, x, y, { font = 'bold 26px Tajawal', bg = E.CREAM, fg = E.NAVY, pad = 16, align = 'center', alpha = 1 } = {}) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.font = font; const w = ctx.measureText(text).width + pad * 2, h = parseInt(font.match(/(\d+)px/)[1]) * 1.5
    const xx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
    ctx.shadowColor = 'rgba(17,28,79,0.25)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4; ctx.fillStyle = bg; rr(ctx, xx, y - h / 2, w, h, h / 2); ctx.fill(); ctx.shadowColor = 'transparent'
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, xx + w / 2, y + 2); ctx.restore()
  }
  function ball(ctx, x, y, lift) {
    ctx.save(); ctx.fillStyle = 'rgba(17,28,79,0.22)'; ctx.beginPath(); ctx.ellipse(x, y + 9, Math.max(4, 15 - lift * 0.12), Math.max(2, 6 - lift * 0.05), 0, 0, Math.PI * 2); ctx.fill()
    const by = y - lift
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = 'rgba(17,28,79,0.75)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, by, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = E.NAVY; ctx.beginPath(); ctx.arc(x, by, 3.6, 0, Math.PI * 2); ctx.fill()
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 8, by + Math.sin(a) * 8, 2.4, 0, Math.PI * 2); ctx.fill() }
    ctx.restore()
  }
  function jerseyCustom(ctx, x, y, s, { body = '#6CABDD', sleeve, num = '#FFFFFF', number = '', name = '', nameSize = 15 } = {}) {
    const u = s / 100; ctx.save(); ctx.translate(x - s / 2, y)
    const p = () => { ctx.beginPath(); ctx.moveTo(30 * u, 8 * u); ctx.lineTo(42 * u, 2 * u); ctx.quadraticCurveTo(50 * u, 14 * u, 58 * u, 2 * u); ctx.lineTo(70 * u, 8 * u); ctx.lineTo(96 * u, 22 * u); ctx.lineTo(86 * u, 46 * u); ctx.lineTo(73 * u, 40 * u); ctx.lineTo(74 * u, 100 * u); ctx.lineTo(26 * u, 100 * u); ctx.lineTo(27 * u, 40 * u); ctx.lineTo(14 * u, 46 * u); ctx.lineTo(4 * u, 22 * u); ctx.closePath() }
    ctx.shadowColor = 'rgba(17,28,79,0.25)'; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 6 * u
    p(); ctx.fillStyle = body; ctx.fill(); ctx.shadowColor = 'transparent'
    ctx.save(); p(); ctx.clip()
    if (sleeve) { ctx.fillStyle = sleeve; ctx.beginPath(); ctx.moveTo(4 * u, 22 * u); ctx.lineTo(30 * u, 8 * u); ctx.lineTo(27 * u, 40 * u); ctx.lineTo(14 * u, 46 * u); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(96 * u, 22 * u); ctx.lineTo(70 * u, 8 * u); ctx.lineTo(73 * u, 40 * u); ctx.lineTo(86 * u, 46 * u); ctx.closePath(); ctx.fill() }
    ctx.fillStyle = 'rgba(17,28,79,0.85)'; ctx.fillRect(4 * u, 18 * u, 12 * u, 9 * u); ctx.fillRect(84 * u, 18 * u, 12 * u, 9 * u)
    ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(74 * u, 0, 30 * u, 100 * u); ctx.restore()
    ctx.strokeStyle = 'rgba(17,28,79,0.35)'; ctx.lineWidth = 1.5 * u; p(); ctx.stroke()
    ctx.fillStyle = num; ctx.font = `900 ${40 * u}px Cairo`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.strokeStyle = 'rgba(17,28,79,0.55)'; ctx.lineWidth = 3 * u; ctx.lineJoin = 'round'; ctx.strokeText(String(number), 50 * u, 60 * u); ctx.fillText(String(number), 50 * u, 60 * u); ctx.textBaseline = 'alphabetic'
    ctx.restore()
    if (name) ed.spaced(ctx, String(name).toUpperCase(), x, y + s + nameSize * 1.55, { size: nameSize, align: 'center', tracking: 0.12 })
  }
  const sprites = new Map()
  function sprite(kind, number, name, kit) { const key = `${kind}-${number}-${name}-${JSON.stringify(kit || null)}`; if (!sprites.has(key)) { const c = createCanvas(240, 150); const ctx = c.getContext('2d'); if (kit) jerseyCustom(ctx, 120, 8, 64, { ...kit, number, name, nameSize: 15 }); else ed.jersey(ctx, 120, 8, 64, { kind, number, name, nameSize: 15 }); sprites.set(key, c) } return sprites.get(key) }
  const slides = (spec.overlays || []).filter((o) => o.type === 'slide')
  function marker(ctx, id, t) {
    const a = ACT[id]; const [x, y] = posCur(id) || pos(id, t); const [bx0, by0] = pos(id, t); const [px, py] = pos(id, t - 0.06); const dx = bx0 - px, dy = by0 - py, dist = Math.hypot(dx, dy)
    const ring = HI.some(([aid, f, to]) => aid === id && t > f && t < to) ? 0.6 + 0.35 * Math.sin(t * 9) : 0
    const slide = slides.some((o) => o.actor === id && t > T(o.from) && t < T(o.to))
    const tc = a.kit ? (a.kit.disc || a.kit.body) : a.kind === 'home' ? E.GRANA : a.kind === 'gk' ? E.GREEN : '#3FA9C9'
    disc(ctx, x, y, tc, { hi: ring, t })
    if (dist > 5) { const nx = -dx / dist, ny = -dy / dist, len = Math.min(90, dist * 5); ctx.save(); ctx.lineCap = 'round'
      for (const [o, w] of [[-18, 3], [0, 5], [18, 3]]) { const ox = -ny * o, oy = nx * o; const sx = x + ox + nx * 28, sy = y + 8 + oy + ny * 28, ex = sx + nx * len, ey = sy + ny * len; const g = ctx.createLinearGradient(sx, sy, ex, ey); g.addColorStop(0, hexA(tc, 0.7)); g.addColorStop(1, hexA(tc, 0)); ctx.strokeStyle = g; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke() }
      ctx.restore() }
    const sp = sprite(a.kind, a.number, a.name, a.kit)
    if (slide) {
      for (const [k, al] of [[0.10, 0.18], [0.05, 0.30]]) { const [gx, gy] = pos(id, t - k); ctx.save(); ctx.globalAlpha = al; ctx.drawImage(sp, gx - 120, gy - 42); ctx.restore() }
      ctx.save(); ctx.fillStyle = 'rgba(120,110,95,0.35)'; for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(x - dx * i * 0.9, y + 30 - dy * i * 0.9, 18 - i * 3, 8 - i, 0, 0, Math.PI * 2); ctx.fill() } ctx.restore()
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.55); ctx.drawImage(sp, -120, -42); ctx.restore()
    } else ctx.drawImage(sp, x - 120, y - 42)
  }
  function goalFrame(ctx, ya, dir, shake) {
    const gl = X(0.43, ya) + shake, gr = X(0.57, ya) + shake, gt = ya + dir * 34
    ctx.save(); ctx.strokeStyle = 'rgba(17,28,79,0.28)'; ctx.lineWidth = 1
    for (let x = gl; x <= gr; x += 7) { ctx.beginPath(); ctx.moveTo(x, gt); ctx.lineTo(x, ya); ctx.stroke() }
    for (let y = Math.min(gt, ya); y <= Math.max(gt, ya); y += 7) { ctx.beginPath(); ctx.moveTo(gl, y); ctx.lineTo(gr, y); ctx.stroke() }
    ctx.strokeStyle = E.NAVY; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(gl, ya); ctx.lineTo(gl, gt); ctx.lineTo(gr, gt); ctx.lineTo(gr, ya); ctx.stroke(); ctx.restore()
  }
  function tag(ctx, t, [t0, u, v, n, label]) {
    if (t < t0) return
    const p = eo((t - t0) / 0.25), s = 1.3 - 0.3 * p, a = t < t0 + 2.4 ? 1 : 0.62
    const [x, y] = P(u, v)
    ctx.save(); ctx.globalAlpha = a * c01((t - t0) / 0.12); ctx.translate(x, y); ctx.scale(s, s)
    ctx.shadowColor = 'rgba(17,28,79,0.3)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3
    ctx.fillStyle = E.GRANA; ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = 'transparent'
    ctx.fillStyle = E.CREAM; ctx.font = '900 24px Playfair'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n, 0, 1)
    ctx.restore()
    ctx.font = 'bold 24px Tajawal'; const w = ctx.measureText(label).width + 24, h = 36
    const L = [x - 30 - w, y - h / 2], R = [x + 30, y - h / 2], U = [x - w / 2, y - 33 - h], D = [x - w / 2, y + 33]
    const far = [[x - 60 - w, y - 60 - h], [x + 60, y - 60 - h], [x - 60 - w, y + 60], [x + 60, y + 60], [x - w / 2, y - 90 - h], [x - w / 2, y + 90]]
    const cands = u > 0.62 ? [L, R, U, D, ...far] : [R, L, U, D, ...far]
    const c = place('tag' + n, cands, w, h, t)
    ctx.save(); ctx.globalAlpha = a * c01((t - t0) / 0.12); pill(ctx, label, c[0], c[1] + h / 2, { font: 'bold 24px Tajawal', align: 'left', pad: 12 }); ctx.restore()
  }
  function overlay(ctx, o, t) {
    const a = win(o, t); if (a <= 0 && o.type !== 'ripple') return
    if (o.type === 'ripple') { const t0 = T(o.from); if (t < t0 || t > t0 + (o.n ?? 3) * (o.period ?? 0.6)) return; const [x, y] = P(o.at[0], o.at[1]); ripples(ctx, x, y, t0, t, col(o.color || 'GOLD'), { n: o.n ?? 3, period: o.period ?? 0.6, rmax: o.rmax ?? 120 })
      if (o.flash) { const k = c01((t - t0) / 0.25); ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = '#FFFFFF'; ctx.shadowColor = E.GOLD; ctx.shadowBlur = 30; ctx.beginPath(); ctx.arc(x, y, 10 + 30 * k, 0, Math.PI * 2); ctx.fill(); ctx.restore() } return }
    if (o.type === 'arrow') { const A = ptPx(o.a, t), B = ptPx(o.b, t); const al = o.flicker ? a * (0.4 + 0.5 * Math.abs(Math.sin(t * 28))) : a
      glowPath(ctx, bezPts(A, B, o.k ?? 0.18), { c0: col(o.c0 || 'GOLD'), c1: col(o.c1 || 'GRANA'), core: o.core || '#FFFFFF', width: o.width ?? 5, alpha: al, flow: t * (o.flowSpeed ?? 1), dashed: !!o.dashed, arrow: o.arrow !== false, p: o.grow ? c01((t - T(o.from)) / o.grow) : 1 })
      if (o.label) { const L = o.labelAt ? ptPx(o.labelAt, t) : [(A[0] + B[0]) / 2 - 70, (A[1] + B[1]) / 2]; smartPill(ctx, 'arrow' + o._i, o.label, L[0], L[1], t, { font: `bold ${o.labelSize ?? 24}px Tajawal`, bg: col(o.labelBg || 'GRANA'), fg: col(o.labelFg || 'CREAM'), alpha: Math.min(1, a) }) } return }
    if (o.type === 'zone') { const [x, y] = P(o.at[0], o.at[1]); const t0 = T(o.from)
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y + 8); ctx.scale(1, 0.5); const g = ctx.createRadialGradient(0, 0, 10, 0, 0, o.r ?? 150); g.addColorStop(0, hexA(E.GOLD, 0.42 + 0.1 * Math.sin(t * 6))); g.addColorStop(0.7, hexA(E.GOLD, 0.18)); g.addColorStop(1, hexA(E.GOLD, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, o.r ?? 150, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      for (let i = 0; i < 3; i++) { const k = (((t - t0) / 1.2) + i / 3) % 1; ctx.save(); ctx.globalAlpha = a * (1 - k) * 0.8; ctx.translate(x, y + 8); ctx.scale(1, 0.5); ctx.strokeStyle = E.GOLD; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 40 + (o.r ?? 150) * 0.8 * k, 0, Math.PI * 2); ctx.stroke(); ctx.restore() }
      return }
    if (o.type === 'zoneLabel') { const [x, y] = P(o.at[0], o.at[1]); smartPill(ctx, 'zone' + o._i, o.label, x + (o.labelDx ?? 0), y - (o.labelDy ?? 92), t, { font: 'bold 28px Tajawal', bg: E.NAVY, fg: E.GOLD, alpha: a }); return }
    if (o.type === 'label') { const L = ptPx(o.at, t); smartPill(ctx, 'label' + o._i, o.text, L[0], L[1], t, { font: `bold ${o.size ?? 24}px Tajawal`, bg: col(o.bg || 'GRANA'), fg: col(o.fg || 'CREAM'), alpha: a }) }
  }
  let pitchLayer = null
  function drawWorld(ctx, t) {
    if (!pitchLayer) { pitchLayer = createCanvas(W, H); const pc = pitchLayer.getContext('2d')
      pc.save(); quad(pc, 0, 1, y0, yb); pc.fillStyle = 'rgba(46,139,87,0.11)'; pc.fill()
      for (let i = 0; i < 10; i += 2) { quad(pc, 0, 1, y0 + ph * i / 10, y0 + ph * (i + 1) / 10); pc.fillStyle = 'rgba(46,139,87,0.055)'; pc.fill() }
      pc.restore(); ed.pitch(pc, x0, y0, pw, ph, { topW, color: 'rgba(17,28,79,0.42)' }); goalFrame(pc, yb, 1, 0) }
    ctx.drawImage(pitchLayer, 0, 0)
    const shake = t > tGoal && t < tGoal + 0.55 ? Math.sin((t - tGoal) * 60) * 4 * (1 - (t - tGoal) / 0.55) : 0
    goalFrame(ctx, y0, -1, shake)
    if (runTrail) { const seen = runTrail.pts.filter(([tt]) => tt <= t).map(([, x, y]) => [x, y + 6]); if (seen.length > 3) glowPath(ctx, smooth(seen, 2), { c0: E.NAVY, c1: '#3FA9C9', width: 4, alpha: 0.85, arrow: false, flow: t }) }
    for (const ps of passSegs) if (t >= ps.start && ps.s.glow !== false) { const p = eo((t - ps.start) / (ps.end - ps.start)); const a = ballAt(ps.start), b = ballAt(ps.end - 1e-4); glowPath(ctx, bezPts([a[0], a[1] + 6], [b[0], b[1] + 6], ps.s.k ?? -0.12), { c0: E.BLUE, c1: E.AQUA, width: 5, p, flow: t, alpha: t < tShot ? 1 : 0.45 }) }
    if (shotSeg && t >= shotSeg.start) { const p = c01((t - shotSeg.start) / (shotSeg.end - shotSeg.start)); const a = ballAt(shotSeg.start), b = P(shotSeg.s.shot[0], shotSeg.s.shot[1]); glowPath(ctx, bezPts([a[0], a[1] + 6], [b[0], b[1] + 6], shotSeg.s.k ?? 0.06), { c0: E.GRANA, c1: E.GOLD, width: 6, p, flow: t * 1.6 }); if (p >= 1) ripples(ctx, b[0], b[1] + 4, tGoal, t, E.GOLD, { n: 3, period: 0.7, rmax: 90 }) }
    for (const o of spec.overlays || []) if (o.type === 'zone') overlay(ctx, o, t)
    for (const id of ORDER) marker(ctx, id, t)
    for (const o of spec.overlays || []) if (o.type !== 'zone' && o.type !== 'slide') overlay(ctx, o, t)
    for (const o of spec.overlays || []) if (o.type === 'zone' && o.label) overlay(ctx, { ...o, type: 'zoneLabel' }, t)
    for (const tg of TAGS) tag(ctx, t, tg)
    if (t > trailFrom) { const pts = []; for (let k = 0; k <= 12; k++) { const tt = t - k * 0.035; if (tt < trailFrom) break; const [x, y, l] = ballAt(tt); pts.push([x, y - l]) }
      if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) > 8) { ctx.save(); ctx.lineCap = 'round'; for (let i = 1; i < pts.length; i++) { const k = i / pts.length; ctx.strokeStyle = hexA(E.GOLD, 0.55 * (1 - k)); ctx.lineWidth = 10 * (1 - k) + 1; ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke() } ctx.restore() } }
    const [bx, by, bl] = ballAt(t); ball(ctx, bx, by, bl)
  }
  // ── static base ──
  const base = createCanvas(W, H); { const ctx = base.getContext('2d')
    ed.backdrop(ctx, W, H, { tone: 'blue' })
    await ed.stadium(ctx, W, H, { top: H - 420, dark: '#8A8FA6', light: '#F4EFE6', alpha: 0.7, fadeTo: 0.6 })
    ed.stack(ctx, spec.stack || ['BARÇA', 'FIRST'], 48, 92, { size: 15 })
    try { const logo = await loadImage(path.join(__dirname, 'assets', 'logo-page.png')); const s = 104, cx = W - 48 - s / 2, cy = 62 + s / 2
      ctx.save(); ctx.shadowColor = 'rgba(17,28,79,0.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8; ctx.fillStyle = E.NAVY; ctx.beginPath(); ctx.arc(cx, cy, s / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, s / 2 - 2, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(logo, cx - s / 2, cy - s / 2, s, s); ctx.restore() } catch (e) { console.warn('logo', e.message) }
    ed.spaced(ctx, 'PRESSING90.LIVE', W / 2, 1830, { size: 16, align: 'center', tracking: 0.42 })
    ed.grain(ctx, W, H)
  }
  const titleC = createCanvas(W, 470); { const ctx = titleC.getContext('2d'); ed.titleAr(ctx, spec.title.l1, spec.title.l2, W / 2, 200, spec.title.size ?? 124, { lat: spec.title.lat }) }
  const capC = CAPS.map(([, small, big]) => { const c = createCanvas(1000, 240); const ctx = c.getContext('2d')
    let bs = 92; for (;;) { ctx.font = `bold ${bs}px Aref`; if (ctx.measureText(big).width <= 860 || bs <= 50) break; bs -= 3 }
    let ss = 34; for (;;) { ctx.font = `bold ${ss}px Tajawal`; if (ctx.measureText(small).width <= 880 || ss <= 22) break; ss -= 2 }
    ctx.font = `bold ${bs}px Aref`; const bw = ctx.measureText(big).width; ctx.font = `bold ${ss}px Tajawal`; const sw = ctx.measureText(small).width
    const w = Math.min(1000, Math.max(bw, sw) + 140)
    ctx.save(); ctx.shadowColor = 'rgba(17,28,79,0.25)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12; ctx.fillStyle = 'rgba(255,255,255,0.86)'; rr(ctx, 500 - w / 2, 10, w, 210, 30); ctx.fill(); ctx.restore()
    ctx.strokeStyle = E.LINE; ctx.lineWidth = 2; rr(ctx, 500 - w / 2, 10, w, 210, 30); ctx.stroke()
    ctx.font = `bold ${ss}px Tajawal`; ctx.textAlign = 'center'; ctx.fillStyle = E.MUTED; ctx.fillText(small, 500, 66)
    ed.titleAr(ctx, '', big, 500, 178, bs)
    return c })
  const timeline = { S: BEATS, VD, shot: tShot, goal: tGoal, end: tEnd, anchors: Object.fromEntries(Object.keys(spec.anchors || {}).map((k) => [k, T(k)])), sheet: (spec.sheet || []).map(T) }
  console.log('[goal-anim]', JSON.stringify({ S: BEATS.map((x) => +x.toFixed(2)), shot: +tShot.toFixed(2), goal: +tGoal.toFixed(2), end: +tEnd.toFixed(2) }))
  const N = Math.round(tEnd * FPS)
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '1', '-x264-params', 'rc-lookahead=8:ref=1:bframes=0', '-crf', '22', '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', scenePath], { stdio: ['pipe', 'ignore', 'inherit'] })
  const c = createCanvas(W, H); const ctx = c.getContext('2d')
  const world = createCanvas(W, H); const wctx = world.getContext('2d')
  const PX = 60, PY = 470, PW = 960, PH = 1100, CX = PX + PW / 2, CY = PY + PH / 2
  const TOTAL = tEnd + 4.2, GW = spec.goalWord || 'هدف!'
  const t0 = Date.now()
  for (let f = 0; f < N; f++) {
    const t = f / FPS
    ctx.drawImage(base, 0, 0)
    { const p = eo(t / 0.4); const s = 1.18 - 0.18 * p; ctx.save(); ctx.globalAlpha = c01(t / 0.18); ctx.translate(W / 2, 250); ctx.scale(s, s); ctx.translate(-W / 2, -250); ctx.drawImage(titleC, 0, 0); ctx.restore() }
    { const p = eo((t - 0.12) / 0.5); const s = 0.96 + 0.04 * p
      ctx.save(); ctx.globalAlpha = c01((t - 0.12) / 0.3); ctx.translate(CX, CY); ctx.scale(s, s); ctx.translate(-CX, -CY)
      ctx.save(); ctx.shadowColor = 'rgba(17,28,79,0.30)'; ctx.shadowBlur = 44; ctx.shadowOffsetY = 18; ctx.fillStyle = 'rgba(255,255,255,0.62)'; rr(ctx, PX, PY, PW, PH, 30); ctx.fill(); ctx.restore()
      ctx.strokeStyle = E.LINE; ctx.lineWidth = 2; rr(ctx, PX, PY, PW, PH, 30); ctx.stroke()
      rr(ctx, PX + 14, PY + 14, PW - 28, PH - 28, 22); ctx.clip()
      layoutActors(t)
      let [fu, fv, sc] = kf3(CAM, t); const [fx, fy] = P(fu, fv)
      { const need = [ballAt(t).slice(0, 2), ...[...carriersAt(t)].filter((id) => CUR[id]).map((id) => CUR[id])]
        const fits = (k) => need.every(([x, y]) => Math.abs(x - fx) * k <= PW / 2 - 70 && Math.abs(y - fy) * k <= PH / 2 - 90)
        let target = sc, n = 0; while (!fits(target) && target > 1.0 && n++ < 25) target *= 0.97
        if (n > 0) { QA.viewportFits++; if (f % 25 === 0) qaEvent(t, `viewport fit: zoom ${sc.toFixed(2)} → ${target.toFixed(2)}`); const prev = VSCALE ?? sc; sc = prev + (target - prev) * 0.2 } else if (VSCALE != null && Math.abs(VSCALE - sc) > 0.02) sc = VSCALE + (sc - VSCALE) * 0.2
        VSCALE = sc }
      VIEW = { x: fx - (PW / 2) / sc, y: fy - (PH / 2) / sc, w: PW / sc, h: PH / sc }
      wctx.clearRect(0, 0, W, H); drawWorld(wctx, t)
      ctx.translate(CX, CY); ctx.scale(sc, sc); ctx.translate(-fx, -fy); ctx.drawImage(world, 0, 0)
      ctx.restore()
      if (t >= tGoal && t < tGoal + 0.8) { const a = 1 - (t - tGoal) / 0.8; ctx.save(); rr(ctx, PX + 14, PY + 14, PW - 28, PH - 28, 22); ctx.clip(); const g = ctx.createRadialGradient(CX, CY - 200, 0, CX, CY - 200, 800); g.addColorStop(0, `rgba(255,255,255,${0.95 * a})`); g.addColorStop(0.4, `rgba(232,194,90,${0.35 * a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore() }
    }
    pill(ctx, 'رسم توضيحي', PX + 34, PY + 50, { font: 'bold 22px Tajawal', bg: 'rgba(244,239,230,0.92)', fg: E.MUTED, align: 'left', pad: 14 })
    if (t > 0.5 && t < 4.0) { const a = c01((t - 0.5) / 0.2) * (t < 3.6 ? 1 : 1 - (t - 3.6) / 0.4); const p = eo((t - 0.5) / 0.3); ctx.save(); ctx.translate(W - 250, PY + 46); ctx.rotate(-0.08); ctx.scale(1.2 - 0.2 * p, 1.2 - 0.2 * p); pill(ctx, spec.sticker || 'شاهد للنهاية', 0, 0, { font: 'bold 34px Tajawal', bg: E.GOLD, fg: E.NAVY, pad: 22, alpha: a }); ctx.restore() }
    if (spec.cta && t >= T(spec.cta.from)) { const st = T(spec.cta.from); const a = c01((t - st) / 0.25); const p = eo((t - st) / 0.3); ctx.save(); ctx.translate(W - 250, PY + 46); ctx.rotate(-0.08); ctx.scale(1.2 - 0.2 * p, 1.2 - 0.2 * p); pill(ctx, spec.cta.text, 0, 0, { font: 'bold 34px Tajawal', bg: E.GOLD, fg: E.NAVY, pad: 22, alpha: a }); ctx.restore() }
    ctx.fillStyle = 'rgba(17,28,79,0.15)'; ctx.fillRect(PX, PY + PH + 16, PW, 6); ctx.fillStyle = E.GRANA; ctx.fillRect(PX, PY + PH + 16, PW * c01(t / TOTAL), 6)
    if (t >= tGoal) { const p = eo((t - tGoal) / 0.35); const s = (1.4 - 0.4 * p) * (1 + 0.02 * Math.sin((t - tGoal) * 5)); ctx.save(); ctx.globalAlpha = c01((t - tGoal) / 0.12) * (spec.cta ? 1 - c01((t - T(spec.cta.from)) / 0.4) : 1); ctx.translate(W / 2, 1490); ctx.scale(s, s); ctx.rotate(-0.04)
      ctx.font = 'bold 220px Aref'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round'; ctx.lineWidth = 26; ctx.strokeStyle = E.CREAM; ctx.strokeText(GW, 0, 0); ctx.lineWidth = 12; ctx.strokeStyle = E.GOLD; ctx.strokeText(GW, 0, 0)
      const w = ctx.measureText(GW).width; ctx.fillStyle = ed.inkGradient(ctx, -w / 2, w); ctx.fillText(GW, 0, 0); ctx.restore() }
    let ci = -1; for (let i = 0; i < CAPS.length; i++) if (t >= CAPS[i][0]) ci = i
    if (ci >= 0) { const st = CAPS[ci][0]; const p = eo((t - st) / 0.25); const s = 1.12 - 0.12 * p; ctx.save(); ctx.globalAlpha = c01((t - st) / 0.12); ctx.translate(W / 2, 1690); ctx.scale(s, s); ctx.drawImage(capC[ci], -500, -120); ctx.restore() }
    const buf = c.toBuffer('raw')
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
    await new Promise((r) => setImmediate(r))
    if (f % 250 === 0) console.log('[goal-anim] frame', f, '/', N, ((Date.now() - t0) / 1000).toFixed(1) + 's')
  }
  ff.stdin.end()
  await new Promise((res, rej) => ff.on('close', (code) => (code ? rej(new Error('ffmpeg ' + code)) : res())))
  const qaVisual = { frames: N, markerCollisions: QA.markerCollisions, labelMoves: QA.labelMoves, unresolved: QA.unresolved, viewportFits: QA.viewportFits, events: QA.events.slice(0, 20) }
  console.log('[goal-anim] QA visual:', JSON.stringify({ ...qaVisual, events: undefined }))

  // ── card + transition + audio mix + audio QA ──
  const cardSpec = await d.drawGoalAnimSpec({ titleLang: 'ar', footer: 'LIVE ON PRESSING90.LIVE', assistLabel: 'صناعة', ...(spec.card.special === 'barca' && confetti ? { special: 'barca', bgVideo: confetti } : {}), ...spec.card })
  const layers = {}
  for (const [k, buf] of Object.entries(cardSpec.layers)) { layers[k] = path.join(dir, `card-${k}.png`); fs.writeFileSync(layers[k], buf) }
  const cardPath = path.join(dir, 'card.mp4')
  await animSlide({ spec: { layers, anims: cardSpec.anims, bgVideo: cardSpec.bgVideo }, seconds: 4.6, fps: FPS, out: cardPath, fadeIn: 0, fadeOut: 0.5 })
  const ffr = (args) => { const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-threads', '1', ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('ffmpeg ' + String(r.stderr || '').slice(-600)) }
  const Ds = dur(scenePath), XF = 0.4, fullPath = path.join(dir, 'full.mp4')
  ffr(['-i', scenePath, '-i', cardPath, '-filter_complex', `[0:v][1:v]xfade=transition=fade:duration=${XF}:offset=${(Ds - XF).toFixed(3)},format=yuv420p[v]`, '-map', '[v]', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-maxrate', '6M', '-bufsize', '12M', '-movflags', '+faststart', fullPath])
  const Tt = dur(fullPath)
  const ms = (s) => Math.round(s * 1000)
  const fc = [`[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=${spec.musicGain ?? 0.16},afade=t=in:st=0:d=0.6,afade=t=out:st=${(Tt - 1.5).toFixed(2)}:d=1.5[m]`]
  const ins = ['-i', fullPath, '-stream_loop', '-1', '-i', music]
  const mix = []
  BEATS.forEach((t, i) => { ins.push('-i', voices[i]); fc.push(`[${i + 2}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms(t)}|${ms(t)}[v${i}]`); mix.push(`[v${i}]`) })
  let extra = ''
  if (roar) { const ri = BEATS.length + 2; ins.push('-i', roar); fc.push(`[${ri}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${spec.roar ?? 0.3},afade=t=out:st=2.2:d=1.6,adelay=${ms(tGoal - 0.15)}|${ms(tGoal - 0.15)}[fx]`); extra = '[fx]' }
  fc.push(`${mix.join('')}[m]${extra}amix=inputs=${mix.length + 1 + (extra ? 1 : 0)}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95[mix]`)
  ffr([...ins, '-filter_complex', fc.join(';'), '-map', '0:v', '-map', '[mix]', '-t', Tt.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out])
  // audio QA
  const err = (args) => spawnSync('ffmpeg', ['-hide_banner', ...args, '-f', 'null', '-'], { encoding: 'utf8' }).stderr || ''
  const qa = { voices: [], overlaps: [], loudness: null, loudnessFixed: false, issues: [] }
  BEATS.forEach((t, i) => {
    const f = voices[i]; const dv = dur(f); const e2 = err(['-i', f, '-af', 'volumedetect'])
    const mean = +(e2.match(/mean_volume:\s*(-?[\d.]+)/)?.[1] ?? NaN), max = +(e2.match(/max_volume:\s*(-?[\d.]+)/)?.[1] ?? NaN)
    if (!(dv > 0.8)) qa.issues.push(`voice ${i}: too short (${dv}s)`)
    if (mean < -35) qa.issues.push(`voice ${i}: nearly silent (${mean} dB)`)
    if (max > -0.3) qa.issues.push(`voice ${i}: clipping (${max} dB)`)
    if (i + 1 < BEATS.length && t + dv > BEATS[i + 1] + 0.05) { qa.overlaps.push([i, i + 1]); qa.issues.push(`voice ${i} overlaps voice ${i + 1} by ${(t + dv - BEATS[i + 1]).toFixed(2)}s`) }
    qa.voices.push({ i, start: +t.toFixed(2), dur: +dv.toFixed(2), mean, max })
  })
  const lufs = (f) => { const e2 = err(['-i', f, '-af', 'ebur128=framelog=quiet']); const m = [...e2.matchAll(/I:\s+(-?[\d.]+) LUFS/g)]; return m.length ? +m[m.length - 1][1] : NaN }
  qa.loudness = lufs(out)
  if (Number.isFinite(qa.loudness) && Math.abs(qa.loudness + 16) > 1.5) {
    const ln = path.join(dir, 'ln.mp4')
    ffr(['-i', out, '-c:v', 'copy', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', ln])
    fs.renameSync(ln, out); qa.loudnessFixed = true; qa.loudnessAfter = lufs(out)
  }
  console.log('[goal-anim] QA audio:', JSON.stringify({ voices: qa.voices.length, overlaps: qa.overlaps.length, loudness: qa.loudness, fixed: qa.loudnessFixed, after: qa.loudnessAfter, issues: qa.issues }))
  return { seconds: Math.round(dur(out)), qa: { visual: qaVisual, audio: { voices: qa.voices.length, overlaps: qa.overlaps.length, loudness: qa.loudness, loudnessFixed: qa.loudnessFixed, loudnessAfter: qa.loudnessAfter, issues: qa.issues } } }
}
