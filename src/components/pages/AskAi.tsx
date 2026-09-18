import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../../lib/api'

/**
 * /ai — full-page conversational assistant for ai.pressing90.live.
 *
 * Architecture is intentionally lean: one input, a scrolling thread, no
 * sidebar / no settings. The chat history is kept client-side; we re-send
 * the last ~20 messages with every turn so the worker can build a fresh
 * prompt without storing any user data.
 *
 * The worker (`/ai/chat`) handles model selection, tool-use orchestration,
 * and brand-voice prompting. This component is purely a chat shell.
 */

type Role = 'user' | 'assistant'

interface ChatMessage {
  role: Role
  content: string
}

const STORAGE_KEY = 'wc26.ai.thread.v1'
const SUGGESTIONS: string[] = [
  'Who won the latest match?',
  "Tell me about Morocco's squad",
  'What\'s the head-to-head between France and Argentina?',
  'Where to watch matches in New York?',
  'Today\'s schedule',
]

function loadThread(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
  } catch { return [] }
}

function saveThread(messages: ChatMessage[]) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30))) } catch { /* quota — ignore */ }
}

export function AskAiPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadThread())
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Set page meta — important for the dedicated subdomain.
  useEffect(() => {
    document.title = 'Ask AI · Pressing 90’ · Pressing 90'
    const desc = 'Conversational World Cup 2026 expert — live scores, head-to-head history, city guides, visa info. Powered by Pressing 90.'
    let m = document.querySelector('meta[name="description"]')
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'description'); document.head.appendChild(m) }
    m.setAttribute('content', desc)
  }, [])

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length, busy])

  // Persist after every change.
  useEffect(() => { saveThread(messages) }, [messages])

  async function send(rawText?: string) {
    const text = (rawText ?? input).trim()
    if (!text || busy) return
    setError(null)
    setInput('')
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setBusy(true)
    try {
      const r = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-20) }),
      })
      if (!r.ok) throw new Error(`API ${r.status}`)
      const data = await r.json() as { reply?: string; error?: string }
      if (data.error) throw new Error(data.error)
      const reply = (data.reply ?? '').trim() || '(Pas de réponse — réessaie autrement ?)'
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
      setMessages((m) => [...m, { role: 'assistant', content: '⚠️ J\'ai eu un souci de connexion. Réessaie ?' }])
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  function clearThread() {
    if (!confirm('Effacer la conversation ?')) return
    setMessages([])
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }

  return (
    <div className="min-h-svh flex flex-col bg-paper">
      {/* Header */}
      <header
        className="sticky top-0 z-20 backdrop-blur-xl bg-paper/90 border-b border-slate-200"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <a href="https://pressing90.live" className="flex items-center gap-2.5 min-w-0">
            <img src="/p90-logo.svg" alt="" className="w-8 h-8 shrink-0" />
            <div className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-500">Pressing 90 · AI</div>
              <div className="font-display font-bold text-slate-900 text-sm truncate">
                Ask the WC<span className="text-accent-gold">26</span> Assistant
              </div>
            </div>
          </a>
          {messages.length > 0 && (
            <button
              onClick={clearThread}
              className="shrink-0 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-mono text-slate-600"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      {/* Thread */}
      <main ref={scrollerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-10">
              <img src="/p90-logo.svg" alt="" className="w-20 h-20 mx-auto mb-5 opacity-80" />
              <h1 className="font-display font-bold text-2xl text-slate-900 mb-2">
                Ask anything about <span className="text-accent-gold">WC26</span>
              </h1>
              <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                Live scores, team histories, city guides, head-to-head records. I pull from real-time feeds + curated tournament data.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="px-3 py-1.5 rounded-full bg-white border border-slate-200 hover:border-slate-400 text-xs text-slate-700 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-slate-500 text-sm pl-2">
              <span className="w-2 h-2 rounded-full bg-accent-gold animate-pulse" />
              <span className="w-2 h-2 rounded-full bg-accent-gold animate-pulse" style={{ animationDelay: '0.15s' }} />
              <span className="w-2 h-2 rounded-full bg-accent-gold animate-pulse" style={{ animationDelay: '0.3s' }} />
            </div>
          )}
          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 px-3 py-2 rounded">
              {error}
            </div>
          )}
        </div>
      </main>

      {/* Composer */}
      <footer
        className="sticky bottom-0 z-20 bg-paper/95 backdrop-blur-xl border-t border-slate-200"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder="Ask about a match, a team, a city…"
            rows={1}
            disabled={busy}
            className="flex-1 resize-none px-4 py-3 rounded-2xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-accent-gold/40 text-sm leading-snug max-h-32 disabled:opacity-50"
            style={{ minHeight: 44 }}
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            className="shrink-0 h-11 w-11 rounded-full bg-ink-900 text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l14-7-5 14-3-6-6-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-2 text-center text-[10px] font-mono text-slate-400">
          Powered by Pressing 90 · Live data + curated WC26 knowledge · Beta
        </div>
      </footer>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={'flex ' + (isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={
          'max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ' +
          (isUser
            ? 'bg-ink-900 text-white rounded-br-sm'
            : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm')
        }
      >
        {renderWithLinks(message.content)}
      </div>
    </div>
  )
}

/** Linkify pressing90.live URLs in the response so they're clickable. */
function renderWithLinks(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /(https?:\/\/[^\s)]+)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <a
        key={m.index}
        href={m[0]}
        target={m[0].startsWith('https://pressing90.live') ? '_self' : '_blank'}
        rel="noopener noreferrer"
        className="underline decoration-accent-gold underline-offset-2 hover:text-slate-900"
      >
        {m[0].replace(/^https?:\/\//, '')}
      </a>
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
