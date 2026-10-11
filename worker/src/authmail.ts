// Les courriels d'authentification, envoyés par NOUS et dans la langue du
// visiteur — pas par Supabase.
//
// ── POURQUOI PASSER PAR ICI ───────────────────────────────────────────────
// Deux raisons, découvertes le 11/10/2026 au moment de lancer la campagne
// Facebook arabe :
//
// 1. LA LANGUE. Supabase n'a qu'UN gabarit par type de courriel, sans
//    variable de langue. Une publicité en arabe qui débouche sur un
//    « Confirm your email address » perd son monde au dernier clic. Le
//    « Send Email Hook » laisse Supabase nous passer la main : il nous
//    donne l'utilisateur et le jeton, on compose et on envoie.
//
// 2. LA LIVRAISON. Le service de courriel intégré de Supabase est bridé
//    (quelques messages par heure) et explicitement donné pour du test.
//    Mehdi n'a jamais reçu sa confirmation. Resend est déjà configuré dans
//    ce worker pour les alertes : on s'en sert.
//
// ── CE QU'IL FAUT POSER DANS SUPABASE ─────────────────────────────────────
//   Authentication → Hooks → Send Email Hook → HTTPS
//   URL     : https://<worker>/auth/email
//   Secret  : la même valeur que SEND_EMAIL_HOOK_SECRET ici
//             (wrangler secret put SEND_EMAIL_HOOK_SECRET)
//
// La signature suit la norme « standard-webhooks » : on la vérifie, sinon
// n'importe qui pourrait nous faire envoyer des courriels à n'importe qui.

export type EnvMail = {
  SUPABASE_URL: string
  RESEND_API_KEY?: string
  RESEND_FROM?: string
  SEND_EMAIL_HOOK_SECRET?: string
}

type Langue = 'ar' | 'fr' | 'en'
type Action = 'signup' | 'magiclink' | 'recovery' | 'email_change' | 'invite'

type Charge = {
  user?: { email?: string; user_metadata?: Record<string, unknown> }
  email_data?: {
    token_hash?: string
    redirect_to?: string
    email_action_type?: string
    site_url?: string
  }
}

const SITE = 'https://pressing90.live'
// Le nouveau sigle, crème sur fond nuit. Le paramètre de version force les
// relais de messagerie à relire l'image au lieu de servir l'ancienne.
const SIGLE = `${SITE}/icon-512.png?v=3`

/** Comparaison à temps constant — une comparaison naïve fuit la signature. */
function memeSignature(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]
  return d === 0
}

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/**
 * Vérifie l'en-tête `webhook-signature` (standard-webhooks) : HMAC-SHA256 de
 * `<id>.<horodatage>.<corps>` avec le secret, qui arrive sous la forme
 * `v1,whsec_<base64>`. L'horodatage est borné à cinq minutes pour qu'un
 * message capté ne puisse pas être rejoué.
 */
async function signatureValide(corps: string, h: Headers, secret: string): Promise<boolean> {
  const id = h.get('webhook-id')
  const ts = h.get('webhook-timestamp')
  const sig = h.get('webhook-signature')
  if (!id || !ts || !sig) return false

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(ts))
  if (!Number.isFinite(age) || age > 300) return false

  const brut = secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '')
  const cle = await crypto.subtle.importKey('raw', deB64(brut), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const attendu = b64(await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(`${id}.${ts}.${corps}`)))

  // L'en-tête peut porter plusieurs signatures séparées par une espace,
  // le temps d'une rotation de secret : il suffit qu'une corresponde.
  for (const part of sig.split(' ')) {
    const v = part.startsWith('v1,') ? part.slice(3) : part
    try { if (memeSignature(deB64(v), deB64(attendu))) return true } catch { /* base64 douteux */ }
  }
  return false
}

// ── Les textes ────────────────────────────────────────────────────────────
// Un courriel d'authentification n'a qu'un seul geste possible. Tout le
// reste — rassurer, signer la marque — tient en dessous.
type Copie = { objet: string; titre: string; corps: string; bouton: string; repli: string; note: string }

