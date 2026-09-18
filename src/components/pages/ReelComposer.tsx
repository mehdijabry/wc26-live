import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { API_BASE } from '../../lib/api'
import { edgeTtsBrowser } from '../../lib/edgeTts'
import { loadMatchPool, type MatchSlide } from '../../lib/matchPool'
import { drawStoryCard, loadCardFonts, loadImage, roundedPath, wrapLines, CREAM, GOLD, NIGHT, type CardArticle } from '../../lib/newsCards'

/**
 * ReelComposer — builds a 1080×1920 vertical video ENTIRELY in the
 * admin browser: canvas scenes recorded via captureStream + a TTS
 * voice-over fetched from the worker (/admin/reels/tts, free Edge TTS).
 *
 * Two modes (Mehdi's spec):
 *  - 'article'  → Ken-Burns animation over the article's story card,
 *                 voice reads title + excerpt + CTA.
 *  - 'matchday' → slides of today's top fixtures (crest vs crest, time,
 *                 competition), voice announces each match.
 *
 * Publication is MANUAL (download → Meta Business app) so the trending
 * music can be added there — same constraint as stories: Meta's
 * licensed music library is app-only, and baking a copyrighted track
 * into the file would get the page struck.
 */

// Voice ids are resolved by the worker: 'ar' needs the ElevenLabs key
// (Edge TTS is dead — Microsoft blocks datacenters AND browser origins),
// 'en'/'fr' fall back to free Workers AI MeloTTS when no key is set.
// Signature music — chosen ONCE by Mehdi (2026-09-06), reused forever:
// matchday reel = voice + music ducked underneath; article reels have
// NO voice-over (his rule) — music only, fixed length.
const MUSIC = { matchday: '/audio/matchday.m4a', article: '/audio/articles.m4a' } as const
const ARTICLE_REEL_SECONDS = 20
const MUSIC_GAIN = { underVoice: 0.22, solo: 0.9 } as const

const VOICES = [
  { id: 'ar', label: 'عربي (ElevenLabs)' },
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Français' },
] as const

function buildMatchScript(slides: MatchSlide[], lang: 'ar' | 'en' | 'fr'): string {
  if (lang === 'ar') {
    const parts = slides.map((s) => `${s.home} ضد ${s.away} في ${s.league}${s.time ? ` على الساعة ${s.time}` : ''}`)
    return `أبرز مباريات اليوم على بريسينغ ٩٠. ${parts.join('. ')}. تابعوا النتائج المباشرة على موقعنا بريسينغ ٩٠ دوت لايف.`
  }
  if (lang === 'fr') {
    const parts = slides.map((s) => `${s.home} contre ${s.away} en ${s.league}${s.time ? ` à ${s.time}` : ''}`)
    return `Les grands matchs du jour sur Pressing 90. ${parts.join('. ')}. Suivez les scores en direct sur pressing90 point live.`
  }
  const parts = slides.map((s) => `${s.home} versus ${s.away} in the ${s.league}${s.time ? ` at ${s.time}` : ''}`)
  return `Today's top matches on Pressing 90. ${parts.join('. ')}. Follow the live scores on pressing90 dot live.`
}

function buildArticleScript(a: CardArticle & { excerpt?: string | null; excerpt_ar?: string | null }, lang: 'ar' | 'en' | 'fr'): string {
  if (lang === 'ar' && a.title_ar) {
    return `${a.title_ar}. ${a.excerpt_ar ?? ''} المقال الكامل على موقعنا بريسينغ ٩٠ دوت لايف — الرابط في التعليق الأول.`
  }
  return `${a.title}. ${a.excerpt ?? ''} Full story on pressing 90 dot live — link in the first comment.`
}

const tag = (s: string) => '#' + s.replace(/[^\p{L}\p{N}]+/gu, '')

/** Ready-to-paste caption: hook + CTA (like the page / visit the site)
 *  + content-specific hashtags per post (teams, competitions). */
