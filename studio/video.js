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
  // Memory-lean pipeline for a 512 MB / 0.1 CPU box: scenes are chained
  // with `concat` (one input decoded at a time) and get a short fade
  // in/out each instead of xfade (which decodes every scene in parallel
  // and OOM-killed the process). Ken Burns via zoompan, 25 fps.
  const fps = 25
  const total = voice ? (await probeDuration(voice)) + 1.2 : seconds
  const n = scenes.length
  const per = total / n
  const fade = Math.min(0.4, per / 4)
  const args = ['-y', '-loglevel', 'error', '-threads', '1']
  for (const s of scenes) args.push('-loop', '1', '-t', per.toFixed(3), '-i', s)
  const musicIdx = n
  args.push('-stream_loop', '-1', '-i', music)
  const voiceIdx = voice ? n + 1 : -1
  if (voice) args.push('-i', voice)

  const frames = Math.round(per * fps)
  const fc = []
  for (let i = 0; i < n; i++) {
    fc.push(`[${i}:v]scale=1080:1920,zoompan=z='min(zoom+0.0007,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps},fade=t=in:st=0:d=${fade},fade=t=out:st=${Math.max(0, per - fade).toFixed(3)}:d=${fade},format=yuv420p,setsar=1[v${i}]`)
  }
  fc.push(`${scenes.map((_, i) => `[v${i}]`).join('')}concat=n=${n}:v=1:a=0[vout]`)
  const fadeOutStart = Math.max(0, total - 1.5).toFixed(2)
  fc.push(`[${musicIdx}:a]volume=${musicGain},afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutStart}:d=1.5[m]`)
  let alast = 'm'
  if (voice) {
    fc.push(`[${voiceIdx}:a]volume=1.0[vo]`)
    fc.push(`[vo][m]amix=inputs=2:duration=longest:dropout_transition=0[mix]`)
    alast = 'mix'
  }
  args.push('-filter_complex', fc.join(';'), '-map', '[vout]', '-map', `[${alast}]`,
    '-t', total.toFixed(2), '-r', String(fps),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '27', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out)
  await run('ffmpeg', args)
  return { out, seconds: Math.round(total) }
}