const TEXTES: Record<Action, Record<Langue, Copie>> = {
  signup: {
    ar: { objet: 'أكّد بريدك وابدأ اللعب — Pressing 90\'',
          titre: 'خطوة واحدة، وتبدأ اللعب',
          corps: 'أكّد بريدك الإلكتروني، ورصيدك من الكرامبون ينتظرك فورًا.',
          bouton: 'تأكيد بريدي الإلكتروني',
          repli: 'الزر لا يعمل؟ انسخ هذا الرابط في متصفّحك:',
          note: 'وصلك هذا البريد لأنّ أحدهم سجّل بهذا العنوان على pressing90.live. إن لم تكن أنت، تجاهله — لا يُفعَّل أي حساب دون هذه النقرة.' },
    fr: { objet: 'Confirmez votre adresse et commencez — Pressing 90\'',
          titre: 'Un clic, et vous jouez',
          corps: 'Confirmez votre adresse : vos crampons vous attendent déjà.',
          bouton: 'Confirmer mon adresse',
          repli: 'Le bouton ne marche pas ? Copiez ce lien dans votre navigateur :',
          note: 'Vous recevez ce message parce qu’une inscription a été faite avec cette adresse sur pressing90.live. Si ce n’est pas vous, ignorez-le — aucun compte n’est activé sans ce clic.' },
    en: { objet: 'Confirm your email and start playing — Pressing 90\'',
          titre: 'One click, and you’re in',
          corps: 'Confirm your email — your crampons are already waiting.',
          bouton: 'Confirm my email',
          repli: 'Button not working? Copy this link into your browser:',
          note: 'You received this because someone signed up with this address on pressing90.live. If it wasn’t you, ignore it — no account is activated without this click.' },
  },
  magiclink: {
    ar: { objet: 'رابط الدخول — Pressing 90\'', titre: 'رابط دخولك', corps: 'اضغط للدخول إلى حسابك. الرابط صالح لمدّة ساعة واحدة.',
          bouton: 'الدخول إلى حسابي', repli: 'الزر لا يعمل؟ انسخ هذا الرابط في متصفّحك:',
          note: 'إن لم تطلب هذا الرابط، تجاهل هذه الرسالة — لن يدخل أحد إلى حسابك.' },
    fr: { objet: 'Votre lien de connexion — Pressing 90\'', titre: 'Votre lien de connexion', corps: 'Cliquez pour accéder à votre compte. Le lien est valable une heure.',
          bouton: 'Accéder à mon compte', repli: 'Le bouton ne marche pas ? Copiez ce lien dans votre navigateur :',
          note: 'Si vous n’avez pas demandé ce lien, ignorez ce message — personne n’accédera à votre compte.' },
    en: { objet: 'Your sign-in link — Pressing 90\'', titre: 'Your sign-in link', corps: 'Tap to reach your account. The link is valid for one hour.',
          bouton: 'Open my account', repli: 'Button not working? Copy this link into your browser:',
          note: 'If you didn’t ask for this link, ignore this message — nobody gets into your account.' },
  },
  recovery: {
    ar: { objet: 'إعادة تعيين كلمة المرور — Pressing 90\'', titre: 'كلمة مرور جديدة', corps: 'اضغط لاختيار كلمة مرور جديدة. الرابط صالح لمدّة ساعة واحدة.',
          bouton: 'اختيار كلمة مرور جديدة', repli: 'الزر لا يعمل؟ انسخ هذا الرابط في متصفّحك:',
          note: 'إن لم تطلب ذلك، تجاهل هذه الرسالة — كلمة مرورك الحالية تبقى كما هي.' },
    fr: { objet: 'Réinitialiser votre mot de passe — Pressing 90\'', titre: 'Un nouveau mot de passe', corps: 'Cliquez pour choisir un nouveau mot de passe. Le lien est valable une heure.',
          bouton: 'Choisir un mot de passe', repli: 'Le bouton ne marche pas ? Copiez ce lien dans votre navigateur :',
          note: 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message — votre mot de passe actuel reste valable.' },
    en: { objet: 'Reset your password — Pressing 90\'', titre: 'A new password', corps: 'Tap to choose a new password. The link is valid for one hour.',
          bouton: 'Choose a password', repli: 'Button not working? Copy this link into your browser:',
          note: 'If you didn’t ask for this, ignore this message — your current password still works.' },
  },
  email_change: {
    ar: { objet: 'أكّد عنوانك الجديد — Pressing 90\'', titre: 'أكّد عنوانك الجديد', corps: 'اضغط لتأكيد عنوان بريدك الجديد.',
          bouton: 'تأكيد العنوان', repli: 'الزر لا يعمل؟ انسخ هذا الرابط في متصفّحك:',
          note: 'إن لم تطلب ذلك، تجاهل هذه الرسالة — عنوانك الحالي لا يتغيّر.' },
    fr: { objet: 'Confirmez votre nouvelle adresse — Pressing 90\'', titre: 'Votre nouvelle adresse', corps: 'Cliquez pour confirmer votre nouvelle adresse de courriel.',
          bouton: 'Confirmer l’adresse', repli: 'Le bouton ne marche pas ? Copiez ce lien dans votre navigateur :',
          note: 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message — votre adresse actuelle ne change pas.' },
    en: { objet: 'Confirm your new address — Pressing 90\'', titre: 'Your new address', corps: 'Tap to confirm your new email address.',
          bouton: 'Confirm address', repli: 'Button not working? Copy this link into your browser:',
          note: 'If you didn’t ask for this, ignore this message — your current address stays as it is.' },
  },
  invite: {
    ar: { objet: 'دعوة إلى Pressing 90\'', titre: 'أنت مدعوّ', corps: 'اضغط لإنشاء حسابك والانضمام إلى اللعب.',
          bouton: 'إنشاء حسابي', repli: 'الزر لا يعمل؟ انسخ هذا الرابط في متصفّحك:',
          note: 'إن لم تكن تنتظر هذه الدعوة، تجاهل هذه الرسالة.' },
    fr: { objet: 'Une invitation sur Pressing 90\'', titre: 'Vous êtes invité', corps: 'Cliquez pour créer votre compte et entrer dans le jeu.',
          bouton: 'Créer mon compte', repli: 'Le bouton ne marche pas ? Copiez ce lien dans votre navigateur :',
          note: 'Si vous n’attendiez pas cette invitation, ignorez ce message.' },
    en: { objet: 'You’re invited to Pressing 90\'', titre: 'You’re invited', corps: 'Tap to create your account and join the game.',
          bouton: 'Create my account', repli: 'Button not working? Copy this link into your browser:',
          note: 'If you weren’t expecting this invitation, ignore this message.' },
  },
}

const ech = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/**
 * La mise en page, commune aux trois langues.
 *
 * Contraintes des clients de messagerie, à ne pas « moderniser » : des
 * tableaux et non du flex, des styles en ligne et non une feuille, une image
 * PNG et non le SVG de la marque (Gmail et Outlook le bloquent), et le lien
 * en clair sous le bouton pour qui n'affiche pas le HTML.
 */
function page(c: Copie, lien: string, lang: Langue): string {
  const rtl = lang === 'ar'
  const dir = rtl ? 'rtl' : 'ltr'
  const police = rtl ? "'Segoe UI',Tahoma,Arial,sans-serif" : "'Helvetica Neue',Helvetica,Arial,sans-serif"
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0B0F0D;margin:0;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;background-color:#121916;border-radius:18px;border:1px solid rgba(236,239,232,0.09);">
  <tr><td align="center" style="padding:40px 32px 0 32px;">
    <img src="${SIGLE}" width="76" height="76" alt="Pressing 90" style="display:block;border:0;outline:none;text-decoration:none;border-radius:17px;">
  </td></tr>
  <tr><td align="center" style="padding:16px 32px 0 32px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:23px;font-weight:700;color:#ECEFE8;letter-spacing:-0.3px;">
    Pressing <span style="color:#D9B54A;">90'</span>
  </td></tr>
  <tr><td align="center" style="padding:10px 32px 0 32px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;font-weight:600;color:#6F7A74;letter-spacing:2.4px;line-height:1.9;text-transform:uppercase;">
    More than a game.<br>Our field of expression.
  </td></tr>
  <tr><td align="center" style="padding:24px 36px 0 36px;"><div style="height:1px;width:56px;background-color:#D9B54A;line-height:1px;">&nbsp;</div></td></tr>
  <tr><td dir="${dir}" align="center" style="padding:26px 36px 0 36px;font-family:${police};font-size:27px;font-weight:700;color:#ECEFE8;line-height:1.45;">${ech(c.titre)}</td></tr>
  <tr><td dir="${dir}" align="center" style="padding:14px 40px 0 40px;font-family:${police};font-size:16px;color:#A8B3AD;line-height:1.75;">${ech(c.corps)}</td></tr>
  <tr><td align="center" style="padding:30px 32px 0 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" bgcolor="#D9B54A" style="border-radius:12px;">
        <a href="${ech(lien)}" style="display:inline-block;padding:16px 40px;font-family:${police};font-size:17px;font-weight:700;color:#0B0F0D;text-decoration:none;border-radius:12px;">${ech(c.bouton)}</a>
      </td></tr></table>
  </td></tr>
  <tr><td dir="${dir}" align="center" style="padding:28px 32px 0 32px;font-family:${police};font-size:13px;color:#7E8A84;line-height:1.9;">
    ${rtl ? 'مجاني بالكامل &nbsp;·&nbsp; بدون إيداع &nbsp;·&nbsp; بدون وسيط رهان'
          : lang === 'fr' ? 'Gratuit &nbsp;·&nbsp; sans dépôt &nbsp;·&nbsp; sans bookmaker'
          : 'Free &nbsp;·&nbsp; no deposit &nbsp;·&nbsp; no bookmaker'}
  </td></tr>
  <tr><td align="center" style="padding:26px 36px 0 36px;"><div style="height:1px;background-color:rgba(236,239,232,0.08);line-height:1px;">&nbsp;</div></td></tr>
  <tr><td dir="${dir}" align="center" style="padding:20px 36px 0 36px;font-family:${police};font-size:13px;color:#7E8A84;line-height:1.7;">
    ${ech(c.repli)}<br>
    <a href="${ech(lien)}" dir="ltr" style="color:#D9B54A;text-decoration:underline;word-break:break-all;font-size:12px;">${ech(lien)}</a>
  </td></tr>
  <tr><td dir="${dir}" align="center" style="padding:26px 36px 36px 36px;font-family:${police};font-size:12px;color:#5E6B65;line-height:1.8;">
    ${ech(c.note)}
  </td></tr>
</table>
</td></tr></table>`
}

const texteSeul = (c: Copie, lien: string) => `${c.titre}\n\n${c.corps}\n\n${lien}\n\n${c.note}\n\nPressing 90' — ${SITE}`

/** Le « Send Email Hook » de Supabase. */
export async function handleAuthEmail(req: Request, env: EnvMail): Promise<Response> {
  const secret = env.SEND_EMAIL_HOOK_SECRET
  if (!secret) return new Response(JSON.stringify({ error: 'hook secret missing' }), { status: 503, headers: { 'content-type': 'application/json' } })
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return new Response(JSON.stringify({ error: 'resend not configured' }), { status: 503, headers: { 'content-type': 'application/json' } })

  const corps = await req.text()
  if (!(await signatureValide(corps, req.headers, secret))) {
    return new Response(JSON.stringify({ error: 'bad signature' }), { status: 401, headers: { 'content-type': 'application/json' } })
  }

  let charge: Charge
  try { charge = JSON.parse(corps) as Charge } catch { return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: { 'content-type': 'application/json' } }) }

  const destinataire = charge.user?.email
  const d = charge.email_data
  if (!destinataire || !d?.token_hash) {
    return new Response(JSON.stringify({ error: 'incomplete payload' }), { status: 400, headers: { 'content-type': 'application/json' } })
  }

  // La langue vient du navigateur au moment de l'inscription : le site la
  // pose dans les métadonnées (voir store/auth.ts). Sans elle, l'anglais,
  // comme le site lui-même quand il ne détecte rien.
  const brut = String(charge.user?.user_metadata?.lang ?? '').toLowerCase()
  const lang: Langue = brut.startsWith('ar') ? 'ar' : brut.startsWith('fr') ? 'fr' : 'en'

  const act = String(d.email_action_type ?? 'signup')
  const action: Action = (['signup', 'magiclink', 'recovery', 'email_change', 'invite'] as const).includes(act as Action)
    ? (act as Action)
    : 'signup'
  const c = TEXTES[action][lang]

  const retour = d.redirect_to || SITE
  const lien = `${env.SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(d.token_hash)}`
    + `&type=${encodeURIComponent(act)}&redirect_to=${encodeURIComponent(retour)}`

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: destinataire,
      subject: c.objet,
      html: page(c, lien, lang),
      text: texteSeul(c, lien),
    }),
  })
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 200)
    console.log('[authmail] resend', r.status, detail)
    // On rend l'erreur à Supabase : il la journalise, et surtout il
    // n'annonce pas à l'utilisateur un courriel qui n'est jamais parti.
    return new Response(JSON.stringify({ error: { http_code: 500, message: `resend ${r.status}` } }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
}

/** Rendu d'un gabarit, pour le relire sans envoyer quoi que ce soit. */
export function apercuAuthEmail(lang: Langue, action: Action, lien: string): { objet: string; html: string } {
  const c = TEXTES[action][lang]
  return { objet: c.objet, html: page(c, lien, lang) }
}
