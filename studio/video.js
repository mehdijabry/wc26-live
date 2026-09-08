// Reel assembly with ffmpeg — Ken Burns per scene, crossfades, music
// (looped, ducked under the optional voice, faded out), H.264 + AAC.
// Tuned for a 0.1-CPU Render instance: ultrafast preset, 30 fps.
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const SITE = process.env.SITE_URL || 'https://pressing90.live'
// Signature tracks (Mehdi's, never regenerated). `story` is EXCLUSIVE to stories.
const MUSIC = { matchday: 'matchday.m4a', article: 'articles.m4a', story: 'stories.m4a' }

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
  // Cache key versioned: bump when a signature track is replaced on the site
  // (v2 = new match-day jingle, Mehdi 2026-09-08).
  const p = path.join(os.tmpdir(), 'p90-v2-' + file)
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
  // Memory-flat pipeline (Render 512 MB): each scene is encoded on its
  // own (one still → short mp4), the segments are joined with the concat
  // DEMUXER (stream copy, no decoding), then the audio is mixed in a last
  // pass with the video copied. Peak memory no longer grows with the
  // number of scenes (8-slide reel OOM-killed the studio on 2026-09-08).
  const fps = 25
  const total = voice ? (await probeDuration(voice)) + 1.2 : seconds
  const n = scenes.length
  const per = total / n
  const fade = Math.min(0.4, per / 4)
  const frames = Math.max(1, Math.round(per * fps))
  const dir = path.resolve(path.dirname(out))   // absolute: the concat demuxer resolves list entries relative to the list file
  const segs = []
  for (let i = 0; i < n; i++) {
    const seg = path.join(dir, `seg${i}.mp4`)
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-threads', '1', '-i', scenes[i],
      '-vf', `scale=1080:1920:flags=lanczos,loop=loop=${frames - 1}:size=1:start=0,setpts=N/(${fps}*TB),trim=duration=${per.toFixed(3)},fade=t=in:st=0:d=${fade},fade=t=out:st=${Math.max(0, per - fade).toFixed(3)}:d=${fade},format=yuv420p,setsar=1`,
      '-r', String(fps), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-tune', 'stillimage', '-an', '-movflags', '+faststart', seg])
    segs.push(seg)
  }
  const list = path.join(dir, 'segs.txt')
  await fs.writeFile(list, segs.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n') + '\n')
  const video = path.join(dir, 'video.mp4')
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video])
  const fadeOutStart = Math.max(0, total - 1.5).toFixed(2)
  const args = ['-y', '-loglevel', 'error', '-threads', '1', '-i', video, '-stream_loop', '-1', '-i', music]
  if (voice) args.push('-i', voice)
  const fc = [`[1:a]volume=${musicGain},afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutStart}:d=1.5[m]`]
  let alast = 'm'
  if (voice) { fc.push('[2:a]volume=1.0[vo]', '[vo][m]amix=inputs=2:duration=longest:dropout_transition=0[mix]'); alast = 'mix' }
  args.push('-filter_complex', fc.join(';'), '-map', '0:v', '-map', `[${alast}]`, '-t', total.toFixed(2),
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out)
  await run('ffmpeg', args)
  for (const s of segs) fs.rm(s, { force: true }).catch(() => {})
  return { out, seconds: Math.round(total) }
}
