// La soirée de Ligue des champions, en cartes de reel.
//
// Va chercher les affiches du jour chez ESPN, en retient trois, et compose
// la première image de chaque carte sur les fonds fournis. Aucune donnée
// n'est saisie à la main : les heures, les écussons et les scores viennent
// de la même source que le site.
//
//   cd studio && node soiree-ucl.mjs [AAAAMMJJ]
import { createCanvas, loadImage } from 'canvas'
import { writeFileSync, existsSync } from 'node:fs'
import { drawUclMatchLayers, registerBrandFonts } from './draw.js'

export const DUREES = [1.5, 2.5, 2.5, 2.5]   // ouverture courte, puis les affiches — neuf secondes

const FONDS = new URL('./assets/ucl/', import.meta.url).pathname
const TZ = 'Africa/Casablanca'          // le fuseau du site, pas celui de la machine
export const jour = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, '')

/**
 * L'ordre des affiches.
 *
 * Barcelone d'abord : c'est le sujet de la page. Ensuite le pedigree
 * européen, parce qu'une vignette ne retient que si on reconnaît les deux
 * écussons en un dixième de seconde.
 */
const POIDS = {
  Barcelona: 100, 'Real Madrid': 90, 'Manchester City': 86, Liverpool: 84, 'Bayern Munich': 84,
  'Paris Saint-Germain': 82, 'Manchester United': 80, Arsenal: 78, 'Atlético Madrid': 76,
  Internazionale: 74, Chelsea: 72, Juventus: 70, 'Borussia Dortmund': 68, Napoli: 66,
  'AC Milan': 66, 'Atalanta': 60, 'Benfica': 58, 'FC Porto': 58, 'Ajax Amsterdam': 56,
  'Bayer Leverkusen': 56, 'RB Leipzig': 54, 'PSV Eindhoven': 52, Galatasaray: 52,
  'Sporting CP': 50, 'Club Brugge': 46, Villarreal: 46, Lille: 44,
}
/**
 * Une affiche vaut par son côté le PLUS FAIBLE.
 *
 * Prendre le maximum des deux faisait passer Viking – Bayern devant
 * Atlético – Manchester United : un seul grand nom ne fait pas une affiche,
 * il faut reconnaître les deux écussons d'un coup d'œil. D'où le côté faible
 * compté double.
 */
const poids = (m) => {
  const a = POIDS[m.home] ?? 20, b = POIDS[m.away] ?? 20
  return Math.min(a, b) * 2 + Math.max(a, b)
}
/** Barcelone passe devant quoi qu'il arrive : c'est le sujet de la page. */
const barca = (m) => /barcelona|barça/i.test(`${m.home} ${m.away}`)

