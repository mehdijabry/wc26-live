// Facebook insights review (KPI guide, docs/playbook/3-analyse-kpis-…): reads the page's recent reels and their insights
// through the Graph API, applies the diagnostics of playbook.ts and adds the page-level daily series. Structured data
// for the admin panel (« Insights » tab, cached 6 h in KV), text for the ops log (job 'playbook-review', automatic
// every Monday 09:05). Needs the `read_insights` permission on the Page token (added 2026-09-18).
import type { Env } from './index'
import { graph, pageAuth } from './automation'
import { analyzeReels, reelDiagnostics, type ReelRow, type Review } from './playbook'

// Reel metrics probed one by one on this page (2026-09-18): a combined list fails with (#100) as soon as ONE name is
// invalid for the video, so each metric is fetched on its own and unknown ones are simply skipped.
const REEL_METRICS = ['fb_reels_total_plays', 'blue_reels_play_count', 'post_video_avg_time_watched', 'fb_reels_replay_count', 'post_video_social_actions', 'post_video_likes_by_reaction_type', 'total_video_complete_views', 'total_video_stories_by_action_type']
const PAGE_METRICS = ['page_impressions_unique', 'page_video_views', 'page_post_engagements', 'page_follows', 'page_daily_follows_net']

export type InsightsData = { generatedAt: string; days: number; limit: number; review: Review; page: { series: Record<string, Array<{ date: string; value: number }>>; current: Record<string, number>; previous: Record<string, number> }; note?: string }

async function reelRows(env: Env, pid: string, token: string, limit: number, days: number): Promise<{ rows: ReelRow[]; err: string }> {
  const list = await graph(env, token, 'GET', `/${pid}/video_reels`, { fields: 'id,created_time,updated_time,description,views,length,permalink_url', limit: String(Math.max(3, Math.min(50, limit))) })
  const since = Date.now() - days * 86400_000
  const items = ((list.data as Array<{ id: string; created_time?: string; updated_time?: string; description?: string; views?: number; length?: number; permalink_url?: string }> | undefined) ?? [])
    .filter((r) => { const t = r.created_time ?? r.updated_time; return !t || Date.parse(t) >= since })
  const rows: ReelRow[] = []; let err = ''
  for (const r of items) {
    const ins: Record<string, number> = {}
    for (const metric of REEL_METRICS) {
      try {
        const j = await graph(env, token, 'GET', `/${r.id}/video_insights`, { metric })
        for (const d of (j.data as Array<{ name: string; values?: Array<{ value: unknown }> }> | undefined) ?? []) {
          const v = d.values?.[0]?.value
          if (typeof v === 'number') ins[d.name] = v
          else if (v && typeof v === 'object') for (const [k, n] of Object.entries(v as Record<string, unknown>)) ins[`${d.name}.${k.toLowerCase()}`] = Number(n) || 0
        }
      } catch (e) { const m = String(e); if (/read_insights|\(#200\)/.test(m)) { err = m; break } }
    }
    const act = (k: string) => ins[`post_video_social_actions.${k}`] ?? ins[`total_video_stories_by_action_type.${k}`]
    const plays = ins.blue_reels_play_count ?? ins.fb_reels_total_plays
    const views = Number(r.views ?? plays ?? 0), length = Number(r.length ?? 0)
    const complete = ins.total_video_complete_views
    const avgMs = complete != null && views > 0 && length > 0 ? Math.min(1, complete / views) * length * 1000 : ins.post_video_avg_time_watched
    const replays = ins.fb_reels_replay_count ?? (ins.fb_reels_total_plays != null && ins.blue_reels_play_count != null ? Math.max(0, ins.fb_reels_total_plays - ins.blue_reels_play_count) : undefined)
    rows.push({ id: r.id, when: r.created_time ?? r.updated_time ?? '', title: (r.description ?? '').split('\n')[0].replace(/\s+/g, ' ').slice(0, 60), views, length, avgMs, replays, shares: act('share') ?? act('shares'), comments: act('comment') ?? act('comments'), likes: act('like') ?? ins['post_video_likes_by_reaction_type.like'], link: r.permalink_url })
  }
  return { rows, err }
}

async function pageSeries(env: Env, pid: string, token: string, days: number): Promise<InsightsData['page']> {
  const series: InsightsData['page']['series'] = {}, current: Record<string, number> = {}, previous: Record<string, number> = {}
  const until = Math.floor(Date.now() / 1000), since = until - 2 * days * 86400
  for (const metric of PAGE_METRICS) {
    try {
      const j = await graph(env, token, 'GET', `/${pid}/insights`, { metric, period: 'day', since: String(since), until: String(until) })
      const d = ((j.data as Array<{ name: string; values?: Array<{ end_time: string; value: unknown }> }> | undefined) ?? [])[0]
      if (!d?.values) continue
      const vals = d.values.map((v) => ({ date: String(v.end_time).slice(0, 10), value: typeof v.value === 'number' ? v.value : 0 }))
      series[metric] = vals.slice(-days)
      if (/page_follows$|page_fans/.test(metric)) { current[metric] = vals[vals.length - 1]?.value ?? 0; previous[metric] = vals[Math.max(0, vals.length - 1 - days)]?.value ?? 0 }   // level (total followers), not a daily flow
      else { current[metric] = vals.slice(-days).reduce((a, v) => a + v.value, 0); previous[metric] = vals.slice(0, -days).reduce((a, v) => a + v.value, 0) }
    } catch { /* metric unavailable on this page / token → skipped */ }
  }
  return { series, current, previous }
}

const CACHE_KEY = (days: number, limit: number) => `auto:insights:v1:${days}:${limit}`
/** Structured review for the admin panel; cached 6 h in KV (200+ Graph calls otherwise), `refresh` forces a new read. */
export async function playbookReviewData(env: Env, opts: { limit?: number; days?: number; refresh?: boolean } = {}): Promise<InsightsData> {
  const days = Math.max(1, Math.min(30, Number(opts.days ?? 7))), limit = Math.max(3, Math.min(50, Number(opts.limit ?? 25)))
  if (!opts.refresh) { try { const raw = await env.CACHE.get(CACHE_KEY(days, limit)); if (raw) return JSON.parse(raw) as InsightsData } catch { /* recompute */ } }
  const { id: pid, token } = await pageAuth(env)
  const { rows, err } = await reelRows(env, pid, token, limit, days)
  const review = analyzeReels(rows, days)
  const page = await pageSeries(env, pid, token, days)
  const data: InsightsData = { generatedAt: new Date().toISOString(), days, limit, review, page, note: !review.account.insights && err ? (/read_insights/.test(err) ? 'Le jeton de page n\'a pas la permission read_insights : complétion, partages et commentaires indisponibles.' : err.slice(0, 160)) : undefined }
  try { await env.CACHE.put(CACHE_KEY(days, limit), JSON.stringify(data), { expirationTtl: 6 * 3600 }) } catch { /* cache only */ }
  return data
}
/** Text version for the ops log / weekly e-mail. */
export async function playbookReview(env: Env, limit = 20, days = 7): Promise<string> {
  const { id: pid, token } = await pageAuth(env)
  const { rows, err } = await reelRows(env, pid, token, limit, days)
  const text = reelDiagnostics(rows, days)
  return rows.length && rows.every((x) => x.avgMs == null) && err ? `${text}\nNOTE : insights indisponibles — ${/read_insights/.test(err) ? 'le jeton de page n\'a pas la permission read_insights' : err.slice(0, 160)}` : text
}