function buildMatchCaption(slides: MatchSlide[], lang: 'ar' | 'en' | 'fr'): string {
  const comps = [...new Set(slides.map((s) => s.league))]
  const teams = slides.flatMap((s) => [s.home, s.away]).slice(0, 8)
  const tags = [...new Set([
    ...comps.map(tag),
    ...teams.map(tag),
    ...(lang === 'ar'
      ? ['#كرة_القدم', '#مباريات_اليوم', '#Pressing90', '#football']
      : ['#football', '#matchday', '#livescore', '#Pressing90']),
  ])].join(' ')
  const list = slides.map((s) => `⚽ ${s.home} 🆚 ${s.away}${s.live ? ' 🔴 LIVE' : s.time ? ` · ${s.time}` : ''}`).join('\n')
  if (lang === 'ar') {
    return `🔥 أبرز مباريات اليوم!\n\n${list}\n\n📲 تابعوا النتائج لحظة بلحظة على 👉 pressing90.live\n❤️ اعمل لايك للصفحة وفعّل التنبيهات حتى لا يفوتك أي هدف!\n\n${tags}`
  }
  if (lang === 'fr') {
    return `🔥 Les gros matchs du jour !\n\n${list}\n\n📲 Scores en direct sur 👉 pressing90.live\n❤️ Aime la page et active les notifications pour ne rien rater !\n\n${tags}`
  }
  return `🔥 Today's big matches!\n\n${list}\n\n📲 Live scores on 👉 pressing90.live\n❤️ Like the page & turn on notifications so you never miss a goal!\n\n${tags}`
}

function buildArticleCaption(a: CardArticle & { excerpt?: string | null; excerpt_ar?: string | null }, lang: 'ar' | 'en' | 'fr'): string {
  const link = `https://pressing90.live/news/${a.slug}?ref=fb-reel${lang === 'ar' ? '&lang=ar' : ''}`
  // Content hashtags from the title's capitalized words (best effort).
  const words = [...new Set((a.title.match(/\b[A-Z][a-zA-Z]{3,}\b/g) ?? []).slice(0, 4))]
  const tags = [...new Set([
    ...words.map(tag),
    ...(lang === 'ar'
      ? ['#كرة_القدم', '#أخبار_الكرة', '#Pressing90', '#football']
      : ['#football', '#footballnews', '#Pressing90']),
  ])].join(' ')
  if (lang === 'ar' && a.title_ar) {
    return `📰 ${a.title_ar}\n\n📲 المقال الكامل 👉 ${link}\n❤️ اعمل لايك للصفحة وتابعنا لكل جديد الكرة!\n\n${tags}`
  }
  if (lang === 'fr') {
    return `📰 ${a.title}\n\n📲 L'article complet 👉 ${link}\n❤️ Aime la page et suis-nous pour toute l'actu foot !\n\n${tags}`
  }
  return `📰 ${a.title}\n\n📲 Full story 👉 ${link}\n❤️ Like the page & follow us for all the football news!\n\n${tags}`
}

