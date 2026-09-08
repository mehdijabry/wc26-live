// Reel assembly with ffmpeg — Ken Burns per scene, crossfades, music
// (looped, ducked under the optional voice, faded out), H.264 + AAC.
// Tuned for a 0.1-CPU Render instance: ultrafast preset, 30 fps.
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
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
    p.on('close', (code) => {
      if (process.env.P90_FFDEBUG) { if (code !== 0) console.error('[ffmpeg]', args.join(' '), '\n', err); try { if (process.env.P90_FFDEBUG.startsWith('/')) fsSync.appendFileSync(process.env.P90_FFDEBUG, JSON.stringify(args) + '\n') } catch { /* ignore */ } }
      return code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-1500)}`))
    })
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
  await muxAudio({ video, music, musicGain, voice, total, out })
  for (const s of segs) fs.rm(s, { force: true }).catch(() => {})
  return { out, seconds: Math.round(total) }
}

/** Last pass: music (looped, faded) + optional voice under the finished video (video copied). */
async function muxAudio({ video, music, musicGain, voice, total, out }) {
  const fadeOutStart = Math.max(0, total - 1.5).toFixed(2)
  const args = ['-y', '-loglevel', 'error', '-threads', '1', '-i', video, '-stream_loop', '-1', '-i', music]
  if (voice) args.push('-i', voice)
  const fc = [`[1:a]volume=${musicGain},afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutStart}:d=1.5[m]`]
  let alast = 'm'
  if (voice) { fc.push('[2:a]volume=1.0[vo]', '[vo][m]amix=inputs=2:duration=longest:dropout_transition=0[mix]'); alast = 'mix' }
  args.push('-filter_complex', fc.join(';'), '-map', '0:v', '-map', `[${alast}]`, '-t', total.toFixed(2),
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out)
  await run('ffmpeg', args)
}

/**
 * Animated GOAL reel (Mehdi, 2026-09-08): transparent layers composited
 * by ffmpeg with time expressions — no per-frame canvas work, one image
 * per layer looped in the graph (memory-flat like renderReel).
 *   0.25 s  GOAL! slams in (3.2× → 1×, ease-out) with a white flash
 *   0.7 s   crests slide in from both sides
 *   1.2 s   score rises in · 1.9 s scorer pill rises · 2.3 s minute fades in
 *   then    GOAL! breathes (±2.5 %), fade to black at the end
 * layers: {bg, flash, goal, home, away, score, scorer, minute} PNG paths + rest positions.
 */
export async function renderGoalAnim({ layers, rest, seconds, music, musicGain, voice, out }) {
  // Memory (measured locally, 9 s): rgba overlays 363 MB → yuva420p + single
  // filter thread 257 MB → same at 720p 186 MB. 1080p first; if ffmpeg dies
  // (OOM on the 512 MB instance) retry once at 720p.
  try { return await goalAnimPass({ layers, rest, seconds, music, musicGain, voice, out, small: false }) }
  catch (e) { console.log('[goal-anim] 1080p pass failed, retrying at 720p:', String(e).slice(0, 200)); return goalAnimPass({ layers, rest, seconds, music, musicGain, voice, out, small: true }) }
}
async function goalAnimPass({ layers, rest, seconds, music, musicGain, voice, out, small }) {
  const fps = 25
  const total = voice ? Math.max(seconds, (await probeDuration(voice)) + 1.2) : seconds
  const frames = Math.round(total * fps)
  const dir = path.resolve(path.dirname(out))
  const order = ['bg', 'flash', 'goal', 'home', 'away', 'score', 'scorer', 'minute']
  const inputs = []
  for (const k of order) inputs.push('-i', layers[k])
  const ease = (t0, d) => `pow(1-min(1,max(0,(t-${t0})/${d})),3)`   // 1 → 0 with ease-out
  const still = (i, lbl) => `[${i}:v]format=${i === 0 ? 'yuv420p' : 'yuva420p'},loop=loop=${frames - 1}:size=1:start=0,setpts=N/(${fps}*TB),trim=duration=${total.toFixed(3)}[${lbl}]`
  const OV = 'format=yuv420'   // overlay in yuv420 (2.5 B/px instead of 4 for rgba)
  const [gx, gy] = rest.goal, [hx, hy] = rest.home, [ax, ay] = rest.away, [sx, sy] = rest.score, [px, py] = rest.scorer, [mx, my] = rest.minute
  const fc = [
    still(0, 'bg0'), still(1, 'fl0'), still(2, 'go0'), still(3, 'ho0'), still(4, 'aw0'), still(5, 'sc0'), still(6, 'pi0'), still(7, 'mi0'),
    `[fl0]fade=t=in:st=0.25:d=0.08:alpha=1,fade=t=out:st=0.38:d=0.7:alpha=1[fl]`,
    // fade BEFORE scale: filters after a per-frame scale see a changing frame size and fail (EINVAL)
    `[go0]fade=t=in:st=0.25:d=0.15:alpha=1,scale=w='iw*(1+2.2*${ease(0.25, 0.45)})*(1+0.025*sin(2*PI*max(0,t-1.2)/1.8))':h=-1:eval=frame[go]`,
    `[ho0]fade=t=in:st=0.7:d=0.25:alpha=1[ho]`, `[aw0]fade=t=in:st=0.7:d=0.25:alpha=1[aw]`,
    `[sc0]fade=t=in:st=1.2:d=0.3:alpha=1[sc]`, `[pi0]fade=t=in:st=1.9:d=0.3:alpha=1[pi]`, `[mi0]fade=t=in:st=2.3:d=0.3:alpha=1[mi]`,
    `[bg0][fl]overlay=0:0:${OV}[v1]`,
    `[v1][go]overlay=x='(W-w)/2':y='${gy + 160}-h/2':eval=frame:${OV}[v2]`,
    `[v2][ho]overlay=x='${hx}-460*${ease(0.7, 0.6)}':y=${hy}:eval=frame:${OV}[v3]`,
    `[v3][aw]overlay=x='${ax}+460*${ease(0.7, 0.6)}':y=${ay}:eval=frame:${OV}[v4]`,
    `[v4][sc]overlay=x=${sx}:y='${sy}+70*${ease(1.2, 0.5)}':eval=frame:${OV}[v5]`,
    `[v5][pi]overlay=x=${px}:y='${py}+120*${ease(1.9, 0.55)}':eval=frame:${OV}[v6]`,
    `[v6][mi]overlay=x=${mx}:y=${my}:${OV},format=yuv420p,setsar=1,fade=t=out:st=${Math.max(0, total - 0.6).toFixed(2)}:d=0.6${small ? ',scale=720:1280:flags=bicubic' : ''}[v]`,
  ]
  const video = path.join(dir, 'video.mp4')
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-threads', '1', '-filter_complex_threads', '1', ...inputs, '-filter_complex', fc.join(';'), '-map', '[v]',
    '-r', String(fps), '-t', total.toFixed(2), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '21', '-an', '-movflags', '+faststart', video])
  await muxAudio({ video, music, musicGain, voice, total, out })
  return { out, seconds: Math.round(total) }
}
