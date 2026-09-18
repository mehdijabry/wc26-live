// « كيف جاء الهدف » — goal recreation reels (Mehdi, 2026-09-18): the best goal of each finished match of the
// day becomes a narrated schematic re-enactment rendered by the studio (type 'goal-anim'). The geometry comes
// from ESPN play coordinates (the scorer's run always ends on the real shot origin, the ball enters where ESPN
// says it crossed the line), the words from gpt-oss-120b (fallback: fixed Arabic templates), the voices from the
// studio's Edge TTS. Staged over cron ticks so no request runs long: texts → voices → render → callback → publish
// (blocked when the studio's audio QA reports an issue). Music « Quake » (aavirall, Uppbeat): credit line in
// every caption. One job at a time (a render takes ~30 min on the studio).
import type { Env } from './index'
import { withPlaybook, checkCaption, pinnedComment } from './playbook'
import { tiktokConfigured, tiktokPublish, tiktokCaption } from './tiktok'
import { log, bump, getCount, localParts, edgeVoice, gptJson, fbReel, fbComment, enqueuePendingComment, studio, matchSummary, loadAutomationSettings, WORKER_PUBLIC, SITE, type AutoMatch, type MatchSummary, type MatchGoal, type AutomationSettings } from './automation'

export type GoalAnimItem = { id: string; slug: string; league: string; home: string; away: string; homeLogo: string | null; awayLogo: string | null; homeScore: string; awayScore: string; venue?: string; addedAt: number; preview?: boolean; goalId?: string; fps?: number; scale?: number; force?: boolean }
type Texts = { scorerAr: string; assistAr: string; voices: string[]; captions: Array<[string, string]>; tags: string[]; cover: string; title: string; post: string }
type Meta = { scorer: string; assist: string; minute: string; distance: number; side: 'home' | 'away'; team: string; opp: string; template: string; opening: string; corner: string; foot: string; scoreLine: string; league: string; venue: string; barca: boolean }
type Scene = { spec: Record<string, unknown>; storyboard: string[]; meta: Meta }
type Job = { stage: 'texts' | 'voices' | 'render' | 'wait'; item: GoalAnimItem; startedAt: number; stageAt: number; scene?: Scene; texts?: Texts; voiceUrls?: string[]; jobId?: string }
type Play = NonNullable<MatchSummary['plays']>[number]

export const MUSIC_CREDIT = 'Music from #Uppbeat (free for Creators!):\nhttps://uppbeat.io/t/aavirall/quake\nLicense code: UHBKKEMPL5OBSULI'
const QKEY = (date: string) => `auto:goalanim:queue:${date}`
const JKEY = 'auto:goalanim:job'
const DONE = (id: string) => `auto:goalanim:done:${id}`
const isBarcaName = (n: string) => /barcelona|barça|barca/i.test(n)

// ─── queue ──────────────────────────────────────────────────────────────────
export async function goalAnimQueue(env: Env, date: string): Promise<GoalAnimItem[]> { try { return JSON.parse((await env.CACHE.get(QKEY(date))) ?? '[]') as GoalAnimItem[] } catch { return [] } }
export async function enqueueGoalAnim(env: Env, date: string, item: GoalAnimItem): Promise<boolean> {
  if (!item.force && (await env.CACHE.get(DONE(item.id)))) return false
  const q = await goalAnimQueue(env, date)
  if (q.some((x) => x.id === item.id)) return false
  q.push(item)
  await env.CACHE.put(QKEY(date), JSON.stringify(q), { expirationTtl: 36 * 3600 })
  return true
}
export async function goalAnimJob(env: Env): Promise<Job | null> { try { const raw = await env.CACHE.get(JKEY); return raw ? (JSON.parse(raw) as Job) : null } catch { return null } }
const saveJob = (env: Env, job: Job) => env.CACHE.put(JKEY, JSON.stringify(job), { expirationTtl: 6 * 3600 })
export const resetGoalAnim = (env: Env) => env.CACHE.delete(JKEY)

