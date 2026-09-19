// TikTok hand-off kit (Mehdi, 2026-09-19)
// ---------------------------------------
// TikTok's inbox upload carries the VIDEO ONLY: /post/publish/inbox/video/init/ accepts `source_info` and nothing else,
// so the draft lands in the app with an empty caption, no hashtags and no cover. Direct post does carry all of that, but
// an unaudited client may only direct-post to a private account (`unaudited_client_can_only_post_to_private_accounts`).
// Until the app passes TikTok's audit, every finished goal recreation is therefore sent by e-mail as a kit, the same way
// the Facebook stories are: cover to download, texts to copy one tap at a time, and a button that pushes the video to the
// TikTok drafts when Mehdi taps it (nothing leaves the worker before that tap).
import type { Env } from './index'
import { sendMail, SITE } from './automation'
import { tiktokPublish, tiktokConfigured } from './tiktok'
import type { TikTokMode, TikTokPrivacy } from './tiktok'

export type TikTokKit = {
  title: string
  videoUrl: string
  coverUrl?: string
  caption: string            // exactly what goes in the TikTok caption field, hashtags and music credit included
  hashtags: string[]
  credit?: string            // Uppbeat licence lines — mandatory on every video that uses the Quake track
  meta?: string              // "Bayern 3-0 Union Berlin · Michael Olise 43'"
  seconds?: number
  created: string
  pushes?: number
  lastPush?: string
  lastStatus?: string
}
const KEY = (id: string) => `auto:ttkit:${id}`
const MAX_PUSHES = 3
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** Splits a finished caption into the sentences, the hashtag line and the music credit, for three separate copy buttons. */
export function splitCaption(caption: string): { body: string; hashtags: string[]; credit: string } {
  const lines = String(caption ?? '').split('\n')
  const credit: string[] = [], tags: string[] = [], body: string[] = []
  let inCredit = false
  for (const l of lines) {
    if (/music from|uppbeat|license code/i.test(l)) { inCredit = true; credit.push(l); continue }
    if (inCredit && /^https?:\/\//i.test(l.trim())) { credit.push(l); continue }
    inCredit = false
    const t = l.match(/#[^\s#]+/g)
    if (t && t.join(' ').length > l.trim().length - 4) { tags.push(...t); continue }   // a line that is only hashtags
    body.push(l)
  }
  return { body: body.join('\n').replace(/\n{3,}/g, '\n\n').trim(), hashtags: tags, credit: credit.join('\n').trim() }
}

export async function createTikTokKit(env: Env, kit: Omit<TikTokKit, 'created'>): Promise<{ id: string; url: string }> {
  const id = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12)
  await env.CACHE.put(KEY(id), JSON.stringify({ ...kit, created: new Date().toISOString(), pushes: 0 } satisfies TikTokKit), { expirationTtl: 7 * 86400 })
  return { id, url: `${SITE}/tiktok-kit/${id}` }   // served through the Pages function so the link matches the sender domain
}
export async function readTikTokKit(env: Env, id: string): Promise<TikTokKit | null> {
  const raw = await env.CACHE.get(KEY(id))
  return raw ? JSON.parse(raw) as TikTokKit : null
}

/** The button on the kit page: uploads the video to the TikTok drafts (inbox) — or direct-posts it when the app is audited. */
export async function pushTikTokKit(env: Env, id: string, opts: { mode?: TikTokMode; privacy?: TikTokPrivacy } = {}): Promise<{ ok: boolean; note: string; status?: string }> {
  const kit = await readTikTokKit(env, id)
  if (!kit) return { ok: false, note: 'Ce kit a expiré (7 jours).' }
  if (!tiktokConfigured(env)) return { ok: false, note: 'TikTok n\'est pas connecté.' }
  if ((kit.pushes ?? 0) >= MAX_PUSHES) return { ok: false, note: `Déjà envoyé ${kit.pushes} fois — limite atteinte.` }
  try {
    const r = await tiktokPublish(env, { videoUrl: kit.videoUrl, caption: kit.caption, mode: opts.mode ?? 'inbox', privacy: opts.privacy ?? 'SELF_ONLY' })
    const next: TikTokKit = { ...kit, pushes: (kit.pushes ?? 0) + 1, lastPush: new Date().toISOString(), lastStatus: r.status }
    await env.CACHE.put(KEY(id), JSON.stringify(next), { expirationTtl: 7 * 86400 })
    return { ok: r.ok, status: r.status, note: r.ok ? 'Vidéo envoyée dans TikTok — ouvre l\'app, onglet Boîte de réception, puis colle la légende.' : `TikTok a refusé : ${r.note ?? r.status ?? '?'}` }
  } catch (e) { return { ok: false, note: String(e).slice(0, 200) } }
}

/** Mobile page behind the e-mail button: preview, cover download, three copy buttons, one push button. */
export function tikTokKitPage(id: string, kit: TikTokKit): string {
  const { body, hashtags, credit } = splitCaption(kit.caption)
  const tags = (kit.hashtags?.length ? kit.hashtags : hashtags).join(' ')
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>TikTok · ${esc(kit.title)}</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#071B30;color:#F3EFE6;font-family:-apple-system,system-ui,sans-serif}
main{max-width:480px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:18px;line-height:1.35;margin:0 0 4px}
.meta{font-size:13px;color:rgba(243,239,230,.6);margin:0 0 16px}
.row{display:flex;gap:10px;align-items:flex-start;margin:0 0 18px}
video,.cover{border-radius:14px;display:block;background:#000}
video{width:58%}
.cover{width:42%;object-fit:cover}
.b{display:block;width:100%;box-sizing:border-box;padding:15px;border:0;border-radius:12px;font-size:16px;font-weight:700;margin:9px 0;cursor:pointer;text-align:center;text-decoration:none}
.gold{background:#D9B54A;color:#071B30}
.tt{background:#FE2C55;color:#fff}
.ghost{background:transparent;color:#F3EFE6;border:1px solid rgba(243,239,230,.28)}
.txt{background:rgba(255,255,255,.06);border-radius:12px;padding:12px 14px;font-size:15px;line-height:1.55;white-space:pre-wrap;word-break:break-word;margin:0 0 8px}
.ar{direction:rtl;text-align:right}
.lbl{font-size:11px;letter-spacing:.12em;color:#D9B54A;margin:22px 0 8px}
.ok{color:#41C97C;font-size:14px;min-height:22px;text-align:center;margin:6px 0 0}
.ko{color:#FF6B6B}
</style></head><body><main>
<p class="lbl" style="margin:0 0 8px">PRESSING 90' · KIT TIKTOK</p>
<h1>${esc(kit.title)}</h1>
<p class="meta">${esc(kit.meta ?? '')}${kit.seconds ? ` · ${Math.round(kit.seconds)} s` : ''}</p>
<div class="row">
  <video src="${esc(kit.videoUrl)}" playsinline muted autoplay loop></video>
  ${kit.coverUrl ? `<img class="cover" src="${esc(kit.coverUrl)}" alt="vignette">` : ''}
</div>
<button class="b tt" id="push">▶︎ Pousser vers TikTok (brouillon)</button>
<div class="ok" id="msg"></div>
<p class="lbl">LÉGENDE COMPLÈTE</p>
<div class="txt ar" id="full">${esc(kit.caption)}</div>
<button class="b gold" data-copy="full">Copier la légende complète</button>
<p class="lbl">DÉTAIL</p>
<div class="txt ar" id="body">${esc(body)}</div>
<button class="b ghost" data-copy="body">Copier le texte seul</button>
${tags ? `<div class="txt" id="tags">${esc(tags)}</div><button class="b ghost" data-copy="tags">Copier les hashtags</button>` : ''}
${credit ? `<div class="txt" id="credit">${esc(credit)}</div><button class="b ghost" data-copy="credit">Copier le crédit musique</button>` : ''}
<p class="lbl">FICHIERS</p>
${kit.coverUrl ? `<a class="b ghost" href="${esc(kit.coverUrl)}" download="pressing90-vignette.jpg">Télécharger la vignette</a>` : ''}
<a class="b ghost" href="${esc(kit.videoUrl)}" download="pressing90-tiktok.mp4">Télécharger la vidéo</a>
<a class="b ghost" href="snssdk1128://" id="open">Ouvrir TikTok</a>
</main><script>
const msg=document.getElementById('msg');
document.querySelectorAll('[data-copy]').forEach((b)=>{b.onclick=async()=>{const el=document.getElementById(b.dataset.copy);const t=el.textContent;try{await navigator.clipboard.writeText(t);msg.className='ok';msg.textContent='Copié ✓';b.textContent=b.textContent.replace('Copier','Copié ✓ —');setTimeout(()=>{msg.textContent=''},2500)}catch(e){const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);msg.textContent='Sélectionné — appuie sur Copier'}}});
const push=document.getElementById('push');
push.onclick=async()=>{if(push.disabled)return;push.disabled=true;const old=push.textContent;push.textContent='Envoi en cours…';msg.className='ok';msg.textContent='';
 try{const r=await fetch(location.pathname+'/push',{method:'POST'});const j=await r.json();msg.className=j.ok?'ok':'ok ko';msg.textContent=j.note||'';push.textContent=j.ok?'Envoyé ✓':old;if(!j.ok)push.disabled=false}
 catch(e){msg.className='ok ko';msg.textContent=String(e.message||e);push.textContent=old;push.disabled=false}};
</script></body></html>`
}

/** The e-mail itself: cover, texts, and the button that opens the page above. */
export async function sendTikTokKitEmail(env: Env, kit: TikTokKit, kitUrl: string): Promise<{ ok: boolean; note?: string }> {
  const { body, hashtags, credit } = splitCaption(kit.caption)
  const tags = (kit.hashtags?.length ? kit.hashtags : hashtags).join(' ')
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:8px">
    <p style="margin:0 0 4px;color:#64748b;font-size:12px;letter-spacing:.08em">PRESSING 90' · KIT TIKTOK</p>
    <h2 style="margin:0 0 4px;color:#0f172a;font-size:20px">${esc(kit.title)}</h2>
    <p style="margin:0 0 14px;color:#64748b;font-size:13px">${esc(kit.meta ?? '')}${kit.seconds ? ` · ${Math.round(kit.seconds)} s` : ''}</p>
    ${kit.coverUrl ? `<img src="${kit.coverUrl}" alt="" style="width:100%;max-width:260px;border-radius:12px;display:block;margin:0 0 16px"/>` : ''}
    <a href="${kitUrl}" style="display:inline-block;background:#FE2C55;color:#fff;font-weight:700;padding:14px 22px;border-radius:10px;text-decoration:none;font-size:16px">▶︎ Ouvrir le kit &amp; pousser vers TikTok</a>
    <p style="color:#475569;font-size:13px;margin:16px 0 6px">La page permet de copier la légende, les hashtags et le crédit musique en un geste, de télécharger la vignette, puis d'envoyer la vidéo dans les brouillons TikTok.</p>
    <div style="background:#f8fafc;border-radius:10px;padding:12px 14px;margin:14px 0;direction:rtl;text-align:right;font-size:14px;line-height:1.6;color:#0f172a;white-space:pre-wrap">${esc(body)}</div>
    ${tags ? `<p style="font-size:13px;color:#0f172a;margin:0 0 10px">${esc(tags)}</p>` : ''}
    ${credit ? `<pre style="font-size:12px;color:#64748b;margin:0 0 10px;white-space:pre-wrap;font-family:inherit">${esc(credit)}</pre>` : ''}
    <p style="font-size:12px;color:#94a3b8;margin:0">Pressing 90' · ${esc(kit.meta ?? '')}</p>
  </div>`
  const text = [`Pressing 90' — kit TikTok`, kit.title, kit.meta ?? '', '', `Ouvrir le kit : ${kitUrl}`, '', body, tags, credit].filter(Boolean).join('\n')
  return sendMail(env, `Kit TikTok prêt : ${kit.title.slice(0, 60)}`, html, text)
}

/** One call from the render callback: store the kit, e-mail it, return the page URL for the ops log. */
export async function queueTikTokKit(env: Env, kit: Omit<TikTokKit, 'created'>): Promise<{ ok: boolean; url: string; note?: string }> {
  const { id, url } = await createTikTokKit(env, kit)
  const mail = await sendTikTokKitEmail(env, { ...kit, created: new Date().toISOString() }, url)
  return { ok: mail.ok, url, note: mail.note }
}