const rep = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=${jour}`, { headers: { 'user-agent': 'p90/1.0' } })
const { events = [] } = await rep.json()
const matchs = events.map((e) => {
  const c = e.competitions[0]
  const h = c.competitors.find((x) => x.homeAway === 'home'), a = c.competitors.find((x) => x.homeAway === 'away')
  const fini = e.status.type.completed, direct = e.status.type.state === 'in'
  return {
    home: h.team.displayName, away: a.team.displayName,
    homeLogo: h.team.logo, awayLogo: a.team.logo,
    league: 'UEFA Champions League',
    time: new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(e.date)),
    live: direct,
    score: fini || direct ? `${h.score}–${a.score}` : undefined,
    fini,
  }
})
if (!matchs.length) { console.log(`aucun match de Ligue des champions le ${jour}`); process.exit(0) }

// Les affiches À VENIR d'abord : un reel d'annonce ne s'ouvre pas sur un
// match déjà joué. Les matchs finis restent disponibles en complément.
const aVenir = matchs.filter((m) => !m.fini).sort((x, y) => (barca(y) - barca(x)) || poids(y) - poids(x))
const choisis = (aVenir.length >= 3 ? aVenir : [...aVenir, ...matchs.filter((m) => m.fini).sort((x, y) => poids(y) - poids(x))]).slice(0, 3)

console.log(`${matchs.length} matchs le ${jour} · ${aVenir.length} à venir`)
console.log('\nretenus pour le reel :')
choisis.forEach((m, i) => console.log(`  ${i + 1}. ${m.home} – ${m.away}   ${m.score || m.time}`))

/**
 * Toutes les cartes prennent le fond STADE.
 *
 * Les fonds « joueurs » et « trophée » sont plus accrocheurs, mais ils
 * occupent précisément la bande où se posent les écussons : rendu, le match
 * y tombait sur le maillot de Mbappé et les noms d'équipe se perdaient dans
 * les visages. Le fond stade a le milieu vide — c'est le seul des trois sur
 * lequel une affiche se lit. Les deux autres font d'excellentes publications
 * à part, sans données par-dessus.
 */
const fond = () => {
  const f = FONDS + 'fond-stade.jpg'
  return existsSync(f) ? f : undefined
}

// ── LA LÉGENDE ────────────────────────────────────────────────────────────
// Entre 200 et 400 caractères, quatre mots-dièse : la mesure du 11/10 montre
// que la légende suit la même règle que la vidéo — 334 caractères pour le
// reel à 1 036 vues, 575 pour celui à 217. La VIDÉO montre trois affiches,
// la LÉGENDE garde toute la soirée.
const AR = { Barcelona: 'برشلونة', Galatasaray: 'غلطة سراي', 'Atlético Madrid': 'أتلتيكو مدريد', 'Manchester United': 'مانشستر يونايتد', Arsenal: 'أرسنال', Lille: 'ليل', Internazionale: 'إنتر', 'Club Brugge': 'كلوب بروج', 'RB Leipzig': 'لايبزيغ', 'PSV Eindhoven': 'آيندهوفن', Villarreal: 'فياريال', Napoli: 'نابولي', 'Viking FK': 'فايكينغ', 'Bayern Munich': 'بايرن ميونيخ', Lens: 'لانس', 'Sporting CP': 'سبورتينغ', 'Sabah FK': 'صباح', 'Slavia Prague': 'سلافيا براغ' }
const ar = (n) => AR[n] || n
const affiches = aVenir.slice(0, 7).map((m) => `${ar(m.home)} × ${ar(m.away)}`).join(' · ')
const legende = `ليلة أوروبية كاملة الليلة في دوري الأبطال\n${affiches}\nالنتائج المباشرة والتشكيلات لحظة بلحظة على pressing90.live\n#دوري_الأبطال #برشلونة #الكرة_الأوروبية #Pressing90`
console.log(`\nlégende (${legende.length} caractères — viser 200 à 400) :\n${legende}\n`)

// La carte d'ouverture sur le fond « joueurs », puis les trois affiches sur
// le fond « stade ». Quatre cartes, mais l'ouverture est courte : 1,5 s puis
// 2,5 s par affiche, soit neuf secondes — la durée mesurée comme gagnante.
const ouverture = existsSync(FONDS + 'fond-joueurs.jpg')
  ? [{ ouverture: true, bgImage: FONDS + 'fond-joueurs.jpg', cover: { text: 'ليلة دوري الأبطال: من يفوز؟', tone: 'matchday' } }]
  : []
export const cartes = [...ouverture, ...choisis.map((m) => ({ ...m, bgImage: fond() }))]
export const legendeSoiree = legende

registerBrandFonts()
const direct = process.argv[1]?.endsWith('soiree-ucl.mjs')
for (let i = 0; direct && i < cartes.length; i++) {
  const m = cartes[i]
  const spec = await drawUclMatchLayers(m, i, cartes.length, undefined, 'ar')
  const c = createCanvas(1080, 1920), ctx = c.getContext('2d')
  const img = {}
  for (const [k, buf] of Object.entries(spec.layers)) img[k] = await loadImage(buf)
  ctx.drawImage(img.bg, 0, 0)
  for (const a of spec.anims) {
    const l = img[a.layer]; if (!l) continue
    if (a.w && a.h) ctx.drawImage(l, a.x, a.y, a.w, a.h); else ctx.drawImage(l, a.x, a.y)
  }
  const out = `/tmp/soiree-${i + 1}.png`
  writeFileSync(out, c.toBuffer('image/png'))
  console.log(' →', out)
}