/** One tick of the staged pipeline: advances the running job by one stage, or starts the next queued match. */
export async function processGoalAnim(env: Env, s: AutomationSettings, date: string, force = false): Promise<string> {
  const job = await goalAnimJob(env)
  if (job) {
    if (Date.now() - job.startedAt > 110 * 60_000) { await env.CACHE.delete(JKEY); await log(env, date, 'goal-anim', false, `job ${job.item.home} v ${job.item.away} timed out at stage ${job.stage}`); return 'timeout' }
    try {
      if (job.stage === 'texts') {
        const sum = await matchSummary(env, job.item, true)
        const goal = pickBestGoal(sum, job.item, job.item.goalId)
        if (!goal) { await env.CACHE.delete(JKEY); await env.CACHE.put(DONE(job.item.id), '1', { expirationTtl: 3 * 86400 }); await log(env, date, 'goal-anim', false, `${job.item.home} v ${job.item.away}: no usable goal (coordinates missing?)`); return 'no goal' }
        const scene = buildScene(job.item, sum, goal)
        let texts: Texts
        try { texts = await goalTexts(env, scene) } catch (e) { await log(env, date, 'goal-anim', false, `LLM texts failed (${String(e).slice(0, 120)}) → template texts`); texts = templateTexts(scene.meta) }
        applyTexts(scene.spec, texts, scene.meta)
        job.scene = scene; job.texts = texts; job.stage = 'voices'; job.stageAt = Date.now()
        await saveJob(env, job)
        await log(env, date, 'goal-anim', true, `${job.item.home} v ${job.item.away}: ${goal.scorer} ${goal.minute} (${scene.meta.template}${scene.meta.opening ? ' · ' + scene.meta.opening : ''}, ${scene.meta.distance} m) — texts ready`)
        return 'texts'
      }
      if (job.stage === 'voices') {
        const urls: string[] = job.voiceUrls ?? []
        const voices = job.texts!.voices
        for (let i = urls.length; i < voices.length; i++) urls.push(await edgeVoice(env, voices[i], 'ar', `goalanim-${job.item.id}-${i}-${Date.now().toString(36)}.mp3`, 1.22))
        job.voiceUrls = urls; job.stage = 'render'; job.stageAt = Date.now()
        await saveJob(env, job)
        return 'voices'
      }
      if (job.stage === 'render') {
        // Guard against a stale KV read (a manual tick right before the cron tick sent the same render twice on 2026-09-18): one send per item per hour.
        const sentKey = `auto:goalanim:sent:${job.item.id}`
        if (await env.CACHE.get(sentKey)) { job.stage = 'wait'; await saveJob(env, job); return 'already sent' }
        await env.CACHE.put(sentKey, '1', { expirationTtl: 3600 })
        const jobId = `goalanim-${job.item.id}-${Date.now().toString(36)}`
        const spec = job.scene!.spec, meta = job.scene!.meta, texts = job.texts!
        const chk = checkCaption(texts.post, { keyword: texts.scorerAr || meta.scorer })   // playbook (2026-09-18): ≤ 5 hashtags, keyword first, CTA
        if (chk.warnings.length) await log(env, date, 'goal-anim-playbook', true, `${meta.scorer} ${meta.minute}: ${chk.warnings.join('; ')}`)
        const description = `${chk.text}\n\n${MUSIC_CREDIT}`
        const comment = pinnedComment(`تحليل هدف ${texts.scorerAr || meta.scorer} في مباراة ${meta.scoreLine} (${meta.league}): ${meta.template === 'solo' ? 'انطلاقة فردية' : `صناعة ${texts.assistAr || meta.assist}`}، تسديدة من ${meta.distance} متراً.`, 'أجمل هدف في المباراة: نعم أم لا؟ 👇', `كل تحليلات الأهداف على ${SITE}/today?lang=ar&ref=fb-goal`)
        await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify({ kind: 'goal-anim', date, label: 'goal-anim', description, comment, title: texts.title, preview: !!job.item.preview, item: job.item, meta }), { expirationTtl: 6 * 3600 })
        await studio(env, '/render/reel', { type: 'goal-anim', data: { spec, voiceUrls: job.voiceUrls, fps: job.item.fps ?? s.goalAnimFps ?? 20, scale: job.item.scale ?? s.goalAnimScale ?? 1 }, jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
        job.jobId = jobId; job.stage = 'wait'; job.stageAt = Date.now()
        await saveJob(env, job)
        await log(env, date, 'goal-anim', true, `${meta.scorer} ${meta.minute}: render job ${jobId} sent to the studio (${(job.voiceUrls ?? []).length} voices)`)
        return 'render'
      }
      return 'waiting'
    } catch (e) {
      await env.CACHE.delete(JKEY); await env.CACHE.put(DONE(job.item.id), '1', { expirationTtl: 3 * 86400 })
      await log(env, date, 'goal-anim', false, `${job.item.home} v ${job.item.away} failed at ${job.stage}: ${String(e).slice(0, 160)}`)
      return 'failed'
    }
  }
  const q = await goalAnimQueue(env, date)
  if (!q.length) return 'idle'
  const next = q[0]
  if (!force && !next.preview && (await getCount(env, date, 'goalanim')) >= (s.goalAnimPerDay ?? 4)) return 'cap'
  q.shift(); await env.CACHE.put(QKEY(date), JSON.stringify(q), { expirationTtl: 36 * 3600 })
  await saveJob(env, { stage: 'texts', item: next, startedAt: Date.now(), stageAt: Date.now() })
  return `started ${next.home} v ${next.away}`
}

/** Studio → worker: the reel is rendered. QA gate, then publish (or log the preview URL). */
export async function goalAnimCallback(env: Env, job: { date: string; description?: string; comment?: string; title?: string; preview?: boolean; item?: GoalAnimItem; meta?: Meta }, body: { ok?: boolean; url?: string; seconds?: number; error?: string; qa?: { visual?: Record<string, unknown>; audio?: { issues?: string[]; loudness?: number; loudnessAfter?: number } } }): Promise<void> {
  await env.CACHE.delete(JKEY)
  const id = job.item?.id ?? ''
  if (id) await env.CACHE.put(DONE(id), '1', { expirationTtl: 3 * 86400 })
  const who = job.meta ? `${job.meta.scorer} ${job.meta.minute}` : 'goal'
  if (!body.ok || !body.url) { await log(env, job.date, 'goal-anim', false, `${who}: render failed: ${body.error ?? 'unknown'}`); return }
  const issues = body.qa?.audio?.issues ?? []
  const vis = body.qa?.visual ?? {}
  const lufs = [body.qa?.audio?.loudness, body.qa?.audio?.loudnessAfter].filter((x) => typeof x === 'number' && Number.isFinite(x) && x !== 0).map((x) => x!.toFixed(1)).join(' → ') || 'n/a'
  const qaNote = `QA audio ${issues.length ? 'FAIL: ' + issues.join('; ') : 'ok'} (${lufs} LUFS) · visual moves ${vis.labelMoves ?? '?'}, unresolved ${vis.unresolved ?? '?'}/${vis.frames ?? '?'}, fits ${vis.viewportFits ?? '?'}`
  if (issues.length) { await log(env, job.date, 'goal-anim', false, `${who}: NOT published — ${qaNote} · ${body.url}`); return }
  if (job.preview) { await log(env, job.date, 'goal-anim', true, `${who}: PREVIEW ready (${body.seconds ?? '?'}s, not published) · ${qaNote} · ${body.url}`); return }
  const r = await fbReel(env, { video_url: body.url, description: job.description ?? '', title: job.title ?? '' })
  if (r.ok) { await bump(env, job.date, 'reel'); await bump(env, job.date, 'goalanim') }
  await log(env, job.date, 'goal-anim', r.ok, r.ok ? `${who}: published (${body.seconds ?? '?'}s) · ${r.note ?? ''} · ${qaNote} · ${body.url}` : `${who}: publish failed ${r.status ?? ''} ${r.note ?? ''} · ${body.url}`)
  // TikTok (2026-09-18): same video, TikTok caption (no link line, ≤ 5 hashtags), privacy/mode from the settings — never for previews.
  if (r.ok) {
    try { const st = await loadAutomationSettings(env); if (st.tiktok && tiktokConfigured(env)) { const t = await tiktokPublish(env, { videoUrl: body.url, caption: tiktokCaption(job.description ?? '', ['#تحليل_الأهداف', '#Pressing90']), privacy: st.tiktokPrivacy, mode: st.tiktokMode }); await log(env, job.date, 'tiktok', t.ok, `${who}: ${t.note ?? ''} · ${t.publish_id ?? ''}`) } }
    catch (e) { await log(env, job.date, 'tiktok', false, `${who}: ${String(e).slice(0, 200)}`) }
  }
  // Pinned comment (playbook): keyword-rich sentence + closed question + link — under the reel once Facebook shows it.
  if (r.ok && job.comment) {
    if (r.id) { const c = await fbComment(env, r.id, job.comment); await log(env, job.date, 'goal-anim-comment', c.ok, c.note ?? '') }
    else if (env.FB_PAGE_TOKEN) { await enqueuePendingComment(env, job.description ?? '', job.comment); await log(env, job.date, 'goal-anim-comment', true, 'queued — commented once Facebook has processed the video') }
  }
}

// ─── best goal of the match ──────────────────────────────────────────────────
export function pickBestGoal(sum: MatchSummary, m: Pick<AutoMatch, 'home' | 'away' | 'homeScore' | 'awayScore'>, goalId?: string): MatchGoal | null {
  const goals = sum.goals.filter((g) => !g.ownGoal && g.x != null && g.y != null)
  if (goalId) return goals.find((g) => g.playId === goalId) ?? null
  const hs = Number(m.homeScore ?? 0), as = Number(m.awayScore ?? 0)
  const score = (g: MatchGoal) => {
    const t = (g.text ?? '').toLowerCase(); let sc = 1
    const dist = (100 - Number(g.x)) * 1.05
    if (dist >= 30) sc += 3; else if (dist >= 20) sc += 2; else if (dist >= 16) sc += 1
    if (/top (left|right) corner/.test(t)) sc += 1
    if (/header/.test(t)) sc += 0.5
    if (/fast break/.test(t)) sc += 1
    if (/through ball/.test(t)) sc += 0.6
    if (/difficult angle/.test(t)) sc += 0.8
    if (g.penalty) sc -= 3
    const min = parseInt(g.minute, 10) || 0
    if (min >= 85 && Math.abs(hs - as) <= 1) sc += 1.5
    if (isBarcaName(g.team) || /morocc/i.test(g.nationality ?? '')) sc += 1
    return sc
  }
  return goals.sort((a, b) => score(b) - score(a) || (parseInt(b.minute, 10) || 0) - (parseInt(a.minute, 10) || 0))[0] ?? null
}

// ─── choreography: ESPN facts → scene spec + storyboard ─────────────────────
type P = { name: string; full?: string; jersey: string; pos: string }
type Actor = { kind: 'home' | 'away' | 'gk'; number: string; name: string; kit?: Record<string, string>; keys: Array<[string, number, number]> }
const norm = (x: string) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim()
const surname = (n: string) => String(n || '').trim().split(/\s+/).slice(-1)[0] || ''
const label = (p: P | undefined, fallback: string) => (p ? surname(p.name || p.full || fallback) : surname(fallback)).toUpperCase().slice(0, 14)
function findPlayer(list: P[], name: string): P | undefined {
  const n = norm(name); if (!n) return undefined
  return list.find((p) => norm(p.full || p.name) === n) || list.find((p) => norm(p.full || p.name).includes(norm(surname(name)))) || list.find((p) => norm(p.name).includes(norm(surname(name))))
}
const kindOf = (pos: string) => /^G/i.test(pos) ? 'gk' : /B$|^CD|^D|^SW/i.test(pos) ? 'def' : /M$|^[LR]M|^CM|^DM|^AM/i.test(pos) ? 'mid' : 'fwd'
const sideOf = (pos: string): 'L' | 'C' | 'R' => (/^L|-L/i.test(pos) ? 'L' : /^R|-R/i.test(pos) ? 'R' : 'C')
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const r3 = (x: number) => Math.round(x * 1000) / 1000
function contrastNum(hex: string): string { const n = parseInt(hex.replace('#', ''), 16); const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? '#1C2C5B' : '#FFFFFF' }
function hue(hex: string): number { const n = parseInt(hex.replace('#', ''), 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return -1; const d = mx - mn; let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60) % 360 }
function teamKit(name: string, color?: string, alt?: string, avoid?: string): Record<string, string> | undefined {
  if (isBarcaName(name)) return undefined   // editorial blaugrana jersey
  let body = color && /^[0-9a-f]{6}$/i.test(color) ? '#' + color : '#3F6FB5'
  const altHex = alt && /^[0-9a-f]{6}$/i.test(alt) ? '#' + alt : undefined
  if (avoid) { const ha = hue(avoid), hb = hue(body); const close = ha >= 0 && hb >= 0 ? Math.min(Math.abs(ha - hb), 360 - Math.abs(ha - hb)) < 35 : Math.abs(parseInt(avoid.slice(1), 16) - parseInt(body.slice(1), 16)) < 0x202020; if (close && altHex) body = altHex }
  return { body, num: contrastNum(body), disc: body, ...(altHex && altHex !== body ? { sleeve: altHex } : {}) }
}

export function buildScene(m: GoalAnimItem, sum: MatchSummary, g: MatchGoal): Scene {
  const h = norm(m.home), tg = norm(g.team)
  const side: 'home' | 'away' = tg === h || tg.includes(h.split(' ')[0]) || h.includes(tg.split(' ')[0]) ? 'home' : 'away'
  const teamName = side === 'home' ? m.home : m.away, oppName = side === 'home' ? m.away : m.home
  const att = sum.rosters.find((r) => r.side === side), def = sum.rosters.find((r) => r.side !== side)
  const attList: P[] = [...(att?.players ?? []), ...(att?.bench ?? [])], defList: P[] = [...(def?.players ?? []), ...(def?.bench ?? [])]
  const tAtt = sum.teams.find((t) => t.side === side), tDef = sum.teams.find((t) => t.side !== side)
  const kitAtt = teamKit(teamName, tAtt?.color, tAtt?.altColor)
  const kitDef = teamKit(oppName, tDef?.color, tDef?.altColor, kitAtt?.body ?? '#A50044')
  const gkKit = { body: '#3A3A3A', num: '#FFFFFF', disc: '#3A3A3A' }
  const text = g.text ?? ''
  // geometry (attacker's frame): u = 1 - Y/100 (left = high Y), v = 1 - X/100 (goal line at the top)
  const ou = r3(clamp(1 - Number(g.y) / 100, 0.06, 0.94)), ov = r3(clamp(1 - Number(g.x) / 100, 0.02, 0.6))
  const tu = r3(clamp(g.y2 != null ? 1 - Number(g.y2) / 100 : 0.5, 0.45, 0.55))
  const top = /top (left|right|corner)|top of the/i.test(text)
  const foot = /header/i.test(text) ? 'header' : /left footed/i.test(text) ? 'left' : /right footed/i.test(text) ? 'right' : 'shot'
  const corner = /top left/i.test(text) ? 'top-left' : /top right/i.test(text) ? 'top-right' : /bottom left/i.test(text) ? 'bottom-left' : /bottom right/i.test(text) ? 'bottom-right' : 'centre'
  const distance = Math.round((100 - Number(g.x)) * 1.05)
  const assistName = g.assist || ''
  const template = !assistName ? 'solo' : /following a fast break/i.test(text) ? 'fastbreak' : /with a cross|headed pass/i.test(text) ? 'cross' : /through ball/i.test(text) ? 'through' : /following a corner|following a set piece/i.test(text) ? 'setpiece' : 'fastbreak'
  // opening: what happened just before (plays with coordinates)
  const plays = sum.plays ?? []
  const gi = plays.findIndex((p) => p.id && p.id === g.playId) >= 0 ? plays.findIndex((p) => p.id === g.playId) : plays.findIndex((p) => p.text.slice(0, 60) === text.slice(0, 60))
  let opening = template === 'setpiece' ? 'corner' : 'recovery', prev: Play | null = null
  for (let i = gi - 1; i >= 0 && i >= gi - 3 && gi > 0; i--) {
    const p = plays[i]; if (!/shot|corner/i.test(p.type)) continue
    const same = norm(p.team) === tg || norm(p.team).includes(tg.split(' ')[0])
    if (/shot/i.test(p.type) && same && template !== 'setpiece') { opening = 'rebound'; prev = p } else if (/shot/i.test(p.type) && !same && template === 'fastbreak') { opening = 'counter'; prev = p } else if (/corner/i.test(p.type) && same) { opening = 'corner' }
    break
  }
  // cast
  const S = findPlayer(attList, g.scorer), A = assistName ? findPlayer(attList, assistName) : undefined
  const others = attList.filter((p) => p !== S && p !== A && kindOf(p.pos) !== 'gk')
  const T1 = others.find((p) => kindOf(p.pos) === 'fwd' && sideOf(p.pos) === 'C') || others.find((p) => kindOf(p.pos) === 'fwd')
  const aSide: 'L' | 'C' | 'R' = A ? sideOf(A.pos) : ou < 0.5 ? 'R' : 'L'
  const farSide: 'L' | 'R' = aSide === 'L' ? 'R' : aSide === 'R' ? 'L' : ou < 0.5 ? 'R' : 'L'
  const T2 = others.find((p) => p !== T1 && kindOf(p.pos) === 'fwd' && sideOf(p.pos) === farSide) || others.find((p) => p !== T1 && kindOf(p.pos) !== 'def' && sideOf(p.pos) === farSide) || others.find((p) => p !== T1 && kindOf(p.pos) === 'mid')
  const T3 = others.find((p) => p !== T1 && p !== T2 && kindOf(p.pos) === 'mid') || others.find((p) => p !== T1 && p !== T2)
  const GK = defList.find((p) => kindOf(p.pos) === 'gk')
  const CBs = defList.filter((p) => kindOf(p.pos) === 'def' && sideOf(p.pos) !== 'L' && sideOf(p.pos) !== 'R' || /^CD|CB/i.test(p.pos))
  const CBL = CBs.find((p) => /-L|^L/i.test(p.pos)) || CBs[0], CBR = CBs.find((p) => p !== CBL && (/-R|^R/i.test(p.pos))) || CBs.find((p) => p !== CBL)
  const FB = defList.find((p) => kindOf(p.pos) === 'def' && (aSide === 'R' ? /^LB|^L/i.test(p.pos) : /^RB|^R/i.test(p.pos)))   // the full-back facing the assister's side
  const CM1 = defList.find((p) => kindOf(p.pos) === 'mid' && sideOf(p.pos) === 'C') || defList.find((p) => kindOf(p.pos) === 'mid')
  const CM2 = defList.find((p) => p !== CM1 && kindOf(p.pos) === 'mid')
  const uOf = (sd: 'L' | 'C' | 'R', wide = 0.18) => (sd === 'L' ? wide : sd === 'R' ? 1 - wide : 0.5)
  const sgn = ou < 0.5 ? 1 : -1                                  // side with more room, from the origin
  const aEnd: [number, number] = aSide === 'C' ? [r3(clamp(ou + 0.17 * sgn, 0.1, 0.9)), r3(ov + 0.04)] : [r3(clamp(ou + (aSide === 'L' ? -0.2 : 0.2), 0.08, 0.92)), r3(clamp(ov + 0.02, 0.05, 0.6))]
  const aStart: [number, number] = template === 'cross' ? [uOf(aSide, 0.16), 0.42] : template === 'setpiece' ? [ou < 0.5 ? 0.02 : 0.98, 0.01] : template === 'through' ? [0.5, 0.42] : [aSide === 'C' ? 0.55 : uOf(aSide, 0.3), 0.56]
  const crossEnd: [number, number] = [aSide === 'L' ? 0.14 : 0.86, 0.07]
  const sStart: [number, number] = template === 'through' ? [r3(clamp(ou - 0.1 * sgn, 0.1, 0.9)), 0.34] : template === 'setpiece' ? [0.5, 0.24] : template === 'solo' ? [r3(clamp(ou + 0.15 * sgn, 0.1, 0.9)), r3(ov + 0.28)] : [r3(clamp(ou - 0.08 * sgn, 0.08, 0.92)), r3(clamp(ov + 0.32, 0.3, 0.7))]
  const recPt: [number, number] = opening === 'rebound' && prev && prev.x2 != null && prev.y2 != null ? [r3(clamp(1 - Number(prev.y2) / 100, 0.1, 0.9)), r3(clamp(1 - Number(prev.x2) / 100, 0.02, 0.5))] : opening === 'counter' ? [0.5, 0.62] : aStart
  const prevPt: [number, number] | null = opening === 'rebound' && prev && prev.x != null && prev.y != null ? [r3(clamp(1 - Number(prev.y) / 100, 0.1, 0.9)), r3(clamp(1 - Number(prev.x) / 100, 0.02, 0.6))] : null
  const K = (...k: Array<[string, number, number]>) => k
  const A_id = 'A', S_id = 'S'
  const actors: Record<string, Actor> = {}
  const pushActor = (id: string, p: P | undefined, fallback: string, kind: 'home' | 'away' | 'gk', kit: Record<string, string> | undefined, keys: Array<[string, number, number]>) => { actors[id] = { kind, number: p?.jersey || '', name: label(p, fallback), ...(kit ? { kit } : {}), keys } }
  const attKind: 'home' | 'away' = kitAtt ? 'home' : 'home'   // Barça = editorial home kit; other clubs draw their own colours
  const defKind: 'home' | 'away' = 'away'
  // ── defenders ──
  pushActor('GK', GK, 'GK', 'gk', gkKit, K(['0', 0.5, 0.025], ['shot', 0.5, 0.025], ['shot+0.7', r3(clamp(tu + (tu < 0.5 ? 0.03 : -0.03), 0.44, 0.56)), 0.03], ['end', r3(clamp(tu + (tu < 0.5 ? 0.03 : -0.03), 0.44, 0.56)), 0.03]))
  pushActor('CB1', CBR, 'CB', defKind, kitDef, K(['0', 0.42, 0.34], ['runs', 0.43, 0.28], ['runsEnd', 0.46, 0.13], ['end', 0.46, 0.13]))
  pushActor('CB2', CBL, 'CB', defKind, kitDef, K(['0', 0.58, 0.34], ['runs', 0.57, 0.28], ['runsEnd', 0.55, 0.12], ['end', 0.55, 0.12]))
  const fbU = aSide === 'L' ? 0.22 : aSide === 'R' ? 0.78 : ou < 0.5 ? 0.78 : 0.22
  pushActor('FB', FB, 'FB', defKind, kitDef, K(['0', fbU, 0.42], ['runs', fbU, 0.36], ['runsEnd', r3(fbU + (fbU < 0.5 ? 0.03 : -0.03)), 0.19], ['end', r3(fbU + (fbU < 0.5 ? 0.03 : -0.03)), 0.19]))
  if (opening === 'recovery' || opening === 'counter') pushActor('CM1', CM1, 'CM', defKind, kitDef, K(['0', r3(clamp(recPt[0] + 0.1, 0.1, 0.9)), r3(recPt[1] + 0.02)], ['rec', r3(clamp(recPt[0] + 0.09, 0.1, 0.9)), r3(recPt[1] + 0.03)], ['carryEnd', r3(clamp(aEnd[0] - 0.02, 0.1, 0.9)), r3(aEnd[1] + 0.1)], ['shot', r3(clamp(aEnd[0] - 0.04, 0.1, 0.9)), r3(aEnd[1] + 0.05)], ['end', r3(clamp(aEnd[0] - 0.04, 0.1, 0.9)), r3(aEnd[1] + 0.05)]))
  else pushActor('CM1', CM1, 'CM', defKind, kitDef, K(['0', 0.56, 0.40], ['runsEnd', 0.58, 0.30], ['end', 0.58, 0.30]))
  pushActor('CM2', CM2, 'CM', defKind, kitDef, K(['0', r3(clamp(recPt[0] - 0.14, 0.1, 0.9)), r3(clamp(recPt[1] + 0.08, 0.1, 0.9))], ['carryEnd', 0.50, 0.42], ['shot', 0.53, 0.33], ['end', 0.53, 0.33]))
  // ── attackers ──
  if (T3) pushActor('T3', T3, 'MF', attKind, kitAtt, K(['0', r3(clamp(sStart[0] - 0.16 * sgn, 0.08, 0.92)), r3(clamp(sStart[1] + 0.16, 0.2, 0.9))], ['carryEnd', r3(clamp(sStart[0] - 0.14 * sgn, 0.08, 0.92)), r3(clamp(sStart[1] + 0.04, 0.2, 0.9))], ['end', r3(clamp(sStart[0] - 0.12 * sgn, 0.08, 0.92)), r3(clamp(sStart[1] - 0.02, 0.15, 0.9))]))
  if (T2) pushActor('T2', T2, 'W', attKind, kitAtt, K(['0', uOf(farSide, 0.2), 0.44], ['runs', uOf(farSide, 0.2), 0.40], ['runsEnd', uOf(farSide, 0.16), 0.16], ['end', uOf(farSide, 0.16), 0.15]))
  if (T1) pushActor('T1', T1, 'ST', attKind, kitAtt, K(['0', 0.5, 0.36], ['runs', 0.5, 0.30], ['runsEnd', 0.5, 0.09], ['end', 0.5, 0.08]))
  if (A) {
    if (template === 'cross') pushActor(A_id, A, assistName, attKind, kitAtt, K(['0', aStart[0], aStart[1]], ['rec', aStart[0], aStart[1]], ['carryEnd', crossEnd[0], crossEnd[1]], ['pass', crossEnd[0], crossEnd[1]], ['end', r3(crossEnd[0] + (crossEnd[0] < 0.5 ? 0.04 : -0.04)), 0.12]))
    else if (template === 'setpiece') pushActor(A_id, A, assistName, attKind, kitAtt, K(['0', aStart[0], aStart[1]], ['pass', aStart[0], aStart[1]], ['end', r3(aStart[0] < 0.5 ? aStart[0] + 0.06 : aStart[0] - 0.06), 0.08]))
    else pushActor(A_id, A, assistName, attKind, kitAtt, K(['0', r3(aStart[0] - 0.02), r3(aStart[1] + 0.02)], ['rec', aStart[0], aStart[1]], ['B2', r3(aStart[0] + 0.01), r3(aStart[1] - 0.02)], ['carryEnd', aEnd[0], aEnd[1]], ['pass', aEnd[0], r3(aEnd[1] - 0.01)], ['end', r3(aEnd[0] - 0.02 * sgn), r3(aEnd[1] - 0.03)]))
  }
  const sKeys: Array<[string, number, number]> = template === 'solo'
    ? K(['0', sStart[0], r3(sStart[1] + 0.04)], ['rec', sStart[0], sStart[1]], ['carryEnd', r3(ou + 0.05 * sgn), r3(ov + 0.1)], ['sRun', r3(ou + 0.05 * sgn), r3(ov + 0.1)], ['sArrive', ou, ov], ['shot', ou, ov], ['goal', r3(ou - 0.01), r3(ov - 0.02)], ['end', r3(ou - 0.04), r3(ov - 0.06)])
    : K(['0', sStart[0], r3(sStart[1] + 0.04)], ['sRun', sStart[0], sStart[1]], ['sArrive', ou, ov], ['shot', ou, ov], ['goal', r3(ou - 0.01), r3(ov - 0.02)], ['end', r3(ou - 0.04), r3(ov - 0.06)])
  pushActor(S_id, S, g.scorer, attKind, kitAtt, sKeys)
  const order = ['GK', 'CB1', 'CB2', 'FB', 'CM1', 'CM2', 'T3', 'T2', 'T1', ...(A ? [A_id] : []), S_id].filter((id) => actors[id])
  // ── anchors ──
  const anchors: Record<string, string> = {
    rec: 'B1+0.9', recEnd: 'rec+0.35', carryEnd: 'B2e+0.1', runs: 'B3', runsEnd: 'B3e', zoneStart: 'B3+1.0', zoneEnd: 'B4e',
    sRun: 'B4', sArrive: template === 'through' ? 'recv' : 'B4+2.0', pass: 'B5e-1.1', recv: 'B5e-0.4', shot: 'B6+0.35', goal: 'shot+0.9', end: 'B8e+0.4',
  }
  if (opening === 'rebound' && prevPt) { anchors.prevShot = 'B1+0.6'; anchors.save = 'B1+1.0'; anchors.rec = 'save+0.5'; anchors.recEnd = 'rec+0.4' }
  // ── ball ──
  const ball: Array<Record<string, unknown>> = []
  if (opening === 'rebound' && prevPt && T1) {
    actors.T1.keys = K(['0', prevPt[0], prevPt[1]], ['save', r3(prevPt[0] + 0.01), r3(prevPt[1] - 0.01)], ['runs', 0.5, 0.26], ['runsEnd', 0.5, 0.09], ['end', 0.5, 0.08])
    ball.push({ until: 'prevShot', carry: 'T1', du: 0.03, dv: 0.01 }, { until: 'save', pass: true, to: [recPt[0], recPt[1]], arc: 6, ease: 'lin', glow: false }, { until: 'rec', pass: true, to: [A_id, 0.035, -0.012], arc: 30, glow: false })
  } else if (template === 'solo') {
    ball.push({ until: 'rec', at: [r3(sStart[0] + 0.035), r3(sStart[1] - 0.012)] })
  } else if (opening === 'counter') {
    ball.push({ until: 'rec', pass: true, from: [0.5, 0.75], to: [recPt[0], recPt[1]], arc: 20, ease: 'lin', glow: false })
  } else {
    if (actors.CM1 && template !== 'cross' && template !== 'setpiece') ball.push({ until: 'rec', carry: 'CM1', du: 0.03, dv: 0.01 }, { until: 'recEnd', pass: true, to: [A_id, 0.035, -0.012], arc: 8, glow: false, ease: 'lin' })
    else ball.push({ until: 'rec', at: [r3(aStart[0] + 0.035), r3(aStart[1] - 0.012)] })
  }
  if (template === 'solo') ball.push({ until: 'shot', carry: S_id, du: 0.03, dv: 0.0, bob: [['B2', 'carryEnd'], ['sRun', 'sArrive']] })
  else {
    ball.push({ until: 'pass', carry: A_id, du: template === 'cross' ? (crossEnd[0] < 0.5 ? 0.035 : -0.035) : 0.035, dv: -0.012, bob: [['B2', 'carryEnd']] })
    ball.push({ until: 'recv', pass: true, to: [S_id, 0.03, 0.0], arc: template === 'cross' || template === 'setpiece' ? 62 : template === 'through' ? 12 : 22, k: -0.1 * sgn })
    ball.push({ until: 'shot', carry: S_id, du: 0.03, dv: 0.0 })
  }
  ball.push({ until: 'goal', shot: [tu, -0.012], arc: top ? 60 : 6, k: 0.03 * sgn }, { rest: [tu, -0.025] })
  // ── camera ──
  const mid: [number, number] = [r3((aEnd[0] + ou) / 2), r3(ov + 0.02)]
  const camera: Array<[string, number, number, number]> = [
    ['0', 0.5, 0.5, 1.0], ['B1-0.3', 0.5, 0.5, 1.06], ['rec', recPt[0], recPt[1], 1.5], ['rec+0.8', recPt[0], r3(recPt[1] - 0.02), 1.5],
    ['B2+0.4', r3((recPt[0] + aEnd[0]) / 2), r3((recPt[1] + aEnd[1]) / 2), 1.35], ['carryEnd', aEnd[0], aEnd[1], 1.4],
    ['runs+0.3', 0.5, r3(clamp(ov, 0.1, 0.5)), 1.35], ['runsEnd', 0.48, r3(clamp(ov - 0.02, 0.1, 0.5)), 1.4],
    ['sRun', sStart[0], r3(sStart[1] - 0.1), 1.45], ['sArrive', ou, r3(ov + 0.05), 1.55],
    ['B5', mid[0], mid[1], 1.45], ['recv', ou, ov, 1.55],
    ['shot', ou, r3(clamp(ov - 0.08, 0.05, 0.5)), 1.6], ['goal', tu, 0.04, 1.85], ['goal+0.18', tu, 0.05, 2.0], ['goal+0.7', tu, 0.09, 1.7], ['end', tu, 0.12, 1.6],
  ]
  // ── tags (labels filled by the texts), overlays, highlights ──
  const tags: Array<[string, number, number, string, string]> = [
    ['rec+0.1', r3(clamp(recPt[0] + 0.12, 0.05, 0.95)), r3(clamp(recPt[1] + 0.03, 0.02, 0.95)), '1', ''],
    ['B2+0.6', r3(clamp(recPt[0] + 0.16, 0.05, 0.95)), r3(clamp(recPt[1] - 0.14, 0.02, 0.95)), '2', ''],
    ['runs+0.5', r3(clamp(uOf(farSide, 0.2) + (farSide === 'L' ? 0.12 : -0.12), 0.05, 0.95)), 0.08, '3', ''],
    ['sRun+0.6', r3(clamp(sStart[0] - 0.14, 0.05, 0.95)), r3(clamp(sStart[1] - 0.18, 0.02, 0.95)), '4', ''],
    ['pass', r3(clamp(mid[0] + 0.1, 0.05, 0.95)), r3(clamp(mid[1] + 0.08, 0.02, 0.95)), '5', ''],
    ['goal', r3(clamp(tu + 0.22, 0.05, 0.95)), 0.03, '6', ''],
  ]
  const overlays: Array<Record<string, unknown>> = [
    { type: 'ripple', at: recPt, from: opening === 'rebound' ? 'save' : 'rec', color: 'GOLD', n: 3, period: 0.6, rmax: 110, flash: true },
    ...(T1 ? [{ type: 'arrow', from: 'runs', to: 'runsEnd+0.3', a: [0.5, 0.30], b: ['T1', 0, 34], k: 0.05, c0: kitAtt?.body ?? '#A50044', c1: '#FFFFFF', width: 4, arrow: false }] : []),
    ...(T2 ? [{ type: 'arrow', from: 'runs', to: 'runsEnd+0.3', a: [uOf(farSide, 0.2), 0.40], b: ['T2', 0, 34], k: 0.12, c0: kitAtt?.body ?? '#A50044', c1: '#FFFFFF', width: 4, arrow: false }] : []),
    { type: 'zone', at: [ou, ov], from: 'zoneStart', to: 'zoneEnd', label: 'المساحة', r: 160, labelDx: -200 * sgn, labelDy: -40 },
    { type: 'arrow', from: 'sRun', to: 'sArrive+0.4', a: sStart, b: [S_id, 0, 34], k: -0.1 * sgn, c0: 'GRANA', c1: 'GOLD', width: 4, arrow: false },
    { type: 'label', text: 'بلا رقابة', at: [S_id, 0, -74], from: 'sRun+0.9', to: 'B4e', bg: 'GRANA', fg: 'CREAM' },
    { type: 'label', text: 'متأخر', at: ['GK', tu < 0.5 ? 130 : -130, 40], from: 'shot+0.4', to: 'goal+0.6' },
  ]
  const highlights: Array<[string, string, string]> = [...(A ? [[A_id, 'rec', 'pass'] as [string, string, string]] : []), ...(T1 ? [['T1', 'runs', 'runsEnd'] as [string, string, string]] : []), ...(T2 ? [['T2', 'runs', 'runsEnd'] as [string, string, string]] : []), [S_id, template === 'solo' ? 'rec' : 'sRun', 'goal+0.8']]
  // ── card ──
  const sc = text.match(/Goal!\s*(.+?)\s(\d+),\s*(.+?)\s(\d+)\./)
  let homeScore = Number(m.homeScore), awayScore = Number(m.awayScore)
  if (sc) { const n1 = norm(sc[1]), s1 = Number(sc[2]), s2 = Number(sc[4]); if (n1 === h || n1.includes(h.split(' ')[0]) || h.includes(n1.split(' ')[0])) { homeScore = s1; awayScore = s2 } else { homeScore = s2; awayScore = s1 } }
  const logo = (id?: string, fallback?: string | null) => (fallback ? fallback : id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png` : undefined)
  const card = { home: m.home, away: m.away, homeLogo: logo(sum.teams.find((t) => t.side === 'home')?.id, m.homeLogo), awayLogo: logo(sum.teams.find((t) => t.side === 'away')?.id, m.awayLogo), homeScore, awayScore, scoringSide: side, scorer: g.scorer, assist: assistName || undefined, minute: `${g.minute}`.replace(/'$/, '') + '’', league: `${m.league}${sum.venue ? ' · ' + sum.venue : ''}`.toUpperCase().slice(0, 44), cover: { text: '', tone: 'goal' }, ...(isBarcaName(teamName) ? { special: 'barca' } : {}) }
  const meta: Meta = { scorer: g.scorer, assist: assistName, minute: `${g.minute}`, distance, side, team: teamName, opp: oppName, template, opening, corner, foot, scoreLine: `${m.home} ${homeScore}-${awayScore} ${m.away}`, league: m.league, venue: sum.venue, barca: isBarcaName(teamName) }
  const storyboard = storyboardOf(meta, { A: A ? A.name || assistName : '', T1: T1?.name ?? '', T2: T2?.name ?? '', CB: CBR?.name ?? '', FB: FB?.name ?? '', CM: CM1?.name ?? '', GK: GK?.name ?? '' })
  const spec: Record<string, unknown> = {
    id: `${m.id}-${(g.playId || g.minute).replace(/[^0-9a-z]/gi, '')}`,
    title: { l1: '', l2: 'كيف جاء؟', lat: `HOW THE GOAL CAME · ${(sum.venue || m.league).toUpperCase().slice(0, 22)} · ${g.minute}` },
    stack: isBarcaName(teamName) ? ['BARÇA', 'FIRST'] : ['GOAL', 'ANALYSIS'],
    espn: { X: Number(g.x), Y: Number(g.y), X2: g.x2 ?? 100, Y2: g.y2 ?? 50 },
    scorer: S_id, scorerArrive: 'sArrive',
    gap: 0.3, roar: 0.3, musicGain: 0.16,
    voices: [], voiceTexts: [],
    beatStarts: { 7: 'max(B6e+0.2, goal+0.5)' },
    anchors, shot: 'shot', goal: 'goal', end: 'end', trailFrom: opening === 'rebound' ? 'prevShot' : 'rec',
    cta: { from: 'B8', text: 'تابع الصفحة' },
    actors, order, ball, camera, tags, captions: [], overlays, highlights, card,
  }
  return { spec, storyboard, meta }
}

function storyboardOf(mt: Meta, c: { A: string; T1: string; T2: string; CB: string; FB: string; CM: string; GK: string }): string[] {
  const S = mt.scorer, A = mt.assist || c.A
  const open = mt.opening === 'rebound' ? `${c.T1 || 'a teammate'} shoots, the keeper ${c.GK} saves and the rebound comes out to ${A}` : mt.opening === 'counter' ? `the opponents shoot, the ball is cleared and ${A} picks it up in his own half` : mt.opening === 'corner' ? `a corner for ${mt.team}, ${A} at the flag` : `${c.CM || 'a midfielder'} of ${mt.opp} loses the ball in midfield and ${A} wins it`
  const carry = mt.template === 'cross' ? `${A} races down the wing to the byline while ${c.FB} chases` : mt.template === 'through' ? `${A} carries the ball through the middle, head up` : mt.template === 'setpiece' ? `${mt.team} load the box, ${c.CB} marks zonally` : mt.template === 'solo' ? `${S} drives forward from deep, two defenders back-pedal` : `${A} sprints through the middle at full speed, ${mt.opp} players retreat`
  const runs = `off the ball: ${c.T1 || 'the striker'} drags the centre-backs ${c.CB} deep, ${c.T2 || 'the winger'} opens the far side`
  const arrive = mt.template === 'through' ? `${S} times his run behind the defensive line` : mt.template === 'solo' ? `${S} feints and beats ${c.FB || 'the defender'} on the edge of the box` : `${S} arrives late and unmarked at the shooting spot (${mt.distance} m from goal)`
  const assist = mt.template === 'cross' ? `${A} crosses` : mt.template === 'through' ? `${A} slides the through ball` : mt.template === 'setpiece' ? `${A} delivers the corner` : mt.template === 'solo' ? `${S} takes one last touch to set himself` : `${A} lays it back to ${S}, perfect timing`
  const finish = `${S} ${mt.foot === 'header' ? 'heads it' : `hits it first time with his ${mt.foot} foot`} from ${mt.distance} m into the ${mt.corner.replace('-', ' ')} — ${c.GK} is beaten`
  return [
    `Hook: goal by ${S} for ${mt.team} vs ${mt.opp} (${mt.scoreLine}, minute ${mt.minute}). Promise to reveal the detail nobody saw.`,
    `Beat 1 (minute ${mt.minute}): ${open}.`,
    `Beat 2: ${carry}.`,
    `Beat 3: ${runs}.`,
    `Beat 4: ${arrive}.`,
    `Beat 5: ${assist}.`,
    `Beat 6 (slow motion): ${finish}.`,
    `Beat 7: GOAL — ${mt.scoreLine} — one sentence summing up the move (recovery / run / decoys / finish).`,
    `Beat 8: call to action — follow the Pressing 90' page for a goal analysis like this every day.`,
  ]
}

/** The words: 9 narration lines, 9 captions (small + big), 6 tag labels, cover, post — Arabic, via gpt-oss-120b. */
async function goalTexts(env: Env, scene: Scene): Promise<Texts> {
  const mt = scene.meta
  const sys = `You write the Arabic narration of a 60-second animated tactical analysis of one goal ("كيف جاء الهدف") for a football page. Answer with ONE JSON object:
{"scorerAr":"...","assistAr":"...","voices":[9 strings],"captions":[[small,big] ×9],"tags":[6 strings],"cover":"...","title":"...","post":"..."}
Rules: Modern Standard Arabic as Arabic sports TV commentators speak, energetic but factual, natural for text-to-speech (no abbreviations, no Latin letters — transliterate every name into Arabic, e.g. Cherki → شيركي, Bouaddi → بوعدي). voices[i] narrates storyboard beat i (9 beats: hook, 1-7, CTA), 12-25 words each, sentences separated by periods; voices[0] must end with "شاهد كيف جاء" and voices[8] must say "تابع صفحة بريسينغ تسعين". captions[i] = [small, big]: small = context, max 6 words; big = the punch, max 4 words (it is displayed in a large calligraphic font). tags = 6 labels of 1-2 words for the numbered steps: opening, run, decoys, arrival, assist, finish. cover = max 5 words for the closing card. title = max 60 characters for the video title. post = 3 lines for the Facebook caption (first line a question, then what happened, then "تحليل هدف كل يوم على Pressing 90'") plus one line of 5 hashtags (mix Arabic and English, include #Pressing90). No emoji anywhere except the post. Never invent statistics beyond the storyboard; the distance in metres and the score are facts you may use. Digits are fine (e.g. "الدقيقة 32").`
  const prompt = `Match: ${mt.scoreLine} (${mt.league}${mt.venue ? ', ' + mt.venue : ''}). Scorer: ${mt.scorer}. Assist: ${mt.assist || 'none (solo goal)'}. Minute ${mt.minute}. Shot: ${mt.foot}, ${mt.distance} m, ${mt.corner}. Template: ${mt.template}${mt.opening ? ' / opening: ' + mt.opening : ''}.\nStoryboard:\n${scene.storyboard.map((l, i) => `${i}. ${l}`).join('\n')}`
  const j = (await gptJson(env, withPlaybook(sys, 'reel', 'hook', 'caption', 'cover'), prompt, 6000)) as Partial<Texts> & { captions?: unknown; voices?: unknown; tags?: unknown }
  const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\p{Extended_Pictographic}️‍#*"]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max)
  const voices = (Array.isArray(j.voices) ? j.voices : []).map((v) => clean(v, 260)).filter(Boolean)
  const captions = (Array.isArray(j.captions) ? j.captions : []).map((c) => (Array.isArray(c) ? [clean(c[0], 60), clean(c[1], 32)] : [clean((c as { small?: string })?.small, 60), clean((c as { big?: string })?.big, 32)]) as [string, string])
  const tags = (Array.isArray(j.tags) ? j.tags : []).map((t) => clean(t, 18)).filter(Boolean)
  if (voices.length !== 9 || captions.length !== 9 || tags.length < 6) throw new Error(`incomplete texts (${voices.length} voices, ${captions.length} captions, ${tags.length} tags)`)
  const t = templateTexts(mt)
  return { scorerAr: clean(j.scorerAr, 30) || t.scorerAr, assistAr: clean(j.assistAr, 30) || t.assistAr, voices, captions, tags: tags.slice(0, 6), cover: clean(j.cover, 40) || t.cover, title: clean(j.title, 90) || t.title, post: String(j.post ?? '').replace(/\*/g, '').trim().slice(0, 900) || t.post }
}
/** Fixed Arabic texts when the model is unavailable — the reel still goes out. */
function templateTexts(mt: Meta): Texts {
  const S = surname(mt.scorer), A = surname(mt.assist) || ''
  const scorerAr = S, assistAr = A
  const voices = [
    `هدف ${S} في مباراة ${mt.team} ضد ${mt.opp}. الكرة قطعت ${mt.distance} متراً، لكن التفصيل الذي صنع الهدف لا يُرى في الإعادة. شاهد كيف جاء.`,
    `الدقيقة ${mt.minute}. ${mt.opening === 'rebound' ? 'الكرة ترتد من الحارس' : mt.opening === 'corner' ? 'ركنية' : 'استخلاص في وسط الملعب'}، ${A ? `و${A} يستلمها ويرفع رأسه.` : `و${S} يستلمها.`}`,
    A ? `${A} يتقدم بالكرة بسرعة، ولاعبو ${mt.opp} يتراجعون في الوقت نفسه.` : `${S} يتقدم بالكرة بسرعة، ولاعبو ${mt.opp} يتراجعون.`,
    `انظر إلى الحركة بلا كرة: المهاجم يسحب قلبي الدفاع إلى العمق، والجناح يفتح الجهة الأخرى.`,
    `و${S}؟ يصل متأخراً بلا رقابة إلى نقطة التسديد، على بعد ${mt.distance} متراً من المرمى.`,
    A ? `${A} يرى كل شيء. تمريرة بسيطة في التوقيت المثالي.` : `لمسة أخيرة لتجهيز الكرة.`,
    `${S} ${mt.foot === 'header' ? 'برأسية' : 'من اللمسة الأولى'}، من ${mt.distance} متراً... في ${mt.corner.includes('top') ? 'الزاوية العليا' : 'الزاوية'}!`,
    `هدف! ${mt.scoreLine}. هجمة كاملة: استخلاص، انطلاقة، تمويه، وتسديدة قاتلة.`,
    `أعجبك التحليل؟ تابع صفحة بريسينغ تسعين، تحليل هدف كل يوم بهذه الطريقة.`,
  ]
  const captions: Array<[string, string]> = [
    [`الدقيقة ${mt.minute} · ${mt.scoreLine}`, `كيف جاء هدف ${S}؟`], [mt.opening === 'rebound' ? 'ارتداد من الحارس' : 'استخلاص الكرة', A ? `${A} يبدأ الهجمة` : `${S} يبدأ الهجمة`], ['المدافعون يتراجعون', 'انطلاقة سريعة'],
    ['حركة بلا كرة', 'فتح المساحة'], ['وصول متأخر', `${S} بلا رقابة`], ['في التوقيت المثالي', A ? 'تمريرة حاسمة' : 'اللمسة الأخيرة'], [`من ${mt.distance} متراً`, 'اللمسة الأولى'], [mt.scoreLine, 'هدف!'], ['Pressing 90’ · pressing90.live', 'تابع الصفحة لتحليل الأهداف'],
  ]
  return { scorerAr, assistAr, voices, captions, tags: ['الاستخلاص', 'الانطلاقة', 'التمويه', 'الوصول', 'التمريرة', 'الإنهاء'], cover: `هدف ${S} · ${mt.distance} متراً`, title: `كيف جاء هدف ${S}؟ | ${mt.scoreLine}`, post: `⚽ كيف جاء هدف ${S}؟ 🔍\n${A ? `${A} يصنع، ` : ''}${S} يُنهي من ${mt.distance} متراً. ${mt.scoreLine}.\nتحليل هدف كل يوم على Pressing 90'\n#تحليل_الأهداف #Pressing90 #${mt.team.replace(/\s+/g, '')} #${S}` }
}
function applyTexts(spec: Record<string, unknown>, t: Texts, mt: Meta): void {
  spec.voiceTexts = t.voices
  spec.captions = t.captions.map((c, i) => [i === 0 ? 'B0' : i === 7 ? 'goal' : `B${i}`, c[0], c[1]])
  const tags = spec.tags as Array<[string, number, number, string, string]>; tags.forEach((tg, i) => { tg[4] = t.tags[i] ?? tg[4] })
  const title = spec.title as { l1: string; l2: string; lat: string }; title.l1 = `هدف ${t.scorerAr || surname(mt.scorer)}`
  const card = spec.card as { cover: { text: string } }; card.cover.text = t.cover
}
