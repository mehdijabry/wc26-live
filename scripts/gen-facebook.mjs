/**
 * Facebook Page assets for the Pressing 90' rebrand — bilingual EN/AR.
 *
 *   node scripts/gen-facebook.mjs
 *
 * Outputs to public/social/:
 *   fb-cover.png    1640×624 — Facebook cover (desktop 820×312 @2x). Text
 *                   kept inside the mobile-safe centre band (~1200 wide,
 *                   ~420 tall) so nothing is cropped on phones.
 *   fb-profile.png  1024×1024 — profile picture; artwork centred with
 *                   ~14% margin so the circular crop keeps everything.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'social')
mkdirSync(OUT, { recursive: true })

const logoSvg = readFileSync(join(ROOT, 'public', 'p90-logo.svg'), 'utf8')
const logoUri = 'data:image/svg+xml;base64,' + Buffer.from(logoSvg).toString('base64')

const FONT = `'Archivo Black','Arial Black',system-ui,-apple-system,sans-serif`
const AR_FONT = `'Geeza Pro','Al Bayan','Baghdad','Noto Naskh Arabic','Arial',sans-serif`

const cover = `<!doctype html><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1640px;height:624px;background:#0a2540;position:relative;overflow:hidden;font-family:${FONT}}
.glow{position:absolute;left:-200px;top:-260px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(212,175,55,.22),transparent 62%)}
.ring{position:absolute;right:-180px;top:-200px;width:760px;height:760px;border-radius:50%;border:26px solid rgba(212,175,55,.10)}
.pitch{position:absolute;left:0;right:0;bottom:0;height:5px;background:linear-gradient(90deg,transparent,#d4af37 30%,#d4af37 70%,transparent)}
.safe{position:absolute;left:220px;top:102px;width:1200px;height:420px;display:flex;align-items:center;gap:56px}
.mark{width:190px;height:190px;flex-shrink:0;border-radius:36px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.txt{flex:1}
h1{color:#f6f3ee;font-size:96px;line-height:.98;letter-spacing:-2px}
h1 b{color:#d4af37;font-weight:900}
.ar{color:#f6f3ee;font-family:${AR_FONT};font-size:44px;line-height:1.35;margin-top:14px;direction:rtl;text-align:left;font-weight:700}
.ar b{color:#d4af37;font-weight:700}
.tags{margin-top:20px;display:flex;gap:12px}
.tag{border:2px solid rgba(212,175,55,.65);color:#f6f3ee;border-radius:999px;padding:8px 20px;font-family:ui-monospace,Menlo,monospace;font-size:20px;letter-spacing:2px;text-transform:uppercase}
.url{position:absolute;right:230px;bottom:40px;color:#8aa1b8;font-family:ui-monospace,Menlo,monospace;font-size:24px;letter-spacing:3px}
</style>
<body>
  <div class="glow"></div><div class="ring"></div>
  <div class="safe">
    <img class="mark" src="${logoUri}">
    <div class="txt">
      <h1>Pressing <b>90&#8217;</b></h1>
      <div class="ar">بريسينغ <b>90&#8217;</b> · نتائج مباشرة · أخبار · تحليل</div>
      <div class="tags"><span class="tag">⚽ Live scores</span><span class="tag">📰 News · أخبار</span><span class="tag">🌍 EN · عربي</span></div>
    </div>
  </div>
  <div class="url">pressing90.live</div>
  <div class="pitch"></div>
</body>`

const profile = `<!doctype html><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1024px;height:1024px;background:#0a2540;position:relative;overflow:hidden;font-family:${FONT};display:grid;place-items:center}
.glow{position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(212,175,55,.20),transparent 58%)}
.ring{position:absolute;left:52px;top:52px;width:920px;height:920px;border-radius:50%;border:8px solid rgba(212,175,55,.35)}
.core{position:relative;text-align:center;transform:translateY(-14px)}
.num{color:#d4af37;font-size:390px;line-height:.9;letter-spacing:-14px;font-weight:900;text-shadow:0 20px 60px rgba(0,0,0,.4)}
.name{color:#f6f3ee;font-size:74px;letter-spacing:-1px;margin-top:8px}
.ar{color:#f6f3ee;font-family:${AR_FONT};font-size:56px;font-weight:700;margin-top:6px;direction:rtl}
.line{width:420px;height:8px;border-radius:4px;background:rgba(212,175,55,.55);margin:22px auto 0;position:relative}
.line::after{content:'';position:absolute;left:50%;top:50%;width:26px;height:26px;border:7px solid rgba(212,175,55,.55);border-radius:50%;transform:translate(-50%,-50%);background:#0a2540}
</style>
<body>
  <div class="glow"></div><div class="ring"></div>
  <div class="core">
    <div class="num">90&#8217;</div>
    <div class="name">Pressing 90&#8217;</div>
    <div class="ar">بريسينغ 90&#8217;</div>
    <div class="line"></div>
  </div>
</body>`

const jobs = [
  { file: 'fb-cover.png', w: 1640, h: 624, html: cover },
  { file: 'fb-profile.png', w: 1024, h: 1024, html: profile },
]

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
for (const j of jobs) {
  await page.setViewport({ width: j.w, height: j.h, deviceScaleFactor: 1 })
  await page.setContent(j.html, { waitUntil: 'load' })
  await new Promise((r) => setTimeout(r, 400))
  const buf = await page.screenshot({ type: 'png' })
  writeFileSync(join(OUT, j.file), buf)
  console.log(`✓ ${j.file} (${j.w}x${j.h}, ${(buf.length / 1024) | 0} KB)`)
}
await browser.close()
