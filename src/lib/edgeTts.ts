/**
 * Edge TTS from the BROWSER — the worker-side version gets 403'd
 * (Microsoft blocks datacenter IPs, same as ESPN/Akamai), but the
 * admin operator's residential IP is fine, and WebSockets aren't
 * subject to CORS. Same protocol as worker/src/tts.ts.
 */

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const CHROMIUM_FULL_VERSION = '130.0.2849.68'

async function secMsGec(): Promise<string> {
  let ticks = Math.floor(Date.now() / 1000) + 11_644_473_600
  ticks -= ticks % 300
  const str = `${ticks * 10_000_000}${TRUSTED_CLIENT_TOKEN}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

const uuid = () => crypto.randomUUID().replace(/-/g, '')
const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function edgeTtsBrowser(text: string, voice: string): Promise<ArrayBuffer> {
  const gec = await secMsGec()
  const url =
    `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}` +
    `&ConnectionId=${uuid()}`

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    const chunks: Uint8Array[] = []
    const timer = setTimeout(() => { try { ws.close() } catch { /* noop */ } reject(new Error('edge-tts timeout')) }, 30_000)

    const finish = () => {
      clearTimeout(timer)
      if (chunks.length === 0) { reject(new Error('edge-tts: no audio received')); return }
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const out = new Uint8Array(total)
      let off = 0
      for (const c of chunks) { out.set(c, off); off += c.length }
      resolve(out.buffer)
    }

    ws.onopen = () => {
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
      ws.send(`X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${now}\r\nPath:ssml\r\n\r\n${ssml}`)
    }

    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === 'string') {
        if (ev.data.includes('Path:turn.end')) { try { ws.close() } catch { /* noop */ } finish() }
        return
      }
      const buf = new Uint8Array(ev.data as ArrayBuffer)
      const headerLen = (buf[0] << 8) | buf[1]
      const headers = new TextDecoder().decode(buf.slice(2, 2 + headerLen))
      if (headers.includes('Path:audio')) chunks.push(buf.slice(2 + headerLen))
    }

    ws.onerror = () => { clearTimeout(timer); reject(new Error('edge-tts websocket error (réseau ou blocage Microsoft)')) }
    ws.onclose = () => { if (chunks.length > 0) finish() }
  })
}
