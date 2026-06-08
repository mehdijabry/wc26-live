import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../store/auth'
import { useBracket } from '../store/bracket'
import { AuthModal } from './AuthModal'

const TIER_COLORS: Record<string, string> = {
  Rookie: 'text-slate-600',
  Amateur: 'text-blue-400',
  Pro: 'text-accent-green',
  Elite: 'text-accent-gold',
  Legend: 'text-yellow-300',
}

export function UserMenu() {
  const { user, profile, signOut, loading, updateAlias } = useAuth()
  const isPublished = useBracket((s) => s.isPublished)
  const shareSlug = useBracket((s) => s.shareSlug)
  const loadBracket = useBracket((s) => s.load)
  const [modalOpen, setModalOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pull bracket state on login so we know whether to show the
  // "View my public bracket" link in the dropdown.
  useEffect(() => {
    if (user) void loadBracket()
  }, [user, loadBracket])

  async function saveAlias() {
    const v = draft.trim()
    if (!v) { setError('Choose a name'); return }
    if (v.length < 2 || v.length > 20) { setError('2–20 characters'); return }
    if (!/^[a-zA-Z0-9_-]+$/.test(v)) { setError('Letters, numbers, _ or - only'); return }
    setBusy(true)
    setError(null)
    const r = await updateAlias(v)
    setBusy(false)
    if (r.error) { setError(r.error); return }
    setEditing(false)
  }

  if (loading) {
    return <div className="w-24 h-8 rounded-full bg-slate-100 animate-pulse" />
  }

  if (!user) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-1.5 rounded-full bg-accent-gold text-ink-900 text-sm font-semibold hover:bg-yellow-300 transition-colors"
        >
          Sign in
        </button>
        <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    )
  }

  const alias = profile?.alias ?? 'fan'
  const tier = profile?.tier ?? 'Rookie'

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full glass glass-hover text-sm"
      >
        <span className="w-6 h-6 rounded-full bg-accent-gold/20 text-accent-gold flex items-center justify-center text-xs font-bold">
          {alias.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden sm:block max-w-[100px] truncate">{alias}</span>
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-64 glass rounded-2xl p-4 z-40 ring-glow">
            <div className="text-xs uppercase tracking-widest text-slate-500 font-mono mb-1">
              Signed in as
            </div>
            {editing ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveAlias()
                      if (e.key === 'Escape') { setEditing(false); setError(null) }
                    }}
                    placeholder="your_alias"
                    className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-300 text-sm font-display font-bold focus:outline-none focus:ring-2 focus:ring-accent-gold/40"
                    maxLength={20}
                  />
                  <button
                    onClick={saveAlias}
                    disabled={busy}
                    className="px-2.5 py-1 rounded bg-accent-gold text-ink-900 text-xs font-semibold disabled:opacity-40"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => { setEditing(false); setError(null) }}
                    className="px-2 py-1 rounded text-slate-500 hover:bg-slate-100 text-xs"
                    title="Cancel"
                  >
                    ×
                  </button>
                </div>
                {error && <div className="text-[10px] text-red-500 font-mono">{error}</div>}
                <div className="text-[10px] text-slate-400 font-mono">
                  2-20 chars · letters, numbers, _ or -
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="font-display font-bold text-lg truncate flex-1">{alias}</div>
                <button
                  onClick={() => { setDraft(alias); setEditing(true); setError(null) }}
                  aria-label="Edit alias"
                  className="shrink-0 w-6 h-6 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center text-xs transition-colors"
                  title="Edit your alias"
                >
                  ✏️
                </button>
              </div>
            )}
            <div className={`text-xs font-mono mt-0.5 ${TIER_COLORS[tier]}`}>
              {tier} tier
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
              <Stat label="Points" value={profile?.total_points ?? 0} />
              <Stat label="Picks" value={profile?.resolved_predictions ?? 0} suffix={`/ ${profile?.total_predictions ?? 0}`} />
              <Stat label="Accuracy" value={`${profile?.accuracy_pct ?? 0}%`} />
            </div>

            <div className="mt-3 text-[11px] text-slate-500 font-mono flex items-center justify-between">
              <span>🔥 streak {profile?.current_streak ?? 0}</span>
              <span>★ best {profile?.best_streak ?? 0}</span>
            </div>

            {/* Quick links — surface the user's own bracket so they
                can actually find what they published. */}
            <div className="mt-4 space-y-1.5">
              <Link
                to="/bracket"
                onClick={() => setMenuOpen(false)}
                className="block w-full px-3 py-2 rounded-lg bg-accent-gold/10 hover:bg-accent-gold/20 text-xs text-slate-800 transition-colors"
              >
                🏆 My bracket
              </Link>
              {isPublished && shareSlug && (
                <Link
                  to={`/u/${shareSlug}`}
                  onClick={() => setMenuOpen(false)}
                  className="block w-full px-3 py-2 rounded-lg bg-accent-green/10 hover:bg-accent-green/20 text-xs text-slate-800 transition-colors"
                >
                  🌍 View my public profile <span className="text-slate-500 font-mono">/u/{shareSlug}</span>
                </Link>
              )}
            </div>

            <button
              onClick={signOut}
              className="mt-3 w-full px-3 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-xs text-slate-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <div className="font-display font-bold text-base text-slate-900 tabular-nums">
        {value}
        {suffix && <span className="text-[10px] text-slate-500 ml-1">{suffix}</span>}
      </div>
      <div className="text-[9px] uppercase tracking-widest text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}
