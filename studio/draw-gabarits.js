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
import { registerBrandFonts, paintLogo, loadImgOuRepli, coverBand } from './draw.js'
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

/**
 * LA PEAU BLAUGRANA NE SE DONNE PAS SUR DEMANDE.
 *
 * Elle se declenchait sur un simple drapeau de l'appelant, et une carte
 * Lyon - Crystal Palace pouvait sortir sur le stade du Barca (Mehdi,
 * 16/10/2026). C'est la meme faute que l'ecusson Champions pose par defaut un
 * soir de Ligue Europa — un habit de club sur un match qui ne le concerne
 * pas — et celle-la avait coute trois publications supprimees.
 *
 * On exige donc les DEUX : que l'appelant la demande, et que Barcelone soit
 * nommee quelque part. L'ecriture arabe est incluse : les titres de la page
 * sont en arabe.
 */
const BARCA = /barcelona|barça|barca|برشلونة/i
const peauBarca = (demande, ...textes) => !!demande && BARCA.test(textes.filter(Boolean).join(' '))

const crests = new Map()
async function crest(url) {
  if (!url) return null
  if (crests.has(url)) return crests.get(url)
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error('http ' + r.status)
    const img = await loadImage(Buffer.from(await r.arrayBuffer()))
    if (crests.size > 24) crests.clear()
    const sortie = lisibleSurFondSombre(img)
    crests.set(url, sortie); return sortie
  } catch { return null }
}

/**
 * UN ECUSSON NOIR SUR UNE PLAQUE DE NUIT NE SE VOIT PAS.
 *
 * Mesure le 16/10/2026 sur la luminance moyenne des pixels opaques :
 * Juventus **0/255** — du noir pur — contre Milan 108, Barcelone 109, Real
 * Madrid 151. Le seuil est donc franc, et il n'y a pas besoin d'une liste de
 * clubs a maintenir : on mesure, et on ne repeint que ce qui est illisible.
 *
 * On garde la SILHOUETTE et on la remplit — `source-in` ne peint que la ou le
 * dessin existe. C'est la meme technique que pour les ecussons de
 * competition, dont celui de la Ligue Europa disparaissait de la meme façon.
 */
function lisibleSurFondSombre(img) {
  const N = 160   // on mesure sur une reduction : le verdict est le meme, le cout est divise par dix
  const p = createCanvas(N, N); const pc = p.getContext('2d')
  pc.drawImage(img, 0, 0, N, N)
  const d = pc.getImageData(0, 0, N, N).data
  let opaques = 0, somme = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue
    opaques++; somme += (d[i] + d[i + 1] + d[i + 2]) / 3
  }
  if (!opaques || somme / opaques >= 42) return img
  const c = createCanvas(img.width || 500, img.height || 500); const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0, c.width, c.height)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = CREME; ctx.fillRect(0, 0, c.width, c.height)
  return c
}

/** Pose un fond à l'échelle de la chaîne, et prolonge le bas si besoin. */
export async function poserPlaque(ctx, nom, W, H) { return poser(ctx, nom, W, H) }

/**
 * Oublie une plaque decodee.
 *
 * Le cache `fonds` garde l'image decodee pour toute la vie du processus, ce
 * qui est le bon choix dans le serveur : il repose la meme plaque a chaque
 * rendu. Mais l'animation de but tourne dans un ENFANT plafonne a 256 Mo
 * (goalanim-cli.js) qui ne la pose QU'UNE FOIS, au moment du fond : 8 Mo de
 * pixels y restent ensuite immobilises pour rien, et ce rendu travaille deja
 * au bord de son plafond.
 */
export function libererPlaque(nom) { fonds.delete(nom) }
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
function blocInscription(ctx, cx, y, taille, W, { compact = false, sansTexte = false, lang = 'ar' } = {}) {
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
    // LA LANGUE SUIT LE FORMAT. Les publications de la page sont en arabe et
    // le restent par defaut ; le ticket d'un joueur, lui, sort dans SA langue
    // — une story francaise qui se termine par une ligne arabe ne ressemble a
    // rien (Mehdi, 17/10/2026).
    //
    // Le nombre est ENTOURE de mots arabes : en tete de ligne, l'algorithme
    // bidirectionnel l'expedie a l'autre bout et il se lit en dernier.
    if (lang === 'fr') txt(ctx, 'Scanne et reçois 100 crampons', cx, yA, { size: 24, color: OR })
    else if (lang === 'en') txt(ctx, 'Scan and get 100 crampons', cx, yA, { size: 24, color: OR })
    else ar(ctx, 'امسح واحصل على 100 كرامبون', cx, yA, { size: 24, color: OR })
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
  // ── LA PEAU BARCA EST RESERVEE A BARCELONE ───────────────────────────
  // `special` suffisait a la declencher : une carte Lyon - Crystal Palace
  // pouvait sortir sur le stade blaugrana (Mehdi, 16/10/2026). C'est la meme
  // faute que l'ecusson Champions pose par defaut sur une soiree d'Europa —
  // un habit de club sur un match qui ne le concerne pas. La demande ne
  // suffit donc plus : il faut que Barcelone joue.
  const barca = peauBarca(g.special === 'barca', g.home, g.away)
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
    // Sans precision a donner, la ligne d'appel remonte au centre du pied
    // plutot que de laisser un blanc au-dessus d'elle.
    const precision = texteBut(g)
    if (precision) {
      ar(ctx, precision, px + pw / 2, py + e(46), { size: e(26) })
      ar(ctx, 'كل الأهداف والإحصائيات على الموقع', px + pw / 2, py + e(94), { size: e(21), color: 'rgba(244,243,238,0.7)' })
    } else {
      ar(ctx, 'كل الأهداف والإحصائيات على الموقع', px + pw / 2, py + e(70), { size: e(23), color: 'rgba(244,243,238,0.8)' })
    }

    // ── LA MARQUE ET LE CODE SONT DESSINES, PAS INCRUSTES ──────────────
    // Cette carte n'en dessinait aucun des deux : ceux qu'on voyait etaient
    // PEINTS DANS LA MAQUETTE d'origine — c'est-a-dire l'ANCIEN logo, celui
    // que Mehdi a fait retirer partout le 15/10, et un faux code QR. La
    // plaque est nue depuis le 16/10, donc les voici, comme sur les autres
    // formats.
    paintLogo(ctx, 44, 44, 150)
    blocInscription(ctx, W / 2, 1664, 120, W, { compact: true })
  }

  // ── flash : le voile blanc du moment du but
  const flash = createCanvas(W, H); { const ctx = flash.getContext('2d')
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(0, 0, W, H) }

  // ── les calques animés, chacun dans sa propre toile
  const carte = (w, h, peindre) => { const c = createCanvas(w, h); peindre(ctx2d(c)); return c }

  const but = carte(e(580), e(130), (ctx) => ar(ctx, 'هدف', e(290), e(65), { size: e(92), color: teinte }))
  const dom = await crest(g.homeLogo), ext = await crest(g.awayLogo)
  const ECU = e(150), DEMI = e(170)   // demi-distance entre les deux centres
  const ecusson = (im) => carte(ECU, ECU, (ctx) => { if (im) ctx.drawImage(im, 0, 0, ECU, ECU) })
  // ── LE SCORE TOMBE SOUS SON ECUSSON ────────────────────────────────
  // Il etait dessine a des positions fixes dans une toile de 563 px, alors
  // que les ecussons se deduisent, eux, du centre de la carte : les chiffres
  // tombaient 70 px EN DEDANS de leur ecusson (Mehdi, 17/10/2026). La toile
  // fait desormais la largeur de la case et les deux chiffres reprennent
  // exactement le demi-ecart des ecussons.
  const LARG = CASES[nom].centre[2]
  const sc = carte(e(LARG), e(150), (ctx) => {
    txt(ctx, String(g.homeScore ?? ''), e(LARG) / 2 - DEMI, e(75), { size: e(118), font: 'Anton' })
    txt(ctx, String(g.awayScore ?? ''), e(LARG) / 2 + DEMI, e(75), { size: e(118), font: 'Anton', color: teinte })
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
    // Les TAILLES REELLES des calques, a cote de leurs positions. Sans
    // elles, l'animation devinait — et `pop` exige w/h : 580x130 passes a la
    // main sur un calque qui fait 816x183 l'ont reduit ET decale de 118 px a
    // gauche, en public, sur le but de Rodri (17/10/2026).
    tailles: {
      goal: [e(580), e(130)],
      home: [ECU, ECU], away: [ECU, ECU],
      score: [e(LARG), e(150)],
      scorer: [e(580), e(70)],
      minute: [e(260), e(60)],
    },
    rest: {
      goal: [cx + (cw - e(580)) / 2, cy + e(345)],
      // Poses en dur, ils tombaient 77 px a GAUCHE du centre de la carte
      // (mesure le 16/10/2026). Ils se deduisent desormais de ce centre :
      // meme ecart entre eux, mais symetrique.
      home: [cx + cw / 2 - DEMI - ECU / 2, cy + e(73)],
      away: [cx + cw / 2 + DEMI - ECU / 2, cy + e(73)],
      score: [cx, cy + e(220)],
      scorer: [cx + (cw - e(580)) / 2, cy + e(455)],
      minute: [cx + (cw - e(260)) / 2, cy + e(510)],
    },
  }
}

