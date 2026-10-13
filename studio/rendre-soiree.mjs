// Rend la vidéo de la soirée en local — IMAGE SEULE, rien n'est publié.
//
// Passe par renderSoireeReel, la MÊME fonction que le studio en production :
// ce qu'on regarde ici est exactement ce qui sortira de la chaîne.
//
//   cd studio && node rendre-soiree.mjs
//   TRANSITION=wiperight node rendre-soiree.mjs
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import { drawUclMatchLayers } from './draw.js'
import { renderSoireeReel } from './video.js'
import { cartes, DUREES, jour } from './soiree-ucl.mjs'

const dir = '/tmp/soiree-rendu'
await rm(dir, { recursive: true, force: true })
await mkdir(dir, { recursive: true })

const slides = []
for (let i = 0; i < cartes.length; i++) {
  const spec = await drawUclMatchLayers(cartes[i], i, cartes.length, undefined, 'ar')
  const layers = {}
  for (const [k, buf] of Object.entries(spec.layers)) {
    layers[k] = path.join(dir, `s${i}-${k}.png`)
    await writeFile(layers[k], buf)
  }
  slides.push({ layers, anims: spec.anims })
  console.log(`  carte ${i + 1}/${cartes.length} — ${DUREES[i] ?? 2.5} s`)
}

const out = path.join(dir, 'soiree.mp4')
const { seconds } = await renderSoireeReel({ slides, durees: DUREES, transition: process.env.TRANSITION || 'fadewhite', out })
const sortie = `/tmp/soiree-ucl-${jour}.mp4`
await writeFile(sortie, await readFile(out))
console.log(`\n→ ${sortie}  (${seconds} s)`)
