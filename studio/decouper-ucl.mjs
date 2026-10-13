// Découpe la planche des trois fonds Ligue des champions en trois images.
//
// Les séparateurs blancs sont MESURÉS, pas devinés : si Mehdi renvoie une
// planche aux proportions différentes, le découpage suit sans qu'on touche
// à une coordonnée.
import { createCanvas, loadImage } from 'canvas'
import { createRequire } from 'node:module'
import { writeFileSync, readdirSync } from 'node:fs'
const sharp = createRequire('/Users/Mehdi/Desktop/wc2026-hub/worker/x.js')('sharp')

const DOSSIER = new URL('./assets/ucl/', import.meta.url).pathname
const NOMS = ['fond-trophee.jpg', 'fond-joueurs.jpg', 'fond-stade.jpg']

const planche = readdirSync(DOSSIER).find((f) => /whatsapp|planche|\.(jpe?g|png|webp)$/i.test(f) && !NOMS.includes(f))
if (!planche) { console.log('aucune planche à découper'); process.exit(0) }

const img = await loadImage(DOSSIER + planche)
const c = createCanvas(img.width, img.height), ctx = c.getContext('2d')
ctx.drawImage(img, 0, 0)
const px = ctx.getImageData(0, 0, img.width, img.height).data

const clair = (i) => px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235
/** Une colonne est « blanche » si presque tous ses pixels le sont. */
const blanche = (x) => {
  let n = 0, t = 0
  for (let y = 0; y < img.height; y += 6) { t++; if (clair((y * img.width + x) * 4)) n++ }
  return n / t > 0.9
}
/** Idem pour une ligne : la planche a aussi un liseré en haut et en bas. */
const ligneBlanche = (y) => {
  let n = 0, t = 0
  for (let x = 0; x < img.width; x += 6) { t++; if (clair((y * img.width + x) * 4)) n++ }
  return n / t > 0.9
}
// Le liseré horizontal : sans le retirer, chaque carte sortait avec un trait
// blanc collé en haut de l'affiche.
let hautUtile = 0, basUtile = img.height - 1
while (hautUtile < img.height && ligneBlanche(hautUtile)) hautUtile++
while (basUtile > hautUtile && ligneBlanche(basUtile)) basUtile--
console.log(`liseré retiré : ${hautUtile} px en haut, ${img.height - 1 - basUtile} px en bas`)

const bandes = []
for (let x = 0; x < img.width; x++) {
  if (!blanche(x)) continue
  const d = bandes[bandes.length - 1]
  if (d && x === d.fin + 1) d.fin = x
  else bandes.push({ debut: x, fin: x })
}
// Les bords de la planche comptent aussi comme séparateurs.
const sep = [{ debut: -1, fin: -1 }, ...bandes.filter((b) => b.fin - b.debut >= 4), { debut: img.width, fin: img.width }]
console.log('séparateurs mesurés :', sep.map((b) => `${b.debut}→${b.fin}`).join('  '))

const panneaux = []
for (let i = 0; i < sep.length - 1; i++) {
  const x0 = sep[i].fin + 1, x1 = sep[i + 1].debut
  if (x1 - x0 > img.width * 0.15) panneaux.push({ x: x0, w: x1 - x0 })
}
console.log('panneaux :', panneaux.map((p) => `${p.w}px à x=${p.x}`).join('  '))
if (panneaux.length !== 3) { console.log(`ATTENDU 3 PANNEAUX, TROUVÉ ${panneaux.length} — rien écrit`); process.exit(1) }

for (let i = 0; i < 3; i++) {
  const { x, w } = panneaux[i]
  // Sortie en 1080×1920, ANCRÉE EN HAUT, liseré exclu.
  //
  // Les panneaux sont plus étroits que le 9:16 : un recadrage centré rognait
  // autant en haut qu'en bas, et le bandeau « Pressing 90' » se retrouvait
  // coupé. C'est le bas de l'affiche — le vide sous le stade — qu'on peut
  // perdre, jamais le logo.
  const y0 = hautUtile, h = basUtile - hautUtile + 1
  const ech = Math.max(1080 / w, 1920 / h)
  const d = createCanvas(1080, 1920), dc = d.getContext('2d')
  dc.imageSmoothingQuality = 'high'
  dc.drawImage(img, x, y0, w, h, (1080 - w * ech) / 2, 0, w * ech, h * ech)
  const jpg = await sharp(d.toBuffer('image/png')).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer()
  writeFileSync(DOSSIER + NOMS[i], jpg)
  console.log(' →', NOMS[i], `1080×1920`, `${Math.round(jpg.length / 1024)} Ko`)
}