async function drawMatchSlide(canvas: HTMLCanvasElement, s: MatchSlide, idx: number, total: number, lang: 'ar' | 'en' | 'fr'): Promise<void> {
  const W = 1080
  const H = 1920
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const ar = lang === 'ar'
  await loadCardFonts()

  ctx.fillStyle = NIGHT
  ctx.fillRect(0, 0, W, H)
  const g1 = ctx.createRadialGradient(W / 2, 500, 0, W / 2, 500, 1100)
  g1.addColorStop(0, 'rgba(217,181,74,0.14)')
  g1.addColorStop(1, 'rgba(217,181,74,0)')
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, W, H)

  // Brand + header
  const logo = await loadImage('/p90-logo.svg')
  if (logo) ctx.drawImage(logo, W / 2 - 55, 120, 110, 110)
  ctx.textAlign = 'center'
  ctx.direction = 'ltr'
  ctx.fillStyle = CREAM
  ctx.font = '400 58px Anton, sans-serif'
  ctx.fillText("Pressing 90’", W / 2, 310)
  ctx.fillStyle = GOLD
  ctx.font = ar ? '800 52px Tajawal, sans-serif' : '400 44px "IBM Plex Mono", monospace'
  ctx.direction = ar ? 'rtl' : 'ltr'
  ctx.fillText(ar ? '⚽ مباريات اليوم' : lang === 'fr' ? '⚽ LES MATCHS DU JOUR' : "⚽ TODAY'S MATCHES", W / 2, 400)

  // League
  ctx.fillStyle = 'rgba(243,239,230,0.65)'
  ctx.font = ar ? '700 40px Tajawal, sans-serif' : '400 34px "IBM Plex Mono", monospace'
  ctx.fillText(s.league, W / 2, 560)

  // Crests row
  const [hImg, aImg] = await Promise.all([s.homeLogo ? loadImage(s.homeLogo) : null, s.awayLogo ? loadImage(s.awayLogo) : null])
  const cy = 850
  const size = 300
  if (hImg) ctx.drawImage(hImg, 120, cy - size / 2, size, size)
  if (aImg) ctx.drawImage(aImg, W - 120 - size, cy - size / 2, size, size)
  ctx.fillStyle = GOLD
  ctx.font = '400 90px Anton, sans-serif'
  ctx.direction = 'ltr'
  ctx.fillText(s.score ?? 'VS', W / 2, cy + 30)

  // Team names
  ctx.fillStyle = CREAM
  ctx.font = ar ? '800 44px Tajawal, sans-serif' : '400 44px Anton, sans-serif'
  wrapLines(ctx, s.home, 380, 2).forEach((l, i) => ctx.fillText(l, 120 + size / 2, cy + size / 2 + 80 + i * 52))
  wrapLines(ctx, s.away, 380, 2).forEach((l, i) => ctx.fillText(l, W - 120 - size / 2, cy + size / 2 + 80 + i * 52))

  // Time / LIVE
  if (s.live) {
    ctx.fillStyle = '#FF4D5E'
    roundedPath(ctx, W / 2 - 140, 1380, 280, 90, 45)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '400 48px Anton, sans-serif'
    ctx.fillText(s.score ? 'LIVE' : 'LIVE', W / 2, 1442)
  } else if (s.time) {
    ctx.fillStyle = GOLD
    roundedPath(ctx, W / 2 - 170, 1380, 340, 90, 45)
    ctx.fill()
    ctx.fillStyle = NIGHT
    ctx.font = '400 30px "IBM Plex Mono", monospace'
    ctx.fillText(s.time, W / 2, 1440)
  }

  // Footer + progress
  ctx.fillStyle = 'rgba(243,239,230,0.5)'
  ctx.font = '400 28px "IBM Plex Mono", monospace'
  ctx.fillText('pressing90.live', W / 2, 1700)
  ctx.fillStyle = GOLD
  ctx.font = '400 26px "IBM Plex Mono", monospace'
  ctx.fillText(`${idx + 1} / ${total}`, W / 2, 1760)
}

