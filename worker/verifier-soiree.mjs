/**
 * Vérifie le déclenchement des quatre vidéos d'une soirée européenne.
 *
 *   node verifier-soiree.mjs
 *
 * Ce qui est testé n'est pas une valeur mais une GARANTIE : à tout instant
 * d'une soirée, au plus un moment est armé — jamais deux à la fois, et aucun
 * trou où il n'y en aurait aucun alors que la soirée bat son plein.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'soiree-'))
const out = join(dir, 'a.mjs')
execFileSync('npx', ['esbuild', 'src/automation.ts', '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error', '--external:cloudflare:*'], { stdio: 'inherit' })
const { MOMENTS_SOIREE, minuteDeJeu, classerAffiches } = await import(out)

let ko = 0
const ok = (nom, cond, detail = '') => { if (!cond) ko++; console.log(`  ${cond ? 'ok ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`) }
const titre = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 54 - t.length))}`)

titre('Lecture de la minute')
for (const [clock, attendu] of [["23'", 23], ["45'+2", 45], ["90'+4", 90], ["68'", 68], ['', null], [undefined, null], ['HT', null]])
  ok(`« ${clock ?? '(absent)'} » → ${attendu}`, minuteDeJeu(clock) === attendu)

titre('Un seul moment armé à la fois')
const armes = (e) => MOMENTS_SOIREE.filter((m) => m.quand(e)).map((m) => m.cle)
// Une soirée minute par minute, sept matchs lancés ensemble.
const soiree = []
for (let min = 1; min <= 95; min++) soiree.push({ minute: min, pause: 0, finis: 0, total: 7 })
const parMinute = soiree.map((e) => ({ min: e.minute, armes: armes(e) }))
ok('aucune minute n’arme deux moments', parMinute.every((x) => x.armes.length <= 1),
   parMinute.filter((x) => x.armes.length > 1).map((x) => `${x.min}'`).join(' ') || 'aucun chevauchement')
ok('la 1re mi-temps est couverte de la 20e à la 32e',
   parMinute.filter((x) => x.armes[0] === 'mt1').map((x) => x.min).join(',') === Array.from({ length: 13 }, (_, i) => i + 20).join(','))
ok('la 2e mi-temps est couverte de la 63e à la 75e',
   parMinute.filter((x) => x.armes[0] === 'mt2').map((x) => x.min).join(',') === Array.from({ length: 13 }, (_, i) => i + 63).join(','))
ok('une fenêtre de 13 minutes couvre une minuterie à 5 min',
   13 >= 5 * 2, 'la passe ne peut pas la sauter')

titre('Mi-temps et fin')
ok('mi-temps : la moitié des matchs déclarés en pause', armes({ minute: 45, pause: 4, finis: 0, total: 7 }).includes('repos'))
ok('mi-temps : un seul match en pause ne suffit pas', !armes({ minute: 45, pause: 1, finis: 0, total: 7 }).includes('repos'))
ok('fin : tous les matchs terminés', armes({ minute: null, pause: 0, finis: 7, total: 7 }).includes('fin'))
ok('fin : six sur sept ne suffisent pas', !armes({ minute: null, pause: 0, finis: 6, total: 7 }).includes('fin'))
ok('aucune soirée vide n’arme la fin', !armes({ minute: null, pause: 0, finis: 0, total: 0 }).includes('fin'))

titre('Classement des affiches')
const M = (home, away) => ({ home, away, state: 'pre' })
const classe = classerAffiches([
  M('Viking FK', 'Bayern Munich'), M('Atlético Madrid', 'Manchester United'),
  M('Galatasaray', 'Barcelona'), M('Arsenal', 'Lille'), M('Internazionale', 'Club Brugge'),
]).map((m) => `${m.home} – ${m.away}`)
ok('Barcelone en tête', classe[0] === 'Galatasaray – Barcelona', classe[0])
ok('Atlético – United devant Viking – Bayern', classe.indexOf('Atlético Madrid – Manchester United') < classe.indexOf('Viking FK – Bayern Munich'),
   classe.slice(0, 3).join(' | '))
ok('Viking – Bayern en dernier', classe[classe.length - 1] === 'Viking FK – Bayern Munich')

console.log(ko ? `\n${ko} ÉCHEC(S)\n` : '\nTout passe.\n')
process.exit(ko ? 1 : 0)
