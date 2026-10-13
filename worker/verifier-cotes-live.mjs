/**
 * Vérifie le modèle de cote en jeu sur des scénarios lisibles.
 *
 *   node verifier-cotes-live.mjs
 *
 * On ne teste pas des valeurs figées : on teste la DYNAMIQUE, qui est ce que
 * le modèle promet. Une cote qui ne monterait pas à mesure que le temps
 * manque serait fausse même si chaque nombre était « plausible ».
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'cl-'))
const out = join(dir, 'cl.mjs')
execFileSync('npx', ['esbuild', 'src/cotes-live.ts', '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error'], { stdio: 'inherit' })
const { cotesLive1X2, grilleLive, minuteDuMatch, fermetureLive, DUREE_MODELE, FERMETURE_AVANT_FIN } = await import(out)

let echecs = 0
const verifier = (nom, condition, detail = '') => {
  console.log(`${condition ? '  ✓' : '  ✗'} ${nom}${detail ? ' — ' + detail : ''}`)
  if (!condition) echecs++
}

// Favori à domicile, cote d'avant-match 1,50 — espérances 2,18 / 0,86.
const D = 2.18, E = 0.86

console.log('\nLe favori est MENÉ 0-1 : sa cote doit monter avec le temps')
const mene = [1, 30, 60, 83].map((m) => cotesLive1X2(D, E, { minute: m, butsDom: 0, butsExt: 1 }))
mene.forEach((c, i) => console.log(`     ${[1, 30, 60, 83][i]}' → ${c.home}`))
verifier('la cote croît strictement', mene.every((c, i) => i === 0 || c.home > mene[i - 1].home))
verifier('à la 83e elle dépasse largement la 30e', mene[3].home > mene[1].home * 3,
  `${mene[1].home} → ${mene[3].home}`)

console.log('\nLe favori MÈNE 1-0 : sa cote doit descendre vers 1,00')
const mene2 = [1, 60, 83].map((m) => cotesLive1X2(D, E, { minute: m, butsDom: 1, butsExt: 0 }))
mene2.forEach((c, i) => console.log(`     ${[1, 60, 83][i]}' → ${c.home}`))
verifier('la cote décroît', mene2[2].home < mene2[0].home)
verifier('elle reste au-dessus du plancher', mene2.every((c) => c.home >= 1.01))

console.log('\n0-0 : le nul se resserre quand le temps manque')
const nuls = [1, 45, 90].map((m) => cotesLive1X2(D, E, { minute: m, butsDom: 0, butsExt: 0 }).draw)
console.log('    ', nuls.join('  →  '))
verifier('le nul décroît', nuls[2] < nuls[1] && nuls[1] < nuls[0])

console.log('\nCohérence : la somme des probabilités implicites dépasse 1 (notre marge)')
for (const m of [10, 50, 80]) {
  const c = cotesLive1X2(D, E, { minute: m, butsDom: 1, butsExt: 1 })
  const s = 1 / c.home + 1 / c.draw + 1 / c.away
  verifier(`marge positive à la ${m}e`, s > 1 && s < 1.25, `somme ${s.toFixed(3)}`)
}

console.log('\nScores exacts : un score déjà dépassé disparaît')
const g = grilleLive(D, E, { minute: 70, butsDom: 1, butsExt: 1 }, 0.12, 5)
verifier('1-0 retiré', !('1-0' in g))
verifier('0-0 retiré', !('0-0' in g))
verifier('1-1 encore pariable', '1-1' in g, `à ${g['1-1']}`)

console.log('\nHorloge ESPN')
verifier('« 67\' » → 67', minuteDuMatch({ displayClock: "67'" }) === 67)
verifier('« 45\'+2 » → 47', minuteDuMatch({ displayClock: "45'+2" }) === 47)
verifier('2e période sans horloge → au moins 46', minuteDuMatch({ period: 2 }) >= 46)

// La borne se DÉDUIT de la constante : écrire « 84e » en dur avait fait
// échouer ce test au seul changement du réglage de 10 à 5 minutes.
const bascule = DUREE_MODELE - FERMETURE_AVANT_FIN
console.log(`\nFermeture : ${FERMETURE_AVANT_FIN} minutes avant la fin (bascule à la ${bascule}e)`)
const t0 = Date.now()
verifier(`ouverte juste avant (${bascule - 1}e)`, Date.parse(fermetureLive(bascule - 1, t0)) > t0)
verifier(`fermée à la bascule (${bascule}e)`, Date.parse(fermetureLive(bascule, t0)) <= t0)
verifier('fermée bien après (95e)', Date.parse(fermetureLive(95, t0)) <= t0)

console.log(echecs ? `\n${echecs} VÉRIFICATION(S) EN ÉCHEC\n` : '\nTout est conforme.\n')
process.exit(echecs ? 1 : 0)
