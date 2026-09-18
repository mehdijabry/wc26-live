import QRCode from 'qrcode'
import { API_BASE } from './api'

/**
 * Branded article cards, drawn in the ADMIN browser (canvas) — the
 * worker can't render images, but every publish action starts from the
 * admin UI, so the browser generates the PNGs and uploads them to the
 * worker (KV), which serves them publicly for the Facebook webhook.
 *
 *  - drawPostCard  → 1080×1350 feed-post card (no QR — the post text
 *    carries the clickable link)
 *  - drawStoryCard → 1080×1920 story card (QR + "visit our profile",
 *    posted manually from the Meta Business app for the music)
 *  - uploadPostCards → generates EN (+AR when translated) post cards
 *    and pushes them to /admin/news/<id>/post-image before an
 *    approve / share-facebook call; failures are silent (the worker
 *    falls back to the raw article image).
 */

export const NIGHT = '#071B30'
export const CREAM = '#F3EFE6'
export const GOLD = '#D9B54A'

export type CardArticle = {
  id?: string
  slug: string
  title: string
  title_ar?: string | null
  image_url: string | null
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const probe = cur ? cur + ' ' + w : w
    if (ctx.measureText(probe).width <= maxWidth || !cur) {
      cur = probe
    } else {
      lines.push(cur)
      cur = w
      if (lines.length === maxLines - 1) break
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur)
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'
  }
  return lines
}

export function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function loadCardFonts(): Promise<void> {
  await Promise.all([
    document.fonts.load('400 60px Anton'),
    document.fonts.load('800 60px Tajawal'),
    document.fonts.load('700 34px Archivo'),
    document.fonts.load('400 30px "IBM Plex Mono"'),
  ]).catch(() => {})
  await document.fonts.ready.catch(() => {})
}

function paintGround(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = NIGHT
  ctx.fillRect(0, 0, W, H)
  const g1 = ctx.createRadialGradient(140, -100, 0, 140, -100, 900)
  g1.addColorStop(0, 'rgba(217,181,74,0.16)')
  g1.addColorStop(1, 'rgba(217,181,74,0)')
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, W, H)
  const g2 = ctx.createRadialGradient(W, H, 0, W, H, 1100)
  g2.addColorStop(0, 'rgba(217,181,74,0.10)')
  g2.addColorStop(1, 'rgba(217,181,74,0)')
  ctx.fillStyle = g2
  ctx.fillRect(0, 0, W, H)
}

async function paintBrandRow(ctx: CanvasRenderingContext2D) {
  const logo = await loadImage('/p90-logo.svg')
  if (logo) ctx.drawImage(logo, 60, 70, 110, 110)
  ctx.textAlign = 'left'
  ctx.direction = 'ltr'
  ctx.fillStyle = CREAM
  ctx.font = '400 64px Anton, sans-serif'
  ctx.fillText('Pressing', 200, 130)
  const pw = ctx.measureText('Pressing ').width
  ctx.fillStyle = GOLD
  ctx.fillText("90’", 200 + pw, 130)
  ctx.fillStyle = 'rgba(243,239,230,0.55)'
  ctx.font = '400 26px "IBM Plex Mono", monospace'
  ctx.fillText('L I V E   F O O T B A L L   S C O R E S', 202, 172)
}

async function paintImagePanel(
  ctx: CanvasRenderingContext2D,
  W: number,
  imageUrl: string | null,
  y: number,
  h: number
) {
  if (!imageUrl) return
  const img = await loadImage(`${API_BASE}/fb-img?u=${encodeURIComponent(imageUrl)}`)
  if (!img) return
  roundedPath(ctx, 60, y, W - 120, h, 36)
  ctx.save()
  ctx.clip()
  const s = Math.max((W - 120) / img.width, h / img.height)
  const dw = img.width * s
  const dh = img.height * s
  ctx.drawImage(img, 60 + ((W - 120) - dw) / 2, y + (h - dh) / 2, dw, dh)
  const fade = ctx.createLinearGradient(0, y + h - 220, 0, y + h)
  fade.addColorStop(0, 'rgba(7,27,48,0)')
  fade.addColorStop(1, 'rgba(7,27,48,0.9)')
  ctx.fillStyle = fade
  ctx.fillRect(60, y, W - 120, h)
  ctx.restore()
  roundedPath(ctx, 60, y, W - 120, h, 36)
  ctx.strokeStyle = 'rgba(243,239,230,0.14)'
  ctx.lineWidth = 2
  ctx.stroke()
}

