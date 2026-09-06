// Reel assembly with ffmpeg — Ken Burns per scene, crossfades, music
// (looped, ducked under the optional voice, faded out), H.264 + AAC.
// Tuned for a 0.1-CPU Render instance: ultrafast preset, 30 fps.
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const SITE = process.env.SITE_URL || 'https://pressing90.live'
const MUSIC = { matchday: 'matchday.m4a', article: 'articles.m4a' }

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 20000) err = err.slice(-20000) })
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-1500)}`))))
  })
}

/** Signature music, fetched once from the site and cached on disk. */
export async function musicPath(kind) {
  const file = MUSIC[kind] || MUSIC.article
  const p = path.join(os.tmpdir(), 'p90-' + file)
  try { await fs.access(p); return p } catch { /* fetch */ }
  const r = await fetch(`${SITE}/audio/${file}`, { headers: { 'user-agent': 'p90-studio/1.0' } })
  if (!r.ok) throw new Error('music fetch failed ' + r.status)
  await fs.writeFile(p, Buffer.from(await r.arrayBuffer()))
  return p
}

export async function probeDuration(file) {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
    let out = ''
    p.stdout.on('data', (d) => { out += d })
    p.on('close', () => resolve(parseFloat(out) || 0))
  })
}

/**
 * scenes: PNG file paths (1080×1920). voice: mp3/wav path or null.
 * Returns {out, seconds}.
 */
export async function renderReel({ scenes, voice, music, musicGain, seconds, out }) {
  const fps = 30
  const total = voice ? (await probeDuration(voice)) + 1.2 : seconds
  const n = scenes.length
  const per = total / n
  const xf = n > 1 ? 0.5 : 0
  const args = ['-y', '-loglevel', 'error']
  // video inputs
  for (const s of scenes) args.push('-loop', '1', '-t', String(per + xf), '-i', s)
  // audio inputs
  const musicIdx = n
  args.push('-stream_loop', '-1', '-i', music)
  const voiceIdx = voice ? n + 1 : -1
  if (voice) args.push('-i', voice)

  // filtergraph: zoompan each scene, xfade chain, audio mix
  const frames = Math.round((per + xf) * fps)
  const fc = []
  for (let i = 0; i < n; i++) {
    fc.push(`[${i}:v]scale=1080:1920,zoompan=z='min(zoom+0.0006,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps},format=yuv420p[v${i}]`)
  }
  let vlast = 'v0'
  for (let i = 1; i < n; i++) {
    const offset = (per * i - xf * (i - 1)) - xf
    fc.push(`[${vlast}][v${i}]xfade=transition=fade:duration=${xf}:offset=${Math.max(0, offset).toFixed(3)}[vx${i}]`)
    vlast = `vx${i}`
  }
  const fadeOutStart = Math.max(0, total - 1.5).toFixed(2)
  fc.push(`[${musicIdx}:a]volume=${musicGain},afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutStart}:d=1.5[m]`)
  let alast = 'm'
  if (voice) {
    fc.push(`[${voiceIdx}:a]volume=1.0[vo]`)
    fc.push(`[vo][m]amix=inputs=2:duration=longest:dropout_transition=0[mix]`)
    alast = 'mix'
  }
  args.push('-filter_complex', fc.join(';'), '-map', `[${vlast}]`, '-map', `[${alast}]`,
    '-t', total.toFixed(2), '-r', String(fps),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out)
  await run('ffmpeg', args)
  return { out, seconds: Math.round(total) }
}
