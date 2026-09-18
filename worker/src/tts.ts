/**
 * Free text-to-speech via Microsoft Edge's Read-Aloud service — the
 * same endpoint the edge-tts ecosystem uses. Called by the admin's
 * Reel composer for the voice-over track (Arabic included, which
 * Workers AI TTS models don't cover).
 *
 * Protocol: outbound WebSocket; send a speech.config JSON message then
 * an SSML message; the service streams binary frames (2-byte header
 * length + ASCII headers + MP3 payload) until a 'turn.end' text frame.
 * Since 2024 the endpoint requires a Sec-MS-GEC token: SHA-256 of
 * (Windows-epoch ticks floored to 5-minute buckets + trusted token).
 */

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const WSS_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const CHROMIUM_FULL_VERSION = '130.0.2849.68'

async function secMsGec(): Promise<string> {
  let ticks = Math.floor(Date.now() / 1000) + 11_644_473_600
  ticks -= ticks % 300 // 5-minute buckets
  const str = `${ticks * 10_000_000}${TRUSTED_CLIENT_TOKEN}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function uuid(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Synthesize `text` with the given Edge voice, returns MP3 bytes. */
export async function edgeTts(text: string, voice: string): Promise<Uint8Array> {
  const gec = await secMsGec()
  const url =
    `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}` +
    `&ConnectionId=${uuid()}`

  const resp = await fetch(url, {
    headers: {
      Upgrade: 'websocket',
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent':
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/${CHROMIUM_FULL_VERSION.split('.')[0]}.0.0.0`,
    },
  })
  const ws = (resp as unknown as { webSocket: WebSocket | null }).webSocket
  if (!ws) throw new Error(`edge-tts upgrade failed: ${resp.status}`)
  ws.accept()

  const requestId = uuid()
  const chunks: Uint8Array[] = []

  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('edge-tts timeout')), 30_000)
    ws.addEventListener('message', (ev: MessageEvent) => {
      const data = ev.data as string | ArrayBuffer
      if (typeof data === 'string') {
        if (data.includes('Path:turn.end')) {
          clearTimeout(timer)
          try { ws.close() } catch { /* already closed */ }
          resolve()
        }
        return
      }
      // Binary frame: [2-byte BE header length][headers][payload]
      const buf = new Uint8Array(data)
      const headerLen = (buf[0] << 8) | buf[1]
      const headers = new TextDecoder().decode(buf.slice(2, 2 + headerLen))
      if (headers.includes('Path:audio')) {
        chunks.push(buf.slice(2 + headerLen))
      }
    })
    ws.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('edge-tts socket error'))
    })
    ws.addEventListener('close', () => {
      clearTimeout(timer)
      // Resolve on clean close even if turn.end was missed.
      resolve()
    })
  })

  const now = new Date().toISOString()
  ws.send(
    `X-Timestamp:${now}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
            outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
          },
        },
      },
    })
  )
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice}'><prosody pitch='+0Hz' rate='+8%' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`
  ws.send(
    `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${now}\r\nPath:ssml\r\n\r\n${ssml}`
  )

  await done
  if (chunks.length === 0) throw new Error('edge-tts returned no audio')
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}
