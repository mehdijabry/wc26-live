// Les formats dessinés sur les gabarits de Mehdi (15/10/2026).
//
// Chaque fonction respecte le contrat du format qu'elle remplace, pour que le
// montage n'ait rien à savoir du changement :
//   gabaritGoalLayers()   → même contrat que drawGoalLayers() : huit calques
//                           nommés + leurs positions de repos, en 1080×1920.
//   gabaritAlbumFinal()   → une toile 1080×1080, comme fulltime-post.
//   gabaritStatsMatch()   → une toile 1080×1080.
//   gabaritTableauSoiree()→ une toile 1080×604 (paysage).
//   gabaritQuatreMoments()→ { layers, anims }, comme drawUclMatchLayers().
//
// ── MISE À L'ÉCHELLE ──────────────────────────────────────────────────────
// Les fonds font 768 de large, la chaîne travaille en 1080 : tout est
// multiplié par ECH (1,40625). Les coordonnées de gabarits.js sont relevées
// sur les fonds à leur taille d'origine, donc elles passent toutes par `e()`.
// Tant que les fonds ne sont pas regénérés en 1080×1920, le rendu est
// légèrement adouci — c'est connu et assumé.

import { createCanvas, loadImage, Image } from 'canvas'
import fsSync from 'node:fs'
import path from 'node:path'
import { registerBrandFonts, paintLogo } from './draw.js'
import { dossierGabarits, CASES, UTILE, couvrir, ar, OR, CREME, MENTHE, tableauComparatif } from './gabarits.js'

const ECH = 1080 / 768
const e = (n) => Math.round(n * ECH)
const png = (c) => c.toBuffer('image/png')
const ctx2d = (c) => { const x = c.getContext('2d'); x.textBaseline = 'middle'; return x }

const fonds = new Map()
async function fond(nom) {
  if (!fonds.has(nom)) fonds.set(nom, await loadImage(path.join(dossierGabarits, `${nom}.jpg`)))
  return fonds.get(nom)
}

const crests = new Map()
async function crest(url) {
  if (!url) return null
  if (crests.has(url)) return crests.get(url)
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error('http ' + r.status)
    const img = await loadImage(Buffer.from(await r.arrayBuffer()))
    if (crests.size > 24) crests.clear()
    crests.set(url, img); return img
  } catch { return null }
}

/** Pose un fond à l'échelle de la chaîne, et prolonge le bas si besoin. */
async function poser(ctx, nom, W, H) {
  const f = await fond(nom)
  const hUtile = UTILE[nom] || f.height
  ctx.fillStyle = '#05080F'; ctx.fillRect(0, 0, W, H)
  // L'ECHELLE SE CALCULE SUR LE FOND REEL, jamais sur une constante. Les
  // premiers fonds faisaient 768 de large et ECH valait 1080/768 ; depuis le
  // 15/10 certains arrivent deja en 1080, et leur appliquer ECH les
  // agrandirait une seconde fois.
  const ech = W / f.width
  ctx.drawImage(f, 0, 0, f.width, hUtile, 0, 0, W, Math.round(hUtile * ech))
}

/**
 * LE QR D'INSCRIPTION, sur sa plaque blanche.
 *
 * Un QR ne se lit que sur fond clair et avec sa marge de silence : pose tel
 * quel sur une photo de nuit, aucun telephone ne l'accroche. Celui-ci porte un
 * logo en son centre, ce qui mange de la redondance d'erreur — d'ou une taille
 * genereuse.
 *
 * Il est dessine ICI et non incruste dans les fonds : un seul fichier a
 * remplacer le jour ou l'adresse d'inscription change, au lieu de sept fonds
 * a regenerer.
 */
