/**
 * Facebook / Instagram announcement post — 1080×1080, bilingual EN/AR.
 * "New season, new look" relaunch visual for Pressing 90'.
 *
 *   node scripts/gen-fb-post.mjs   →  public/social/fb-post-relaunch.png
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
const MONO = `ui-monospace,Menlo,monospace`

const html = `<!doctype html><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1080px;background:#0a2540;position:relative;overflow:hidden;font-family:${FONT};color:#f6f3ee}
/* stadium-light glows */
.g1{position:absolute;left:-260px;top:-260px;width:820px;height:820px;border-radius:50%;background:radial-gradient(circle,rgba(212,175,55,.30),transparent 60%)}
.g2{position:absolute;right:-300px;bottom:-320px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(212,175,55,.16),transparent 62%)}
/* pitch centre circle, cropped bottom-right */
.ring{position:absolute;right:-240px;bottom:-240px;width:760px;height:760px;border-radius:50%;border:22px solid rgba(255,255,255,.06)}
.ring2{position:absolute;right:-240px;bottom:-240px;width:760px;height:760px;border-radius:50%;border:4px solid rgba(212,175,55,.35);transform:scale(.72);transform-origin:center}
/* diagonal gold slash */
.slash{position:absolute;left:-120px;top:722px;width:1400px;height:10px;background:linear-gradient(90deg,transparent,#d4af37 25%,#d4af37 75%,transparent);transform:rotate(-4deg);opacity:.75}
.head{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:22px}
.head img{width:88px;height:88px;border-radius:20px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.head .n{font-size:40px;letter-spacing:-1px}
.head .n b{color:#d4af37}
.head .s{font-family:${MONO};font-size:15px;letter-spacing:4px;color:#8aa1b8;text-transform:uppercase;margin-top:4px}
.kick{position:absolute;left:72px;top:212px;font-family:${MONO};font-size:22px;letter-spacing:6px;color:#d4af37;text-transform:uppercase}
.kick::before{content:'';display:inline-block;width:12px;height:12px;border-radius:50%;background:#e11d48;margin-right:14px;vertical-align:middle;box-shadow:0 0 0 6px rgba(225,29,72,.25)}
h1{position:absolute;left:72px;top:262px;font-size:124px;line-height:.92;letter-spacing:-4px;width:940px}
h1 b{color:#d4af37}
.ar{position:absolute;right:72px;top:530px;direction:rtl;text-align:right;font-family:${AR_FONT};font-weight:700;font-size:64px;line-height:1.2;color:#f6f3ee}
.ar b{color:#d4af37}
.pills{position:absolute;left:72px;bottom:176px;display:flex;flex-wrap:wrap;gap:14px;width:940px}
.pill{border:2.5px solid rgba(212,175,55,.7);border-radius:999px;padding:14px 26px;font-family:${MONO};font-size:24px;letter-spacing:2px;text-transform:uppercase;background:rgba(10,37,64,.55);backdrop-filter:blur(4px)}
.cta{position:absolute;left:72px;bottom:72px;display:inline-flex;align-items:center;gap:18px;background:#d4af37;color:#0a2540;border-radius:999px;padding:22px 40px;font-size:40px;letter-spacing:-1px;box-shadow:0 18px 50px rgba(212,175,55,.35)}
.cta span{font-family:${MONO};font-size:34px;letter-spacing:1px}
</style>
<body>
  <div class="g1"></div><div class="g2"></div>
  <div class="ring"></div><div class="ring2"></div>
  <div class="slash"></div>

  <div class="head">
    <img src="${logoUri}">
    <div><div class="n">Pressing <b>90&#8217;</b></div><div class="s">live football scores</div></div>
  </div>

  <div class="kick">New season · موسم جديد</div>
  <h1>New season.<br>New <b>look.</b></h1>
  <div class="ar">هوية جديدة،<br>نفس <b>الشغف.</b></div>

  <div class="pills">
    <span class="pill">⚽ Live scores</span>
    <span class="pill">📰 News · أخبار</span>
    <span class="pill">🌍 EN · عربي</span>
    <span class="pill">🏆 WC26 archive</span>
  </div>

  <div class="cta">👉 <span>pressing90.live</span></div>
</body>`

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'load' })
await new Promise((r) => setTimeout(r, 400))
const buf = await page.screenshot({ type: 'png' })
writeFileSync(join(OUT, 'fb-post-relaunch.png'), buf)
console.log(`✓ fb-post-relaunch.png (1080x1080, ${(buf.length / 1024) | 0} KB)`)
await browser.close()
