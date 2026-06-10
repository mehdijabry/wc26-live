/**
 * Post-build prerender pass.
 *
 * Vite gives us a Single-Page-App where `dist/index.html` is the only
 * static HTML the deploy serves. React Router takes over on the client
 * and renders the actual page contents after the JS bundle loads. That
 * works fine for human visitors with a modern browser but it breaks for
 *
 *   - Bingbot / Yandex / DuckDuckGo (don't execute JS at crawl time)
 *   - Facebook / Twitter / WhatsApp / Slack / iMessage / LinkedIn link
 *     preview bots (read the og:title/description from the initial HTML)
 *   - Googlebot's first-pass crawl (JS rendering is delayed by days)
 *
 * What this script does:
 *
 *   1. Reads `public/sitemap.xml` for the canonical list of routes.
 *   2. Spawns a tiny static server on top of `dist/` (same content the
 *      production deploy will serve).
 *   3. Launches headless Chromium via Puppeteer.
 *   4. For each route, navigates the browser to the local server,
 *      waits for React Router + the per-page useEffect that sets
 *      `<title>` / `<meta>` / JSON-LD to finish, snapshots the rendered
 *      DOM, and writes it back as `dist/<route>/index.html`.
 *   5. Cloudflare Pages then serves the snapshotted HTML for each URL
 *      directly — every crawler sees the real title, description, OG
 *      image and structured data on first byte. React hydrates on top
 *      transparently for human visitors.
 *
 * Run AFTER `vite build`. Adds ~30-90 seconds to the deploy depending
 * on network (the snapshots fetch ESPN data per route).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { extname } from 'node:path'
import { readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer'

const ROOT = process.cwd()
const DIST = join(ROOT, 'dist')
const SITEMAP = join(ROOT, 'public', 'sitemap.xml')
// Dynamic port — 0 lets the OS pick a free port and we read it back
// after listen(). Avoids collisions with anything else binding 4321.
let PORT = 0
const CONCURRENCY = 4 // launch up to N browser tabs at once

// ---------------------------------------------------------------------------
// Step 1 — Parse sitemap.xml for routes
// ---------------------------------------------------------------------------

function parseSitemap() {
  const xml = readFileSync(SITEMAP, 'utf8')
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  const routes = locs
    .map((url) => {
      try {
        const u = new URL(url)
        return u.pathname.replace(/\/$/, '') || '/'
      } catch {
        return null
      }
    })
    .filter(Boolean)
  // dedupe just in case
  return { routes: [...new Set(routes)] }
}

// ---------------------------------------------------------------------------
// Step 2 — Tiny static server over dist/
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
}

function startServer() {
  return new Promise((resolve) => {
    /** @type {import('node:http').Server} */
    const server = createServer(async (req, res) => {
      try {
        let path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
        // Try exact path, then path/index.html, then SPA fallback to /index.html
        const candidates = [
          join(DIST, path),
          join(DIST, path, 'index.html'),
          join(DIST, 'index.html'), // SPA fallback for unknown routes
        ]
        for (const candidate of candidates) {
          try {
            const data = await readFile(candidate)
            const ext = extname(candidate).toLowerCase()
            res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' })
            res.end(data)
            return
          } catch { /* try next candidate */ }
        }
        res.writeHead(404)
        res.end('not found')
      } catch (e) {
        res.writeHead(500)
        res.end('error')
      }
    })
    server.listen(PORT, () => {
      // Capture the OS-assigned port so prerenderRoute can use it.
      const addr = server.address()
      PORT = typeof addr === 'object' && addr ? addr.port : PORT
      resolve(server)
    })
  })
}

// ---------------------------------------------------------------------------
// Step 3 — Prerender a single route with Puppeteer
// ---------------------------------------------------------------------------

async function prerenderRoute(browser, route) {
  const page = await browser.newPage()
  // Block heavy 3rd-party stuff at crawl time so the snapshot doesn't
  // bake Adsterra iframes / Cloudflare analytics into static HTML.
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const url = req.url()
    if (
      url.includes('adsterra') ||
      url.includes('turbulentrefreshments') ||
      url.includes('cloudflareinsights') ||
      url.includes('googletagmanager') ||
      url.includes('google-analytics')
    ) {
      req.abort()
    } else {
      req.continue()
    }
  })

  const url = `http://localhost:${PORT}${route === '/' ? '' : route}`
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 })

  // The per-page useEffect that calls document.title = ... and
  // document.head.appendChild(jsonLdScript) needs a tick to settle after
  // hydration. Wait until the title is no longer the generic landing one.
  try {
    await page.waitForFunction(
      () => {
        const t = document.title || ''
        return (
          t.length > 0 &&
          !t.startsWith('WC26 Live · Pressing 90′ — World Cup 2026 scores')
        )
      },
      { timeout: 4_000 }
    )
  } catch {
    // Some routes legitimately use the default title (e.g. the home
    // page). Don't fail the route just because the title didn't change.
  }

  // Small extra wait so any debounced setMeta / structured-data
  // injection lands before we snapshot.
  await new Promise((r) => setTimeout(r, 400))

  const html = await page.content()
  await page.close()
  return html
}

// ---------------------------------------------------------------------------
// Step 4 — Write snapshot to dist/<route>/index.html
// ---------------------------------------------------------------------------

function writeSnapshot(route, html) {
  // Route '/' → dist/index.html (overwrite the SPA shell with the
  // hydrated version — keeps the same script tags so React still boots).
  const dir = route === '/' ? DIST : join(DIST, route)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html, 'utf8')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(DIST)) {
    console.error('[prerender] dist/ not found — run `vite build` first.')
    process.exit(1)
  }

  const { routes } = parseSitemap()
  console.log(`[prerender] Found ${routes.length} routes in sitemap.`)

  const server = await startServer()
  console.log(`[prerender] Local server on http://localhost:${PORT}`)

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  console.log('[prerender] Headless Chromium up.')

  let ok = 0
  let failed = 0
  const failures = []

  // Process routes in batches of CONCURRENCY to keep memory + CPU sane.
  for (let i = 0; i < routes.length; i += CONCURRENCY) {
    const batch = routes.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (route) => {
        const label = route.padEnd(36)
        try {
          const html = await prerenderRoute(browser, route)
          writeSnapshot(route, html)
          ok++
          console.log(`[prerender] ✓ ${label} (${(html.length / 1024) | 0} KB)`)
        } catch (e) {
          failed++
          failures.push({ route, message: String(e?.message ?? e) })
          console.log(`[prerender] ✗ ${label} — ${String(e?.message ?? e).slice(0, 80)}`)
        }
      })
    )
  }

  await browser.close()
  server.close()

  console.log(`[prerender] Done. ${ok} ok, ${failed} failed.`)
  if (failures.length) {
    console.log('[prerender] Failures:')
    for (const f of failures) {
      console.log(`  - ${f.route}: ${f.message}`)
    }
  }
  // Don't fail the build on a handful of failed routes — the SPA
  // fallback still works for those URLs, we just lose the SEO boost.
  process.exit(0)
}

main().catch((e) => {
  console.error('[prerender] fatal:', e)
  process.exit(1)
})
