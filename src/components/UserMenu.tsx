import { useState } from 'react'
import { useAuth } from '../store/auth'
import { AuthModal } from './AuthModal'

const TIER_COLORS: Record<string, string> = {
  Rookie: 'text-slate-600',
  Amateur: 'text-blue-400',
  Pro: 'text-accent-green',
  Elite: 'text-accent-gold',
  Legend: 'text-yellow-300',
}

export function UserMenu() {
  const { user, profile, signOut, loading } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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
            <div className="font-display font-bold text-lg truncate">{alias}</div>
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

            <button
              onClick={signOut}
              className="mt-4 w-full px-3 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-xs text-slate-600 transition-colors"
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