/**
 * 1080×1350 feed-post card — SPLIT layout (Mehdi's spec): the ORIGINAL
 * article photo full-bleed on the top half, the GENERATED branded part
 * on the bottom half (brand row, title, QR, site pill). The QR links
 * with ?ref=fb-post so scans of the image are tracked separately from
 * clicks on the post's link (?ref=fb).
 */
export async function drawPostCard(canvas: HTMLCanvasElement, a: CardArticle, lang: 'en' | 'ar'): Promise<void> {
  const W = 1080
  const H = 1350
  const PHOTO_H = 700
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const ar = lang === 'ar'
  const title = (ar && a.title_ar) ? a.title_ar : a.title
  const qrUrl = `https://pressing90.live/news/${a.slug}?ref=fb-post${ar ? '&lang=ar' : ''}`

  await loadCardFonts()
  paintGround(ctx, W, H)

  // ── Top half: original photo, full-bleed, fading into the night ────
  if (a.image_url) {
    const img = await loadImage(`${API_BASE}/fb-img?u=${encodeURIComponent(a.image_url)}`)
    if (img) {
      const s = Math.max(W / img.width, PHOTO_H / img.height)
      const dw = img.width * s
      const dh = img.height * s
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, W, PHOTO_H)
      ctx.clip()
      ctx.drawImage(img, (W - dw) / 2, (PHOTO_H - dh) / 2, dw, dh)
      ctx.restore()
      const fade = ctx.createLinearGradient(0, PHOTO_H - 240, 0, PHOTO_H)
      fade.addColorStop(0, 'rgba(7,27,48,0)')
      fade.addColorStop(1, 'rgba(7,27,48,1)')
      ctx.fillStyle = fade
      ctx.fillRect(0, PHOTO_H - 240, W, 240)
    }
  }

  // ── Bottom half: generated panel ───────────────────────────────────
  // Brand row (compact)
  const logo = await loadImage('/p90-logo.svg')
  if (logo) ctx.drawImage(logo, 60, 728, 78, 78)
  ctx.textAlign = 'left'
  ctx.direction = 'ltr'
  ctx.fillStyle = CREAM
  ctx.font = '400 46px Anton, sans-serif'
  ctx.fillText('Pressing', 158, 772)
  const pw = ctx.measureText('Pressing ').width
  ctx.fillStyle = GOLD
  ctx.fillText("90’", 158 + pw, 772)
  ctx.fillStyle = 'rgba(243,239,230,0.55)'
  ctx.font = '400 20px "IBM Plex Mono", monospace'
  ctx.fillText('L I V E   F O O T B A L L   S C O R E S', 160, 802)
  // Eyebrow, opposite side of the brand
  ctx.fillStyle = GOLD
  ctx.direction = ar ? 'rtl' : 'ltr'
  ctx.textAlign = 'right'
  ctx.font = ar ? '800 30px Tajawal, sans-serif' : '400 28px "IBM Plex Mono", monospace'
  ctx.fillText(ar ? 'مقال جديد' : 'N E W   A R T I C L E', W - 64, 782)

  // Title — up to 3 lines
  const titleTop = 910
  ctx.fillStyle = GOLD
  if (ar) ctx.fillRect(W - 64 - 10, titleTop - 50, 10, 168)
  else ctx.fillRect(60, titleTop - 50, 10, 168)
  ctx.fillStyle = CREAM
  ctx.font = ar ? '800 62px Tajawal, sans-serif' : '400 62px Anton, sans-serif'
  ctx.direction = ar ? 'rtl' : 'ltr'
  ctx.textAlign = ar ? 'right' : 'left'
  wrapLines(ctx, title, W - 220, 3).forEach((l, i) => {
    ctx.fillText(l, ar ? W - 104 : 104, titleTop + i * 80)
  })

  // Bottom row: QR card on one side, site pill + tagline on the other
  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, qrUrl, {
    width: 360,
    margin: 1,
    color: { dark: NIGHT, light: '#FFFFFF' },
  })
  const qrCard = 190
  const qrX = ar ? 60 : W - 60 - qrCard
  const qrY = H - 60 - qrCard
  roundedPath(ctx, qrX, qrY, qrCard, qrCard, 24)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.drawImage(qrCanvas, qrX + 12, qrY + 12, qrCard - 24, qrCard - 24)

  const sideX = ar ? W - 64 : 60
  ctx.fillStyle = GOLD
  const pillW = 340
  roundedPath(ctx, ar ? sideX - pillW : sideX, qrY + 30, pillW, 58, 29)
  ctx.fill()
  ctx.fillStyle = NIGHT
  ctx.font = '400 30px "IBM Plex Mono", monospace'
  ctx.textAlign = 'center'
  ctx.direction = 'ltr'
  ctx.fillText('pressing90.live', (ar ? sideX - pillW : sideX) + pillW / 2, qrY + 68)
  ctx.fillStyle = 'rgba(243,239,230,0.6)'
  ctx.font = ar ? '500 26px Tajawal, sans-serif' : '400 24px "IBM Plex Mono", monospace'
  ctx.textAlign = ar ? 'right' : 'left'
  ctx.direction = ar ? 'rtl' : 'ltr'
  ctx.fillText(ar ? 'المقال الكامل عبر الرابط أو QR' : 'full article → link in post · or scan', sideX, qrY + 140)
}

