// Gabarits livrés par Mehdi le 15/10/2026 — fonds dessinés à la main, que le
// studio remplit avec de vraies données.
//
// ── CE QUI EST MESURÉ ICI, ET POURQUOI ────────────────────────────────────
// Les fonds sont des images : rien n'indique où poser le contenu. Les
// coordonnées ci-dessous ont été relevées au pixel sur chaque fond, et c'est
// le travail qu'on ne veut pas refaire. Elles valent pour les fichiers de
// assets/gabarits/ À LEUR TAILLE D'ORIGINE — si un fond est regénéré, il faut
// les reprendre.
//
// ── DEUX PIÈGES DE CES FONDS ──────────────────────────────────────────────
// 1. Ils portent du DÉCOR DE MAQUETTE : une fausse barre Facebook en bas, des
//    cadres en pointillés et les mots « PLACEHOLDER ». D'où `UTILE` (la
//    hauteur réelle) et `couvrir()` (qui masque un cadre avant d'écrire
//    dessus). À remplacer par des fonds propres en 1080×1920 dès que possible.
// 2. Ils font 768×1376, pas 1080×1920. En l'état, un reel sort flou.
//
// ── LANGUE ────────────────────────────────────────────────────────────────
// La page publie en ARABE (`mainLang: 'ar'`). Mehdi, 15/10 : les chiffres
// restent en 1234, jamais en ٠١٢٣. Et le texte arabe se dessine en Tajawal
// gras SANS espacement de lettres, sinon les liaisons se détachent.

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const dossierGabarits = path.join(__dirname, 'assets', 'gabarits')

export const OR = '#CCAC61'
export const CREME = '#F4F3EE'
export const MENTHE = '#7FE7C4'

/** Hauteur réellement utilisable : sous ça commence la fausse barre Facebook. */
export const UTILE = {
  'but-neutre': 1190,
  'but-barca': 1190,
  // Fond remplace le 15/10 par une plaque propre en 1080x1920 : plus de
  // fausse barre Facebook a couper, la hauteur utile est la hauteur entiere.
  'soiree-4-moments': 1920,
  // Plaques livrees le 15/10 pour remplacer assets/ucl/ : vierges de toute
  // competition, hauteur pleine.
  'soiree-ouverture': 1920,
  'soiree-recap': 1920,
  'soiree-fin': 1920,
  'terrain-iso': 1184,
  'album-final': 1024,
  'stats-match': 1024,
  'tableau-soiree': 768,
}

/**
 * Les cases de chaque fond, relevées au pixel : [x, y, largeur, hauteur].
 *
 * « but-neutre » et « but-barca » sont LE MÊME gabarit en deux peaux — mêmes
 * cases, mêmes coordonnées. Une seule fonction de dessin suffit pour les deux.
 */
export const CASES = {
  'but-neutre': { entete: [40, 262, 580, 160], centre: [40, 447, 580, 545], pied: [40, 1012, 580, 148] },
  'but-barca': { entete: [35, 262, 585, 165], centre: [35, 447, 585, 545], joueur: [648, 682, 110, 458], pied: [35, 1012, 585, 148] },
  'soiree-4-moments': {
    titre: [24, 300, 720, 60],
    moments: [[24, 384, 345, 205], [400, 384, 345, 205], [24, 616, 345, 210], [400, 616, 345, 210]],
  },
  'stats-match': { entete: [375, 55, 600, 330], tableau: [50, 400, 650, 544], aside: [710, 405, 265, 315] },
  'tableau-soiree': { tableau: [45, 206, 1105, 502], chiffres: [1162, 206, 196, 352] },
}

/**
 * LE TERRAIN ISOMÉTRIQUE, ET SON PIÈGE.
 *
 * Le terrain du fond « terrain-iso » DÉBORDE du cadre des deux côtés. Mesuré
 * le 15/10 : la pointe haute et la pointe basse sont visibles, mais les deux
 * coins latéraux tombent hors de l'image — 152 px à droite, 360 px à gauche.
 * Le terrain complet fait 1 280 px de large pour un fond de 768 : il en manque
 * 40 %, surtout à gauche.
 *
 * Conséquence pratique : on projette les coordonnées ESPN sur le
 * parallélogramme COMPLET, coins hors cadre compris. Une action au centre
 * tombe juste ; une action sur l'aile gauche sort du cadre — cela se lit comme
 * un cadrage serré, pas comme un défaut, mais une passe partie de la ligne de
 * touche gauche ne sera pas visible.
 */
export const TERRAIN_ISO = {
  haut: [400, 310],
  droite: [820, 550],   // hors cadre (le fond s'arrête à 768)
  bas: [160, 990],
  gauche: [-260, 750],  // hors cadre
}
// Les deux coins latéraux ne sont pas visibles : ils viennent du prolongement
// des bords, puis ont été ajustés pour que la cage et le rond central tombent
// sur leurs positions mesurées. Tolérance constatée : une vingtaine de pixels,
// invisible à l'œil sur un reel.

/**
 * Projette une position de terrain sur le fond isométrique.
 *
 * `u` court de 0 (ligne de touche gauche) à 1 (droite), `v` de 0 (ligne de
 * but défendue) à 1 (ligne de but attaquée) — la même convention que
 * goalanim.js, pour que les deux rendus soient interchangeables.
 */
