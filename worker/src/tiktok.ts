// TikTok Content Posting API (Mehdi, 2026-09-18): OAuth (Login Kit v2) + direct post / inbox upload of the reels the
// engine already renders. Nothing is posted unless the `tiktok` setting is on; an unaudited TikTok app can only post
// SELF_ONLY (private) videos, the audit lifts that. Tokens live in KV (`tiktok:auth`): access token 24 h, refresh
// token 365 d, refreshed on use. Secrets: TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET (wrangler secret put, Mehdi).
// Videos are uploaded from the worker (FILE_UPLOAD, one chunk ≤ 64 MB) — no domain verification needed for the
// Supabase media URLs. Docs: developers.tiktok.com/docs/content-posting-api-get-started.
import type { Env } from './index'
import { log, localParts } from './automation'
import { checkCaption } from './playbook'

const API = 'https://open.tiktokapis.com/v2'
export const TIKTOK_SCOPES = 'user.info.basic,video.publish,video.upload'
// Literal on purpose: WORKER_PUBLIC is not initialised yet when this module is evaluated (import cycle automation → goalanim → tiktok).
export const TIKTOK_REDIRECT = 'https://wc26-api.nameless-violet-5dc1.workers.dev/tiktok/callback'
const AUTH_KEY = 'tiktok:auth'

type TikTokEnv = Env & { TIKTOK_CLIENT_KEY?: string; TIKTOK_CLIENT_SECRET?: string }
export type TikTokAuth = { access_token: string; refresh_token: string; open_id: string; scope: string; expires_at: number; refresh_expires_at: number; obtained_at: number; username?: string; nickname?: string }
export type TikTokPrivacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'
export type TikTokMode = 'direct' | 'inbox'

export function tiktokConfigured(env: Env): boolean { const e = env as TikTokEnv; return !!(e.TIKTOK_CLIENT_KEY && e.TIKTOK_CLIENT_SECRET) }
const creds = (env: Env) => { const e = env as TikTokEnv; if (!e.TIKTOK_CLIENT_KEY || !e.TIKTOK_CLIENT_SECRET) throw new Error('tiktok_not_configured (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET)'); return { key: e.TIKTOK_CLIENT_KEY, secret: e.TIKTOK_CLIENT_SECRET } }

// ─── OAuth ──────────────────────────────────────────────────────────────────
/** Authorization URL for Mehdi's browser (state kept 10 min in KV). */
export async function tiktokConnectUrl(env: Env): Promise<string> {
  const { key } = creds(env)
  const state = crypto.randomUUID().replace(/-/g, '')
  await env.CACHE.put(`tiktok:state:${state}`, '1', { expirationTtl: 600 })
  const q = new URLSearchParams({ client_key: key, scope: TIKTOK_SCOPES, response_type: 'code', redirect_uri: TIKTOK_REDIRECT, state })
  return `https://www.tiktok.com/v2/auth/authorize/?${q.toString()}`
}
async function tokenRequest(env: Env, params: Record<string, string>): Promise<TikTokAuth> {
  const { key, secret } = creds(env)
  const body = new URLSearchParams({ client_key: key, client_secret: secret, ...params })
  const r = await fetch(`${API}/oauth/token/`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'cache-control': 'no-cache' }, body })
  const j = await r.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; open_id?: string; scope?: string; expires_in?: number; refresh_expires_in?: number; error?: string; error_description?: string }
  if (!r.ok || !j.access_token || !j.refresh_token) throw new Error(`tiktok token ${r.status}: ${j.error ?? ''} ${j.error_description ?? ''}`.trim())
  const now = Date.now()
  const prev = await tiktokAuthRaw(env)
  return { access_token: j.access_token, refresh_token: j.refresh_token, open_id: j.open_id ?? prev?.open_id ?? '', scope: j.scope ?? '', expires_at: now + (j.expires_in ?? 86400) * 1000, refresh_expires_at: now + (j.refresh_expires_in ?? 31536000) * 1000, obtained_at: now, username: prev?.username, nickname: prev?.nickname }
}
/** GET /tiktok/callback?code&state → exchanges the code, stores the tokens, shows a tiny confirmation page. */
export async function handleTikTokCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const html = (title: string, body: string, status = 200) => new Response(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;max-width:520px;margin:60px auto;padding:0 20px"><h1 style="font-size:22px">${title}</h1><p>${body}</p><p><a href="https://pressing90.live/admin">← Retour au panneau admin</a></p></body>`, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
  const err = url.searchParams.get('error'); if (err) return html('TikTok : connexion refusée', `${err} — ${url.searchParams.get('error_description') ?? ''}`, 400)
  const code = url.searchParams.get('code') ?? '', state = url.searchParams.get('state') ?? ''
  if (!code || !state || !(await env.CACHE.get(`tiktok:state:${state}`))) return html('TikTok : requête invalide', 'state inconnu ou expiré — relance la connexion depuis le panneau admin.', 400)
  await env.CACHE.delete(`tiktok:state:${state}`)
  try {
    const auth = await tokenRequest(env, { code, grant_type: 'authorization_code', redirect_uri: TIKTOK_REDIRECT })
    await env.CACHE.put(AUTH_KEY, JSON.stringify(auth))
    try { const info = await tiktokUserInfo(env); auth.username = info.username; auth.nickname = info.nickname; await env.CACHE.put(AUTH_KEY, JSON.stringify(auth)) } catch { /* optional */ }
    await log(env, localParts().date, 'tiktok', true, `connected${auth.username ? ' as @' + auth.username : ''} · scopes ${auth.scope}`)
    return html('TikTok connecté ✓', `Compte ${auth.nickname ?? ''} ${auth.username ? '@' + auth.username : ''} lié au worker. Portées : ${auth.scope}. Le jeton se renouvelle tout seul.`)
  } catch (e) { return html('TikTok : échec', String(e).slice(0, 300), 502) }
}
async function tiktokAuthRaw(env: Env): Promise<TikTokAuth | null> { try { const raw = await env.CACHE.get(AUTH_KEY); return raw ? (JSON.parse(raw) as TikTokAuth) : null } catch { return null } }
/** Valid access token (refreshed when < 30 min left). */
export async function tiktokAuth(env: Env): Promise<TikTokAuth> {
  const a = await tiktokAuthRaw(env)
  if (!a) throw new Error('tiktok_not_connected (open the admin panel → TikTok → Connect)')
  if (Date.now() > a.refresh_expires_at) throw new Error('tiktok refresh token expired — reconnect from the admin panel')
  if (Date.now() < a.expires_at - 30 * 60_000) return a
  const fresh = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: a.refresh_token })
  fresh.username = a.username; fresh.nickname = a.nickname; fresh.open_id = fresh.open_id || a.open_id
  await env.CACHE.put(AUTH_KEY, JSON.stringify(fresh))
  return fresh
}
export async function tiktokDisconnect(env: Env): Promise<void> { await env.CACHE.delete(AUTH_KEY) }