let qrImg = null
function blocQr(ctx, x, y, taille) {
  if (qrImg === null) {
    try {
      const im = new Image()
      im.src = fsSync.readFileSync(path.join(dossierGabarits, '..', 'qr-inscription.png'))
      qrImg = im
    } catch (e) { console.warn('qr', e.message); qrImg = false }
  }
  if (!qrImg) return
  const M = Math.round(taille * 0.055)
  ctx.save()
  const r = Math.round(taille * 0.08)
  const T = taille + M * 2
  ctx.beginPath(); ctx.moveTo(x + r, y)
  ctx.arcTo(x + T, y, x + T, y + T, r); ctx.arcTo(x + T, y + T, x, y + T, r)
  ctx.arcTo(x, y + T, x, y, r); ctx.arcTo(x, y, x + T, y, r); ctx.closePath()
  ctx.fillStyle = '#FFFFFF'; ctx.fill()
  ctx.drawImage(qrImg, x + M, y + M, taille, taille)
  ctx.restore()
}

function txt(ctx, t, x, y, { size = 40, font = 'Archivo', color = CREME, align = 'center' } = {}) {
  ctx.save(); ctx.font = `${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align
  ctx.textBaseline = 'middle'; ctx.fillText(t, x, y); ctx.restore()
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LE REEL DE BUT — gabarits « but-neutre » et « but-barca »            ║
// ║                                                                      ║
// ║ Même contrat que drawGoalLayers : le montage anime des calques par   ║
// ║ leur nom et les repose aux coordonnées de `rest`. On ne change que   ║
// ║ ce qui est peint, jamais la structure.                               ║
// ╚══════════════════════════════════════════════════════════════════════╝
export async function gabaritGoalLayers(g) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const barca = g.special === 'barca'
  const nom = barca ? 'but-barca' : 'but-neutre'
  const C = CASES[nom]
  const teinte = barca ? OR : MENTHE

  // ── bg : le fond, ses cases masquées, et le texte qui ne bouge pas
  const bg = createCanvas(W, H); { const ctx = ctx2d(bg)
    await poser(ctx, nom, W, H)
    const [ex, ey, ew, eh] = C.entete.map(e)
    couvrir(ctx, [ex, ey, ew, eh], '#070B16', 14)
    ar(ctx, ligueAr(g.league), ex + ew / 2, ey + e(38), { size: e(24), color: teinte })
    ar(ctx, `${nomAr(g.home)} · ${nomAr(g.away)}`, ex + ew / 2, ey + e(90), { size: e(26) })
    couvrir(ctx, C.centre.map(e), '#05080F', 18)
    couvrir(ctx, C.pied.map(e), '#070B16', 14)
    const [px, py, pw] = C.pied.map(e)
    ar(ctx, texteBut(g), px + pw / 2, py + e(46), { size: e(26) })
    ar(ctx, 'كل الأهداف والإحصائيات على الموقع', px + pw / 2, py + e(94), { size: e(21), color: 'rgba(244,243,238,0.7)' })
  }

  // ── flash : le voile blanc du moment du but
  const flash = createCanvas(W, H); { const ctx = flash.getContext('2d')
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(0, 0, W, H) }

  // ── les calques animés, chacun dans sa propre toile
  const carte = (w, h, peindre) => { const c = createCanvas(w, h); peindre(ctx2d(c)); return c }

  const but = carte(e(580), e(130), (ctx) => ar(ctx, 'هدف', e(290), e(65), { size: e(92), color: teinte }))
  const dom = await crest(g.homeLogo), ext = await crest(g.awayLogo)
  const ecusson = (im) => carte(e(150), e(150), (ctx) => { if (im) ctx.drawImage(im, 0, 0, e(150), e(150)) })
  const sc = carte(e(400), e(150), (ctx) => {
    txt(ctx, String(g.homeScore ?? ''), e(80), e(75), { size: e(118), font: 'Anton' })
    txt(ctx, String(g.awayScore ?? ''), e(320), e(75), { size: e(118), font: 'Anton', color: teinte })
  })
  const buteur = carte(e(580), e(70), (ctx) => ar(ctx, nomAr(g.scorer), e(290), e(35), { size: e(36) }))
  const min = carte(e(260), e(60), (ctx) => {
    txt(ctx, String(g.minute || '').replace("'", ''), e(90), e(30), { size: e(40), font: 'Anton', color: teinte, align: 'right' })
    ar(ctx, 'دقيقة', e(170), e(30), { size: e(22), align: 'left' })
  })

  // Positions de repos, calées sur la case centrale du gabarit.
  const [cx, cy, cw] = C.centre.map(e)
  return {
    bg: png(bg), flash: png(flash), goal: png(but),
    home: png(ecusson(dom)), away: png(ecusson(ext)), score: png(sc),
    scorer: png(buteur), minute: png(min),
    rest: {
      goal: [cx + (cw - e(580)) / 2, cy + e(345)],
      home: [cx + e(50), cy + e(73)],
      away: [cx + e(390), cy + e(73)],
      score: [cx + (cw - e(400)) / 2, cy + e(220)],
      scorer: [cx + (cw - e(580)) / 2, cy + e(455)],
      minute: [cx + (cw - e(260)) / 2, cy + e(510)],
    },
  }
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║ L'ALBUM DE FIN DE MATCH — gabarit « album-final », 1:1               ║
// ╚══════════════════════════════════════════════════════════════════════╝
export async function gabaritAlbumFinal(d) {
  registerBrandFonts()
  const T = 1080
  const c = createCanvas(T, T); const ctx = ctx2d(c)
  const f = await fond('album-final')
  ctx.drawImage(f, 0, 0, T, T)
  // Voile du bas : le texte doit tenir sur la photo du stade.
  const g = ctx.createLinearGradient(0, T * 0.37, 0, T)
  g.addColorStop(0, 'rgba(6,10,20,0)'); g.addColorStop(0.45, 'rgba(6,10,20,0.86)'); g.addColorStop(1, 'rgba(6,10,20,0.96)')
  ctx.fillStyle = g; ctx.fillRect(0, T * 0.37, T, T * 0.63)

  ar(ctx, 'نهاية المباراة', T / 2, 528, { size: 40, color: OR })
  const dom = await crest(d.homeLogo), ext = await crest(d.awayLogo)
  if (dom) ctx.drawImage(dom, 158, 590, 158, 158)
  if (ext) ctx.drawImage(ext, 764, 590, 158, 158)
  txt(ctx, `${d.homeScore ?? ''} – ${d.awayScore ?? ''}`, T / 2, 676, { size: 116, font: 'Anton' })
  ar(ctx, nomAr(d.home), 237, 790, { size: 25 })
  ar(ctx, nomAr(d.away), 843, 790, { size: 25 })

  // Les buteurs : minute en chiffres latins à gauche, nom en arabe à droite,
  // tracés SÉPARÉMENT (une chaîne mixte est réordonnée par le bidirectionnel).
  let y = 866
  // `goals` est la forme que le worker produit déjà (ftPosterData) ; `buts`
  // reste accepté pour les appels directs.
  for (const b of (d.buts || d.goals || []).slice(0, 8)) {
    const col = b.side === 'away' ? CREME : OR
    txt(ctx, String(b.minute || '').replace("'", '') + "'", 420, y, { size: 22, font: 'Anton', align: 'right', color: col })
    ar(ctx, nomAr(b.scorer), 442, y, { size: 22, align: 'left', color: col })
    y += 34
  }
  return c
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LE TABLEAU DE STATISTIQUES — gabarit « stats-match », 1:1            ║
// ╚══════════════════════════════════════════════════════════════════════╝
export async function gabaritStatsMatch(d) {
  registerBrandFonts()
  const T = 1080
  const c = createCanvas(T, T); const ctx = ctx2d(c)
  const f = await fond('stats-match')
  ctx.drawImage(f, 0, 0, T, T)
  const E = T / 1024
  const b = (r, rr = 8) => couvrir(ctx, r.map((n) => Math.round(n * E)), '#080C12', rr)

  b(CASES['stats-match'].entete, 6)
  ar(ctx, 'إحصائيات المباراة', 712, 106, { size: 31, color: MENTHE })
  const dom = await crest(d.homeLogo), ext = await crest(d.awayLogo)
  if (dom) ctx.drawImage(dom, 443, 158, 101, 101)
  if (ext) ctx.drawImage(ext, 880, 158, 101, 101)
  txt(ctx, `${d.homeScore ?? ''} – ${d.awayScore ?? ''}`, 712, 209, { size: 78, font: 'Anton' })
  ar(ctx, nomAr(d.home), 494, 295, { size: 23 })
  ar(ctx, nomAr(d.away), 930, 295, { size: 23, color: MENTHE })

  const [tx, ty, tw] = CASES['stats-match'].tableau.map((n) => Math.round(n * E))
  b(CASES['stats-match'].tableau, 6)
  tableauComparatif(ctx, [tx, ty, tw], d.lignes || [], { hauteurLigne: Math.round(66 * E) })

  b(CASES['stats-match'].aside, 6)
  if (d.ecart) {
    ar(ctx, 'المفارقة', 888, 469, { size: 25, color: MENTHE })
    txt(ctx, d.ecart.valeur, 888, 548, { size: 66, font: 'Anton' })
    ar(ctx, d.ecart.libelle, 888, 606, { size: 21 })
  }
  return c
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LE TABLEAU DE LA SOIRÉE — gabarit « tableau-soiree », paysage        ║
// ╚══════════════════════════════════════════════════════════════════════╝
export async function gabaritTableauSoiree(d) {
  registerBrandFonts()
  const f = await fond('tableau-soiree')
  const W = 1376, H = 768
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  ctx.drawImage(f, 0, 0)
  const b = (r, rr = 8) => couvrir(ctx, r, '#060B18', rr)

  // LE LOGO EST DESSINE ICI, pas incruste dans le fond (Mehdi, 15/10). Il est
  // vectoriel, donc net a toute taille, et il suit le theme : `paintLogo` sort
  // la version Barca ou la version neutre selon le contexte. Un logo incruste
  // ne peut pas — et `assets/logo-page.png` est l'ecusson du Barca, qui n'a
  // rien a faire sur un tableau de Ligue Europa.
  paintLogo(ctx, 48, 48, 104)
  blocQr(ctx, 1204, 592, 110)

  ar(ctx, d.titre || 'نتائج الليلة الأوروبية', 600, 120, { size: 42 })
  // Le nombre se trace À PART du texte arabe : mélangés, l'ordre s'inverse.
  ar(ctx, d.sousTitre || 'تسع مباريات', 600, 172, { size: 21, color: OR })

  const [X, Y0, LARG] = CASES['tableau-soiree'].tableau
  const lignes = (d.matchs || []).slice(0, 9)
  const LIG = 54
  b([X, Y0, LARG, lignes.length * LIG + 16], 8)
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i]
    const y = Y0 + 16 + i * LIG + LIG / 2
    if (i % 2 === 0) { ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(X + 10, y - LIG / 2 + 4, LARG - 20, LIG - 8); ctx.restore() }
    ar(ctx, nomAr(m.home), X + 370, y, { size: 24, align: 'right' })
    txt(ctx, `${m.homeScore}-${m.awayScore}`, X + 470, y, { size: 32, font: 'Anton', color: OR })
    ar(ctx, nomAr(m.away), X + 570, y, { size: 24, align: 'left' })
    const ecart = Math.abs(Number(m.homeScore) - Number(m.awayScore)) || 0
    ctx.save(); ctx.fillStyle = ecart >= 4 ? OR : 'rgba(244,243,238,0.45)'
    ctx.fillRect(X + 820, y - 7, ecart * 26, 14); ctx.restore()
    txt(ctx, `+${ecart}`, X + 1050, y, { size: 21, font: 'Archivo', align: 'right', color: ecart >= 4 ? OR : CREME })
  }

  b(CASES['tableau-soiree'].chiffres, 8)
  ar(ctx, 'أرقام الليلة', 1260, 240, { size: 22, color: OR })
  for (const [i, n] of (d.chiffres || []).slice(0, 4).entries()) {
    txt(ctx, n.valeur, 1260, 300 + i * 66, { size: 34, font: 'Anton' })
    ar(ctx, n.libelle, 1260, 328 + i * 66, { size: 16, color: 'rgba(244,243,238,0.6)' })
  }
  return c
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LES QUATRE MOMENTS — gabarit « soiree-4-moments », ouverture du reel ║
// ║ Même contrat que drawUclMatchLayers : { layers, anims }.             ║
// ╚══════════════════════════════════════════════════════════════════════╝
export async function gabaritQuatreMoments(d) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  await poser(ctx, 'soiree-4-moments', W, H)

  // Le fond livre le 15/10 ne porte plus de logo : on le dessine, vectoriel.
  paintLogo(ctx, e(40), e(40), e(96))
  blocQr(ctx, W - e(40) - e(104), e(40), e(92))

  ar(ctx, 'أربع لحظات', W / 2, e(330), { size: e(54) })
  const cases = CASES['soiree-4-moments'].moments
  const moments = (d.moments || []).slice(0, 4)
  for (let i = 0; i < Math.min(4, moments.length); i++) {
    const [x, y, w, h] = cases[i].map(e)
    ctx.save()
    ctx.beginPath(); const r = e(14)
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
    ctx.fillStyle = '#0B1536'; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore()
    const m = moments[i]
    ar(ctx, m.titre, x + w / 2, y + e(36), { size: e(21), color: OR })
    txt(ctx, String(m.minute), x + w / 2, y + e(94), { size: e(52), font: 'Anton' })
    ar(ctx, m.phrase, x + w / 2, y + e(152), { size: e(19), color: 'rgba(244,243,238,0.82)' })
  }
  // Les deux lignes du bas tombaient SUR LES TRIBUNES ECLAIREES du fond et
  // devenaient illisibles. Un voile sombre les porte, degrade des deux cotes
  // pour ne pas trancher sur la photo.
  const yB = e(880)
  const voile = ctx.createLinearGradient(0, yB - e(46), 0, yB + e(80))
  voile.addColorStop(0, 'rgba(5,8,15,0)')
  voile.addColorStop(0.35, 'rgba(5,8,15,0.88)')
  voile.addColorStop(0.75, 'rgba(5,8,15,0.88)')
  voile.addColorStop(1, 'rgba(5,8,15,0)')
  ctx.save(); ctx.fillStyle = voile; ctx.fillRect(0, yB - e(46), W, e(126)); ctx.restore()

  if (d.ligne) ar(ctx, d.ligne, W / 2, yB, { size: e(26) })
  ar(ctx, 'أفضل لحظات الليلة الأوروبية', W / 2, e(926), { size: e(22), color: 'rgba(244,243,238,0.75)' })

  return { layers: { bg: png(c) }, anims: [] }
}

// ── Petits utilitaires ─────────────────────────────────────────────────────
/** Les noms de clubs et de joueurs arrivent en latin : on les laisse tels
 *  quels faute de table de translittération. Le point d'extension est ici. */
function nomAr(n) { return String(n ?? '') }
function ligueAr(l) { return String(l ?? '') }
function texteBut(g) {
  const qui = nomAr(g.scorer)
  if (g.ownGoal) return `${qui} · هدف في مرماه`
  if (g.penalty) return `${qui} · من ركلة جزاء`
  return g.assist ? `${qui} · صناعة ${nomAr(g.assist)}` : qui
}
