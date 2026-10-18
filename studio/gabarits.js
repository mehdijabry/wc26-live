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
  // Les deux plaques du ticket arrivent en 1152x2048, soit du 9:16 exact :
  // rien a rogner, la hauteur utile est la hauteur du fichier.
  'but-clip': 2080,
  // Les deux plaques du 18/10/2026, en 1664x2080 (4:5 exact) : rien a
  // rogner, la hauteur utile est celle du fichier.
  'resumes-du-jour': 2080,
  'but-filet': 2080,
  // La version large, generee par accident le 18/10 et gardee : un clip
  // 16:9 y respire, la carte epouse la forme de la video.
  'but-filet-large': 1152,
  'ticket-gagnant': 2048,
  'ticket-gagnant-barca': 2048,
  // Plaques de but refaites le 16/10/2026 en 1080x1920 : les anciennes
  // faisaient 768x1376 et portaient encore du decor de maquette, d'ou une
  // hauteur utile de 1190 qui laissait 247 px de vide en bas d'un reel.
  // Elles sont desormais nues : la hauteur entiere sert.
  'but-neutre': 1920,
  'but-barca': 1920,
  // Fond remplace le 15/10 par une plaque propre en 1080x1920 : plus de
  // fausse barre Facebook a couper, la hauteur utile est la hauteur entiere.
  'soiree-4-moments': 1920,
  // Plaques livrees le 15/10 pour remplacer assets/ucl/ : vierges de toute
  // competition, hauteur pleine.
  'soiree-ouverture': 1920,
  'soiree-recap': 1920,
  'soiree-fin': 1920,
  // Terrain debout, livre le 15/10 pour le reel « كيف جاء الهدف ».
  'terrain-vertical': 1920,
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
  // ── LES CARTES DE BUT SONT CENTREES, ET C'EST UN CORRECTIF ──────────────
  // Les reperes d'origine etaient releves sur la maquette 768x1376, qui etait
  // elle-meme decentree : une fois a l'echelle, les cadres tombaient a 56 px
  // du bord gauche et 208 du bord droit (vu par Mehdi le 16/10/2026). Les
  // plaques neuves ne portent plus aucun cadre — c'est le code qui les
  // dessine, donc ils n'ont plus de raison d'etre decales.
  //
  // Largeur 700 sur 768 : 34 px de marge de chaque cote, soit 48 px une fois
  // a l'echelle de 1080. La case « joueur » de la peau Barca disparait : elle
  // n'existait que pour un decoupage de la maquette.
  // Relevé au pixel sur la plaque 1664x2080 (17/10/2026), exprimé en
  // fractions parce que le rendu se fait en 1080x1350 : x 5,1 % → 94,9 %,
  // fenêtre 21 % → 58,6 %, bandeau 61,8 % → 77,2 %.
  'but-clip': { fenetre: [55, 283, 970, 508], bandeau: [55, 834, 970, 208] },
  // ── LES DEUX PLAQUES DU 18/10/2026 ──────────────────────────────────
  // Relevees A L'ENCRE sur les fichiers 1664x2080, pas a l'oeil :
  //  · « resumes-du-jour » : le filet dore traverse a y 403, et le cadre
  //    du panneau occupe x 120→1543, y 653→1374.
  //  · « but-filet » : le rectangle mat du centre va de x 160 a 1501 et
  //    de y 467 a 1290. Ses bords se trouvent par un SAUT de luminance
  //    moyenne, pas par uniformite : les mailles du filet passent devant
  //    le bord gauche et cassent toute mesure de platitude.
  //
  // Exprimees ici A L'ECHELLE DE LA PLAQUE ; les fonctions de dessin les
  // ramenent en 1080x1350 par le rapport 1080/1664.
  'resumes-du-jour': { filet: 403, panneau: [120, 653, 1423, 721] },
  // ── LA PLAQUE DU BUT N'A PLUS DE FENETRE ────────────────────────────
  // Mehdi, 18/10/2026 : « dans l'apercu il y'a un carre noir derriere qui
  // ne rend pas bien... tu poseras directement l'apercu sur le gabari, il
  // n'aura pas de cadre specifique, il prendra la forme de la video ».
  // Les plaques sont donc nues : plus de rectangle mat, juste le filet et
  // le ballon. Ce qui suit n'est plus une fenetre mais une ZONE LIBRE,
  // celle ou le filet est le plus sombre et ou une image se pose sans rien
  // masquer d'utile. La vignette y est centree A SA PROPRE FORME.
  'but-filet': { zone: [0.09, 0.16, 0.82, 0.54], legende: 0.77 },
  // La zone commence SOUS l'en-tete : a 0,08 la ligne de competition
  // passait dessous et disparaissait (vu le 18/10 sur le but d'Abde).
  // La zone se resserre encore depuis le 18/10 : le pied porte desormais
  // DEUX lignes — « le lien est en commentaire » puis la signature — et
  // il lui faut la place.
  'but-filet-large': { zone: [0.22, 0.13, 0.71, 0.45], legende: 0.70 },
  'but-neutre': { entete: [34, 250, 700, 160], centre: [34, 430, 700, 560], pied: [34, 1010, 700, 150] },
  'but-barca': { entete: [34, 250, 700, 160], centre: [34, 430, 700, 560], pied: [34, 1010, 700, 150] },
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
