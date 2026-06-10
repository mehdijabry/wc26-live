# Security model — pressing90.live

Last reviewed: 2026-06-10

## OWASP Top 10 — controls in place

| # | Risk | Where it's mitigated |
|---|---|---|
| A01 | Broken Access Control | `/push/broadcast` is gated by `ADMIN_TOKEN` (constant-time compare in `worker/src/index.ts::constantTimeEqual`). All POST endpoints are rate-limited per IP via KV (see `security.ts::rateLimit`). Supabase tables have RLS enabled and the anon role has zero policies on `push_subscriptions`. |
| A02 | Cryptographic Failures | TLS terminated at Cloudflare edge (HSTS + automatic certs). VAPID private key and Supabase service key live only in Cloudflare Worker Secrets (`wrangler secret put`). VAPID JWT signing uses Web Crypto API (ECDSA P-256), aes128gcm content encoding for the push payload (RFC 8291). No secret material is shipped to the client. |
| A03 | Injection | Every URL parameter that feeds an upstream fetch is whitelisted by regex in `worker/src/security.ts` (`safeTeamCode`, `safeEventId`, `safeYmd`, `safePushEndpoint`). Supabase queries via PostgREST use URL-encoded values (`encodeURIComponent`). No string concatenation into SQL — Supabase REST is parameterised by design. |
| A04 | Insecure Design | Push endpoint URLs are restricted to a hardcoded set of known push services (FCM / Mozilla / Apple / Microsoft) — attackers can't trick `/push/broadcast` into hitting their own server. URL deep-links in notifications are required to be relative paths (`startsWith('/')`). JSON bodies are size-capped before parsing. |
| A05 | Security Misconfiguration | `withSecurityHeaders()` adds CSP / `X-Content-Type-Options: nosniff` / `Referrer-Policy: no-referrer` / `Permissions-Policy: interest-cohort=()` to every response. CORS is allow-listed to the production + legacy origins (no `*`). |
| A06 | Vulnerable Components | `npm audit` clean as of last review. Production deps audited weekly. |
| A07 | Identification & Authentication Failures | Auth via Supabase Auth (email + password OR Google OAuth). Passwords never touched by our code — Supabase handles bcrypt + brute-force throttling server-side. Sessions are JWT, stored in `localStorage` by `@supabase/supabase-js`, refreshed automatically. |
| A08 | Software & Data Integrity Failures | Static SPA built locally + deployed via `wrangler pages deploy` — no untrusted CI pulls. Subresource integrity on cross-origin scripts (`<script integrity=…>` on the few external CDN scripts we use). |
| A09 | Logging & Monitoring | Rate-limit hits + error paths log to `wrangler tail`. Cloudflare Analytics tracks total / blocked request volume. Push delivery errors log per-endpoint. |
| A10 | SSRF | Push fan-out is restricted to the whitelisted push-service host set. ESPN proxy paths only fetch from `site.api.espn.com` (hardcoded constant). No user-supplied URL is ever passed to `fetch()`. |

## Inputs & where they're validated

| Source | Validation (frontend) | Validation (backend) |
|---|---|---|
| `/teams/:code`, `/roster/:code`, `/team-history/:code` URL param | n/a (routed by React Router) | `safeTeamCode()` — must match `/^[A-Z]{2,4}$/` |
| `/match/:id` URL param | n/a | `safeEventId()` — must match `/^\d{1,12}$/` |
| `/today?date=` query | n/a (default fills it) | `safeYmd()` — strictly 8 digits + calendar bounds |
| `/push/subscribe` body | Standard PushSubscription shape | `safePushEndpoint()` + `safeBase64Url()` + length caps on `ua` / `lang` |
| `/push/unsubscribe` body | n/a | `safePushEndpoint()` |
| `/push/test` body | n/a | `safePushEndpoint()` + length caps on title/body + relative URL only |
| `/push/broadcast` body | n/a | `x-admin-token` constant-time compare + length caps + relative URL only |
| Login email/password | Supabase Auth client | Supabase Auth server |
| Alias (UserMenu) | Length 2-20 + regex `[a-zA-Z0-9_-]` (`saveAlias` in `UserMenu.tsx`) | Supabase RLS + check constraint on `profiles.alias` |
| Bracket predictions | Constrained UI (only valid team picks selectable) | Supabase RLS — user can only insert/update their own row |
| Share-slug in `/u/:slug` | n/a (resolved via PostgREST `.eq('share_slug', slug)`) | PostgREST escapes the value; slugs are server-generated nanoids |

## Rate limits (per IP, sliding 60s buckets)

| Route | Limit | Why |
|---|---|---|
| `/push/subscribe` | 20 / min | Even a power-user clicking 'enable' across devices doesn't exceed this. Catches DB-fill attacks. |
| `/push/unsubscribe` | 20 / min | Same logic. |
| `/push/test` | 5 / min | Test pushes hit external push services — keep it tight to avoid VAPID-key abuse flagging. |
| `/push/broadcast` | 5 / min | Behind admin token; rate limit catches credential-stuffing. |
| ESPN-proxy reads | (none) | Cached in KV; ESPN itself rate-limits us. |

429 responses include a `Retry-After` header.

## Secrets management

All secrets live in Cloudflare Worker Secrets (`wrangler secret put`). Set:

- `SUPABASE_SERVICE_KEY` — server-side DB writes
- `VAPID_PUBLIC` / `VAPID_PRIVATE` / `VAPID_SUBJECT` — Web Push VAPID identity
- `ADMIN_TOKEN` — gate for `/push/broadcast`

Never commit any of these. `.gitignore` covers `.env*` already. `.env.example` ships placeholder values only.

## Reporting

If you find a security issue, please email **info@pressing90.live**. We aim to acknowledge within 24h and patch critical issues within 72h.
