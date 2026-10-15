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
import { registerBrandFonts, paintLogo, loadImgOuRepli } from './draw.js'
import { dossierGabarits, CASES, UTILE, couvrir, ar, arNombre, OR, CREME, MENTHE, tableauComparatif } from './gabarits.js'
import { jersey, pitch, lineupRows, surname, spaced } from './editorial.js'

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
export async function poserPlaque(ctx, nom, W, H) { return poser(ctx, nom, W, H) }
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
/**
 * LE BLOC D'INSCRIPTION COMPLET : le code, son voile, et les deux lignes.
 *
 * Mehdi, 15/10 : « c'est parfait comme ca pour le QR, ca va etre comme ca sur
 * tous les formats. » D'ou cette fonction unique — recopier le bloc dans
 * chaque gabarit garantissait qu'ils divergeraient a la premiere retouche.
 *
 * `cx` est le centre voulu : on centre sur la PLAQUE (code + marge de
 * silence), pas sur le code seul, sinon l'ensemble se decale.
 *
 * Les chiffres sont ceux de la page d'atterrissage du lien porte par le code
 * (https://pressing90.live/bienvenue/APMVZ2CJ) : 100 crampons et 3 analyses.
 * Les mots arabes viennent de cette meme page en ?lang=ar.
 */
function blocInscription(ctx, cx, y, taille, W, { compact = false, sansTexte = false } = {}) {
  const T = largeurQr(taille)
  blocQr(ctx, cx - T / 2, y, taille)
  // Regle de Mehdi, 15/10 : la ou la phrase ne tient pas dans la zone, on ne
  // l'ecrit PAS plutot que de la laisser deborder. Le tableau paysage n'a
  // qu'une colonne de 196 px : il porte le code seul.
  if (sansTexte) return
  const yA = y + T + (compact ? 38 : 52)
  const h = compact ? 100 : 188
  const voile = ctx.createLinearGradient(0, yA - (compact ? 32 : 54), 0, yA - (compact ? 32 : 54) + h)
  voile.addColorStop(0, 'rgba(5,8,15,0)')
  voile.addColorStop(0.3, 'rgba(5,8,15,0.9)')
  voile.addColorStop(0.78, 'rgba(5,8,15,0.9)')
  voile.addColorStop(1, 'rgba(5,8,15,0)')
  ctx.save(); ctx.fillStyle = voile; ctx.fillRect(0, yA - (compact ? 32 : 54), W, h); ctx.restore()
  if (compact) {
    // Le nombre est ENTOURE de mots arabes : en tete de ligne, l'algorithme
    // bidirectionnel l'expedie a l'autre bout et il se lit en dernier.
    ar(ctx, 'امسح واحصل على 100 كرامبون', cx, yA, { size: 24, color: OR })
  } else {
    ar(ctx, 'امسح الرمز واحصل على هديتك الترحيبية', cx, yA, { size: 31 })
    ar(ctx, 'احصل على 100 كرامبون و3 تحليلات ذكاء اصطناعي', cx, yA + 48, { size: 24, color: OR })
  }
}

/** La largeur TOTALE de la plaque, code + marge de silence. */
export const largeurQr = (taille) => taille + Math.round(taille * 0.055) * 2

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
  // RENDU EN 1920x1080 depuis le 15/10, quand Mehdi a livre la plaque en 2K.
  // Les coordonnees ci-dessous restent exprimees dans l'ancien repere de
  // 1376x768 — celui ou elles ont ete relevees au pixel — et le contexte est
  // mis a l'echelle une fois pour toutes. Les reecrire une par une n'aurait
  // apporte que des occasions de se tromper.
  const W = 1376, H = 768
  const ECH_T = 1080 / H
  // 1376 x 1,40625 = 1935, soit 15 px de trop. On cadre a 1920 pile : le
  // dessin le plus a droite (le panneau des chiffres) s'arrete a 1910.
  const c = createCanvas(1920, 1080); const ctx = ctx2d(c)
  ctx.drawImage(f, 0, 0, c.width, c.height)
  ctx.scale(ECH_T, ECH_T)
  const b = (r, rr = 8) => couvrir(ctx, r, '#060B18', rr)

  // LE LOGO EST DESSINE ICI, pas incruste dans le fond (Mehdi, 15/10). Il est
  // vectoriel, donc net a toute taille, et il suit le theme : `paintLogo` sort
  // la version Barca ou la version neutre selon le contexte. Un logo incruste
  // ne peut pas — et `assets/logo-page.png` est l'ecusson du Barca, qui n'a
  // rien a faire sur un tableau de Ligue Europa.
  paintLogo(ctx, 48, 48, 104)
  blocInscription(ctx, 1260, 586, 118, W, { sansTexte: true })

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
  blocInscription(ctx, W / 2, e(1000), e(170), W)

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


// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LE POST DES MATCHS DU JOUR — plaque « post-4-5 », 1080×1350          ║
// ║                                                                      ║
// ║ Nouvelle fonction plutot qu'une reprise de drawMatchdayPost : celle-  ║
// ║ ci est un design CLAIR, fond creme et encre bleu nuit. Poser une      ║
// ║ plaque sombre dessous rendrait tout son texte illisible. Elle reste   ║
// ║ donc intacte, disponible en repli.                                    ║
// ╚══════════════════════════════════════════════════════════════════════╝
export const MATCHS_PAR_PAGE = 7

