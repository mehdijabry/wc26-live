// Frame-by-frame promo video renderer.
//
// Drives Chromium headless via Puppeteer, loads scene.html with a
// ?frame=N URL param, screenshots into ./frames/, then ffmpeg
// concatenates the PNG sequence into pressing90-promo.mp4.
//
// Each frame is rendered DETERMINISTICALLY — no CSS transitions,
// no requestAnimationFrame timing drift. The JS inside scene.html
// reads the frame number and computes every visual property
// (opacity, transform, text) from that integer. Same N → same pixel.
//
// Defaults: 1920x1080 @ 30fps × 60s = 1800 frames. Adjust below.

import puppeteer from 'puppeteer'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRAMES_DIR = path.join(HERE, 'frames')
const SCENE_URL = 'file://' + path.join(HERE, 'scene.html')

const W = 1920
const H = 1080
const FPS = 30
const SECONDS = 60
const TOTAL = FPS * SECONDS // 1800

console.log(`▶  Render plan: ${TOTAL} frames at ${W}x${H} (${SECONDS}s @ ${FPS}fps)`)

await fs.mkdir(FRAMES_DIR, { recursive: true })

const browser = await puppeteer.launch({
  headless: 'new',
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  args: [
    `--window-size=${W},${H}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',  // file:// → http (Wikipedia image)
    '--force-device-scale-factor=1',
  ],
})

const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })

// Pre-warm the page once so heavy assets (fonts, stadium hero images,
// SVG emblem, and all lottie JSONs) load before the per-frame loop.
// We also wait explicitly for window.__lottiesReady to flip true so
// goToAndStop() on the first capture isn't a no-op.
console.log('▶  Warming up assets…')
await page.goto(`${SCENE_URL}?frame=0&total=${TOTAL}`, { waitUntil: 'networkidle0', timeout: 30_000 })
try {
  await page.waitForFunction('window.__lottiesReady === true', { timeout: 15_000 })
  console.log('   …all lotties loaded')
} catch {
  console.warn('   ! lotties did not all report ready — proceeding anyway')
}
await new Promise((r) => setTimeout(r, 1000))

// Now render each frame — the page stays loaded; we only call the
// exposed setFrame(N) JS each tick. That's the difference between a
// 15-minute capture (reload-per-frame) and a 1-2-minute capture.
console.log(`▶  Capturing ${TOTAL} frames…`)
const t0 = Date.now()
for (let f = 0; f < TOTAL; f++) {
  await page.evaluate((frame, total) => window.setFrame(frame, total), f, TOTAL)
  await page.waitForFunction('window.__frameReady === true', { timeout: 5_000 })
  const name = String(f).padStart(4, '0')
  await page.screenshot({
    path: path.join(FRAMES_DIR, `frame-${name}.png`),
    type: 'png',
    fullPage: false,
    captureBeyondViewport: false,
  })
  if (f % 30 === 0) {
    const pct = ((f / TOTAL) * 100).toFixed(1)
    const sec = ((Date.now() - t0) / 1000).toFixed(0)
    const eta = TOTAL > f ? ((Date.now() - t0) / Math.max(1, f) * (TOTAL - f) / 1000).toFixed(0) : 0
    process.stdout.write(`\r  ${name}  ${pct}%  ${sec}s elapsed  ${eta}s ETA`)
  }
}
console.log(`\n✓  Captured ${TOTAL} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`)

await browser.close()

// ffmpeg assemble — H.264, yuv420p for max compatibility (FB, etc.)
console.log('▶  Assembling MP4 with ffmpeg…')
const out = path.join(HERE, 'pressing90-promo.mp4')
const ff = spawn('ffmpeg', [
  '-y',
  '-framerate', String(FPS),
  '-i', path.join(FRAMES_DIR, 'frame-%04d.png'),
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-preset', 'medium',
  '-crf', '18',         // visually lossless-ish
  '-movflags', '+faststart',
  out,
])
ff.stdout.pipe(process.stdout)
ff.stderr.pipe(process.stderr)
await new Promise((resolve, reject) => {
  ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))
})
console.log(`✓  Output: ${out}`)
