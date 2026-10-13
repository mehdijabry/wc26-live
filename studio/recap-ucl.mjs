// Récapitulatif d'une soirée européenne : TOUS les matchs, en deux cartes.
//
//   cd studio && node recap-ucl.mjs            → /tmp/recap-ucl.mp4
//   COVER='...' TITRE='...' node recap-ucl.mjs
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { drawUclRecapLayers, drawUclMatchLayers, registerBrandFonts } from './draw.js'
import { renderSoireeReel } from './video.js'

const FONDS = new URL('./assets/ucl/', import.meta.url).pathname
const TZ = 'Africa/Casablanca'
const jour = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, '')
// Quatre rencontres par carte au maximum. À cinq, la dernière ligne tombait
// dans les gradins du fond et disparaissait — mesuré à l'image.
const PAR_CARTE = 4
// 4 s par carte, et non 2,6 : trois rencontres à lire demandent plus de
// temps qu'une seule affiche. La vidéo passe à ~13,5 s, au-dessus des neuf
// secondes mesurées comme optimales — mais un tableau qu'on ne peut pas lire
// ne retient personne non plus.
const DUREE_CARTE = 4.0

const ETATS = { pre: '', halftime: 'الاستراحة', post: 'انتهت' }
const rep = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=${jour}`, { headers: { 'user-agent': 'p90/1.0' } })
const { events = [] } = await rep.json()
const matchs = events.map((e) => {
  const c = e.competitions[0]
  const h = c.competitors.find((x) => x.homeAway === 'home'), a = c.competitors.find((x) => x.homeAway === 'away')
  const st = e.status.type
  const direct = st.state === 'in', fini = st.completed
  return {
    home: h.team.shortDisplayName || h.team.displayName, away: a.team.shortDisplayName || a.team.displayName,
    homeLogo: h.team.logo, awayLogo: a.team.logo,
    kickoff: e.date,
    time: new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(e.date)),
    live: direct,
    score: direct || fini ? `${h.score}–${a.score}` : undefined,
    etat: fini ? ETATS.post : direct ? (/halftime/i.test(st.name) ? ETATS.halftime : `${e.status.displayClock || ''}`) : '',
  }
})
if (!matchs.length) { console.log('aucun match'); process.exit(0) }
// Dans l'ordre du coup d'envoi : c'est l'ordre dans lequel on a suivi la soirée.
matchs.sort((a, b) => a.kickoff.localeCompare(b.kickoff))
console.log(`${matchs.length} matchs`)
matchs.forEach((m) => console.log(`  ${m.home} ${m.score || m.time} ${m.away}  ${m.etat}`))

// Réparti ÉQUITABLEMENT : neuf matchs par paquets de quatre donnaient
// 4+4+1, et la dernière carte n'affichait qu'une rencontre perdue au milieu
// du vide. Même nombre de cartes, lignes réparties.
const nbCartes = Math.ceil(matchs.length / PAR_CARTE)
const parCarte = Math.ceil(matchs.length / nbCartes)
const pages = []
for (let i = 0; i < matchs.length; i += parCarte) pages.push(matchs.slice(i, i + parCarte))

const dir = '/tmp/recap-rendu'
await rm(dir, { recursive: true, force: true })
await mkdir(dir, { recursive: true })
registerBrandFonts()

const specs = []
const durees = []
if (existsSync(FONDS + 'fond-joueurs.jpg')) {
  specs.push(await drawUclMatchLayers({ ouverture: true, bgImage: FONDS + 'fond-joueurs.jpg', cover: { text: process.env.COVER || 'ليلة دوري الأبطال', tone: 'matchday' } }, 0, pages.length + 1, undefined, 'ar'))
  durees.push(1.5)
}
for (let p = 0; p < pages.length; p++) {
  specs.push(await drawUclRecapLayers(pages[p], p + 1, pages.length, {
    bgImage: FONDS + 'fond-stade.jpg',
    titre: process.env.TITRE || 'دوري الأبطال',
    cover: undefined, lang: 'ar',
  }))
  durees.push(DUREE_CARTE)
}

const slides = []
for (let i = 0; i < specs.length; i++) {
  const layers = {}
  for (const [k, buf] of Object.entries(specs[i].layers)) { layers[k] = path.join(dir, `r${i}-${k}.png`); await writeFile(layers[k], buf) }
  slides.push({ layers, anims: specs[i].anims })
}
const out = path.join(dir, 'recap.mp4')
const musique = new URL('../public/audio/matchday2.m4a', import.meta.url).pathname
const { seconds } = await renderSoireeReel({ slides, durees, music: musique, out })
await writeFile(`/tmp/recap-ucl-${jour}.mp4`, await readFile(out))
console.log(`\n→ /tmp/recap-ucl-${jour}.mp4  (${seconds} s, ${specs.length} cartes)`)