/**
 * Rend AUTANT DE PAGES qu'il faut pour montrer toutes les rencontres, sept par
 * image (Mehdi, 15/10). Au-dela de sept, les lignes deviennent trop fines pour
 * un telephone ; en tronquant, on cachait des matchs. Les pages partent en
 * album, comme les affiches de fin de match.
 *
 * Rend un TABLEAU de toiles, meme quand il n'y en a qu'une.
 */
export async function gabaritMatchdayPost(d) {
  const tous = d.matchs || []
  const pages = Math.max(1, Math.ceil(tous.length / MATCHS_PAR_PAGE))
  const out = []
  for (let p = 0; p < pages; p++) {
    out.push(await unePageMatchday(d, tous.slice(p * MATCHS_PAR_PAGE, (p + 1) * MATCHS_PAR_PAGE), p + 1, pages))
  }
  return out
}

async function unePageMatchday(d, ms, page, pages) {
  registerBrandFonts()
  const W = 1080, H = 1350
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  await poser(ctx, 'post-4-5', W, H)

  paintLogo(ctx, 44, 44, 130)

  ar(ctx, d.titre || 'مباريات اليوم', W / 2, 232, { size: 58 })
  if (d.sousTitre) ar(ctx, d.sousTitre, W / 2, 294, { size: 24, color: OR })
  // Le numero de page n'apparait QUE s'il y en a plusieurs : sur une image
  // unique, « 1/1 » n'informe de rien et encombre.
  if (pages > 1) txt(ctx, `${page}/${pages}`, W - 56, 294, { size: 24, font: 'Archivo', align: 'right', color: OR })

  const Y0 = 352, LIG = 104
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]
    const y = Y0 + i * LIG
    couvrir(ctx, [56, y, W - 112, LIG - 14], '#070B16', 12)
    const cy = y + (LIG - 14) / 2
    const dom = await crest(m.homeLogo), ext = await crest(m.awayLogo)
    if (dom) ctx.drawImage(dom, 82, cy - 29, 58, 58)
    if (ext) ctx.drawImage(ext, W - 140, cy - 29, 58, 58)
    ar(ctx, nomAr(m.home), 166, cy, { size: 22, align: 'left' })
    ar(ctx, nomAr(m.away), W - 166, cy, { size: 22, align: 'right' })
    // L'heure ou le score, au centre : c'est ce que l'oeil cherche en premier.
    txt(ctx, m.score || m.heure || '', W / 2, cy, { size: m.score ? 36 : 30, font: 'Anton', color: OR })
  }

  // Version COMPACTE du bloc : 1350 de haut contre 1920 pour un reel, et sept
  // rencontres au-dessus. Une seule ligne d'appel, et un code plus petit.
  blocInscription(ctx, W / 2, Y0 + ms.length * LIG + 14, 148, W, { compact: true })
  return c
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LA CARTE DE REEL — plaque « reel-neutre », 1080×1920                 ║
// ║                                                                      ║
// ║ Meme contrat que drawMatchLayers / drawUclMatchLayers :              ║
// ║ (m, idx, total, heading, lang) -> { layers, anims }. Le montage      ║
// ║ n'a donc rien a savoir du changement.                                ║
// ╚══════════════════════════════════════════════════════════════════════╝
export async function gabaritMatchSlide(m, idx, total, heading, lang = 'ar') {
  registerBrandFonts()
  const W = 1080, H = 1920
  const PNG = (c) => c.toBuffer('image/png')

  // ── Le fond : plaque, marque, QR, et le titre de la competition
  const bg = createCanvas(W, H); { const ctx = ctx2d(bg)
    await poser(ctx, m.barca ? 'reel-barca' : 'reel-neutre', W, H)
    // La marque plus grande : a 96 px elle se perdait sur une plaque de nuit,
    // alors que le coin avait de la place (Mehdi, 15/10).
    paintLogo(ctx, 44, 44, 150)
    // LE QR DESCEND AU CENTRE BAS, sur les tribunes : en haut a droite il
    // concurrencait la marque et laissait un vide au milieu de la carte.
    //
    // On centre sur la PLAQUE, pas sur le code : elle porte la marge de
    // silence, et centrer sur le code seul decalait l'ensemble de 12 px a
    // droite par rapport au bandeau du dessus (vu par Mehdi, 15/10).
    blocInscription(ctx, W / 2, 1180, 220, W)
    if (heading) ar(ctx, heading, W / 2, 262, { size: 46 })
    // La pagination dit au spectateur qu'il y a une suite.
    if (total > 1) txt(ctx, `${idx + 1}/${total}`, W / 2, 324, { size: 24, font: 'Archivo', color: OR })
  }

  // ── L'ecusson de la competition, s'il est fourni. JAMAIS de valeur par
  //    defaut : un faux blason est pire qu'aucun.
  const lig = m.leagueLogo ? await crest(m.leagueLogo) : null
  // L'ECUSSON EST REPEINT EN CREME. Ceux d'ESPN sont dessines en noir sur fond
  // transparent : pose tel quel sur une plaque de nuit, il disparait purement
  // et simplement (constate sur la Ligue Europa, 15/10). On garde sa SILHOUETTE
  // et on la remplit — `source-in` ne peint que la ou le dessin existe.
  const badge = createCanvas(200, 200)
  if (lig) { const bc = badge.getContext('2d')
    bc.drawImage(lig, 0, 0, 200, 200)
    bc.globalCompositeOperation = 'source-in'
    bc.fillStyle = CREME; bc.fillRect(0, 0, 200, 200)
  }

  // ── Les deux equipes
  const dom = await crest(m.homeLogo), ext = await crest(m.awayLogo)
  const ecusson = (im) => { const c = createCanvas(260, 260); if (im) c.getContext('2d').drawImage(im, 0, 0, 260, 260); return c }

  const noms = createCanvas(W, 120); { const ctx = ctx2d(noms)
    ar(ctx, nomAr(m.home), 230, 60, { size: 34 })
    ar(ctx, nomAr(m.away), W - 230, 60, { size: 34 })
  }

  // ── Le score, ou l'heure du coup d'envoi
  const centre = createCanvas(420, 200); { const ctx = ctx2d(centre)
    if (m.score) txt(ctx, String(m.score).replace('–', ' – '), 210, 100, { size: 92, font: 'Anton', color: OR })
    else { ar(ctx, m.time || '', 210, 100, { size: 56, color: OR }) }
  }

  // ── L'etat : une pastille rouge et la minute pour un match en cours.
  const etat = createCanvas(360, 70); if (m.etat) { const ctx = ctx2d(etat)
    couvrir(ctx, [0, 0, 360, 70], '#070B16', 14)
    if (m.live) { ctx.save(); ctx.fillStyle = '#FF4D5E'; ctx.beginPath(); ctx.arc(60, 35, 11, 0, Math.PI * 2); ctx.fill(); ctx.restore() }
    ar(ctx, m.etat, m.live ? 205 : 180, 35, { size: 26, color: m.live ? '#FF4D5E' : CREME })
  }

  const layers = { bg: PNG(bg), badge: PNG(badge), noms: PNG(noms), centre: PNG(centre) }
  const anims = [
    { layer: 'badge', x: 440, y: 356, w: 200, h: 200, fade: { st: 0, d: 0.25 } },
    { layer: 'home', x: 110, y: 620, slide: { dx: -420, dy: 0, st: 0.15, d: 0.5 }, fade: { st: 0.15, d: 0.25 } },
    { layer: 'away', x: 710, y: 620, slide: { dx: 420, dy: 0, st: 0.15, d: 0.5 }, fade: { st: 0.15, d: 0.25 } },
    { layer: 'centre', x: 330, y: 650, w: 420, h: 200, pop: { from: 1.4, st: 0.35, d: 0.3 }, fade: { st: 0.35, d: 0.25 } },
    { layer: 'noms', x: 0, y: 920, fade: { st: 0.5, d: 0.3 } },
  ]
  layers.home = PNG(ecusson(dom)); layers.away = PNG(ecusson(ext))
  if (m.etat) { layers.etat = PNG(etat); anims.push({ layer: 'etat', x: 360, y: 1050, fade: { st: 0.65, d: 0.3 } }) }
  if (idx === 0 && m.cover) {
    const cv = createCanvas(W - 80, 150); const ctx = ctx2d(cv)
    couvrir(ctx, [0, 0, W - 80, 150], '#070B16', 18)
    ar(ctx, m.cover.text || '', (W - 80) / 2, 75, { size: 38 })
    layers.cover = PNG(cv)
    anims.push({ layer: 'cover', x: 40, y: 1620, fade: { st: 0, d: 0 }, out: { st: 2.6, d: 0.4 } })
  }
  return { layers, anims }
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


// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LA SOIRÉE EUROPÉENNE — plaque « reel-neutre », 1080×1920             ║
// ║                                                                      ║
// ║ POURQUOI CES DEUX FONCTIONS EXISTENT.                                ║
// ║ Le reel de soirée était bâti sur assets/ucl/ : trois plaques qui     ║
// ║ portent le logo UEFA Champions League, le ballon étoilé et le        ║
// ║ trophée PEINTS DANS LE FOND. Un soir de Ligue Europa, chaque carte   ║
// ║ sortait donc en habits de Ligue des champions — c'est l'incident du  ║
// ║ 15/10/2026, trois reels supprimés.                                   ║
// ║                                                                      ║
// ║ La plaque est désormais VIERGE et l'écusson se pose AU RENDU, celui  ║
// ║ de la vraie compétition du soir (ecussonLigue() côté worker). Une    ║
// ║ seule plaque sert les trois coupes d'Europe, et rien n'est jamais    ║
// ║ affirmé par le fond.                                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝

/**
 * L'écusson d'une compétition, repeint en crème.
 *
 * Ceux d'ESPN sont dessinés en noir sur fond transparent : posés tels quels
 * sur une plaque de nuit, ils disparaissent purement et simplement (constaté
 * sur la Ligue Europa le 15/10). On garde leur SILHOUETTE et on la remplit —
 * `source-in` ne peint que là où le dessin existe.
 *
 * Rend un canevas VIDE quand l'écusson manque, jamais un écusson par défaut :
 * c'est précisément un blason Champions posé par défaut qui a causé l'incident.
 */
async function ecussonCreme(url, taille) {
  const c = createCanvas(taille, taille)
  const img = await crest(url)
  if (!img) return c
  const x = c.getContext('2d')
  x.drawImage(img, 0, 0, taille, taille)
  x.globalCompositeOperation = 'source-in'
  x.fillStyle = CREME; x.fillRect(0, 0, taille, taille)
  return c
}

/**
 * L'OUVERTURE DU REEL DE SOIRÉE.
 *
 * `d` : { titre, phrase, leagueLogo, lang }. Même contrat de sortie que
 * drawUclMatchLayers — { layers, anims } — pour que le montage n'ait rien à
 * savoir du changement.
 */
export async function gabaritOuvertureSoiree(d = {}) {
  registerBrandFonts()
  const W = 1080, H = 1920

  const bg = createCanvas(W, H); { const ctx = ctx2d(bg)
    await poser(ctx, 'soiree-ouverture', W, H)
    paintLogo(ctx, 44, 44, 150)
    blocInscription(ctx, W / 2, 1180, 220, W)
  }

  const badge = await ecussonCreme(d.leagueLogo, 260)

  const titre = createCanvas(W, 240); { const ctx = ctx2d(titre)
    // Le nom de la compétition vient du worker, jamais d'une constante.
    if (d.titre) ar(ctx, d.titre, W / 2, 56, { size: 62 })
    if (d.phrase) ar(ctx, d.phrase, W / 2, 150, { size: 34, color: 'rgba(244,243,238,0.86)' })
  }

  return {
    layers: { bg: png(bg), badge: png(badge), titre: png(titre) },
    anims: [
      { layer: 'badge', x: 410, y: 400, w: 260, h: 260, pop: { from: 1.4, st: 0, d: 0.35 }, fade: { st: 0, d: 0.25 } },
      { layer: 'titre', x: 0, y: 720, fade: { st: 0.3, d: 0.35 } },
    ],
  }
}

/**
 * LE RÉCAPITULATIF DES RENCONTRES, quatre par carte.
 *
 * Une couche par ligne : elles entrent en cascade, et une ligne manquante ne
 * casse pas les autres. `d` : { titre, leagueLogo }.
 */
export async function gabaritRecapSoiree(matchs, page = 0, pages = 1, d = {}) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const Y0 = 500, LIG = 152

  const bg = createCanvas(W, H); { const ctx = ctx2d(bg)
    // Les tribunes en bokeh pendant la soiree ; le stade vide quand tout est
    // joue. `d.plaque` laisse le serveur choisir sans toucher au dessin.
    await poser(ctx, d.plaque || 'soiree-recap', W, H)
    paintLogo(ctx, 44, 44, 150)
    if (d.titre) ar(ctx, d.titre, W / 2, 262, { size: 46 })
    if (pages > 1) txt(ctx, `${page + 1}/${pages}`, W / 2, 322, { size: 24, color: OR })
    blocInscription(ctx, W / 2, 1180, 220, W)
  }

  const badge = await ecussonCreme(d.leagueLogo, 100)

  const layers = { bg: png(bg), badge: png(badge) }
  const anims = [{ layer: 'badge', x: 490, y: 372, w: 100, h: 100, fade: { st: 0, d: 0.25 } }]

  for (let i = 0; i < matchs.length; i++) {
    const m = matchs[i]
    const c = createCanvas(W, LIG); const ctx = ctx2d(c)
    couvrir(ctx, [60, 6, 960, 134], '#070B16', 18)
    const [dom, ext] = await Promise.all([crest(m.homeLogo), crest(m.awayLogo)])
    if (dom) ctx.drawImage(dom, 104, 36, 72, 72)
    if (ext) ctx.drawImage(ext, 904, 36, 72, 72)
    ar(ctx, nomAr(m.home), 310, 60, { size: 28 })
    ar(ctx, nomAr(m.away), 770, 60, { size: 28 })
    if (m.score) txt(ctx, String(m.score).replace('–', ' – '), W / 2, 58, { size: 50, font: 'Anton', color: OR })
    else ar(ctx, m.time || '', W / 2, 58, { size: 34, color: OR })
    // L'état se LIT sur la carte : pastille rouge et minute pour un match en
    // cours, « terminé » pour les autres. Sans lui, personne ne distingue un
    // score en route d'un résultat définitif.
    if (m.etat) {
      if (m.live) { ctx.save(); ctx.fillStyle = '#FF4D5E'; ctx.beginPath(); ctx.arc(W / 2 - 54, 110, 8, 0, Math.PI * 2); ctx.fill(); ctx.restore() }
      ar(ctx, m.etat, W / 2 + (m.live ? 10 : 0), 110, { size: 22, color: m.live ? '#FF4D5E' : 'rgba(244,243,238,0.7)' })
    }
    layers[`l${i}`] = png(c)
    anims.push({ layer: `l${i}`, x: 0, y: Y0 + i * LIG, slide: { dx: 0, dy: 26, st: 0.15 + i * 0.12, d: 0.35 }, fade: { st: 0.15 + i * 0.12, d: 0.3 } })
  }
  return { layers, anims }
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LE POST D'ARTICLE — plaque « post-4-5 », 1080×1350                   ║
// ║                                                                      ║
// ║ Remplace drawArticlePost, qui etait reste en style CLAIR (fond creme,║
// ║ encre bleu nuit) alors que tout le reste de la page est passe au     ║
// ║ style de nuit. Mehdi, 15/10 : « je veux avoir un seul style ».       ║
// ╚══════════════════════════════════════════════════════════════════════╝

/**
 * Ecrit de l'arabe sur PLUSIEURS lignes, coupe aux espaces.
 *
 * Les titres d'article font de dix a vingt mots : sur une seule ligne ils
 * sortaient du cadre ou retrecissaient jusqu'a l'illisible. On coupe aux
 * espaces — jamais a l'interieur d'un mot, l'arabe etant une ecriture liee.
 * Rend le nombre de lignes reellement ecrites, pour que l'appelant sache ou
 * reprendre.
 */
function arLignes(ctx, texte, x, y, { size = 48, maxW = 940, max = 3, interligne = 1.35, color = CREME, align = 'center' } = {}) {
  ctx.save()
  ctx.font = `bold ${size}px Tajawal`
  const mots = String(texte ?? '').trim().split(/\s+/)
  const lignes = []
  let cour = ''
  for (const m of mots) {
    const essai = cour ? `${cour} ${m}` : m
    if (ctx.measureText(essai).width <= maxW || !cour) cour = essai
    else { lignes.push(cour); cour = m; if (lignes.length === max) break }
  }
  if (lignes.length < max && cour) lignes.push(cour)
  ctx.restore()
  const h = Math.round(size * interligne)
  for (let i = 0; i < lignes.length; i++) ar(ctx, lignes[i], x, y + i * h, { size, color, align })
  return lignes.length
}

export async function gabaritArticlePost(a = {}) {
  registerBrandFonts()
  const W = 1080, H = 1350
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  await poser(ctx, 'post-4-5', W, H)
  paintLogo(ctx, 40, 40, 130)

  // Le surtitre, en or : il dit de quoi parle la page, pas ce que dit l'article.
  ar(ctx, a.kicker || 'خبر جديد', W / 2, 232, { size: 36, color: OR })

  // ── LA PHOTO, cadre arrondi et liseré crème ────────────────────────────
  // `loadImgOuRepli` et non `loadImg` : c'est le studio qui charge, donc
  // c'est lui qui decide de se rabattre (voir draw.js).
  const PX = 60, PY = 292, PW = W - 120, PH = 560
  const img = await loadImgOuRepli(a.image_url, a.repli)
  ctx.save()
  arrondi(ctx, PX, PY, PW, PH, 24); ctx.clip()
  if (img) {
    const s = Math.max(PW / img.width, PH / img.height), dw = img.width * s, dh = img.height * s
    ctx.drawImage(img, PX + (PW - dw) / 2, PY + (PH - dh) / 2, dw, dh)
  } else { ctx.fillStyle = '#0B1536'; ctx.fillRect(PX, PY, PW, PH) }
  ctx.restore()
  ctx.save(); arrondi(ctx, PX, PY, PW, PH, 24)
  ctx.strokeStyle = 'rgba(244,243,238,0.55)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore()

  // ── LE TITRE ───────────────────────────────────────────────────────────
  // Un voile le porte : sous la photo commence la pelouse eclairee de la
  // plaque, et un titre pose dessus devenait illisible.
  const TY = 912
  const voile = ctx.createLinearGradient(0, TY - 56, 0, TY + 190)
  voile.addColorStop(0, 'rgba(5,8,15,0)')
  voile.addColorStop(0.22, 'rgba(5,8,15,0.9)')
  voile.addColorStop(0.8, 'rgba(5,8,15,0.9)')
  voile.addColorStop(1, 'rgba(5,8,15,0)')
  ctx.save(); ctx.fillStyle = voile; ctx.fillRect(0, TY - 56, W, 246); ctx.restore()
  arLignes(ctx, a.title, W / 2, TY, { size: 48, maxW: 940, max: 3 })

  blocInscription(ctx, W / 2, 1118, 112, W, { compact: true })
  return c
}

/** Chemin d'un rectangle a coins arrondis. */
function arrondi(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LA CARTE D'ARTICLE EN REEL — « reel-barca » ou « reel-neutre »       ║
// ║                                                                      ║
// ║ C'est le format des infos Barça, publie chaque matin. Il etait reste ║
// ║ en style CLAIR — papier creme, encre bleu nuit — a cote de tout le   ║
// ║ reste de la page passe au style de nuit (Mehdi, 15/10 : « je veux    ║
// ║ avoir un seul style »).                                             ║
// ║                                                                      ║
// ║ Meme contrat que drawArticleLayers : (a, heading, lang) ->           ║
// ║ { layers, anims }, et les memes minutages, pour que le montage et la ║
// ║ vignette ne changent pas de comportement.                            ║
// ╚══════════════════════════════════════════════════════════════════════╝
export async function gabaritArticleSlide(a = {}, heading, lang = 'ar') {
  registerBrandFonts()
  const W = 1080, H = 1920
  const PX = 60, PY = 330, PW = W - 120, PH = 620
  const TY = 1030

  const bg = createCanvas(W, H); { const ctx = ctx2d(bg)
    // La plaque blaugrana des que la carte parle de Barcelone ; la neutre
    // sinon. Le reel des infos Barca porte donc ses couleurs sans qu'aucun
    // ecusson n'ait a etre dessine.
    await poser(ctx, a.barca === false ? 'reel-neutre' : 'reel-barca', W, H)
    paintLogo(ctx, 44, 44, 150)
    blocInscription(ctx, W / 2, 1240, 200, W)
  }

  const kicker = createCanvas(W, 100); { const ctx = ctx2d(kicker)
    ar(ctx, heading || (lang === 'ar' ? 'خبر جديد' : 'NEW ARTICLE'), W / 2, 50, { size: 46, color: OR })
  }

  // ── LA PHOTO ───────────────────────────────────────────────────────────
  // `loadImgOuRepli` et non `loadImg` : c'est le studio qui charge, donc
  // c'est lui qui decide de se rabattre (voir draw.js, 15/10/2026).
  const photo = createCanvas(PW, PH); { const ctx = ctx2d(photo)
    const img = await loadImgOuRepli(a.image_url, a.repli)
    ctx.save(); arrondi(ctx, 0, 0, PW, PH, 26); ctx.clip()
    if (img) {
      const s = Math.max(PW / img.width, PH / img.height), dw = img.width * s, dh = img.height * s
      ctx.drawImage(img, (PW - dw) / 2, (PH - dh) / 2, dw, dh)
    } else { ctx.fillStyle = '#0B1536'; ctx.fillRect(0, 0, PW, PH) }
    ctx.restore()
    ctx.save(); arrondi(ctx, 0, 0, PW, PH, 26)
    ctx.strokeStyle = 'rgba(244,243,238,0.55)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore()
  }

  // ── LE TITRE, sur son voile ────────────────────────────────────────────
  // Sous la photo commencent les tribunes eclairees de la plaque : un titre
  // pose dessus devient illisible des la deuxieme ligne.
  const titre = createCanvas(W, 250); { const ctx = ctx2d(titre)
    const v = ctx.createLinearGradient(0, 0, 0, 250)
    v.addColorStop(0, 'rgba(5,8,15,0)')
    v.addColorStop(0.18, 'rgba(5,8,15,0.9)')
    v.addColorStop(0.82, 'rgba(5,8,15,0.9)')
    v.addColorStop(1, 'rgba(5,8,15,0)')
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, 250)
    arLignes(ctx, a.title, W / 2, 62, { size: 52, maxW: 950, max: 3 })
  }

  const layers = { bg: png(bg), kicker: png(kicker), photo: png(photo), titre: png(titre) }
  if (a.cover) { const cv = createCanvas(W - 80, 150); const ctx = ctx2d(cv)
    couvrir(ctx, [0, 0, W - 80, 150], '#070B16', 18)
    ar(ctx, a.cover.text || '', (W - 80) / 2, 75, { size: 38 })
    layers.cover = png(cv) }

  const anims = a.first ? [
    // Premiere carte = vignette : tout est visible des la premiere image.
    { layer: 'photo', x: PX, y: PY, slide: { dx: 0, dy: 24, st: 0, d: 0.6 }, fade: { st: 0, d: 0 } },
    { layer: 'kicker', x: 0, y: 206, fade: { st: 0, d: 0 } },
    { layer: 'titre', x: 0, y: TY - 62, fade: { st: 0, d: 0 } },
    ...(a.cover ? [{ layer: 'cover', x: 40, y: PY + PH - 160, fade: { st: 0, d: 0 }, out: { st: 2.6, d: 0.4 } }] : []),
  ] : [
    { layer: 'photo', x: PX, y: PY, slide: { dx: 0, dy: 70, st: 0.1, d: 0.7 }, fade: { st: 0.1, d: 0.45 } },
    { layer: 'kicker', x: 0, y: 206, w: W, h: 100, pop: { from: 1.8, st: 0.55, d: 0.35 }, fade: { st: 0.55, d: 0.15 } },
    { layer: 'titre', x: 0, y: TY - 62, slide: { dx: -90, dy: 0, st: 0.85, d: 0.5 }, fade: { st: 0.85, d: 0.3 } },
  ]
  return { layers, anims }
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LES STORIES — plaque « reel-neutre » / « reel-barca », 1080×1920     ║
// ║                                                                      ║
// ║ C'est la plus grosse surface restee en style clair : dix sorties le  ║
// ║ 15/10 (six matchday-story, quatre article-story-kit). Chaque carte   ║
// ║ sert DEUX fois — en image fixe et comme unique plan de la story      ║
// ║ video — donc une seule fonction par format suffit.                   ║
// ╚══════════════════════════════════════════════════════════════════════╝

/**
 * Les rencontres du jour, en story. Six par page, le worker pagine.
 *
 * Meme signature que drawMatchStory : (matches, dateLabel, page, pages,
 * opts) -> canvas.
 */
export async function gabaritMatchdayStory(matches = [], dateLabel, page = 1, pages = 1, opts = {}) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  const vedette = opts.featured && page === 1 && matches[0]
  await poser(ctx, vedette ? 'reel-barca' : 'reel-neutre', W, H)
  paintLogo(ctx, 44, 44, 150)

  ar(ctx, vedette ? 'يوم برشلونة' : 'مباريات اليوم', W / 2, 300, { size: 68 })
  if (dateLabel) ar(ctx, String(dateLabel), W / 2, 372, { size: 26, color: OR })
  // Le numero de page n'apparait QUE s'il y en a plusieurs : sur une story
  // unique, « 1/1 » n'informe de rien.
  if (pages > 1) txt(ctx, `${page}/${pages}`, W - 64, 372, { size: 26, align: 'right', color: OR })

  const Y0 = 470, LIG = 136
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const y = Y0 + i * LIG
    couvrir(ctx, [56, y, W - 112, LIG - 16], '#070B16', 14)
    const cy = y + (LIG - 16) / 2
    const dom = await crest(m.homeLogo), ext = await crest(m.awayLogo)
    if (dom) ctx.drawImage(dom, 86, cy - 33, 66, 66)
    if (ext) ctx.drawImage(ext, W - 152, cy - 33, 66, 66)
    ar(ctx, nomAr(m.home), 178, cy, { size: 26, align: 'left' })
    ar(ctx, nomAr(m.away), W - 178, cy, { size: 26, align: 'right' })
    // L'heure ou le score, au centre : c'est ce que l'oeil cherche d'abord.
    txt(ctx, m.score || m.time || m.heure || '', W / 2, cy, { size: m.score ? 44 : 36, font: 'Anton', color: OR })
  }

  blocInscription(ctx, W / 2, Y0 + matches.length * LIG + 24, 200, W)
  return c
}