/**
 * LE REEL DE BUT, SUR LE GABARIT — même spécification d'animation que
 * `drawGoalAnimSpec`, mais avec les calques du gabarit.
 *
 * ── POURQUOI IL A FALLU CELLE-CI ──────────────────────────────────────────
 * `gabaritGoalLayers` existait depuis le 16/10 et la branche IMAGE du studio
 * l'utilisait déjà. Mais le reel — le seul chemin que l'automatisation
 * emprunte quand un but tombe — passait par `drawGoalAnimSpec`, qui tire ses
 * calques de `drawGoalLayers`, c'est-à-dire l'ANCIENNE carte crème à
 * confettis. Le but de Lamine Yamal du 17/10 est sorti comme ça, en public.
 * Le gabarit était fait ; il n'était simplement jamais atteint.
 *
 * Les positions de repos viennent de `rest`, donc du gabarit lui-même : rien
 * n'est écrit en dur ici, et une retouche de plaque se propage toute seule.
 * Seule la bande d'accroche a sa place propre — en HAUT, dans la seule zone
 * libre de la plaque : l'en-tête, la case centrale, le pied et le bloc
 * d'inscription occupent tout le reste.
 */
export async function gabaritGoalAnimSpec(g) {
  const L = await gabaritGoalLayers(g)
  const r = L.rest
  // Les tailles viennent du gabarit : `pop` les exige, et les ecrire a la
  // main reduit et decale le calque (voir `tailles` dans gabaritGoalLayers).
  const T = L.tailles
  return {
    // PAS de vidéo de confettis sous la carte : elle servait à l'ancienne
    // carte, qui était transparente. La plaque est opaque — la vidéo serait
    // téléchargée, montée, et jamais vue.
    layers: {
      bg: L.bg, flash: L.flash, goal: L.goal, home: L.home, away: L.away,
      score: L.score, scorer: L.scorer, minute: L.minute,
      cover: coverBand(g.cover).toBuffer('image/png'),
    },
    // Timings identiques à ceux qui ont été validés : tout est à l'écran
    // avant la demi-seconde, le mouvement n'est qu'un accent (audit du
    // 13/09 : 80 à 85 % des spectateurs partent avant 3 s).
    anims: [
      { layer: 'flash', x: 0, y: 0, fade: { st: 0, d: 0.06 }, out: { st: 0.12, d: 0.6 } },
      { layer: 'goal', x: r.goal[0], y: r.goal[1], w: T.goal[0], h: T.goal[1], pop: { from: 1.22, st: 0, d: 0.35 }, fade: { st: 0, d: 0 } },
      { layer: 'home', x: r.home[0], y: r.home[1], slide: { dx: -50, dy: 0, st: 0, d: 0.4 }, fade: { st: 0, d: 0 } },
      { layer: 'away', x: r.away[0], y: r.away[1], slide: { dx: 50, dy: 0, st: 0, d: 0.4 }, fade: { st: 0, d: 0 } },
      { layer: 'score', x: r.score[0], y: r.score[1], slide: { dx: 0, dy: 18, st: 0, d: 0.35 }, fade: { st: 0, d: 0 } },
      { layer: 'scorer', x: r.scorer[0], y: r.scorer[1], fade: { st: 0, d: 0 } },
      { layer: 'minute', x: r.minute[0], y: r.minute[1], fade: { st: 0, d: 0 } },
      { layer: 'cover', x: 40, y: 196, fade: { st: 0, d: 0 }, out: { st: 2.6, d: 0.4 } },
    ],
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
  // ── LA COMPOSITION SE CALCULE, ELLE N'EST PAS POSEE EN DUR ────────────
  // Les reperes etaient fixes : un 7-2 a neuf buts debordait du cadre et deux
  // buts laissaient 230 px de vide (Mehdi, 16/10/2026). La hauteur du bloc
  // se deduit maintenant du contenu, et le bloc est centre.
  //
  // Et LES BUTEURS SONT SOUS LEUR EQUIPE : ceux de gauche sous l'ecusson de
  // gauche, ceux de droite sous celui de droite. Une liste melangee obligeait
  // a lire la couleur pour savoir qui avait marque.
  const tous = d.buts || d.goals || []
  const butsDom = tous.filter((b) => b.side !== 'away').slice(0, 8)
  const butsExt = tous.filter((b) => b.side === 'away').slice(0, 8)
  const lignes = Math.max(butsDom.length, butsExt.length)

  const PAS = 40, ECUS = 150
  const total = 44 + 28 + ECUS + 58 + (lignes ? 28 + lignes * PAS : 0)
  // Legerement sous le centre geometrique : l'oeil place le centre optique
  // un peu plus haut que le milieu exact.
  const y0 = Math.max(300, Math.round((T - total) / 2) + 26)

  // Le voile commence AU-DESSUS du bloc, quelle que soit sa hauteur.
  const hv = Math.max(0, y0 - 90)
  const g = ctx.createLinearGradient(0, hv, 0, T)
  g.addColorStop(0, 'rgba(6,10,20,0)'); g.addColorStop(0.3, 'rgba(6,10,20,0.9)'); g.addColorStop(1, 'rgba(6,10,20,0.97)')
  ctx.fillStyle = g; ctx.fillRect(0, hv, T, T - hv)

  ar(ctx, 'نهاية المباراة', T / 2, y0 + 22, { size: 40, color: OR })
  const yE = y0 + 44 + 28
  const dom = await crest(d.homeLogo), ext = await crest(d.awayLogo)
  if (dom) ctx.drawImage(dom, 160, yE, ECUS, ECUS)
  if (ext) ctx.drawImage(ext, T - 160 - ECUS, yE, ECUS, ECUS)
  txt(ctx, `${d.homeScore ?? ''} – ${d.awayScore ?? ''}`, T / 2, yE + ECUS / 2 + 6, { size: 112, font: 'Anton' })
  const CD = 160 + ECUS / 2, CE = T - 160 - ECUS / 2
  ar(ctx, nomAr(d.home), CD, yE + ECUS + 38, { size: 25 })
  ar(ctx, nomAr(d.away), CE, yE + ECUS + 38, { size: 25 })

  // La minute est un nombre et le nom de l'arabe : arNombre les trace
  // SEPAREMENT et centre la paire, sinon le bidirectionnel renvoie la minute
  // a l'autre bout de la ligne.
  const yB = yE + ECUS + 58 + 28
  const colonne = (liste, cx, couleur) => liste.forEach((b, i) =>
    arNombre(ctx, nomAr(b.scorer), String(b.minute || '').replace("'", '') + "'", cx, yB + i * PAS, { size: 23, color: couleur }))
  colonne(butsDom, CD, OR)
  colonne(butsExt, CE, CREME)
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
  // Le titre dit DE QUELLE PERIODE il s'agit : la meme carte sort a la pause
  // avec les chiffres de la premiere mi-temps, puis au coup de sifflet final
  // avec ceux de la seconde (Mehdi, 16/10/2026).
  ar(ctx, d.titre || 'إحصائيات المباراة', 712, 106, { size: 31, color: MENTHE })
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

  // ── LA MARQUE ET LE CODE, DESSINES ────────────────────────────────────
  // Ils etaient PEINTS DANS LA MAQUETTE, avec les cadres et les mots
  // « HOME TEAM » / « AWAY TEAM » qui transparaissaient sous la carte. La
  // plaque est nue depuis le 16/10/2026 : ils occupent les deux zones
  // qu'ils occupaient deja, mais a la taille des autres formats et, pour le
  // code, modifiable.
  // 190 et non 150 : ici la marque occupe un bloc a elle, laisse libre par
  // l'entete decale a droite. A la taille des autres formats elle s'y perdait.
  paintLogo(ctx, 102, 108, 190)

  // Le bloc d'inscription complet tire un voile SUR TOUTE LA LARGEUR, qui
  // traverserait le tableau. Ici le code est pose seul et sa ligne d'appel
  // est ecrite sous lui, dans son propre coin.
  const CXQ = 912, YQ = 788, TQ = 148
  blocInscription(ctx, CXQ, YQ, TQ, T, { sansTexte: true })
  const yA = YQ + largeurQr(TQ) + 34
  const voile = ctx.createLinearGradient(749, 0, 1080, 0)
  voile.addColorStop(0, 'rgba(5,8,15,0)'); voile.addColorStop(0.25, 'rgba(5,8,15,0.9)')
  voile.addColorStop(0.85, 'rgba(5,8,15,0.9)'); voile.addColorStop(1, 'rgba(5,8,15,0)')
  ctx.save(); ctx.fillStyle = voile; ctx.fillRect(749, yA - 28, 331, 58); ctx.restore()
  ar(ctx, 'امسح واحصل على 100 كرامبون', CXQ, yA, { size: 21, color: OR })
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
    // ── FOND VIDEO OU PLAQUE (Mehdi, 20/10/2026) ──────────────────────
    // « Utilise cette video comme gabarit, seuls les textes changent ; tu
    // remets le logo, le QR, etc. » Le moteur sait deja poser une video en
    // boucle SOUS les calques (`spec.bgVideo` dans animSlide) : il suffit
    // que ce calque-ci cesse d'etre opaque. On ne pose donc plus la plaque,
    // on pose un VOILE — et le logo, le QR et le titre restent dessines
    // ici, au-dessus de la video, exactement comme avant.
    if (m.bgVideo) voileSurVideo(ctx, W, H)
    else await poser(ctx, peauBarca(m.barca, m.home, m.away) ? 'reel-barca' : 'reel-neutre', W, H)
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
  // ── « LE LIEN EST EN COMMENTAIRE », ET CA CLIGNOTE (Mehdi, 20/10/2026)
  // Les reels de resumes portent le lien de la journee en commentaire —
  // une description de reel n'est pas cliquable sur Facebook. Encore
  // faut-il que le spectateur le SACHE : sur une vidéo de cinq secondes
  // il n'ira pas chercher. Le bandeau clignote pour attirer l'oeil sans
  // occuper le centre de la carte, et il n'apparait que si on le demande
  // (`m.lienCommentaire`) : les reels de resultats n'en ont pas besoin,
  // leur commentaire n'est pas la raison d'etre du post.
  if (m.lienCommentaire) {
    const lw = W - 160
    const lc = createCanvas(lw, 110); const ctx = ctx2d(lc)
    couvrir(ctx, [0, 0, lw, 110], '#070B16', 20)
    ar(ctx, 'الرابط في التعليقات 👇', lw / 2, 55, { size: 40, color: OR })
    layers.lien = PNG(lc)
    // Debut a 1,2 s : la carte a le temps de se poser avant qu'un element
    // ne se mette a bouger. Cycle de 0,9 s dont 0,55 visible — un rythme
    // qui accroche sans faire stroboscope.
    anims.push({ layer: 'lien', x: 80, y: 1440, blink: { st: 1.2, period: 0.9, on: 0.55 } })
  }
  if (idx === 0 && m.cover) {
    const cv = createCanvas(W - 80, 150); const ctx = ctx2d(cv)
    couvrir(ctx, [0, 0, W - 80, 150], '#070B16', 18)
    ar(ctx, m.cover.text || '', (W - 80) / 2, 75, { size: 38 })
    layers.cover = PNG(cv)
    anims.push({ layer: 'cover', x: 40, y: 1620, fade: { st: 0, d: 0 }, out: { st: 2.6, d: 0.4 } })
  }
  // `server.js` lit `specs[i].bgVideo` : sans ce renvoi, la video est
  // demandee puis perdue, et le reel sort sur fond noir. C'est ce qui
  // arrivait au fond bokeh du Barca depuis que cette carte est devenue
  // celle par defaut (15/10) — son `ms[0].bgVideo` n'allait nulle part.
  return { layers, anims, bgVideo: m.bgVideo || undefined }
}

/**
 * LE VOILE QUI REND UNE VIDEO LISIBLE.
 *
 * Une plaque opaque garantissait le contraste ; une video de stade, non —
 * un projecteur qui passe derriere un score blanc l'efface. Le voile
 * rattrape ca en trois couches, et aucune n'est decorative :
 *
 *   · un assombrissement general, pour que l'image cesse de concurrencer
 *     le texte ;
 *   · deux degrades aux extremites, la ou vivent le titre et le QR — un
 *     QR ne se lit QUE sur fond franc, c'est la partie non negociable ;
 *   · un creux sombre au centre, sous les ecussons et le score.
 *
 * On ne touche pas a la video elle-meme : elle reste nette au milieu des
 * zones vides, ou c'est elle qu'on veut voir.
 */
function voileSurVideo(ctx, W, H) {
  ctx.save()
  ctx.fillStyle = 'rgba(5, 8, 15, 0.46)'
  ctx.fillRect(0, 0, W, H)

  const haut = ctx.createLinearGradient(0, 0, 0, 420)
  haut.addColorStop(0, 'rgba(5, 8, 15, 0.86)')
  haut.addColorStop(1, 'rgba(5, 8, 15, 0)')
  ctx.fillStyle = haut; ctx.fillRect(0, 0, W, 420)

  const bas = ctx.createLinearGradient(0, H - 560, 0, H)
  bas.addColorStop(0, 'rgba(5, 8, 15, 0)')
  bas.addColorStop(0.55, 'rgba(5, 8, 15, 0.80)')
  bas.addColorStop(1, 'rgba(5, 8, 15, 0.94)')
  ctx.fillStyle = bas; ctx.fillRect(0, H - 560, W, 560)

  const centre = ctx.createRadialGradient(W / 2, 700, 60, W / 2, 700, 620)
  centre.addColorStop(0, 'rgba(5, 8, 15, 0.62)')
  centre.addColorStop(1, 'rgba(5, 8, 15, 0)')
  ctx.fillStyle = centre; ctx.fillRect(0, 180, W, 1100)
  ctx.restore()
}

// ── Petits utilitaires ─────────────────────────────────────────────────────
/** Les noms de clubs et de joueurs arrivent en latin : on les laisse tels
 *  quels faute de table de translittération. Le point d'extension est ici. */
function nomAr(n) { return String(n ?? '') }
function ligueAr(l) { return String(l ?? '') }
/**
 * La ligne du pied : ce qu'on sait du but EN PLUS de son auteur.
 *
 * Elle repetait le nom du buteur, qui est deja un calque anime au centre de
 * la carte — « Lamine Yamal » deux fois sur la meme image (17/10/2026). Le
 * pied ne porte plus que la precision : penalty, csc, ou le passeur. Sans
 * precision, il reste vide et la ligne n'est pas dessinee.
 */
function texteBut(g) {
  if (g.ownGoal) return 'هدف في مرماه'
  if (g.penalty) return 'من ركلة جزاء'
  return g.assist ? `صناعة ${nomAr(g.assist)}` : ''
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
    // Cette carte prenait la peau blaugrana PAR DEFAUT : tout article sans
    // drapeau explicite en heritait. Elle se merite desormais, comme ailleurs.
    await poser(ctx, peauBarca(a.barca !== false, a.title) ? 'reel-barca' : 'reel-neutre', W, H)
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
  const vedette = peauBarca(opts.featured && page === 1, matches[0]?.home, matches[0]?.away)
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
  await poser(ctx, peauBarca(a.barca, a.title, a.kicker) ? 'reel-barca' : 'reel-neutre', W, H)
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



// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LE TICKET GAGNANT — gabarit « ticket-gagnant », 1080x1920 (story)    ║
// ╚══════════════════════════════════════════════════════════════════════╝
/**
 * Le pari gagné d'un joueur, prêt à partir en story.
 *
 * ── CE QU'ON MONTRE, ET POURQUOI ──────────────────────────────────────────
 * Un ticket de bookmaker affiche une cote et un gain, et ça ne raconte rien :
 * le lecteur ne sait pas si le pari était osé ou évident. Deux chiffres de
 * plus le disent, et nous sommes les seuls à les avoir :
 *
 *   · LA CHANCE IMPLICITE (100 / cote) — « 19 % de chances ». C'est l'audace
 *     du pari, dans la seule unité que tout le monde comprend.
 *   · LA PART DES PARIEURS qui avaient fait le même choix — « 12 % l'avaient
 *     vu ». Un bookmaker ne peut pas l'écrire : il ne connaît pas les autres
 *     joueurs. Nous, si. C'est ce chiffre qui transforme un ticket en fierté.
 *
 * ── DEUX PLAQUES, DEUX GÉOMÉTRIES ─────────────────────────────────────────
 * La ligne de perforation ne tombe pas au même endroit sur les deux fonds :
 * à 51,5 % sur le neutre, à 63 % sur le blaugrana. Les zones sont donc
 * relevées par plaque, et c'est la plaque qui décide où vont les jambes du
 * pari — dans le talon quand il est grand (neutre), au-dessus de la ligne
 * quand il est petit (Barça). Déduire l'une de l'autre donnerait du texte
 * posé sur la perforation.
 *
 * ── LA PEAU BLAUGRANA NE SE DONNE PAS SUR DEMANDE ─────────────────────────
 * Même règle que partout : il faut que l'appelant la demande ET que Barcelone
 * soit nommée dans le pari. Un combiné sans le Barça ne peut pas la prendre.
 */
const TICKET = {
  'ticket-gagnant':       { haut: [235, 300, 600, 655], bas: [235, 1025, 600, 450], jambes: 'bas',  qr: 1672 },
  'ticket-gagnant-barca': { haut: [225, 355, 635, 825], bas: [225, 1240, 635, 300], jambes: 'haut', qr: 1672 },
}

const MOTS = {
  fr: { gagne: 'PARI GAGNÉ', chance: '{n} % de chances', vu: '{n} % l’avaient vu',
        mise: 'MISE', gain: 'GAIN', autres: '+{n} autres', nul: 'Nul' },
  en: { gagne: 'BET WON', chance: '{n}% chance', vu: '{n}% called it',
        mise: 'STAKE', gain: 'PAYOUT', autres: '+{n} more', nul: 'Draw' },
  // Le nombre doit etre ENTOURE de mots arabes : un signe en bout de chaine
  // est expedie a l'autre extremite par l'algorithme bidirectionnel — « ٪ »
  // s'est retrouve tout a gauche de « حظوظه 18 ».
  ar: { gagne: 'رهان رابح', chance: 'حظوظه {n} بالمئة', vu: 'توقّعه {n} ٪ فقط',
        mise: 'الرهان', gain: 'المكسب', autres: 'و{n} أخرى', nul: 'تعادل' },
}

export async function gabaritTicketGagnant(d = {}) {
  registerBrandFonts()
  const W = 1080, H = 1920
  const lang = ['fr', 'en', 'ar'].includes(d.lang) ? d.lang : 'en'
  const m = MOTS[lang]
  const rtl = lang === 'ar'
  // Les chiffres restent LATINS en arabe, comme partout sur le site.
  const n = (v) => Number(v ?? 0).toLocaleString(lang === 'ar' ? 'ar-u-nu-latn' : lang)
  // Une ligne de texte, dans la bonne écriture. L'arabe passe par Tajawal
  // gras ; tout le reste par Archivo. Jamais d'interlettrage sur l'arabe, il
  // détacherait les liaisons.
  const ligne = (t, x, y, o = {}) => (rtl ? ar(ctx, t, x, y, o) : txt(ctx, t, x, y, o))

  const jambes = Array.isArray(d.jambes) ? d.jambes : []
  const nomsDuPari = jambes.map((j) => `${j.titre || ''} ${j.pick || ''}`).join(' ')
  const plaque = peauBarca(d.barca, nomsDuPari) ? 'ticket-gagnant-barca' : 'ticket-gagnant'
  const G = TICKET[plaque]

  const c = createCanvas(W, H); const ctx = ctx2d(c)
  await poserPlaque(ctx, plaque, W, H)

  const [hx, hy, hw, hh] = G.haut
  const cx = Math.round(hx + hw / 2)

  // ── LE BLOC DU HAUT SE CENTRE DANS SA MOITIE ──────────────────────────
  // Sa hauteur depend de ce qu'il porte : un avatar, une legende, les deux
  // ou aucun. Ancre en haut, il laissait un trou sous lui ; on le mesure
  // donc avant de le poser.
  const aAvatar = !!d.avatar
  const aLegende = !!d.legende
  const hautEnBas = G.jambes === 'haut'
  const hBloc = (aAvatar ? 150 : 0) + 56 + 92 + 128 + (d.chance != null ? 56 : 0) + (aLegende ? 80 : 0)
  // Quand les jambes partagent la moitie haute, le bloc reste colle en haut :
  // c'est a elles de prendre la place qui reste.
  let y = (hautEnBas ? hy + 40 : hy + Math.max(0, Math.round((hh - hBloc) / 2))) + 58
  const av = d.avatar ? await loadImgOuRepli(d.avatar, null) : null
  if (av) {
    const R = 54
    ctx.save(); ctx.beginPath(); ctx.arc(cx, y, R, 0, Math.PI * 2); ctx.closePath()
    ctx.strokeStyle = OR; ctx.lineWidth = 3; ctx.stroke(); ctx.clip()
    ctx.drawImage(av, cx - R, y - R, R * 2, R * 2); ctx.restore()
    y += R + 42
  }
  ligne(d.alias || '', cx, y, { size: 44, font: 'Archivo', color: CREME })
  y += 56

  // ── LE VERDICT ────────────────────────────────────────────────────────
  ligne(m.gagne, cx, y, { size: 30, color: MENTHE })
  y += 92

  // ── LA COTE, LE CHIFFRE QU'ON VIENT VOIR ──────────────────────────────
  const cote = Number(d.cote ?? 0)
  txt(ctx, `×${cote.toFixed(2)}`, cx, y + 40, { size: 150, font: 'Anton', color: OR })
  y += 128

  // ── L'AUDACE ──────────────────────────────────────────────────────────
  if (d.chance != null) {
    ligne(m.chance.replace('{n}', n(d.chance)), cx, y, { size: 30, color: CREME })
    y += 56
  }

  // ── LE MOT DU JOUEUR ──────────────────────────────────────────────────
  if (d.legende) {
    const op = { size: 30, maxW: hw - 40, max: 2, color: '#AEBAB3', align: 'center' }
    if (rtl) arLignes(ctx, d.legende, cx, y + 16, op)
    else txtLignes(ctx, d.legende, cx, y + 16, { ...op, font: 'Archivo', poids: '400' })
    y += 80
  }

  // ── LES JAMBES ────────────────────────────────────────────────────────
  const [bx, by, bw, bh] = G.bas
  // Les jambes prennent TOUT ce qui reste sous le bloc du haut : le forcer a
  // une hauteur fixe laissait un combine a trois selections afficher
  // « +1 autre » alors que la place existait.
  const zone = G.jambes === 'haut'
    ? { x: hx, y: y + 12, w: hw, h: Math.max(0, hy + hh - (y + 12)) }
    : { x: bx, y: by + 14, w: bw, h: bh - 120 }

  const PAS = 104
  const combien = Math.max(1, Math.min(jambes.length, Math.floor(zone.h / PAS)))
  for (let i = 0; i < combien; i++) {
    const j = jambes[i]
    const yl = zone.y + i * PAS + 34
    // Le filet vert qui tient la jambe : une couleur = un sens, et ici le
    // vert dit « cette sélection est passée ».
    ctx.save(); ctx.fillStyle = MENTHE
    ctx.fillRect(rtl ? zone.x + zone.w - 4 : zone.x, yl - 26, 4, 64); ctx.restore()
    const xTexte = rtl ? zone.x + zone.w - 20 : zone.x + 20
    const align = rtl ? 'right' : 'left'
    const titre = `${j.titre || ''}${j.score ? `  ${j.score}` : ''}`
    ligne(titre, xTexte, yl - 8, { size: 28, color: '#AEBAB3', align })
    const choix = j.pick === 'draw' ? m.nul : (j.choix || j.pick || '')
    ligne(choix, xTexte, yl + 28, { size: 32, color: CREME, align })
    // La cote de la jambe, à l'autre bout.
    txt(ctx, Number(j.cote ?? 0).toFixed(2), rtl ? zone.x + 20 : zone.x + zone.w - 20, yl + 28,
        { size: 28, font: 'Archivo', color: OR, align: rtl ? 'left' : 'right' })
    if (j.part != null) {
      ligne(m.vu.replace('{n}', n(j.part)), rtl ? zone.x + 20 : zone.x + zone.w - 20, yl - 8,
            { size: 22, color: OR, align: rtl ? 'left' : 'right' })
    }
  }
  if (jambes.length > combien) {
    const reste = jambes.length - combien
    ligne((reste > 1 && m.autresP ? m.autresP : m.autres).replace('{n}', n(reste)),
          zone.x + zone.w / 2, zone.y + combien * PAS + 24, { size: 24, color: '#7C8A83' })
  }

  // ── LE TALON : CE QUI A ÉTÉ ENGAGÉ, CE QUE ÇA A RAPPORTÉ ───────────────
  const yPied = by + bh - 54
  const gx = rtl ? bx + bw - 24 : bx + 24
  const dx = rtl ? bx + 24 : bx + bw - 24
  ligne(m.mise, gx, yPied - 36, { size: 22, color: '#7C8A83', align: rtl ? 'right' : 'left' })
  txt(ctx, n(d.mise), gx, yPied + 6, { size: 46, font: 'Anton', color: CREME, align: rtl ? 'right' : 'left' })
  ligne(m.gain, dx, yPied - 36, { size: 22, color: '#7C8A83', align: rtl ? 'left' : 'right' })
  txt(ctx, n(d.gain), dx, yPied + 6, { size: 58, font: 'Anton', color: '#8B6CF5', align: rtl ? 'left' : 'right' })

  // ── LA MARQUE ET LE CODE, SUR LA PELOUSE ──────────────────────────────
  paintLogo(ctx, 44, 44, 150)
  blocInscription(ctx, W / 2, G.qr, 130, W, { compact: true, lang })
  return c
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LE BUT EN CLIP — gabarit « but-clip », 1080×1350 (4:5, post FB)      ║
// ╚══════════════════════════════════════════════════════════════════════╝
/**
 * La carte qui accompagne un but publié à la main.
 *
 * ── CE QU'ELLE EST ────────────────────────────────────────────────────────
 * Une INVITATION, pas un résumé. Elle montre la vignette de la vidéo dans
 * une fenêtre, un bouton de lecture, et juste assez de contexte pour qu'on
 * sache de quel but il s'agit : les deux écussons, le score, le buteur et
 * sa minute. Tout ce qui raconterait le but lui enlèverait sa raison d'être.
 *
 * ── LA VIGNETTE EST LA LEUR, ET ELLE LE RESTE ─────────────────────────────
 * On la pose dans une fenêtre, comme n'importe quel aperçu de lien, et le
 * post renvoie chez l'ayant droit. On ne reverse jamais la VIDÉO sur la
 * page : le Rights Manager de Meta attrape les buts en minutes, et c'est la
 * page qui prend l'avertissement.
 *
 * Sans vignette (un post X, par exemple), la fenêtre reste noire et le
 * bouton de lecture suffit : mieux vaut une fenêtre vide qu'une image
 * improvisée — c'est la règle posée le 17/10 sur les articles.
 */
export async function gabaritButClip(d = {}) {
  registerBrandFonts()
  const W = 1080, H = 1350
  const lang = ['fr', 'en', 'ar'].includes(d.lang) ? d.lang : 'ar'
  const rtl = lang === 'ar'
  const n = (v) => Number(v ?? 0).toLocaleString(lang === 'ar' ? 'ar-u-nu-latn' : lang)
  const ligne = (t, x, y, o = {}) => (rtl ? ar(ctx, t, x, y, o) : txt(ctx, t, x, y, o))

  const barca = peauBarca(d.barca, d.home, d.away)
  const teinte = barca ? OR : MENTHE

  const c = createCanvas(W, H); const ctx = ctx2d(c)
  await poserPlaque(ctx, 'but-clip', W, H)

  const [fx, fy, fw, fh] = CASES['but-clip'].fenetre
  const [bx, by, bw, bh] = CASES['but-clip'].bandeau

  // ── LA FENÊTRE : la vignette, recadrée pour remplir sans se déformer ──
  const vign = d.vignette ? await loadImgOuRepli(d.vignette, null) : null
  if (vign) {
    ctx.save()
    ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip()
    couvrir(ctx, [fx, fy, fw, fh], '#05080F', 0)
    const r = Math.max(fw / vign.width, fh / vign.height)
    const lw = vign.width * r, lh = vign.height * r
    ctx.drawImage(vign, fx + (fw - lw) / 2, fy + (fh - lh) / 2, lw, lh)
    // Un voile en bas de la fenêtre : la minute s'y pose sans jamais tomber
    // sur un fond clair.
    const voile = ctx.createLinearGradient(0, fy + fh - 150, 0, fy + fh)
    voile.addColorStop(0, 'rgba(5,8,15,0)'); voile.addColorStop(1, 'rgba(5,8,15,0.85)')
    ctx.fillStyle = voile; ctx.fillRect(fx, fy + fh - 150, fw, 150)
    ctx.restore()
  }

  // ── LE BOUTON DE LECTURE, dessiné et non incrusté ────────────────────
  // Centré sur la FENÊTRE, pas sur l'image : la vignette change de
  // proportions d'une source à l'autre.
  const px = fx + fw / 2, py = fy + fh / 2, R = 66
  ctx.save()
  // Un halo sous le disque : sur une vignette claire et chargée, un disque
  // semi-transparent ne suffit pas et le triangle se perd dans l'image.
  const halo = ctx.createRadialGradient(px, py, R * 0.6, px, py, R * 2.1)
  halo.addColorStop(0, 'rgba(5,8,15,0.55)'); halo.addColorStop(1, 'rgba(5,8,15,0)')
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(px, py, R * 2.1, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(5,8,15,0.88)'; ctx.fill()
  ctx.lineWidth = 4; ctx.strokeStyle = teinte; ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(px - 18, py - 26); ctx.lineTo(px + 30, py); ctx.lineTo(px - 18, py + 26)
  ctx.closePath(); ctx.fillStyle = teinte; ctx.fill()
  ctx.restore()

  // La minute, en bas de la fenêtre.
  if (d.minute) {
    txt(ctx, String(d.minute).replace("'", "'"), fx + fw - 28, fy + fh - 44,
        { size: 46, font: 'Anton', color: CREME, align: 'right' })
  }

  // ── LE HAUT : la marque et la compétition ────────────────────────────
  paintLogo(ctx, 44, 44, 140)
  if (d.competition) ligne(d.competition, W / 2, 200, { size: 34, color: teinte })

  // ── LE BANDEAU : qui, contre qui, et le score ────────────────────────
  const dom = await crest(d.homeLogo), ext = await crest(d.awayLogo)
  const ECU = 104, cy = by + 74
  if (dom) ctx.drawImage(dom, bx + 46, cy - ECU / 2, ECU, ECU)
  if (ext) ctx.drawImage(ext, bx + bw - 46 - ECU, cy - ECU / 2, ECU, ECU)
  if (d.homeScore !== undefined && d.awayScore !== undefined) {
    txt(ctx, `${d.homeScore ?? ''} – ${d.awayScore ?? ''}`, bx + bw / 2, cy,
        { size: 76, font: 'Anton', color: CREME })
  }
  if (d.scorer) {
    ligne(nomAr(d.scorer), bx + bw / 2, by + bh - 42, { size: 36, color: teinte })
  }

  // ── LE BAS : le code d'inscription ────────────────────────────────────
  blocInscription(ctx, W / 2, 1096, 112, W, { compact: true, lang })
  return c
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║ L'IMAGE DE PARTAGE DES PAGES VIDÉO — gabarit « og-video », 1200×630  ║
// ║                                                                      ║
// ║ Ce format ne se publie PAS comme une photo : c'est l'`og:image` de   ║
// ║ /v/<id>. Facebook l'affiche sous un post de LIEN, et le clic part    ║
// ║ sur le site au lieu d'ouvrir une image en grand (Mehdi, 17/10/2026 : ║
// ║ « vu que c'est juste une image ça ne sert à rien, nous on veut       ║
// ║ convertir en trafic »).                                              ║
// ║                                                                      ║
// ║ D'où 1200×630 et non 1080×1350 : c'est le format que Facebook        ║
// ║ réclame pour un aperçu de lien. Rendu à cette taille exacte, rien    ║
// ║ n'est rogné à l'affichage — ce qu'on compose est ce qui est montré.  ║
// ╚══════════════════════════════════════════════════════════════════════╝

/**
 * ROGNE LES BANDES NOIRES D'UNE VIGNETTE.
 *
 * Le piège des vignettes YouTube : `hqdefault.jpg` sort en 480×360, c'est-à-
 * dire du 4:3 avec deux bandes noires CUITES autour d'une image 16:9 ; et la
 * vignette d'un Short arrive en 16:9 avec deux bandes verticales autour d'une
 * image 9:16. Se fier aux dimensions du fichier donnerait donc la mauvaise
 * fenêtre dans les deux cas — celle du conteneur, pas celle de la vidéo.
 *
 * On mesure l'encre plutôt que de lire l'en-tête : les lignes et colonnes
 * franchement noires des bords sont retirées, et c'est le rectangle restant
 * qui donne le format réel.
 *
 * Trois garde-fous, parce qu'une photo de match de nuit est elle-même sombre :
 *   · on ne rogne que sur UN axe — un letterbox est horizontal ou vertical,
 *     jamais les deux ;
 *   · chaque bande doit faire entre 3 % et 32 % du côté ;
 *   · les deux bandes doivent être de taille comparable (un letterbox est
 *     centré). Une image simplement sombre en haut ne passe aucun des trois.
 *
 * Rend un rectangle source `[sx, sy, sw, sh]`, en pixels de l'image d'origine.
 */
function sansBandes(img) {
  const N = 120
  const W = img.width || 0, H = img.height || 0
  if (!W || !H) return [0, 0, W, H]
  const p = createCanvas(N, N); const pc = p.getContext('2d')
  pc.drawImage(img, 0, 0, N, N)
  const d = pc.getImageData(0, 0, N, N).data
  const lum = (i) => (d[i] + d[i + 1] + d[i + 2]) / 3
  const moyLigne = (y) => { let s = 0; for (let x = 0; x < N; x++) s += lum((y * N + x) * 4); return s / N }
  const moyCol = (x) => { let s = 0; for (let y = 0; y < N; y++) s += lum((y * N + x) * 4); return s / N }
  const NOIR = 10   // une bande cuite est à 0 ; 10/255 laisse passer le bruit de compression

  let h0 = 0, h1 = N - 1, v0 = 0, v1 = N - 1
  while (h0 < h1 && moyLigne(h0) < NOIR) h0++
  while (h1 > h0 && moyLigne(h1) < NOIR) h1--
  while (v0 < v1 && moyCol(v0) < NOIR) v0++
  while (v1 > v0 && moyCol(v1) < NOIR) v1--

  const haut = h0, bas = N - 1 - h1, gauche = v0, droite = N - 1 - v1
  const plausible = (a, b) => {
    // 38 % : une vidéo 9:16 dans un cadre 16:9 — la vignette d'un Short —
    // laisse 34,1 % de noir de chaque côté. Un plafond à 32 % les rejetait
    // tous (mesuré le 17/10 sur un cas de test : rapport rendu 1,77 au lieu
    // de 0,56). C'est le pire cas réel, d'où la marge juste au-dessus.
    const min = N * 0.03, max = N * 0.38
    return a >= min && b >= min && a <= max && b <= max && Math.abs(a - b) <= N * 0.05
  }
  if (plausible(haut, bas) && gauche + droite < N * 0.03) {
    return [0, Math.round(H * (haut / N)), W, Math.round(H * ((h1 - h0 + 1) / N))]
  }
  if (plausible(gauche, droite) && haut + bas < N * 0.03) {
    return [Math.round(W * (gauche / N)), 0, Math.round(W * ((v1 - v0 + 1) / N)), H]
  }

  return [0, 0, W, H]
}

/**
 * LA PREMIÈRE VIGNETTE QUI CHARGE, DANS L'ORDRE DONNÉ.
 *
 * YouTube publie une vignette AU FORMAT D'ORIGINE sous `oardefault.jpg` :
 * 1080×1920 pour un Short, et 404 pour une vidéo ordinaire. C'est le seul
 * signal déterministe du format réel — mesuré le 18/10 sur trois vidéos.
 *
 * Sans elle, `maxresdefault` rend un 16:9 dans lequel le clip vertical est
 * encadré de part et d'autre par un recadrage large, et la carte sortait
 * avec une vidéo verticale coincée au milieu d'une image large (le but
 * d'Abde). J'avais d'abord tenté de détecter ces bandes à leur manque de
 * détail : posée au jugé, l'heuristique n'a pas mordu, et elle risquait de
 * rogner de vraies images larges. Une adresse qui répond ou non vaut mieux
 * qu'une mesure qui devine.
 */
async function premiereImage(sources) {
  for (const src of (Array.isArray(sources) ? sources : [sources]).filter(Boolean)) {
    const im = await loadImgOuRepli(src, null)
    // Une vignette absente revient parfois en 120×90 (l'image « pas de
    // miniature » de YouTube) plutôt qu'en 404 : on l'écarte aussi.
    if (im && (im.width > 200 || im.height > 200)) return im
  }
  return null
}

/** Un rectangle à coins arrondis, posé sur le chemin courant. */
function cheminArrondi(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

/**
 * Écrit une ligne en la faisant TENIR dans une largeur donnée : on réduit le
 * corps jusqu'à `min`, et seulement après on coupe. Une ligne coupée se lit ;
 * une ligne qui déborde sur l'écusson voisin, non.
 */
function ligneTenue(ctx, t, x, y, maxW, { size = 40, min = 24, font = 'Archivo', color = CREME, rtl = false } = {}) {
  let s = size, texte = String(t ?? '')
  if (!texte) return
  const police = (n) => (rtl ? `bold ${n}px Tajawal` : `${n}px ${font}`)
  ctx.save()
  ctx.font = police(s)
  while (ctx.measureText(texte).width > maxW && s > min) { s -= 2; ctx.font = police(s) }
  while (texte.length > 4 && ctx.measureText(texte).width > maxW) {
    texte = texte.slice(0, -2) + '…'
    ctx.font = police(s)
  }
  ctx.restore()
  if (rtl) ar(ctx, texte, x, y, { size: s, color })
  else txt(ctx, texte, x, y, { size: s, font, color })
}

/**
 * LA FENÊTRE SE CALCULE, ELLE N'EST PAS DESSINÉE SUR LA PLAQUE.
 *
 * Première tentative le 17/10 : trois plaques, une par format, avec la
 * fenêtre et son cadre doré cuits dedans. Mesuré sur les images rendues, la
 * « 9:16 » faisait 0,42 et le « carré » 1,11 — ces générateurs ne comptent
 * pas, et relancer n'y change rien. La plaque est donc nue, et le cadre,
 * son ombre interne et le bouton sont tracés ici, aux dimensions exactes du
 * rapport réel de la vignette. N'importe quel format tombe juste, au pixel,
 * sans seuil ni liste de cas.
 */
export async function gabaritOgVideo(d = {}) {
  registerBrandFonts()
  const W = 1200, H = 630
  const lang = ['fr', 'en', 'ar'].includes(d.lang) ? d.lang : 'ar'
  const rtl = lang === 'ar'
  const barca = peauBarca(d.barca, d.home, d.away, d.competition)
  const teinte = barca ? OR : MENTHE

  const c = createCanvas(W, H); const ctx = ctx2d(c)

  // ── LE FOND, RECADRÉ ET NON ÉTIRÉ ───────────────────────────────────
  // `poser()` cale sur la largeur : la plaque 2048×1152 descendrait à 675 de
  // haut dans un cadre de 630, et la bande d'herbe sortirait par le bas. Ici
  // on couvre et on centre — on perd 3 % de ciel et 3 % d'herbe, rien d'utile.
  ctx.fillStyle = '#05080F'; ctx.fillRect(0, 0, W, H)
  const f = await fond('og-video')
  const ech = Math.max(W / f.width, H / f.height)
  ctx.drawImage(f, (W - f.width * ech) / 2, (H - f.height * ech) / 2, f.width * ech, f.height * ech)

  // ── LA FENÊTRE, AU FORMAT RÉEL DE LA VIGNETTE ───────────────────────
  const vign = await premiereImage(d.vignettes ?? [d.vignette, d.vignetteRepli])
  const [sx, sy, sw, sh] = vign ? sansBandes(vign) : [0, 0, 16, 9]
  const MARGE = 44, MAXW = 700, MAXH = H - MARGE * 2
  const rapport = sh ? sw / sh : 16 / 9
  let fw = MAXH * rapport, fh = MAXH
  if (fw > MAXW) { fw = MAXW; fh = MAXW / rapport }
  fw = Math.round(fw); fh = Math.round(fh)
  const fx = MARGE, fy = Math.round((H - fh) / 2)
  const R = 16

  ctx.save()
  cheminArrondi(ctx, fx, fy, fw, fh, R); ctx.clip()
  ctx.fillStyle = '#05080F'; ctx.fillRect(fx, fy, fw, fh)
  if (vign) {
    // La fenêtre a EXACTEMENT le rapport du rectangle utile : le `cover`
    // ci-dessous ne rogne donc rien, il ne fait qu'absorber l'arrondi.
    const r = Math.max(fw / sw, fh / sh)
    const lw = sw * r, lh = sh * r
    ctx.drawImage(vign, sx, sy, sw, sh, fx + (fw - lw) / 2, fy + (fh - lh) / 2, lw, lh)
  }
  // L'ombre interne : la fenêtre doit sembler encastrée dans la plaque, pas
  // collée dessus. Un trait épais tracé SOUS le masque ne mord que vers
  // l'intérieur.
  ctx.strokeStyle = 'rgba(5,8,15,0.55)'; ctx.lineWidth = 26
  cheminArrondi(ctx, fx, fy, fw, fh, R); ctx.stroke()
  ctx.restore()

  ctx.save()
  cheminArrondi(ctx, fx, fy, fw, fh, R)
  ctx.strokeStyle = OR; ctx.lineWidth = 3; ctx.stroke()
  ctx.restore()

  // ── LE BOUTON DE LECTURE ─────────────────────────────────────────────
  // Centré sur la FENÊTRE et dimensionné par elle : sur une vidéo verticale
  // la fenêtre est trois fois plus étroite, un disque de taille fixe la
  // boucherait.
  const px = fx + fw / 2, py = fy + fh / 2
  const RB = Math.max(42, Math.min(80, Math.round(Math.min(fw, fh) * 0.17)))
  ctx.save()
  const halo = ctx.createRadialGradient(px, py, RB * 0.6, px, py, RB * 2.1)
  halo.addColorStop(0, 'rgba(5,8,15,0.55)'); halo.addColorStop(1, 'rgba(5,8,15,0)')
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(px, py, RB * 2.1, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(px, py, RB, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(5,8,15,0.88)'; ctx.fill()
  ctx.lineWidth = 4; ctx.strokeStyle = teinte; ctx.stroke()
  const t = RB * 0.42
  ctx.beginPath()
  ctx.moveTo(px - t * 0.68, py - t); ctx.lineTo(px + t * 1.12, py); ctx.lineTo(px - t * 0.68, py + t)
  ctx.closePath(); ctx.fillStyle = teinte; ctx.fill()
  ctx.restore()

  if (d.minute) {
    txt(ctx, String(d.minute), fx + fw - 20, fy + fh - 26,
        { size: Math.round(Math.min(fw, fh) * 0.11), font: 'Anton', color: CREME, align: 'right' })
  }

  // ── LA COLONNE : tout ce qui reste à droite de la fenêtre ────────────
  // Sa largeur dépend du format de la vidéo — 376 px face à une fenêtre
  // 16:9, 771 face à une verticale — donc rien n'y est posé en dur.
  const x0 = fx + fw + 36
  const LC = W - MARGE - x0
  const cx = x0 + LC / 2

  // UN VOILE, PAS UN PANNEAU. La plaque porte une rangée de lumières ambrées
  // à mi-hauteur et une bande d'herbe éclairée en bas — exactement là où
  // tombent la compétition et la signature. Le voile s'ouvre en dégradé
  // depuis la fenêtre et file jusqu'aux trois bords : aucune arête visible,
  // donc l'œil y lit une pénombre et non un cadre collé par-dessus.
  const voile = ctx.createLinearGradient(x0 - 20, 0, x0 + 120, 0)
  voile.addColorStop(0, 'rgba(5,8,15,0)'); voile.addColorStop(1, 'rgba(5,8,15,0.46)')
  ctx.save()
  ctx.fillStyle = voile; ctx.fillRect(x0 - 20, 0, 140, H)
  ctx.fillStyle = 'rgba(5,8,15,0.46)'; ctx.fillRect(x0 + 120, 0, W - (x0 + 120), H)
  ctx.restore()

  paintLogo(ctx, cx - 44, 46, 88)

  let y = 190
  if (d.etiquette) {
    const et = String(d.etiquette)
    ctx.save(); ctx.font = rtl ? 'bold 26px Tajawal' : '24px Archivo'
    const lw = Math.min(LC, ctx.measureText(et).width + 44); ctx.restore()
    ctx.save()
    cheminArrondi(ctx, cx - lw / 2, y - 23, lw, 46, 23)
    ctx.fillStyle = 'rgba(5,8,15,0.72)'; ctx.fill()
    ctx.strokeStyle = teinte; ctx.lineWidth = 2; ctx.stroke(); ctx.restore()
    ligneTenue(ctx, et, cx, y, lw - 28, { size: rtl ? 26 : 24, min: 18, color: teinte, rtl })
    y += 74
  }

  if (d.competition) {
    ligneTenue(ctx, d.competition, cx, y, LC, { size: 30, min: 20, color: teinte, rtl })
    y += 62
  }

  // Les écussons et le score : une seule rangée, mesurée sur la colonne.
  const dom = await crest(d.homeLogo), ext = await crest(d.awayLogo)
  const aScore = d.homeScore !== undefined && d.homeScore !== null
    && d.awayScore !== undefined && d.awayScore !== null
  if (dom || ext || aScore) {
    const ECU = Math.min(84, Math.round(LC * 0.22))
    const score = aScore ? `${d.homeScore} – ${d.awayScore}` : ''
    ctx.save(); ctx.font = '62px Anton'; const ls = score ? ctx.measureText(score).width : 0; ctx.restore()
    const total = ECU * 2 + 2 * 26 + ls
    let gx = cx - total / 2
    if (dom) ctx.drawImage(dom, gx, y - ECU / 2, ECU, ECU)
    gx += ECU + 26
    if (score) txt(ctx, score, gx + ls / 2, y, { size: 62, font: 'Anton', color: CREME })
    gx += ls + 26
    if (ext) ctx.drawImage(ext, gx, y - ECU / 2, ECU, ECU)
    y += Math.max(ECU, 70) / 2 + 48
  }

  // Le titre : le buteur quand on le connaît, sinon l'affiche du match.
  const titre = d.titre || [d.home, d.away].filter(Boolean).join(' — ')
  if (titre) { ligneTenue(ctx, titre, cx, y, LC, { size: 36, min: 22, color: CREME, rtl }); y += 54 }
  if (d.sousTitre) ligneTenue(ctx, d.sousTitre, cx, y, LC, { size: 26, min: 18, color: 'rgba(244,243,238,0.72)', rtl })

  // La signature, en bas de colonne : l'aperçu doit dire d'où vient le lien.
  txt(ctx, 'pressing90.live', cx, H - 48, { size: 24, font: 'Archivo', color: 'rgba(244,243,238,0.55)' })
  return c
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║ LES DEUX CARTES SANS LIEN — gabarits « resumes-du-jour » et          ║
// ║ « but-filet », 1080×1350                                             ║
// ║                                                                      ║
// ║ Mehdi, 18/10/2026 : « tous les posts images vont avec un lien        ║
// ║ directement dans la description et FB pénalise pour ça, ils          ║
// ║ n'aiment pas qu'on quitte la page ». On revient donc à une IMAGE     ║
// ║ publiée en photo, le lien en premier commentaire.                    ║
// ║                                                                      ║
// ║ Ces deux cartes doivent se distinguer d'un coup d'œil dans le fil :  ║
// ║ la journée porte les ÉCUSSONS DES CHAMPIONNATS sur un panneau de     ║
// ║ stade, le but porte un BALLON DANS LE FILET et l'aperçu du clip.     ║
// ╚══════════════════════════════════════════════════════════════════════╝

/** Les plaques font 1664 de large, la chaîne travaille en 1080. */
const E45 = 1080 / 1664
const e45 = (n) => Math.round(n * E45)

/**
 * LA PHRASE DE SIGNATURE, IDENTIQUE SUR TOUTES LES CARTES.
 *
 * Mehdi, 18/10/2026 : « laisse une phrase signature figée sur tous les
 * posts… regarde ce que font les pages qui ont le plus de vues et
 * inspire-t'en ».
 *
 * Relevé : les grandes pages arabes ferment toutes par « تابعنا ليصلك كل
 * جديد » — yalla shoot, عشاق كرة القدم et les autres. La mécanique est
 * juste (impératif + bénéfice), mais la formule est si répandue qu'elle
 * ne se lit plus. On garde la mécanique et on nomme ce qu'on apporte
 * vraiment : chaque but, chaque résumé. Elle ne change jamais — c'est ce
 * qui en fait une signature et non un slogan.
 */
const SIGNATURE = {
  // SANS POINT FINAL. Dans un passage arabe, la ponctuation de fin se
  // place au bord GAUCHE du bloc — typographiquement juste, mais ici le
  // point venait se coller aux deux-points de « Pressing90.live : » et on
  // lisait « .live : . متعة ». Une signature n'a pas besoin de point.
  ar: 'Pressing90.live : متعة كرة القدم.. مجاناً وبدون أي إعلانات',
  fr: 'Pressing90.live : le plaisir du football, gratuit et sans aucune publicité',
  en: 'Pressing90.live — the joy of football, free and with no ads at all',
}
/**
 * « LE LIEN EST EN COMMENTAIRE ».
 *
 * Mehdi, 18/10/2026. C'est la conséquence directe de la règle du jour :
 * plus aucun lien en description, parce que Facebook pénalise ce qui
 * emmène ailleurs. Le lien part donc en premier commentaire — encore
 * faut-il le dire, sinon personne ne va le chercher.
 */
const EN_COMMENTAIRE = {
  ar: 'الرابط في التعليقات',
  fr: 'Le lien est en commentaire',
  en: 'Link in the comments',
}

/**
 * LE PIED DE CARTE : l'instruction, puis la signature.
 *
 * L'instruction passe devant, en or et plus grande : c'est elle qui fait
 * agir. La signature vient dessous, plus discrète — elle se répète à
 * chaque post, elle n'a pas à crier.
 *
 * LE VOILE EST INDISPENSABLE. Posées telles quelles au bas des cartes,
 * ces deux lignes tombent sur l'herbe éclairée ou sur les mailles et
 * deviennent illisibles. Le dégradé s'ouvre et se referme sur du
 * transparent : on y lit une pénombre, pas un bandeau collé.
 *
 * La version française est deux fois plus longue que l'arabe : tout
 * passe par `ligneTenue`, qui réduit le corps avant de couper.
 */
function piedDeCarte(ctx, lang, cx, yBas, taille, largeur) {
  const t1 = EN_COMMENTAIRE[lang] ?? EN_COMMENTAIRE.en
  const t2 = SIGNATURE[lang] ?? SIGNATURE.en
  const rtl = lang === 'ar'
  const y1 = yBas - Math.round(taille * 1.5)
  const h = taille * 4.6
  const g = ctx.createLinearGradient(0, y1 - h * 0.42, 0, y1 + h * 0.58)
  g.addColorStop(0, 'rgba(5,8,15,0)')
  g.addColorStop(0.3, 'rgba(5,8,15,0.8)')
  g.addColorStop(0.7, 'rgba(5,8,15,0.8)')
  g.addColorStop(1, 'rgba(5,8,15,0)')
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, y1 - h * 0.42, cx * 2, h); ctx.restore()

  ligneTenue(ctx, t1, cx, y1, largeur, { size: taille, min: 16, color: OR, rtl })
  ligneMixte(ctx, t2, cx, yBas, largeur, Math.round(taille * 0.78))
}

/**
 * UNE LIGNE QUI MÊLE DU LATIN ET DE L'ARABE SE TRACE EN DEUX FOIS.
 *
 * « Pressing90.live : متعة كرة القدم.. مجاناً وبدون أي إعلانات. » rendue
 * d'un seul `fillText` sortait à l'envers (18/10/2026) : le nom de domaine
 * se retrouvait à DROITE et le point final sautait tout à gauche.
 * L'algorithme bidirectionnel avait résolu la ligne entière en RTL, parce
 * qu'elle est majoritairement arabe — le « P » initial n'y change rien.
 *
 * C'est la même famille de pièges que les chiffres dans une phrase arabe,
 * déjà payée deux fois sur d'autres formats. La parade est la même : on
 * ne confie jamais l'ordre d'une ligne mixte au moteur de rendu. On coupe
 * au premier caractère arabe, on mesure les deux morceaux, et on les pose
 * soi-même — le latin à gauche, l'arabe à sa suite, chacun dans sa police.
 * À l'intérieur de chaque morceau, le moteur fait son travail et le fait
 * bien.
 */
function ligneMixte(ctx, texte, cx, y, largeur, taille) {
  const m = String(texte).match(/^([^\u0600-\u06FF]+?)([\u0600-\u06FF][\s\S]*)$/)
  const couleur = 'rgba(244,243,238,0.72)'
  if (!m) { ligneTenue(ctx, texte, cx, y, largeur, { size: taille, min: 14, color: couleur }); return }
  const [, latin, arabe] = m
  let t = taille
  const mesurer = () => {
    ctx.font = `${t}px Archivo`; const a = ctx.measureText(latin).width
    ctx.font = `bold ${t}px Tajawal`; const b = ctx.measureText(arabe).width
    return [a, b, a + b]
  }
  let [wL, , total] = mesurer()
  while (total > largeur && t > 13) { t -= 1; [wL, , total] = mesurer() }
  const x = cx - total / 2
  ctx.save()
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = couleur
  ctx.font = `${t}px Archivo`; ctx.fillText(latin, x, y)
  ctx.font = `bold ${t}px Tajawal`; ctx.fillText(arabe, x + wL, y)
  ctx.restore()
}

/**
 * LA CARTE DE LA JOURNÉE — une seule par jour.
 *
 * Mehdi : « une image unique, la seule chose qui change dessus d'un post à
 * l'autre c'est la date et les logos de championnats qui ont joué ce
 * jour ». D'où un panneau VIDE sur la plaque : le nombre d'écussons change
 * — six un dimanche, un seul un mardi — et des cases dessinées
 * laisseraient des trous les jours creux.
 *
 * `d.competitions` : [{ logo, label }]. On répartit sur une ou deux
 * rangées selon le nombre, et la taille suit : deux écussons occupent la
 * largeur, six se serrent. Personne ne compte les logos, on lit « il y a
 * eu du football partout » ou « il y a eu la Ligue des champions ».
 */
export async function gabaritResumesDuJour(d = {}) {
  registerBrandFonts()
  const W = 1080, H = 1350
  const lang = ['fr', 'en', 'ar'].includes(d.lang) ? d.lang : 'ar'
  const rtl = lang === 'ar'
  const ligne = (t, x, y, o = {}) => (rtl ? ar(ctx, t, x, y, o) : txt(ctx, t, x, y, o))

  const c = createCanvas(W, H); const ctx = ctx2d(c)
  await poserPlaque(ctx, 'resumes-du-jour', W, H)

  const { filet, panneau } = CASES['resumes-du-jour']
  const yFilet = e45(filet)
  const [px, py, pw, ph] = panneau.map(e45)

  // ── L'EN-TÊTE : le titre, puis la date sous le filet doré ────────────
  paintLogo(ctx, W / 2 - 54, 44, 108)
  if (d.titre) ligne(d.titre, W / 2, yFilet - 78, { size: 52, color: CREME })
  if (d.date) ligne(d.date, W / 2, yFilet + 54, { size: 30, color: OR })

  // ── LE PANNEAU : les écussons des championnats du jour ───────────────
  const comps = (Array.isArray(d.competitions) ? d.competitions : []).slice(0, 6)
  const ecussons = []
  for (const k of comps) {
    const im = await crest(k && k.logo)
    if (im) ecussons.push({ im, label: (k && k.label) || '' })
  }
  if (ecussons.length) {
    // Une rangée jusqu'à trois, deux rangées au-delà : au-delà de trois
    // sur une ligne, un écusson tombe sous les 120 px et ne se reconnaît
    // plus.
    const parRangee = ecussons.length <= 3 ? ecussons.length : Math.ceil(ecussons.length / 2)
    const rangees = Math.ceil(ecussons.length / parRangee)
    // Plus de libellé sous l'écusson : la rangée n'a plus besoin de sa
    // ligne de texte, l'écusson peut donc grossir d'autant.
    const T = Math.min(Math.round((pw - 60) / parRangee) - 36, Math.round((ph - 60) / rangees) - 28, 240)
    const hRangee = T + 28
    const yDebut = py + (ph - rangees * hRangee) / 2
    // LE LOGO SEUL, JAMAIS SON NOM (Mehdi, 18/10/2026). Un écusson de
    // championnat se reconnaît en un dixième de seconde ; son nom écrit
    // dessous prend une ligne, se lit en arabe ou en français selon le
    // lecteur, et n'apprend rien à personne.
    for (let i = 0; i < ecussons.length; i++) {
      const r = Math.floor(i / parRangee)
      const dansRangee = Math.min(parRangee, ecussons.length - r * parRangee)
      const pas = pw / dansRangee
      const cx = px + pas * ((i % parRangee) + 0.5)
      const cy = yDebut + r * hRangee
      ctx.drawImage(ecussons[i].im, cx - T / 2, cy, T, T)
    }
  }

  // ── LE PIED : ce qu'on vient chercher, et où ─────────────────────────
  if (d.accroche) ligne(d.accroche, W / 2, py + ph + 74, { size: 34, color: CREME })
  blocInscription(ctx, W / 2, 1028, 88, W, { compact: true, lang })
  piedDeCarte(ctx, lang, W / 2, H - 34, 28, W - 80)
  return c
}

/**
 * LA CARTE D'UN BUT — l'aperçu du clip dans le filet.
 *
 * La fenêtre n'est PAS dessinée sur la plaque, et c'est délibéré : un but
 * arrive en 16:9 depuis YouTube et en 9:16 depuis X. Une fenêtre cuite
 * rognerait un quart de l'image une fois sur deux — c'est la leçon des
 * trois plaques d'OG, mesurées à 0,42 et 1,11 au lieu de 0,56 et 1,00. On
 * garde donc un rectangle mat et on trace le cadre au rendu, aux
 * proportions réelles de la vignette.
 */
export async function gabaritButFilet(d = {}) {
  registerBrandFonts()
  const lang = ['fr', 'en', 'ar'].includes(d.lang) ? d.lang : 'ar'
  const rtl = lang === 'ar'

  // ── LA CARTE PREND LA FORME DU CLIP ──────────────────────────────────
  // Un but de X arrive en 9:16, un but de YouTube en 16:9. Une seule
  // plaque obligerait à caler l'un des deux dans un cadre qui n'est pas
  // le sien — c'est précisément ce que Mehdi a refusé. Il y a donc deux
  // plaques du même filet, et on choisit celle qui épouse le clip.
  const vign = await premiereImage(d.vignettes ?? [d.vignette, d.vignetteRepli])
  const [sx, sy, sw, sh] = vign ? sansBandes(vign) : [0, 0, 16, 9]
  const rapport = sh ? sw / sh : 16 / 9
  const large = rapport >= 1.25
  const plaque = large ? 'but-filet-large' : 'but-filet'
  const W = large ? 1200 : 1080
  const H = large ? 675 : 1350

  const c = createCanvas(W, H); const ctx = ctx2d(c)
  const ligne = (t, x, y, o = {}) => (rtl ? ar(ctx, t, x, y, o) : txt(ctx, t, x, y, o))
  await poserPlaque(ctx, plaque, W, H)

  const { zone, legende } = CASES[plaque]
  const zx = zone[0] * W, zy = zone[1] * H, zw = zone[2] * W, zh = zone[3] * H

  // ── L'EN-TÊTE ────────────────────────────────────────────────────────
  paintLogo(ctx, large ? 34 : 40, large ? 30 : 40, large ? 84 : 104)
  // L'ÉCUSSON DE LA COMPÉTITION, PAS SON NOM (Mehdi, 18/10/2026). Il se
  // reconnaît sans être lu, et il ne dépend d'aucune langue. Le nom ne
  // sert plus que de secours, quand on n'a pas d'écusson.
  const ecuComp = await crest(d.competitionLogo)
  if (ecuComp) {
    // Un peu plus grand, et posé sur un disque sombre : au milieu des
    // mailles éclairées du haut, un écusson clair se perdait.
    const T = large ? 82 : 104
    const cx = W / 2, cy = (large ? 18 : 42) + T / 2
    ctx.save()
    const halo = ctx.createRadialGradient(cx, cy, T * 0.3, cx, cy, T * 0.92)
    halo.addColorStop(0, 'rgba(5,8,15,0.72)'); halo.addColorStop(1, 'rgba(5,8,15,0)')
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, T * 0.92, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    ctx.drawImage(ecuComp, cx - T / 2, cy - T / 2, T, T)
  } else if (d.competition) {
    ligne(d.competition, W / 2, large ? 46 : 104, { size: large ? 28 : 34, color: OR })
  }

  // ── LA VIGNETTE, POSÉE NUE ET À SA PROPRE FORME ──────────────────────
  // Aucun cadre dessiné sur la plaque, aucun fond ajouté : l'image occupe
  // la zone libre au plus grand, et ce qui dépasse autour reste le filet.
  // Un simple filet doré d'un trait la détache des mailles — sans lui, un
  // clip sombre s'y fond.
  let fw = zw, fh = zw / rapport
  if (fh > zh) { fh = zh; fw = zh * rapport }
  fw = Math.round(fw); fh = Math.round(fh)
  const fx = Math.round(zx + (zw - fw) / 2), fy = Math.round(zy + (zh - fh) / 2)
  const R = 12

  if (vign) {
    ctx.save()
    // Une ombre portée sous la vignette : elle la décolle du filet mieux
    // qu'un trait, et sans rien ajouter de visible.
    ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 38; ctx.shadowOffsetY = 10
    cheminArrondi(ctx, fx, fy, fw, fh, R); ctx.fillStyle = '#05080F'; ctx.fill()
    ctx.restore()
    ctx.save()
    cheminArrondi(ctx, fx, fy, fw, fh, R); ctx.clip()
    const r = Math.max(fw / sw, fh / sh)
    ctx.drawImage(vign, sx, sy, sw, sh, fx + (fw - sw * r) / 2, fy + (fh - sh * r) / 2, sw * r, sh * r)
    ctx.restore()
    ctx.save()
    cheminArrondi(ctx, fx, fy, fw, fh, R)
    ctx.strokeStyle = 'rgba(204,172,97,0.85)'; ctx.lineWidth = 2; ctx.stroke()
    ctx.restore()
  }

  // Le bouton de lecture, dimensionné par la vignette.
  const bx = fx + fw / 2, by = fy + fh / 2
  const RB = Math.max(40, Math.min(78, Math.round(Math.min(fw, fh) * 0.17)))
  ctx.save()
  const halo = ctx.createRadialGradient(bx, by, RB * 0.6, bx, by, RB * 2.1)
  halo.addColorStop(0, 'rgba(5,8,15,0.55)'); halo.addColorStop(1, 'rgba(5,8,15,0)')
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(bx, by, RB * 2.1, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(bx, by, RB, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(5,8,15,0.88)'; ctx.fill()
  ctx.lineWidth = 4; ctx.strokeStyle = OR; ctx.stroke()
  const tp = RB * 0.42
  ctx.beginPath()
  ctx.moveTo(bx - tp * 0.68, by - tp); ctx.lineTo(bx + tp * 1.12, by); ctx.lineTo(bx - tp * 0.68, by + tp)
  ctx.closePath(); ctx.fillStyle = OR; ctx.fill()
  ctx.restore()

  if (d.minute) {
    txt(ctx, String(d.minute), fx + fw - 18, fy + fh - 26,
        { size: Math.round(Math.min(fw, fh) * 0.1), font: 'Anton', color: CREME, align: 'right' })
  }

  // ── LA LÉGENDE ───────────────────────────────────────────────────────
  const cy = legende * H
  if (d.buteur) {
    ligneTenue(ctx, d.buteur, W / 2, cy, W - (large ? 220 : 140),
               { size: large ? 48 : 64, min: large ? 28 : 36, color: CREME, rtl })
  }
  const affiche = [d.home, d.away].filter(Boolean).join(' — ')
  if (affiche) {
    ligneTenue(ctx, affiche, W / 2, cy + (large ? 58 : 76), W - (large ? 240 : 160),
               { size: large ? 26 : 32, min: 18, color: 'rgba(244,243,238,0.78)', rtl })
  }

  piedDeCarte(ctx, lang, W / 2, large ? H - 26 : 1296, large ? 22 : 27, W - (large ? 150 : 80))
  return c
}

