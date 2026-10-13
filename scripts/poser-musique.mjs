// Installe une piste de musique de reel dans public/audio/.
//
// ── POURQUOI NORMALISER ──────────────────────────────────────────────────
// Le studio applique un GAIN FIXE à la musique (0,9 sans voix, 0,22 avec).
// Une piste livrée 7 dB plus fort que l'ancienne sortirait donc 7 dB plus
// fort dans le reel — et « matchs du jours » est à -5,4 LUFS contre -12,4
// pour la piste en place. On aligne tout sur -12,4 LUFS, plafond à -1 dBTP,
// en deux passes : la première mesure, la seconde corrige.
//
//   node scripts/poser-musique.mjs "<source>" <nom-de-sortie> [secondes]
import { execFileSync, spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'

const [source, nom, secondes = '60'] = process.argv.slice(2)
if (!source || !nom) { console.log('usage: poser-musique.mjs <source> <nom.m4a> [secondes]'); process.exit(1) }

const CIBLE = { I: -12.4, TP: -1.0, LRA: 11 }
const sortie = `public/audio/${nom}`

const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
/**
 * ffmpeg écrit le rapport loudnorm sur la SORTIE D'ERREUR, pas sur la sortie
 * standard, et il termine en code 0 : `execFileSync` ne rendait donc rien du
 * tout. D'où spawnSync, qui donne les deux flux.
 */
const mesurer = (f, extra = []) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', ...extra, '-i', f, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' })
  const m = `${r.stderr || ''}${r.stdout || ''}`.match(/\{[^{}]*input_i[^{}]*\}/s)
  return m ? JSON.parse(m[0]) : null
}

const avant = mesurer(source, ['-t', secondes])
if (!avant) { console.log('mesure impossible'); process.exit(1) }
console.log(`  avant : I=${avant.input_i} LUFS  TP=${avant.input_tp} dB  LRA=${avant.input_lra}`)

const filtre = `loudnorm=I=${CIBLE.I}:TP=${CIBLE.TP}:LRA=${CIBLE.LRA}` +
  `:measured_I=${avant.input_i}:measured_TP=${avant.input_tp}:measured_LRA=${avant.input_lra}` +
  `:measured_thresh=${avant.input_thresh}:offset=${avant.target_offset}:linear=true:print_format=summary`
try {
  // SURTOUT PAS de limiteur après loudnorm. `alimiter` remonte le niveau par
  // défaut (son option `level` est active) : ajouté « par sécurité », il
  // faisait passer la crête de -1,0 dB à 0,0 dB — mesuré. loudnorm tient
  // déjà son plafond tout seul.
  ff(['-y', '-t', secondes, '-i', source, '-af', `${filtre},afade=t=out:st=${Number(secondes) - 2}:d=2`,
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', sortie])
} catch (e) { console.log(e.stderr?.slice(-600) || e.message); process.exit(1) }

const apres = mesurer(sortie)
console.log(`  après : I=${apres.input_i} LUFS  TP=${apres.input_tp} dB  LRA=${apres.input_lra}`)
console.log(`  → ${sortie}  ${Math.round(statSync(sortie).size / 1024)} Ko`)
