// Weekly playbook review (KPI guide, docs/playbook/3-analyse-kpis-…): reads the page's recent reels and their
// insights through the Graph API and applies the diagnostics of playbook.ts. Ops job 'playbook-review'; the tick
// runs it every Monday 09:05 (local) and writes the summary in the daily log (→ the ops e-mail / admin panel).
// Insights need the `read_insights` permission on the Page token (2026-09-18: the current token lacks it — the review
// then works on views only and says so).
import type { Env } from './index'
import { graph, pageAuth } from './automation'
import { reelDiagnostics, type ReelRow } from './playbook'

// Classic video metrics (valid on every Page video, reels included); the "fb_reels_*" names were refused with (#100) on this page.
const METRICS = 'total_video_views,total_video_avg_time_watched,total_video_complete_views,total_video_impressions_unique,total_video_stories_by_action_type'

export async function playbookReview(env: Env, limit = 20, days = 7): Promise<string> {
  const { id: pid, token } = await pageAuth(env)
  const list = await graph(env, token, 'GET', `/${pid}/video_reels`, { fields: 'id,updated_time,description,views,length,permalink_url', limit: String(Math.max(3, Math.min(50, limit))) })
  const since = Date.now() - days * 86400_000
  const rows = ((list.data as Array<{ id: string; updated_time?: string; description?: string; views?: number; length?: number; permalink_url?: string }> | undefined) ?? [])
    .filter((r) => !r.updated_time || Date.parse(r.updated_time) >= since)
  const out: ReelRow[] = []
  let lastErr = ''
  for (const r of rows) {
    const ins: Record<string, number> = {}
    try {
      const j = await graph(env, token, 'GET', `/${r.id}/video_insights`, { metric: METRICS })
      for (const d of (j.data as Array<{ name: string; values?: Array<{ value: unknown }> }> | undefined) ?? []) {
        const v = d.values?.[0]?.value
        if (typeof v === 'number') ins[d.name] = v
        else if (v && typeof v === 'object') for (const [k, n] of Object.entries(v as Record<string, unknown>)) ins[`${d.name}.${k.toLowerCase()}`] = Number(n) || 0
      }
    } catch (e) { lastErr = String(e) }
    const act = (k: string) => ins[`total_video_stories_by_action_type.${k}`]
    const views = Number(r.views ?? ins.total_video_views ?? 0), length = Number(r.length ?? 0)
    // completion: complete views / views when Facebook gives both, else average watch time / length
    const complete = ins.total_video_complete_views
    const avgMs = complete != null && views > 0 && length > 0 ? Math.min(1, complete / views) * length * 1000 : ins.total_video_avg_time_watched
    out.push({
      id: r.id, when: r.updated_time ?? '', title: (r.description ?? '').split('\n')[0].replace(/\s+/g, ' ').slice(0, 48),
      views, length, avgMs, reach: ins.total_video_impressions_unique,
      shares: act('share'), comments: act('comment'), likes: act('like'),
      link: r.permalink_url,
    })
  }
  const text = reelDiagnostics(out, days)
  const noInsights = out.length > 0 && out.every((x) => x.avgMs == null)
  return noInsights && lastErr ? `${text}\nNOTE : insights indisponibles — ${/read_insights/.test(lastErr) ? 'le jeton de page n\'a pas la permission read_insights (à ajouter au FB_PAGE_TOKEN pour obtenir la complétion, les partages et les commentaires)' : lastErr.slice(0, 160)}` : text
}
