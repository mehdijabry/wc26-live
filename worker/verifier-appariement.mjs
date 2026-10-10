/**
 * Les cas de contrôle de l'appariement ESPN ↔ BSD.
 *
 * POURQUOI CE FICHIER EXISTE. La règle a été réécrite trois fois le
 * 10 octobre 2026, et chaque version cassait ce que la précédente réussissait :
 *
 *   1. ressemblance = mots communs / nom le plus COURT
 *      → « Manchester City » et « Manchester United » obtenaient 0,5, soit
 *        autant que « Bayern Munich » et « FC Bayern München ».
 *   2. ressemblance = mots communs / nom le plus LONG
 *      → City/United recalé, mais « Feyenoord Rotterdam » face à
 *        « Feyenoord » tombait aussi, et le taux est passé de 71 % à 61 %.
 *   3. refus dès que les DEUX noms gardent un mot orphelin
 *      → un mot en plus est anodin, deux mots qui se contredisent ne le sont
 *        pas. C'est la version en place.
 *
 * Les paires ci-dessous sont toutes RÉELLES, relevées sur les deux API le
 * même jour. Avant de toucher à la règle, lancer :
 *
 *     node verifier-appariement.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sortie = join(mkdtempSync(join(tmpdir(), 'appariement-')), 'pronostics.mjs')
execFileSync('npx', ['esbuild', 'src/pronostics.ts', '--bundle', '--format=esm', '--platform=node', `--outfile=${sortie}`, '--log-level=error'])
const { ressemblance } = await import(sortie)

/** Le même seuil que la porte « ancre » de construireAppariement. */
const SEUIL = 0.6

const cas = [
  // ── Doivent s'apparier ────────────────────────────────────────────────
  ['Bayern Munich', 'FC Bayern München', true],      // exonyme
  ['Internazionale', 'Inter', true],                 // préfixe
  ['Brest', 'Stade Brestois', true],                 // préfixe + forme de club
  ['Red Bull New York', 'New York Red Bulls', true], // ordre + radical
  ['Racing Genk', 'KRC Genk', true],                 // forme de club
  ['Feyenoord Rotterdam', 'Feyenoord', true],        // ville en plus
  ['Ajax Amsterdam', 'Ajax', true],                  // ville en plus
  ['Mainz', '1. FSV Mainz 05', true],                // numéro et forme en plus
  ['Wolverhampton Wanderers', 'Wolves', true],       // préfixe
  ['Saint-Étienne', 'Saint-Etienne', true],          // accent
  ['RB Salzburg', 'Red Bull Salzburg', true],        // sigle de deux lettres
  ['Bodo/Glimt', 'Bodø/Glimt', true],                // « ø » non décomposable
  ['Grazer AK', 'Grazer AK 1902', true],             // année en plus

  // ── Ne doivent JAMAIS s'apparier ──────────────────────────────────────
  ['Manchester City', 'Manchester United', false],   // même ville, autre club
  ['Bayern Munich', 'Bayer Leverkusen', false],      // préfixe trompeur
  ['Atletico Madrid', 'Real Madrid', false],         // même ville, autre club
  ['Brest', 'Brescia', false],                       // préfixe trop court
  ['Inter', 'Parma', false],
  ['Juventus', 'Torino', false],
]

let echecs = 0
for (const [a, b, attendu] of cas) {
  const s = ressemblance(a, b)
  const ok = (s >= SEUIL) === attendu
  if (!ok) echecs++
  console.log(`${ok ? '  ok  ' : '  RATÉ'}  ${s.toFixed(2)}  ${a.padEnd(24)} ~ ${b}`)
}
console.log(`\n  ${cas.length - echecs}/${cas.length} cas conformes`)
process.exit(echecs ? 1 : 0)