/** 1080×1920 story card — QR + visit-our-profile CTA. */
export async function drawStoryCard(canvas: HTMLCanvasElement, a: CardArticle, lang: 'en' | 'ar'): Promise<void> {
  const W = 1080
  const H = 1920
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const ar = lang === 'ar'
  const title = (ar && a.title_ar) ? a.title_ar : a.title
  const articleUrl = `https://pressing90.live/news/${a.slug}?ref=fb-story${ar ? '&lang=ar' : ''}`

  await loadCardFonts()
  paintGround(ctx, W, H)
  await paintBrandRow(ctx)

  ctx.direction = ar ? 'rtl' : 'ltr'
  ctx.textAlign = ar ? 'right' : 'left'
  ctx.fillStyle = GOLD
  ctx.font = ar ? '800 34px Tajawal, sans-serif' : '400 36px "IBM Plex Mono", monospace'
  ctx.fillText(ar ? 'مقال جديد' : 'N E W   A R T I C L E', ar ? W - 64 : 64, 300)

  await paintImagePanel(ctx, W, a.image_url, 340, 760)

  // Title
  const titleTop = 1190
  ctx.fillStyle = GOLD
  if (ar) ctx.fillRect(W - 64 - 10, titleTop - 58, 10, 190)
  else ctx.fillRect(60, titleTop - 58, 10, 190)
  ctx.fillStyle = CREAM
  ctx.font = ar ? '800 72px Tajawal, sans-serif' : '400 72px Anton, sans-serif'
  ctx.direction = ar ? 'rtl' : 'ltr'
  ctx.textAlign = ar ? 'right' : 'left'
  wrapLines(ctx, title, W - 220, 3).forEach((l, i) => {
    ctx.fillText(l, ar ? W - 104 : 104, titleTop + i * 92)
  })

  // CTA card with QR
  const cardY = 1500
  const cardH = 320
  roundedPath(ctx, 60, cardY, W - 120, cardH, 36)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()

  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, articleUrl, {
    width: 480,
    margin: 1,
    color: { dark: NIGHT, light: '#FFFFFF' },
  })
  const qrSize = 250
  const qrX = ar ? W - 60 - 36 - qrSize : 96
  ctx.drawImage(qrCanvas, qrX, cardY + 35, qrSize, qrSize)

  const tx = ar ? qrX - 40 : 96 + qrSize + 44
  ctx.direction = ar ? 'rtl' : 'ltr'
  ctx.textAlign = ar ? 'right' : 'left'
  ctx.fillStyle = NIGHT
  ctx.font = ar ? '800 52px Tajawal, sans-serif' : '400 52px Anton, sans-serif'
  ctx.fillText(ar ? 'امسح رمز QR' : 'Scan the QR code', tx, cardY + 105)
  ctx.fillStyle = '#3A4C63'
  ctx.font = ar ? '500 36px Tajawal, sans-serif' : '700 34px Archivo, sans-serif'
  wrapLines(
    ctx,
    ar ? 'أو زر صفحتنا لقراءة المقال كاملاً' : 'or visit our profile to read the full article',
    ar ? (qrX - 40) - 100 : (W - 96) - tx,
    2
  ).forEach((l, i) => ctx.fillText(l, tx, cardY + 170 + i * 46))

  ctx.fillStyle = GOLD
  const pillW = 340
  const pillX = ar ? tx - pillW : tx
  roundedPath(ctx, pillX, cardY + 232, pillW, 56, 28)
  ctx.fill()
  ctx.fillStyle = NIGHT
  ctx.font = '400 30px "IBM Plex Mono", monospace'
  ctx.textAlign = 'center'
  ctx.direction = 'ltr'
  ctx.fillText('pressing90.live', pillX + pillW / 2, cardY + 270)
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/**
 * Generate + upload the branded post card(s) for an article so the
 * worker's Facebook publish uses them instead of the raw image.
 * EN always; AR only when the translation already exists. Silent on
 * failure — the FB post then falls back to the raw article image.
 */
