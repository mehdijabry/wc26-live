/**
 * Get a Google Search Console refresh_token for the admin panel.
 *
 * One-shot script. Run once per Google account that owns the GSC
 * properties you want to access. After running it, paste the output
 * into wrangler secrets:
 *
 *   echo "<refresh_token>" | npx wrangler secret put GSC_REFRESH_TOKEN
 *   echo "<client_id>"     | npx wrangler secret put GSC_CLIENT_ID
 *   echo "<client_secret>" | npx wrangler secret put GSC_CLIENT_SECRET
 *
 * Prerequisites
 * -------------
 *
 * Create an OAuth client of type "Web application" in your Google Cloud
 * project. Steps (~3 min):
 *   1. https://console.cloud.google.com/apis/credentials (pick 'pressing90' project)
 *   2. + CREATE CREDENTIALS → OAuth client ID
 *   3. Application type = Web application
 *   4. Name = 'wc26-gsc-oauth'
 *   5. Authorized redirect URIs → ADD URI → http://localhost:8732/callback
 *   6. CREATE → copy the Client ID + Client secret
 *
 * Usage
 * -----
 *
 *   node scripts/get-gsc-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * The script:
 *   1. Boots an HTTP server on localhost:8732 (callback target)
 *   2. Opens your browser to the Google consent page
 *   3. You sign in with the Google account that owns pressing90.live in GSC
 *   4. Google redirects to localhost with a one-shot 'code'
 *   5. We exchange the code for a refresh_token
 *   6. We print all three secrets ready to paste into wrangler
 *
 * The localhost server lives only for the duration of the auth dance.
 */

import { createServer } from 'node:http'
import { execSync } from 'node:child_process'

const [, , clientId, clientSecret] = process.argv
if (!clientId || !clientSecret) {
  console.error('Usage: node scripts/get-gsc-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>')
  process.exit(1)
}

const REDIRECT_URI = 'http://localhost:8732/callback'
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',     // required to get a refresh_token
    prompt: 'consent',          // force fresh refresh_token even if previously consented
  }).toString()

console.log('\nOpening browser for Google sign-in…')
console.log('If it doesn\'t open, paste this URL into a browser:\n')
console.log(authUrl)
console.log()

// macOS-specific 'open'; falls back to xdg-open on Linux, start on Windows.
try {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  execSync(`${opener} '${authUrl}'`)
} catch { /* user can copy the URL above */ }

const server = createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith('/callback')) {
    res.writeHead(404).end('not found')
    return
  }
  const u = new URL(req.url, 'http://localhost:8732')
  const code = u.searchParams.get('code')
  const err = u.searchParams.get('error')
  if (err) {
    res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }).end(
      `<h1>Auth error</h1><p>${err}</p>`
    )
    console.error('Auth error:', err)
    server.close()
    process.exit(1)
  }
  if (!code) {
    res.writeHead(400).end('missing code')
    return
  }
  // Exchange the code for tokens.
  console.log('Got code, exchanging for refresh_token…')
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  const data = await tokenResp.json()
  if (!data.refresh_token) {
    res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' }).end(
      '<h1>Failed</h1><pre>' + JSON.stringify(data, null, 2) + '</pre>'
    )
    console.error('No refresh_token in response:', data)
    server.close()
    process.exit(1)
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(
    '<h1>Done ✅</h1><p>You can close this tab and go back to your terminal.</p>'
  )
  console.log('\n✨ refresh_token obtained.\n')
  console.log('Run these three commands to push secrets to your worker:\n')
  console.log(`  cd /Users/Mehdi/Desktop/wc2026-hub/worker`)
  console.log(`  echo "${clientId}" | npx wrangler secret put GSC_CLIENT_ID`)
  console.log(`  echo "${clientSecret}" | npx wrangler secret put GSC_CLIENT_SECRET`)
  console.log(`  echo "${data.refresh_token}" | npx wrangler secret put GSC_REFRESH_TOKEN`)
  console.log()
  console.log('Optional: also overwrite GSC_SITE_URL to the URL-prefix property:')
  console.log(`  echo "https://pressing90.live/" | npx wrangler secret put GSC_SITE_URL`)
  console.log()
  server.close()
})

server.listen(8732, () => {
  console.log('Local callback listener on http://localhost:8732 …\n')
})