// ─── API calls ──────────────────────────────────────────────────────────────
async function api<T>(env: Env, path: string, body?: unknown, method: 'GET' | 'POST' = 'POST'): Promise<T> {
  const { access_token } = await tiktokAuth(env)
  const r = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json; charset=UTF-8' }, body: body != null ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) })
  const j = await r.json().catch(() => ({})) as { data?: T; error?: { code?: string; message?: string; log_id?: string } }
  if (!r.ok || (j.error && j.error.code && j.error.code !== 'ok')) throw new Error(`tiktok ${path} ${r.status}: ${j.error?.code ?? ''} ${j.error?.message ?? ''}`.trim())
  return (j.data ?? {}) as T
}
export async function tiktokUserInfo(env: Env): Promise<{ open_id: string; username?: string; nickname?: string; avatar?: string }> {
  const d = await api<{ user?: { open_id?: string; display_name?: string; username?: string; avatar_url?: string } }>(env, '/user/info/?fields=open_id,display_name,username,avatar_url', undefined, 'GET')
  return { open_id: d.user?.open_id ?? '', username: d.user?.username, nickname: d.user?.display_name, avatar: d.user?.avatar_url }
}
export type CreatorInfo = { creator_username?: string; creator_nickname?: string; privacy_level_options?: TikTokPrivacy[]; comment_disabled?: boolean; duet_disabled?: boolean; stitch_disabled?: boolean; max_video_post_duration_sec?: number }
/** Must be queried before every direct post (TikTok compliance): allowed privacy levels, max duration, disabled interactions. */
export const tiktokCreatorInfo = (env: Env) => api<CreatorInfo>(env, '/post/publish/creator_info/query/', {})

export async function tiktokStatus(env: Env): Promise<{ configured: boolean; connected: boolean; username?: string; nickname?: string; scope?: string; expiresAt?: number; refreshExpiresAt?: number; creator?: CreatorInfo; error?: string; redirectUri: string }> {
  const base = { configured: tiktokConfigured(env), redirectUri: TIKTOK_REDIRECT }
  const a = await tiktokAuthRaw(env)
  if (!a) return { ...base, connected: false }
  const out = { ...base, connected: true, username: a.username, nickname: a.nickname, scope: a.scope, expiresAt: a.expires_at, refreshExpiresAt: a.refresh_expires_at } as Awaited<ReturnType<typeof tiktokStatus>>
  try { out.creator = await tiktokCreatorInfo(env) } catch (e) { out.error = String(e).slice(0, 200) }
  return out
}