export async function uploadPostCards(article: CardArticle & { id: string }, token: string): Promise<void> {
  const langs: Array<'en' | 'ar'> = article.title_ar ? ['en', 'ar'] : ['en']
  for (const lang of langs) {
    try {
      const canvas = document.createElement('canvas')
      await drawPostCard(canvas, article, lang)
      const blob = await canvasBlob(canvas)
      if (!blob) continue
      await fetch(`${API_BASE}/admin/news/${article.id}/post-image?lang=${lang}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' },
        body: blob,
      })
    } catch { /* fall back to the raw article image */ }
  }
}

// ─── Match-day story image(s) — no voice, just today's fixtures ──────

export type StoryMatch = {
  home: string
  away: string
  homeLogo: string | null
  awayLogo: string | null
  time: string
  league: string
  live: boolean
  score?: string
}

/** How many fixtures fit on one 1080×1920 story page. */
export const MATCHES_PER_STORY = 6

/**
 * 1080×1920 story listing up to MATCHES_PER_STORY fixtures: brand
 * header, big "today's matches" title + date, one row per match
 * (crest · name — time/score pill — name · crest, league beneath),
 * QR to /today?ref=fb-story + site pill. `page`/`pages` for the
 * "1/3" marker when the day is split across several images.
 */
export async function drawMatchStory(
  canvas: HTMLCanvasElement,
  matches: StoryMatch[],
  lang: 'en' | 'ar' | 'fr',
  page: number,
  pages: number
): Promise<void> {
  const W = 1080
  const H = 1920
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const ar = lang === 'ar'
  await loadCardFonts()

  // Ground
  ctx.fillStyle = NIGHT
  ctx.fillRect(0, 0, W, H)
  const g1 = ctx.createRadialGradient(W / 2, 200, 0, W / 2, 200, 1000)
  g1.addColorStop(0, 'rgba(217,181,74,0.16)')
  g1.addColorStop(1, 'rgba(217,181,74,0)')
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, W, H)

  // Brand row
  const logo = await loadImage('/p90-logo.svg')
  if (logo) ctx.drawImage(logo, 60, 70, 96, 96)
  ctx.textAlign = 'left'
  ctx.direction = 'ltr'
  ctx.fillStyle = CREAM
  ctx.font = '400 56px Anton, sans-serif'
  ctx.fillText('Pressing', 180, 124)
  const pw = ctx.measureText('Pressing ').width
  ctx.fillStyle = GOLD
  ctx.fillText("90’", 180 + pw, 124)
  ctx.fillStyle = 'rgba(243,239,230,0.55)'
  ctx.font = '400 22px "IBM Plex Mono", monospace'
  ctx.fillText('L I V E   F O O T B A L L   S C O R E S', 182, 160)
  if (pages > 1) {
    ctx.textAlign = 'right'
    ctx.fillStyle = GOLD
    ctx.font = '400 30px "IBM Plex Mono", monospace'
    ctx.fillText(`${page} / ${pages}`, W - 60, 130)
  }

  // Title + date
  ctx.textAlign = 'center'
  ctx.direction = ar ? 'rtl' : 'ltr'
  ctx.fillStyle = GOLD
  ctx.font = ar ? '800 76px Tajawal, sans-serif' : '400 78px Anton, sans-serif'
  ctx.fillText(ar ? '⚽ مباريات اليوم' : lang === 'fr' ? '⚽ LES MATCHS DU JOUR' : "⚽ TODAY'S MATCHES", W / 2, 330)
  ctx.fillStyle = 'rgba(243,239,230,0.7)'
  ctx.font = ar ? '500 34px Tajawal, sans-serif' : '400 30px "IBM Plex Mono", monospace'
  const dateStr = new Date().toLocaleDateString(ar ? 'ar-u-nu-latn' : lang, { weekday: 'long', day: 'numeric', month: 'long' })
  ctx.fillText(dateStr, W / 2, 392)

  // Rows
  const top = 470
  const rowH = 190
  const crest = 96
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const y = top + i * rowH
    // row card
    roundedPath(ctx, 48, y, W - 96, rowH - 22, 28)
    ctx.fillStyle = 'rgba(13,44,75,0.85)'
    ctx.fill()
    ctx.strokeStyle = m.live ? 'rgba(255,77,94,0.55)' : 'rgba(243,239,230,0.10)'
    ctx.lineWidth = 2
    ctx.stroke()
    const cy = y + (rowH - 22) / 2
    // crests
    const [hImg, aImg] = await Promise.all([
      m.homeLogo ? loadImage(m.homeLogo) : null,
      m.awayLogo ? loadImage(m.awayLogo) : null,
    ])
    if (hImg) ctx.drawImage(hImg, 78, cy - crest / 2 - 8, crest, crest)
    if (aImg) ctx.drawImage(aImg, W - 78 - crest, cy - crest / 2 - 8, crest, crest)
    // names (Latin, as on the site)
    ctx.direction = 'ltr'
    ctx.fillStyle = CREAM
    ctx.font = '400 38px Anton, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(wrapLines(ctx, m.home, 250, 1)[0] ?? m.home, 78 + crest + 18, cy + 4)
    ctx.textAlign = 'right'
    ctx.fillText(wrapLines(ctx, m.away, 250, 1)[0] ?? m.away, W - 78 - crest - 18, cy + 4)
    // centre pill: score (live/final) or kick-off time
    const label = m.score ?? m.time
    ctx.font = m.score ? '400 44px Anton, sans-serif' : '400 30px "IBM Plex Mono", monospace'
    const pillW = Math.max(150, ctx.measureText(label).width + 48)
    roundedPath(ctx, W / 2 - pillW / 2, cy - 40, pillW, 62, 31)
    ctx.fillStyle = m.live ? '#FF4D5E' : GOLD
    ctx.fill()
    ctx.fillStyle = m.live ? '#FFFFFF' : NIGHT
    ctx.textAlign = 'center'
    ctx.fillText(label, W / 2, cy + (m.score ? 4 : 2) + 8)
    // league under the pill
    ctx.fillStyle = 'rgba(243,239,230,0.55)'
    ctx.direction = ar ? 'rtl' : 'ltr'
    ctx.font = ar ? '500 26px Tajawal, sans-serif' : '400 22px "IBM Plex Mono", monospace'
    ctx.fillText(wrapLines(ctx, m.league, 420, 1)[0] ?? m.league, W / 2, cy + 66)
  }

  // Footer: QR to /today + site pill + profile hint
  const footY = Math.max(top + matches.length * rowH + 30, 1620)
  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, `https://pressing90.live/today?ref=fb-story${ar ? '&lang=ar' : lang === 'fr' ? '&lang=fr' : ''}`, {
    width: 360,
    margin: 1,
    color: { dark: NIGHT, light: '#FFFFFF' },
  })
  const qr = 180
  roundedPath(ctx, W - 60 - qr, footY, qr, qr, 22)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.drawImage(qrCanvas, W - 60 - qr + 10, footY + 10, qr - 20, qr - 20)
  ctx.fillStyle = GOLD
  roundedPath(ctx, 60, footY + 20, 360, 60, 30)
  ctx.fill()
  ctx.fillStyle = NIGHT
  ctx.font = '400 30px "IBM Plex Mono", monospace'
  ctx.textAlign = 'center'
  ctx.direction = 'ltr'
  ctx.fillText('pressing90.live', 60 + 180, footY + 60)
  ctx.fillStyle = 'rgba(243,239,230,0.7)'
  ctx.textAlign = 'left'
  ctx.direction = ar ? 'rtl' : 'ltr'
  if (ar) ctx.textAlign = 'right'
  ctx.font = ar ? '500 30px Tajawal, sans-serif' : '700 26px Archivo, sans-serif'
  const hint = ar ? 'النتائج المباشرة: امسح الرمز أو زر صفحتنا' : lang === 'fr' ? 'Scores en direct : scanne ou visite notre profil' : 'Live scores: scan or visit our profile'
  wrapLines(ctx, hint, 520, 2).forEach((l, i) => ctx.fillText(l, ar ? W - 60 - qr - 30 : 60, footY + 128 + i * 36))
}
