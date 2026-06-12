// Sanity-check renderer: 8 sample frames (1 per scene mid-point).
// Validates layout before committing 1800-frame full render.
import puppeteer from 'puppeteer'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'sample-frames')
const URL_BASE = 'file://' + path.join(HERE, 'scene.html')
await fs.mkdir(OUT, { recursive: true })

const samples = [
  { name: 's1-intro',    frame: 100 },
  { name: 's2-tagline',  frame: 280 },
  { name: 's3-scores',   frame: 500 },
  { name: 's4-notifs',   frame: 800 },
  { name: 's5-bracket',  frame: 1100 },
  { name: 's6-stadium',  frame: 1400 },
  { name: 's7-install',  frame: 1600 },
  { name: 's8-cta',      frame: 1740 },
]

const browser = await puppeteer.launch({
  headless: 'new',
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  args: ['--no-sandbox', '--disable-web-security', '--force-device-scale-factor=1'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })

for (const s of samples) {
  await page.goto(`${URL_BASE}?frame=${s.frame}&total=1800`, { waitUntil: 'networkidle0', timeout: 30_000 })
  await new Promise((r) => setTimeout(r, 800))  // let assets settle
  const out = path.join(OUT, `${s.name}-f${s.frame}.png`)
  await page.screenshot({ path: out, type: 'png' })
  console.log(`✓ ${s.name} → frame ${s.frame}`)
}
await browser.close()
console.log('Done. Check ./sample-frames/')