export function ReelComposer({
  mode,
  article,
  token,
  onClose,
}: {
  mode: 'article' | 'matchday'
  article: (CardArticle & { excerpt?: string | null; excerpt_ar?: string | null }) | null
  token: string
  onClose: () => void
}) {
  const [voice, setVoice] = useState<string>('ar')
  const lang: 'ar' | 'en' | 'fr' = voice.startsWith('ar') ? 'ar' : voice.startsWith('fr') ? 'fr' : 'en'
  const [script, setScript] = useState('')
  const [caption, setCaption] = useState('')
  const [capCopied, setCapCopied] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoExt, setVideoExt] = useState<'mp4' | 'webm'>('mp4')
  // Matchday: full candidate pool + the operator's selection.
  const [pool, setPool] = useState<MatchSlide[]>([])
  const [sel, setSel] = useState<Set<number>>(new Set())
  const previewRef = useRef<HTMLCanvasElement>(null)

  const chosen = useMemo(() => pool.filter((_, i) => sel.has(i)), [pool, sel])

  // Load the pool once per language (times/league names are localized).
  useEffect(() => {
    if (mode !== 'matchday') return
    let on = true
    void (async () => {
      setStatus('Chargement des matchs du jour…')
      try {
        const slides = await loadMatchPool(lang)
        if (!on) return
        setPool(slides)
        setSel(new Set(slides.slice(0, 6).map((_, i) => i)))
        setStatus(slides.length ? `${slides.length} matchs disponibles — coche ceux à inclure` : 'Aucun match majeur trouvé aujourd’hui')
      } catch (e) {
        if (on) setStatus('Erreur de chargement : ' + String(e))
      }
    })()
    return () => { on = false }
  }, [mode, lang])

  // (Re)build the voice script when the selection or language changes.
  // Arabic goes through the worker AI (100% Arabic, numbers in words,
  // names transliterated — the TTS mangles Latin text and digits);
  // en/fr are built locally. Debounced so checkbox toggles don't spam.
  useEffect(() => {
    if (mode === 'article') {
      if (article) {
        setScript(buildArticleScript(article, lang))
        setCaption(buildArticleCaption(article, lang))
        setStatus('Script prêt — édite-le si besoin')
      }
      return
    }
    if (chosen.length === 0) { setScript(''); setCaption(''); return }
    setCaption(buildMatchCaption(chosen, lang))
    if (lang !== 'ar') {
      setScript(buildMatchScript(chosen, lang))
      return
    }
    const t = window.setTimeout(() => {
      setStatus('🪄 Rédaction du script arabe (IA)…')
      void fetch(`${API_BASE}/admin/reels/script`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ matches: chosen.map((s) => ({ home: s.home, away: s.away, league: s.league, time: s.time, live: s.live, score: s.score })) }),
      })
        .then(async (r) => {
          const d = await r.json().catch(() => null) as { script?: string; error?: string } | null
          if (d?.script) {
            setScript(d.script)
            setStatus(`✓ Script arabe prêt (${chosen.length} matchs) — édite-le si besoin`)
          } else {
            setScript(buildMatchScript(chosen, 'ar'))
            setStatus('⚠︎ IA indisponible — script de secours, à relire')
          }
        })
        .catch(() => {
          setScript(buildMatchScript(chosen, 'ar'))
          setStatus('⚠︎ IA indisponible — script de secours, à relire')
        })
    }, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, article, lang, chosen])

  const scenes = mode === 'matchday' ? chosen.length : 1

  // Selection helpers — per match and per competition.
  function toggleMatch(i: number) {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }
  function toggleLeague(league: string, on: boolean) {
    setSel((prev) => {
      const next = new Set(prev)
      pool.forEach((s, i) => { if (s.league === league) { if (on) next.add(i); else next.delete(i) } })
      return next
    })
  }

  async function generate() {
    setBusy(true)
    setVideoUrl(null)
    // iOS Safari: the AudioContext must be created AND unlocked inside
    // the user gesture — after the first `await` the gesture is spent
    // and resume() never resolves (the voice step hung forever on
    // iPhone). Create it synchronously here, play a silent tick, and
    // never await resume() unguarded.
    const audioCtx = new AudioContext()
    try {
      const tick = audioCtx.createBufferSource()
      tick.buffer = audioCtx.createBuffer(1, 1, 22050)
      tick.connect(audioCtx.destination)
      tick.start(0)
    } catch { /* unlock is best-effort */ }
    void audioCtx.resume().catch(() => {})
    try {
      // 1. Voice-over — MATCHDAY ONLY (Mehdi's rule: article reels are
      // music + visuals, no voice). Worker TTS (ElevenLabs for Arabic,
      // free Workers AI MeloTTS for en/fr); browser Edge TTS kept as a
      // legacy last resort.
      let voiceBuf: AudioBuffer | null = null
      if (mode === 'matchday') {
        setStatus('🎙 Génération de la voix…')
        let mp3: ArrayBuffer
        const ttsResp = await fetch(`${API_BASE}/admin/reels/tts`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ text: script, voice }),
        })
        if (ttsResp.ok) {
          mp3 = await ttsResp.arrayBuffer()
        } else {
          const errText = (await ttsResp.text()).slice(0, 300)
          try {
            mp3 = await edgeTtsBrowser(script, voice)
          } catch {
            throw new Error('TTS: ' + errText)
          }
        }
        void audioCtx.resume().catch(() => {})
        setStatus('🎙 Décodage de la voix…')
        voiceBuf = await audioCtx.decodeAudioData(mp3.slice(0))
      }

      // Signature music (fetched from the site's own /audio/, decoded).
      setStatus('🎵 Chargement de la musique signature…')
      const musicResp = await fetch(mode === 'matchday' ? MUSIC.matchday : MUSIC.article)
      if (!musicResp.ok) throw new Error('Musique signature introuvable')
      const musicBuf = await audioCtx.decodeAudioData(await musicResp.arrayBuffer())

      const duration = voiceBuf ? voiceBuf.duration + 1.2 : ARTICLE_REEL_SECONDS

      // 2. Pre-render scenes.
      setStatus('🎨 Rendu des scènes…')
      const sceneCanvases: HTMLCanvasElement[] = []
      if (mode === 'matchday') {
        for (let i = 0; i < chosen.length; i++) {
          const c = document.createElement('canvas')
          await drawMatchSlide(c, chosen[i], i, chosen.length, lang)
          sceneCanvases.push(c)
        }
      } else if (article) {
        const c = document.createElement('canvas')
        await drawStoryCard(c, article, lang === 'ar' && article.title_ar ? 'ar' : 'en')
        sceneCanvases.push(c)
      }
      if (sceneCanvases.length === 0) throw new Error('Aucune scène à rendre')

      // 3. Record: canvas stream + audio mix (voice over ducked music,
      // or music alone for article reels). Music loops if shorter than
      // the reel and fades out over the last 1.5s.
      setStatus(voiceBuf
        ? `🎬 Enregistrement de la vidéo… (voix ${Math.round(voiceBuf.duration)}s + musique)`
        : `🎬 Enregistrement de la vidéo… (${ARTICLE_REEL_SECONDS}s, musique signature)`)
      const out = previewRef.current!
      out.width = 1080
      out.height = 1920
      const octx = out.getContext('2d')!
      const vStream = out.captureStream(30)
      const dest = audioCtx.createMediaStreamDestination()
      const src = audioCtx.createBufferSource()
      if (voiceBuf) {
        src.buffer = voiceBuf
        src.connect(dest)
      }
      const music = audioCtx.createBufferSource()
      music.buffer = musicBuf
      music.loop = true
      const musicGain = audioCtx.createGain()
      const level = voiceBuf ? MUSIC_GAIN.underVoice : MUSIC_GAIN.solo
      musicGain.gain.setValueAtTime(0, audioCtx.currentTime)
      musicGain.gain.linearRampToValueAtTime(level, audioCtx.currentTime + 0.8)
      musicGain.gain.setValueAtTime(level, audioCtx.currentTime + Math.max(0.8, duration - 1.5))
      musicGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration)
      music.connect(musicGain).connect(dest)
      const stream = new MediaStream([...vStream.getVideoTracks(), ...dest.stream.getAudioTracks()])

      const mp4Type = 'video/mp4'
      const useMp4 = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mp4Type)
      const mime = useMp4 ? mp4Type : 'video/webm;codecs=vp9,opus'
      setVideoExt(useMp4 ? 'mp4' : 'webm')
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 })
      const parts: Blob[] = []
      rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data) }
      const finished = new Promise<void>((res) => { rec.onstop = () => res() })

      const perScene = duration / sceneCanvases.length
      const t0 = performance.now()
      let raf = 0
      // The recording must NEVER end before the voice does: we stop on
      // the source's `onended` signal (wall-clock was cutting reels
      // short when the decoded duration under-estimated the speech),
      // with a hard cap so a lost event can't loop forever.
      let audioEnded = !voiceBuf // no voice → wall-clock only
      src.onended = () => { audioEnded = true }
      const hardCap = duration + 12
      const drawFrame = () => {
        const t = (performance.now() - t0) / 1000
        const sceneT = Math.min(t, duration - 0.001)
        const i = Math.min(sceneCanvases.length - 1, Math.floor(sceneT / perScene))
        const local = (sceneT - i * perScene) / perScene
        const zoom = 1 + 0.06 * local // Ken Burns
        const c = sceneCanvases[i]
        octx.fillStyle = NIGHT
        octx.fillRect(0, 0, 1080, 1920)
        octx.save()
        octx.translate(540, 960)
        octx.scale(zoom, zoom)
        octx.drawImage(c, -540, -960)
        octx.restore()
        // crossfade during the last 0.4s of a scene
        if (local > 0.85 && i < sceneCanvases.length - 1) {
          octx.globalAlpha = (local - 0.85) / 0.15
          octx.drawImage(sceneCanvases[i + 1], 0, 0)
          octx.globalAlpha = 1
        }
        const done = (audioEnded && t >= duration) || t >= hardCap
        if (!done) raf = requestAnimationFrame(drawFrame)
        else rec.stop()
      }

      rec.start(250)
      music.start()
      if (voiceBuf) src.start()
      raf = requestAnimationFrame(drawFrame)
      await finished
      cancelAnimationFrame(raf)
      try { music.stop() } catch { /* ended */ }
      try { if (voiceBuf) src.stop() } catch { /* ended */ }
      void audioCtx.close()

      const blob = new Blob(parts, { type: mime })
      setVideoUrl(URL.createObjectURL(blob))
      setStatus(`✓ Reel prêt (${Math.round(duration)}s, ${useMp4 ? 'MP4' : 'WebM'})`)
    } catch (e) {
      setStatus('✗ ' + String(e))
    } finally {
      setBusy(false)
    }
  }

  // Tracked link for the reel's first comment / link sticker: article
  // reels point at the article, match-day reels at /today — both tagged
  // fb-reel so they get their own line in the Visitors block.
  const [copiedLink, setCopiedLink] = useState(false)
  const reelUrl = mode === 'article' && article
    ? `https://pressing90.live/news/${article.slug}?ref=fb-reel${lang === 'ar' ? '&lang=ar' : lang === 'fr' ? '&lang=fr' : ''}`
    : `https://pressing90.live/today?ref=fb-reel${lang === 'ar' ? '&lang=ar' : lang === 'fr' ? '&lang=fr' : ''}`
  async function copyReelLink() {
    try { await navigator.clipboard.writeText(reelUrl); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000) } catch { /* tooltip */ }
  }

  function download() {
    if (!videoUrl) return
    const a = document.createElement('a')
    a.href = videoUrl
    a.download = `reel-${mode}-${lang}-${Date.now()}.${videoExt}`
    a.click()
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" onClick={onClose}>
      <div className="bg-white rounded-2xl p-4 sm:p-5 max-h-[92vh] overflow-y-auto w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-display font-bold text-slate-900">
            🎬 Reel · {mode === 'matchday' ? 'Matchs du jour' : 'Article'}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600">×</button>
        </div>

        <label className="block text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-1">
          {mode === 'matchday' ? 'Voix' : 'Langue'}
        </label>
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
        >
          {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>

        {mode === 'matchday' ? (
          <>
            <label className="block text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-1">
              Script de la voix-off (éditable) · 🎵 musique signature en fond
            </label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              rows={5}
              className="w-full mb-3 px-3 py-2 rounded-lg border border-slate-300 text-sm leading-relaxed"
            />
          </>
        ) : (
          <div className="mb-3 text-[11px] font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            🎵 Sans voix-off : carte animée {ARTICLE_REEL_SECONDS}s + musique signature « articles ».
          </div>
        )}

        {/* Matchday: pick which matches (or whole competitions) appear. */}
        {mode === 'matchday' && pool.length > 0 && (
          <div className="mb-3 max-h-56 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1">
            {[...new Set(pool.map((s) => s.league))].map((league) => {
              const idxs = pool.map((s, i) => ({ s, i })).filter(({ s }) => s.league === league)
              const allOn = idxs.every(({ i }) => sel.has(i))
              return (
                <div key={league}>
                  <label className="flex items-center gap-2 px-1.5 py-1 rounded-lg bg-slate-100 cursor-pointer">
                    <input type="checkbox" checked={allOn} onChange={(e) => toggleLeague(league, e.target.checked)} />
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wide text-slate-700 truncate">{league}</span>
                  </label>
                  {idxs.map(({ s, i }) => (
                    <label key={i} className="flex items-center gap-2 px-1.5 py-1 ml-4 cursor-pointer hover:bg-slate-50 rounded-lg">
                      <input type="checkbox" checked={sel.has(i)} onChange={() => toggleMatch(i)} />
                      <span className="text-xs text-slate-800 truncate">
                        {s.home} – {s.away}
                        <span className="text-slate-400 font-mono text-[10px]"> · {s.live ? `LIVE${s.score ? ' ' + s.score : ''}` : s.time}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={generate}
          disabled={busy || (mode === 'matchday' && (!script.trim() || chosen.length === 0)) || (mode === 'article' && !article)}
          className="w-full px-4 py-2.5 rounded-full bg-accent-gold text-ink-900 text-sm font-bold hover:bg-yellow-300 disabled:opacity-50"
        >
          {busy ? '⏳ Génération…' : `🎬 Générer le reel${mode === 'matchday' ? ` (${scenes} scènes)` : ''}`}
        </button>

        {status && <div className="mt-2 text-[11px] font-mono text-slate-600">{status}</div>}

        {/* Recording surface doubles as the preview while rendering. */}
        <div className={'mt-3 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 ' + (videoUrl ? 'hidden' : '')}>
          <canvas ref={previewRef} className="w-full h-auto block" />
        </div>
        {videoUrl && (
          <>
            <video
              src={videoUrl}
              controls
              playsInline
              className="mt-3 w-full rounded-xl border border-slate-200"
              // MediaRecorder blobs report duration=Infinity, which stalls
              // the player — the classic seek-to-the-end hack fixes it.
              onLoadedMetadata={(e) => {
                const v = e.currentTarget
                if (v.duration === Infinity) {
                  v.currentTime = 1e10
                  v.ontimeupdate = () => { v.ontimeupdate = null; v.currentTime = 0 }
                }
              }}
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={download}
                className="flex-1 px-4 py-2.5 rounded-full bg-accent-gold text-ink-900 text-sm font-bold hover:bg-yellow-300"
              >
                ⬇️ Télécharger le {videoExt.toUpperCase()}
              </button>
              <button
                onClick={copyReelLink}
                title={reelUrl}
                className={'flex-1 px-4 py-2.5 rounded-full text-sm font-bold border transition-colors ' + (copiedLink ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-300 text-slate-700 hover:border-slate-500')}
              >
                {copiedLink ? '✓ Copié !' : '🔗 Copier le lien'}
              </button>
            </div>
          </>
        )}

        {/* Caption + content-specific hashtags, ready to paste with the
            reel (like-the-page + visit-the-site CTAs included). */}
        {caption && (
          <>
            <label className="mt-3 block text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-1">
              📋 Texte de publication (caption + hashtags)
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              rows={7}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs leading-relaxed"
            />
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(caption)
                  setCapCopied(true)
                  setTimeout(() => setCapCopied(false), 2000)
                } catch { /* clipboard blocked */ }
              }}
              className={
                'mt-1.5 w-full px-4 py-2 rounded-full text-sm font-bold border transition-colors ' +
                (capCopied ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-300 text-slate-700 hover:border-slate-500')
              }
            >
              {capCopied ? '✓ Copié !' : '🔗 Copier le texte'}
            </button>
          </>
        )}

        <div className="mt-3 text-[11px] font-mono text-slate-600 bg-amber-50 border border-amber-200/70 rounded-lg px-3 py-2 leading-relaxed">
          Publie le reel depuis l’app <strong>Meta Business</strong> :<br />
          🎵 ajoute la <strong>musique tendance</strong> par-dessus la voix<br />
          🔗 lien de l’article en <strong>premier commentaire</strong>
        </div>
      </div>
    </div>,
    document.body
  )
}