/**
 * Un article en story. Meme composition que la carte de reel, aplatie :
 * une story n'a qu'un plan, les calques n'y servent a rien.
 */
export async function gabaritArticleStory(a = {}) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const PX = 60, PY = 330, PW = W - 120, PH = 620
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  await poser(ctx, a.barca ? 'reel-barca' : 'reel-neutre', W, H)
  paintLogo(ctx, 44, 44, 150)

  ar(ctx, a.kicker || (a.lang === 'ar' ? 'خبر جديد' : 'NEW ARTICLE'), W / 2, 256, { size: 46, color: OR })

  // `loadImgOuRepli` et non `loadImg` : c'est le studio qui charge, donc
  // c'est lui qui decide de se rabattre (voir draw.js, 15/10/2026).
  const img = await loadImgOuRepli(a.image_url, a.repli)
  ctx.save(); arrondi(ctx, PX, PY, PW, PH, 26); ctx.clip()
  if (img) {
    const s = Math.max(PW / img.width, PH / img.height), dw = img.width * s, dh = img.height * s
    ctx.drawImage(img, PX + (PW - dw) / 2, PY + (PH - dh) / 2, dw, dh)
  } else { ctx.fillStyle = '#0B1536'; ctx.fillRect(PX, PY, PW, PH) }
  ctx.restore()
  ctx.save(); arrondi(ctx, PX, PY, PW, PH, 26)
  ctx.strokeStyle = 'rgba(244,243,238,0.55)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore()

  // Le titre sur son voile : sous la photo commencent les tribunes eclairees.
  const TY = 1030
  const v = ctx.createLinearGradient(0, TY - 62, 0, TY + 188)
  v.addColorStop(0, 'rgba(5,8,15,0)')
  v.addColorStop(0.18, 'rgba(5,8,15,0.9)')
  v.addColorStop(0.82, 'rgba(5,8,15,0.9)')
  v.addColorStop(1, 'rgba(5,8,15,0)')
  ctx.save(); ctx.fillStyle = v; ctx.fillRect(0, TY - 62, W, 250); ctx.restore()
  arLignes(ctx, a.title, W / 2, TY, { size: 52, maxW: 950, max: 3 })

  blocInscription(ctx, W / 2, 1300, 200, W)
  return c
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LES COMPOSITIONS — plaque « post-4-5 », 1080×1350                    ║
// ║                                                                      ║
// ║ Le maillot et le terrain viennent d'editorial.js, inchanges : ils    ║
// ║ sont deja blaugrana et or, et se lisent sur une plaque de nuit.      ║
// ║                                                                      ║
// ║ En revanche jersey() trace le NOM en bleu nuit, sans option de       ║
// ║ couleur — invisible sur cette plaque. On lui demande donc le maillot ║
// ║ sans nom et on ecrit les noms en creme par-dessus.                   ║
// ╚══════════════════════════════════════════════════════════════════════╝
export async function gabaritLineupPost(d = {}) {
  registerBrandFonts()
  const W = 1080, H = 1350
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  await poser(ctx, 'post-4-5', W, H)
  paintLogo(ctx, 36, 36, 118)

  const prevue = d.predicted !== false
  ar(ctx, prevue ? 'التشكيلة المتوقعة' : 'التشكيلة الرسمية', W / 2, 198, { size: 56 })
  txt(ctx, `${d.home || ''}  v  ${d.away || ''}`.toUpperCase(), W / 2, 256, { size: 30, font: 'Archivo' })
  // La competition et le schema sur la meme ligne, en or. Le schema est un
  // nombre : il se trace en Archivo, et SEPAREMENT du texte arabe, sinon le
  // bidi l'envoie a l'autre bout de la ligne.
  if (d.leagueAr) ar(ctx, d.leagueAr, W / 2, 302, { size: 24, color: OR })
  if (d.formation) txt(ctx, d.formation, W - 56, 302, { size: 26, align: 'right', color: OR })

  const X = pitch(ctx, 120, 340, 840, 700, { topW: 0.88, color: 'rgba(244,243,238,0.4)' })
  const rangs = lineupRows(d.players || [], d.formation)
  const ys = [965, 830, 695, 560].slice(0, rangs.length)
  const TAILLE = 98
  rangs.forEach((rang, ri) => {
    const n = rang.length, pas = n === 1 ? 0 : Math.min(230, 700 / (n - 1))
    rang.forEach((p, i) => {
      const u = 0.5 + ((i - (n - 1) / 2) * pas) / 840
      const x = X(u, ys[ri]), y = ys[ri] - Math.round(TAILLE * 0.7)
      jersey(ctx, x, y, TAILLE, { kind: ri === 0 ? 'gk' : (d.kit || 'home'), number: p.jersey || '' })
      spaced(ctx, String(surname(p.name)).toUpperCase(), x, y + TAILLE + 28, {
        size: 18, align: 'center', tracking: 0.12, color: CREME,
      })
    })
  })

  blocInscription(ctx, W / 2, 1090, 124, W, { compact: true })
  return c
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LA COUVERTURE FOOTBALL STORIES — plaque « tableau-soiree », 1200×675 ║
// ║                                                                      ║
// ║ 1200×675 est conserve : c'est la taille que reclame Facebook pour    ║
// ║ une image de partage, et la fiche d'article s'en sert en bandeau.    ║
// ║ La plaque de soiree est en 16:9 comme elle, donc elle lui va.        ║
// ║                                                                      ║
// ║ PAS DE CODE QR ICI, et c'est deliberе : cette image est la banniere  ║
// ║ de l'article SUR le site et l'apercu du lien sur Facebook. Un code   ║
// ║ qui renvoie au site, affiche sur le site, ne sert a personne — et    ║
// ║ dans un fil il est trop petit pour etre lu.                          ║
// ╚══════════════════════════════════════════════════════════════════════╝

/** Coupe un texte en lignes aux espaces, dans la police demandee. */
function txtLignes(ctx, texte, x, y, { size = 48, font = 'Archivo', poids = '900', maxW = 900, max = 4, interligne = 1.3, color = CREME, align = 'left' } = {}) {
  ctx.save()
  ctx.font = `${poids} ${size}px ${font}`
  const mots = String(texte ?? '').trim().split(/\s+/)
  const lignes = []
  let cour = ''
  for (const m of mots) {
    const essai = cour ? `${cour} ${m}` : m
    if (ctx.measureText(essai).width <= maxW || !cour) cour = essai
    else { lignes.push(cour); cour = m; if (lignes.length === max) break }
  }
  if (lignes.length < max && cour) lignes.push(cour)
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'
  const h = Math.round(size * interligne)
  lignes.forEach((l, i) => ctx.fillText(l, x, y + i * h))
  ctx.restore()
  return lignes.length
}

export async function gabaritTaleCover(d = {}) {
  registerBrandFonts()
  const W = 1200, H = 675
  const arabe = (d.lang || 'en') === 'ar'
  const c = createCanvas(W, H); const ctx = ctx2d(c)
  await poser(ctx, 'tableau-soiree', W, H)

  // Un voile part du cote ou le texte est aligne : l'accroche descend jusque
  // sur la pelouse eclairee de la plaque, ou elle devient illisible.
  const voile = ctx.createLinearGradient(arabe ? W : 0, 0, arabe ? 0 : W, 0)
  voile.addColorStop(0, 'rgba(5,8,15,0.92)')
  voile.addColorStop(0.45, 'rgba(5,8,15,0.74)')
  voile.addColorStop(0.78, 'rgba(5,8,15,0.22)')
  voile.addColorStop(1, 'rgba(5,8,15,0)')
  ctx.save(); ctx.fillStyle = voile; ctx.fillRect(0, 0, W, H); ctx.restore()

  paintLogo(ctx, arabe ? W - 36 - 92 : 36, 32, 92)

  // L'ANNEE EN FILIGRANE, derriere le texte : elle date l'histoire d'un coup
  // d'oeil sans prendre de place. Chiffres latins, comme partout.
  if (d.year) {
    ctx.save(); ctx.font = '900 210px Archivo'; ctx.fillStyle = 'rgba(204,172,97,0.14)'
    ctx.textAlign = arabe ? 'left' : 'right'; ctx.textBaseline = 'alphabetic'
    ctx.fillText(String(d.year), arabe ? 24 : W - 24, H - 18); ctx.restore()
  }

  const X = arabe ? W - 56 : 56
  if (d.kicker) {
    if (arabe) ar(ctx, d.kicker, X, 150, { size: 30, color: OR, align: 'right' })
    else txtLignes(ctx, d.kicker, X, 150, { size: 26, font: 'Archivo', maxW: 900, max: 1, color: OR, align: 'left' })
  }
  if (arabe) arLignes(ctx, d.hook, X, 250, { size: 48, maxW: 920, max: 3, interligne: 1.32, align: 'right' })
  else txtLignes(ctx, d.hook, X, 250, { size: 48, font: 'Playfair', maxW: 920, max: 3, interligne: 1.32 })

  txt(ctx, 'PRESSING90.LIVE', arabe ? W - 56 : 56, H - 42, { size: 18, font: 'Archivo', align: arabe ? 'right' : 'left', color: 'rgba(244,243,238,0.8)' })
  return c
}
