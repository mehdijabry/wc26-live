/**
 * One-shot brand asset generator for the Pressing 90' rebrand.
 * Renders the p90 mark + og card in headless Chromium and screenshots
 * them as the PNG set referenced by manifest.json / index.html.
 *
 *   node scripts/gen-icons.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = join(ROOT, 'public')

const logoSvg = readFileSync(join(PUB, 'p90-logo.svg'), 'utf8')
const logoDataUri = 'data:image/svg+xml;base64,' + Buffer.from(logoSvg).toString('base64')

// Maskable icons need ~20% safe-zone padding around the mark on a solid bg.
const iconHtml = (size, maskable) => `<!doctype html><meta charset="utf-8">
<style>*{margin:0;padding:0}body{width:${size}px;height:${size}px;background:${maskable ? '#0a2540' : 'transparent'};display:grid;place-items:center}img{width:${maskable ? Math.round(size * 0.72) : size}px;height:${maskable ? Math.round(size * 0.72) : size}px}</style>
<body><img src="${logoDataUri}"></body>`

const ogHtml = `<!doctype html><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#0a2540;font-family:'Archivo Black','Arial Black',system-ui,sans-serif;display:flex;align-items:center;padding:0 90px;position:relative;overflow:hidden}
.mark{width:190px;height:190px;margin-right:64px;flex-shrink:0}
h1{color:#f6f3ee;font-size:92px;line-height:1.02;letter-spacing:-2px}
h1 span{color:#d4af37}
p{position:absolute;left:90px;bottom:64px;color:#8aa1b8;font-size:30px;font-family:ui-monospace,Menlo,monospace;letter-spacing:2px}
.line{position:absolute;right:-120px;top:-120px;width:480px;height:480px;border:22px solid rgba(212,175,55,.12);border-radius:50%}
</style>
<body>
  <div class="line"></div>
  <img class="mark" src="${logoDataUri}">
  <h1>Pressing <span>90&#8217;</span><br>live football scores</h1>
  <p>pressing90.live &middot; scores &middot; news &middot; WC26 archive</p>
</body>`

const jobs = [
  { file: 'icon-192.png', w: 192, h: 192, html: iconHtml(192, false), transparent: true },
  { file: 'icon-512.png', w: 512, h: 512, html: iconHtml(512, false), transparent: true },
  { file: 'icon-maskable-192.png', w: 192, h: 192, html: iconHtml(192, true) },
  { file: 'icon-maskable-512.png', w: 512, h: 512, html: iconHtml(512, true) },
  { file: 'icon-180.png', w: 180, h: 180, html: iconHtml(180, true) }, // apple-touch (opaque)
  { file: 'og.png', w: 1200, h: 630, html: ogHtml },
]

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
for (const j of jobs) {
  await page.setViewport({ width: j.w, height: j.h, deviceScaleFactor: 1 })
  await page.setContent(j.html, { waitUntil: 'load' })
  await new Promise((r) => setTimeout(r, 300)) // font/image settle
  const buf = await page.screenshot({ type: 'png', omitBackground: !!j.transparent })
  writeFileSync(join(PUB, j.file), buf)
  console.log(`✓ ${j.file} (${j.w}x${j.h}, ${(buf.length / 1024) | 0} KB)`)
}
await browser.close()
