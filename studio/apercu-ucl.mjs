// Aperçu d'une carte de reel, sans passer par ffmpeg.
//
// Compose la PREMIÈRE IMAGE du reel exactement comme le fait animSlide : le
// fond, puis chaque couche à la position de son animation. C'est l'image que
// Facebook montre en vignette, et celle qui décide si on reste — la regarder
// coûte deux secondes ici, contre plusieurs minutes de rendu vidéo.
//
//   cd studio && node apercu-ucl.mjs      → /tmp/ucl-*.png et /tmp/ordinaire.png
import { createCanvas } from 'canvas'
import { writeFileSync } from 'node:fs'
import { loadImage } from 'canvas'
import { drawUclMatchLayers, drawMatchLayers, registerBrandFonts } from './draw.js'

const T = (id) => `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`
const MATCHS = [
  { home: 'Real Madrid', away: 'Manchester City', homeLogo: T(86), awayLogo: T(382), league: 'UEFA Champions League', round: 'Phase de ligue · Journée 3', time: '21:00', cover: { text: 'ليلة أوروبية: من يفوز؟', tone: 'matchday' } },
  { home: 'Inter', away: 'Arsenal', homeLogo: T(110), awayLogo: T(359), league: 'UEFA Champions League', round: 'Phase de ligue · Journée 3', time: '21:00' },
  { home: 'Paris Saint-Germain', away: 'Bayer Leverkusen', homeLogo: T(160), awayLogo: T(131), league: 'UEFA Champions League', round: 'Phase de ligue · Journée 3', live: true, score: '2–1' },
]

async function composer(spec, sortie) {
  const c = createCanvas(1080, 1920), ctx = c.getContext('2d')
  const img = {}
  for (const [k, buf] of Object.entries(spec.layers)) img[k] = await loadImage(buf)
  // bg d'abord, puis chaque couche à sa position d'animation
  ctx.drawImage(img.bg, 0, 0)
  for (const a of spec.anims) {
    const l = img[a.layer]
    if (!l) continue
    if (a.w && a.h) ctx.drawImage(l, a.x, a.y, a.w, a.h)
    else ctx.drawImage(l, a.x, a.y)
  }
  writeFileSync(sortie, c.toBuffer('image/png'))
  console.log(' →', sortie)
}

registerBrandFonts()
for (let i = 0; i < MATCHS.length; i++) {
  await composer(await drawUclMatchLayers(MATCHS[i], i, MATCHS.length, undefined, 'fr'), `/tmp/ucl-${i}.png`)
}
// La carte ordinaire, pour comparer
await composer(await drawMatchLayers(MATCHS[0], 0, 3, undefined, 'en'), '/tmp/ordinaire.png')
