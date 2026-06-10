/**
 * Web Push subscription helpers for the PWA notification opt-in flow.
 *
 * Lifecycle:
 *   1. UI button calls subscribeToPush() — asks the browser permission
 *      and creates a PushSubscription via the active service worker.
 *   2. The subscription is POSTed to the Cloudflare Worker
 *      `/push/subscribe` endpoint, which upserts it into Supabase.
 *   3. Server-side fan-out (cron + manual blasts) sends notifications
 *      via /push/send.
 *
 * iOS 16.4+ supports Web Push BUT only when the user has installed
 * the site to their home screen (add-to-home-screen → standalone). On
 * other browsers (Chrome/Firefox Android, Chrome/Edge desktop, Firefox
 * desktop) the regular browser tab is enough. We don't try to detect
 * iOS here — the Notification.requestPermission call simply fails on
 * unsupported configs and we surface a friendly error.
 */

import { API_BASE } from './api'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC as string | undefined

/** Convert base64url-encoded VAPID public to the Uint8Array PushManager wants. */
function urlBase64ToUint8(base64: string): Uint8Array {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const std = padded.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(std)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'no-vapid' | 'no-sw' }

/** Cheap check we can run synchronously before showing the opt-in button. */
export function pushSupport(): PushSupport {
  if (!VAPID_PUBLIC) return { ok: false, reason: 'no-vapid' }
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' }
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'no-sw' }
  if (!('PushManager' in window)) return { ok: false, reason: 'unsupported' }
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' }
  return { ok: true }
}

/** Check the current subscription state — useful for the toggle UI. */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return null
    return (await reg.pushManager.getSubscription()) ?? null
  } catch {
    return null
  }
}

/** Run the full subscribe flow. Resolves to the saved subscription. */
export async function subscribeToPush(): Promise<PushSubscription> {
  const support = pushSupport()
  if (!support.ok) {
    throw new Error(`Push not supported on this device (${support.reason}).`)
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission denied.')
  }

  const reg =
    (await navigator.serviceWorker.getRegistration()) ??
    (await navigator.serviceWorker.register('/sw.js', { scope: '/' }))

  // Reuse existing subscription if there is one — Web Push permits
  // exactly one per service-worker scope, and renewing it for no
  // reason kicks the user off the previous keypair.
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    // PushManager.subscribe wants a BufferSource (ArrayBuffer / typed
    // array). Passing the Uint8Array's .buffer is the cleanest cast TS
    // accepts under Node 20+ lib.dom types.
    const keyBuf = urlBase64ToUint8(VAPID_PUBLIC!).buffer as ArrayBuffer
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBuf,
    })
  }

  await persistSubscription(sub)
  return sub
}

/** Unsubscribe locally AND tell the server to drop the row. */
export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getCurrentSubscription()
  if (!sub) return
  try {
    await fetch(`${API_BASE}/push/unsubscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })
  } catch { /* best-effort */ }
  await sub.unsubscribe()
}

async function persistSubscription(sub: PushSubscription): Promise<void> {
  // PushSubscription.toJSON() returns endpoint + keys{p256dh,auth} in
  // the shape web-push libraries expect everywhere. We forward verbatim.
  const json = sub.toJSON()
  const payload = {
    endpoint: json.endpoint,
    keys: json.keys,
    // Browser hint helps with debugging which platform a sub came from
    ua: navigator.userAgent,
    lang: navigator.language,
  }
  const resp = await fetch(`${API_BASE}/push/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    throw new Error(`Subscribe API ${resp.status}`)
  }
}
