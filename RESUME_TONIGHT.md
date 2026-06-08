# WC26 Live — Reprise ce soir

## ⏸️ État au pause (7 juin 2026, 18h45)

Tout le code est **commit + push + déployé en prod** sur `https://wc26.mehdijabry.dev`.
Dernier commit : `6f83529` — `feat(auth): surface OAuth provider error instead of silent fallback`.

## ✅ Ce qui marche

- **Light theme** complet (footmercato-style), gold logo conservé
- **AuthModal** portalisée vers `document.body` — s'affiche partout, plus de bug de stacking context
- **TeamSheet** avec 5 tabs : Infos / Squad (26 joueurs) / WC26 (3 matchs) / History / Stats
- **History tab** — palmarès FIFA + 44 matchs Maroc (7 WC22 complets, qualifs, friendlies)
- **Worker `/team-history`** fan out sur WC seasontype 1→5 + qualifs CAF/UEFA/etc + AFCON + Copa America
- **AthorError banner** rouge — surface l'erreur OAuth au lieu du fallback silencieux
- **PKCE exchange explicite** dans `useAuth.init()` — évite la race condition

## 🚧 Bloqué — à reprendre ce soir

### Problème : Login Google → "Unable to exchange external code"

**Diagnostic confirmé :**
- ✅ Google Cloud redirect URI = `https://ssvvojhxyotlbcdosiog.supabase.co/auth/v1/callback` (correct)
- ✅ OAuth Consent Screen = Production + Externe
- ✅ Client ID Supabase ↔ Google matchent
- ❓ **Client Secret obsolète dans Supabase** — c'est la dernière variable

**Action à finir :**
J'ai créé un nouveau OAuth Client dans Google Cloud aujourd'hui :
- **Nom** : "WC26 Live OAuth v2"
- **Project** : `gen-lang-client-0440368779` (Gemini API)
- **Client ID** : `786367888791-lkreavapurr7grqil65e8f1pqb530l5k.apps.googleusercontent.com`
- **Client Secret** : 🚨 **Non récupéré** — popup fermé avant download du JSON

### Plan pour ce soir (3 étapes, 5 min)

1. Aller sur Google Cloud → Clients OAuth → ouvrir "WC26 Live OAuth v2"
2. Cliquer "Ajouter un secret" (ou supprimer le client v2 et en créer un v3 en téléchargeant le JSON cette fois)
3. Coller Client ID + Secret dans Supabase → `Authentication → Providers → Google` → Save
4. Tester login Google sur wc26.mehdijabry.dev

Cmd direct : `https://console.cloud.google.com/auth/clients?project=gen-lang-client-0440368779`

## 📋 Autres tasks pending (pour info, pas urgent)

- #95 — Fix Supabase Auth URLs (Site URL + redirects whitelist) → à vérifier en parallèle
- #110 — Bracket KO Tree + Predictions section toujours sur données statiques
- #106 — [DEMAIN] Setup pubs WC26 (X/Reddit/Google Ads + AdSense)

## 🔑 URLs utiles

- **Site prod** : https://wc26.mehdijabry.dev
- **Pages dashboard** : https://dash.cloudflare.com/?to=/:account/pages/view/wc26-live
- **Worker** : https://wc26-api.nameless-violet-5dc1.workers.dev
- **Supabase** : https://supabase.com/dashboard/project/ssvvojhxyotlbcdosiog
- **GitHub** : https://github.com/mehdijabry/wc26-live
