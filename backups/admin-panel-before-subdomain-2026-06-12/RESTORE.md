# Restore admin panel to pre-subdomain state

## Option A — git tag (recommended)
```bash
cd /Users/Mehdi/Desktop/wc2026-hub
git checkout pre-admin-subdomain-2026-06-12 -- \
  src/components/pages/AdminPanel.tsx \
  src/App.tsx \
  index.html \
  public/manifest.json \
  public/admin-manifest.json \
  public/_headers \
  worker/src/
git commit -m "restore: revert admin to pre-subdomain state"
git push
cd worker && npx wrangler deploy
```

## Option B — files in this folder
Each file in this directory mirrors the layout of the repo. Copy back over
the live tree if the git tag is gone for some reason.

## What this snapshot does NOT contain
- Cloudflare Pages "custom domain" settings (manual UI step)
- Cloudflare Worker secrets (ADMIN_PASSWORD_HASH etc. — never committed)
- Supabase config (admin panel does not use Supabase auth)

The path-based admin URL `pressing90.live/admin-panel-1992` STAYS working
even after the subdomain migration — the subdomain is purely additive.