export function pointTerrain(u, v) {
  const { haut, droite, bas, gauche } = TERRAIN_ISO
  // Les deux lignes de but sont les arêtes `gauche→bas` (v=0, but défendu) et
  // `haut→droite` (v=1, but attaqué) : c'est le long de cette seconde arête
  // que la cage est dessinée sur le fond. On interpole d'abord le long de v
  // sur chaque bord, puis entre les deux bords selon u.
  const gx = gauche[0] + (haut[0] - gauche[0]) * v, gy = gauche[1] + (haut[1] - gauche[1]) * v
  const dx = bas[0] + (droite[0] - bas[0]) * v, dy = bas[1] + (droite[1] - bas[1]) * v
  return [gx + (dx - gx) * u, gy + (dy - gy) * u]
}

/**
 * Masque une case du fond avant d'écrire dessus.
 *
 * Indispensable tant que les fonds portent leurs cadres en pointillés et leurs
 * mots « PLACEHOLDER » : sans ça, ils transparaissent sous le contenu. Le
 * remplissage est OPAQUE — une première version à 0,90 d'alpha laissait encore
 * lire « MATCH VIDEO PLACEHOLDER » dessous.
 */
export function couvrir(ctx, [x, y, w, h], fond = '#070B16', r = 10) {
  ctx.save()
  ctx.beginPath(); ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  ctx.fillStyle = fond; ctx.fill()
  ctx.strokeStyle = 'rgba(204,172,97,0.55)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.restore()
}

/**
 * Écrit de l'arabe.
 *
 * Tajawal gras, et SURTOUT aucun espacement de lettres : l'arabe est une
 * écriture liée, un `letterSpacing` détache chaque caractère et le texte
 * devient illisible (incident du 09/10, voir pressing90-arabe-liaisons).
 */
export function ar(ctx, t, x, y, { size = 30, color = CREME, align = 'center' } = {}) {
  ctx.save()
  ctx.font = `bold ${size}px Tajawal`; ctx.fillStyle = color
  ctx.textAlign = align; ctx.textBaseline = 'middle'
  ctx.fillText(t, x, y)
  ctx.restore()
}

/**
 * Écrit un nombre À CÔTÉ d'un texte arabe, sans les mélanger dans la même
 * chaîne.
 *
 * Une chaîne qui mêle arabe et chiffres est réordonnée par l'algorithme
 * bidirectionnel, et le nombre part à l'autre bout de la ligne : « 14 أكتوبر
 * 2026 » s'est affiché « أكتوبر 2026 … 14 ». Deux tracés séparés, et le
 * problème disparaît.
 */
export function arNombre(ctx, texteAr, nombre, x, y, { size = 22, color = CREME, ecart = 10 } = {}) {
  ctx.save()
  ctx.font = `${size}px Archivo`
  const ln = ctx.measureText(String(nombre)).width
  ctx.font = `bold ${size}px Tajawal`
  const la = ctx.measureText(texteAr).width
  const total = ln + ecart + la
  let gx = x - total / 2
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = color
  ctx.font = `${size}px Archivo`; ctx.fillText(String(nombre), gx, y)
  gx += ln + ecart
  ctx.font = `bold ${size}px Tajawal`; ctx.fillText(texteAr, gx, y)
  ctx.restore()
}

/**
 * Le tableau comparatif de deux équipes : une ligne par statistique, le nom au
 * centre, les deux valeurs de part et d'autre, et deux barres proportionnelles
 * qui s'éloignent du centre.
 *
 * `lignes` : [libellé arabe, valeur gauche, valeur droite, texte gauche, texte droite]
 */
export function tableauComparatif(ctx, [X, Y, W], lignes, { hauteurLigne = 66, teinteDroite = MENTHE } = {}) {
  const cx = X + W / 2, demi = Math.round(W * 0.305)
  for (let i = 0; i < lignes.length; i++) {
    const [lab, g, d, tg, td] = lignes[i]
    const y = Y + 20 + i * hauteurLigne + hauteurLigne / 2
    const tot = (g + d) || 1
    ctx.save()
    ctx.fillStyle = 'rgba(244,243,238,0.85)'; ctx.fillRect(cx - 86 - demi * (g / tot), y + 13, demi * (g / tot), 9)
    ctx.fillStyle = teinteDroite; ctx.fillRect(cx + 86, y + 13, demi * (d / tot), 9)
    ctx.restore()
    ar(ctx, lab, cx, y - 8, { size: 23 })
    ctx.save(); ctx.font = '30px Anton'; ctx.fillStyle = CREME; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText(tg, cx - 96, y - 6)
    ctx.fillStyle = teinteDroite; ctx.textAlign = 'left'; ctx.fillText(td, cx + 96, y - 6); ctx.restore()
    if (i < lignes.length - 1) {
      ctx.save(); ctx.strokeStyle = 'rgba(127,231,196,0.12)'
      ctx.beginPath(); ctx.moveTo(X + 24, y + 34); ctx.lineTo(X + W - 24, y + 34); ctx.stroke(); ctx.restore()
    }
  }
}

/** Les libellés arabes des statistiques qu'ESPN expose. */
export const STATS_AR = {
  possession: 'الاستحواذ',
  shots: 'التسديدات',
  shotsOnTarget: 'على المرمى',
  corners: 'الركنيات',
  passes: 'التمريرات',
  passAccuracy: 'دقة التمرير',
  fouls: 'الأخطاء',
  saves: 'التصديات',
  offsides: 'التسلل',
  yellowCards: 'البطاقات الصفراء',
}