// ─── publishing ─────────────────────────────────────────────────────────────
/** TikTok caption = the "title": first lines of the Facebook caption without the "link in the comments" line, ≤ 5 hashtags, music credit kept. */
export function tiktokCaption(description: string, extraTags: string[] = []): string {
  const lines = String(description ?? '').split('\n').filter((l) => !/الرابط في التعليقات|link in (bio|the comments)|pressing90\.live\/|https?:\/\//i.test(l) || /uppbeat|License code/i.test(l))
  let text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const have = new Set([...text.matchAll(/#[^\s#]+/g)].map((m) => m[0].toLowerCase()))
  const add = extraTags.filter((t) => !have.has(t.toLowerCase())).slice(0, Math.max(0, 5 - have.size))
  if (add.length) text += `\n${add.join(' ')}`
  return checkCaption(text).text.slice(0, 2200)
}
export type TikTokPublishResult = { ok: boolean; publish_id?: string; status?: string; note?: string; mode: TikTokMode; privacy?: TikTokPrivacy; bytes?: number }
/** Uploads the rendered video (one chunk) and publishes it — direct post (privacy from settings, validated against creator_info)
 *  or inbox upload (Mehdi finishes the post in the TikTok app). `dry` validates everything and stops before the upload. */
export async function tiktokPublish(env: Env, p: { videoUrl: string; caption: string; privacy?: TikTokPrivacy; mode?: TikTokMode; dry?: boolean; coverMs?: number }): Promise<TikTokPublishResult> {
  const mode: TikTokMode = p.mode ?? 'direct'
  const info = await tiktokCreatorInfo(env)
  let privacy: TikTokPrivacy = p.privacy ?? 'SELF_ONLY'
  const allowed = info.privacy_level_options ?? []
  if (mode === 'direct' && allowed.length && !allowed.includes(privacy)) {
    if (!allowed.includes('SELF_ONLY')) throw new Error(`tiktok privacy ${privacy} not allowed (options: ${allowed.join(', ')})`)
    privacy = 'SELF_ONLY'   // unaudited app: private only
  }
  const head = await fetch(p.videoUrl, { method: 'HEAD', signal: AbortSignal.timeout(20000) })
  const size = Number(head.headers.get('content-length') ?? 0)
  if (!head.ok || !size) throw new Error(`video not reachable (${head.status})`)
  if (size > 64 * 1024 * 1024) throw new Error(`video too large for a single chunk (${Math.round(size / 1048576)} MB > 64 MB)`)
  if (p.dry) return { ok: true, mode, privacy, bytes: size, note: `dry run: creator @${info.creator_username ?? '?'}, privacy options ${allowed.join('/') || '?'}, max ${info.max_video_post_duration_sec ?? '?'} s, video ${Math.round(size / 1048576)} MB — nothing sent` }
  const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 }
  const init = mode === 'direct'
    ? await api<{ publish_id: string; upload_url: string }>(env, '/post/publish/video/init/', { post_info: { title: p.caption.slice(0, 2200), privacy_level: privacy, disable_duet: !!info.duet_disabled, disable_comment: !!info.comment_disabled, disable_stitch: !!info.stitch_disabled, video_cover_timestamp_ms: p.coverMs ?? 1000 }, source_info })
    : await api<{ publish_id: string; upload_url: string }>(env, '/post/publish/inbox/video/init/', { source_info })
  const video = await fetch(p.videoUrl, { signal: AbortSignal.timeout(60000) })
  if (!video.ok) throw new Error(`video download ${video.status}`)
  const buf = await video.arrayBuffer()
  const up = await fetch(init.upload_url, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-length': String(buf.byteLength), 'content-range': `bytes 0-${buf.byteLength - 1}/${buf.byteLength}` }, body: buf, signal: AbortSignal.timeout(120000) })
  if (!up.ok && up.status !== 201) throw new Error(`tiktok upload ${up.status} ${(await up.text()).slice(0, 160)}`)
  let status = 'PROCESSING_UPLOAD'
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 3000)); try { status = (await tiktokPublishStatus(env, init.publish_id)).status; if (status !== 'PROCESSING_UPLOAD' && status !== 'PROCESSING_DOWNLOAD') break } catch { /* keep polling */ } }
  return { ok: status !== 'FAILED', publish_id: init.publish_id, status, mode, privacy, bytes: buf.byteLength, note: `${mode} · ${privacy} · ${status}` }
}
export async function tiktokPublishStatus(env: Env, publishId: string): Promise<{ status: string; fail_reason?: string; post_ids?: string[] }> {
  const d = await api<{ status?: string; fail_reason?: string; publicaly_available_post_id?: string[] }>(env, '/post/publish/status/fetch/', { publish_id: publishId })
  return { status: d.status ?? 'UNKNOWN', fail_reason: d.fail_reason, post_ids: d.publicaly_available_post_id }
}
