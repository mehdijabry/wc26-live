// Weekly playbook review (KPI guide, docs/playbook/3-analyse-kpis-…): reads the page's recent reels and their
// insights through the Graph API and applies the diagnostics of playbook.ts. Ops job 'playbook-review'; the tick
// runs it every Monday 09:05 (local) and writes the summary in the daily log (→ the ops e-mail / admin panel).
import type { Env } from './index'
import { graph, pageAuth } from './automation'
import { reelDiagnostics, type ReelRow } from './playbook'

const METRICS = 'post_video_avg_time_watched,fb_reels_total_plays,fb_reels_replay_count,post_impressions_unique,post_video_social_actions,post_video_likes_by_reaction_type'

export async function playbookReview(env: Env, limit = 20, days = 7): Promise<string> {
  const { id: pid, token } = await pageAuth(env)
  const list = await graph(env, token, 'GET', `/${pid}/video_reels`, { fields: 'id,updated_time,description,views,length,permalink_url', limit: String(Math.max(3, Math.min(50, limit))) })
  const since = Date.now() - days * 86400_000
  const rows = ((list.data as Array<{ id: string; updated_time?: string; description?: string; views?: number; length?: number; permalink_url?: string }> | undefined) ?? [])
    .filter((r) => !r.updated_time || Date.parse(r.updated_time) >= since)
  const out: ReelRow[] = []
  for (const r of rows) {
    const ins: Record<string, number> = {}
    try {
      const j = await graph(env, token, 'GET', `/${r.id}/video_insights`, { metric: METRICS })
      for (const d of (j.data as Array<{ name: string; values?: Array<{ value: unknown }> }> | undefined) ?? []) {
        const v = d.values?.[0]?.value
        if (typeof v === 'number') ins[d.name] = v
        else if (v && typeof v === 'object') for (const [k, n] of Object.entries(v as Record<string, unknown>)) ins[`${d.name}.${k.toLowerCase()}`] = Number(n) || 0
      }
    } catch { /* insights unavailable for this video → views only */ }
    const social = (k: string) => ins[`post_video_social_actions.${k}`]
    out.push({
      id: r.id, when: r.updated_time ?? '', title: (r.description ?? '').split('\n')[0].replace(/\s+/g, ' ').slice(0, 48),
      views: Number(r.views ?? ins.fb_reels_total_plays ?? 0), length: Number(r.length ?? 0),
      avgMs: ins.post_video_avg_time_watched, replays: ins.fb_reels_replay_count, reach: ins.post_impressions_unique,
      shares: social('share') ?? social('shares'), comments: social('comment') ?? social('comments'), likes: ins['post_video_likes_by_reaction_type.like'],
      link: r.permalink_url,
    })
  }
  return reelDiagnostics(out, days)
}
