import { useState } from 'react'
import { QuickFinalePicker } from './QuickFinalePicker'
import { QuickGroupsPicker } from './QuickGroupsPicker'

/**
 * Phase picker hub — landing screen for /predictions.
 *
 * Phases unlock progressively along the WC26 schedule. Two are always
 * open (Groups + Full bracket) since users predict those before kickoff.
 * Every other phase opens the day its previous round ends — so the user
 * predicts the next round after seeing the previous one resolve.
 */

type Phase = {
  id: 'groups' | 'r32' | 'r16' | 'qf' | 'sf' | 'final' | 'full'
  emoji: string
  title: string
  sub: string
  /**
   * ISO date (UTC) the phase unlocks. Past dates = always open
   * (groups, full bracket). Future dates = locked until reached.
   * Computed against the current Date at render time.
   */
  unlockOn: string
  accent: 'gold' | 'silver' | 'bronze' | 'green' | 'red' | 'blue' | 'slate'
}

/**
 * Source for unlock dates: FIFA published WC26 schedule.
 *   Group stage   · Jun 11 → Jun 27, 2026  → R32 unlocks Jun 28
 *   Round of 32   · Jun 28 → Jul 3         → R16 unlocks Jul 4
 *   Round of 16   · Jul 4 → Jul 7          → QF unlocks Jul 9
 *   Quarter-finals · Jul 9 → Jul 11        → SF unlocks Jul 14
 *   Semi-finals   · Jul 14 → Jul 15        → Final unlocks Jul 18
 *   3rd place + Final · Jul 18 → Jul 19
 */
const PHASES: Phase[] = [
  { id: 'groups', emoji: '🌍', title: 'Groups + best thirds', sub: '12 groups · 36 picks',             unlockOn: '2025-01-01', accent: 'slate' },
  { id: 'r32',    emoji: '🏟️', title: 'Round of 32',          sub: '16 matches · the big kick-off',    unlockOn: '2026-06-28', accent: 'green' },
  { id: 'r16',    emoji: '🎯', title: 'Round of 16',          sub: '8 matches · the deciding round',   unlockOn: '2026-07-04', accent: 'blue' },
  { id: 'qf',     emoji: '🔥', title: 'Quarter-finals',       sub: '4 matches · last 8 standing',      unlockOn: '2026-07-09', accent: 'red' },
  { id: 'sf',     emoji: '⚔️', title: 'Semi-finals',          sub: '2 matches · last 4 standing',      unlockOn: '2026-07-14', accent: 'silver' },
  { id: 'final',  emoji: '🏆', title: 'Final + 3rd place',    sub: 'Champion + finalist + 3rd',        unlockOn: '2026-07-18', accent: 'gold' },
  { id: 'full',   emoji: '📋', title: 'Full bracket',         sub: 'Whole tournament · complete poster', unlockOn: '2025-01-01', accent: 'slate' },
]

function isUnlocked(p: Phase, now: Date): boolean {
  return now.getTime() >= new Date(p.unlockOn + 'T00:00:00Z').getTime()
}

function formatUnlockDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function PhasePickerHub({ onFullBracket }: { onFullBracket: () => void }) {
  const [openModal, setOpenModal] = useState<Phase['id'] | null>(null)
  const now = new Date()

  function handleClick(phase: Phase) {
    if (!isUnlocked(phase, now)) return
    if (phase.id === 'full') {
      onFullBracket()
      return
    }
    setOpenModal(phase.id)
  }

  return (
    <section className="container max-w-6xl mx-auto px-6 py-8 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <div className="text-xs uppercase tracking-widest font-mono text-accent-gold mb-2">
          My WC26 predictions
        </div>
        <h1 className="font-display font-bold text-3xl sm:text-4xl text-slate-900">
          Which phase do you want to predict?
        </h1>
        <p className="text-slate-600 mt-2 max-w-2xl">
          Phases unlock as the tournament progresses. Predict groups now, then come back to
          predict each round after the previous one wraps up. Or fill the whole bracket in
          one go for a complete tournament poster.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {PHASES.map((p) => (
          <PhaseCard
            key={p.id}
            phase={p}
            unlocked={isUnlocked(p, now)}
            onClick={() => handleClick(p)}
          />
        ))}
      </div>

      {/* Modal pickers — only the two ready-from-day-1 phases. */}
      <QuickFinalePicker
        open={openModal === 'final'}
        onClose={() => setOpenModal(null)}
      />
      <QuickGroupsPicker
        open={openModal === 'groups'}
        onClose={() => setOpenModal(null)}
      />
    </section>
  )
}

function PhaseCard({
  phase,
  unlocked,
  onClick,
}: {
  phase: Phase
  unlocked: boolean
  onClick: () => void
}) {
  const accentBg = {
    gold: 'bg-amber-50 group-hover:bg-amber-100 border-amber-200',
    silver: 'bg-slate-50 group-hover:bg-slate-100 border-slate-200',
    bronze: 'bg-orange-50 group-hover:bg-orange-100 border-orange-200',
    green: 'bg-emerald-50 group-hover:bg-emerald-100 border-emerald-200',
    red: 'bg-rose-50 group-hover:bg-rose-100 border-rose-200',
    blue: 'bg-sky-50 group-hover:bg-sky-100 border-sky-200',
    slate: 'bg-slate-50 group-hover:bg-slate-100 border-slate-200',
  }[phase.accent]
  const ring = unlocked
    ? 'hover:border-accent-gold hover:shadow-lg cursor-pointer'
    : 'opacity-60 cursor-not-allowed'

  return (
    <button
      onClick={onClick}
      disabled={!unlocked}
      className={
        `group relative rounded-2xl p-4 sm:p-5 border-2 ${accentBg} ${ring} ` +
        'text-left transition-all flex flex-col gap-2 min-h-[140px] sm:min-h-[160px]'
      }
    >
      {!unlocked && (
        <span className="absolute top-2.5 right-2.5 text-[9px] uppercase tracking-widest font-mono text-slate-600 bg-white px-2 py-0.5 rounded-full border border-slate-200 flex items-center gap-1">
          <span aria-hidden>🔒</span> {formatUnlockDate(phase.unlockOn)}
        </span>
      )}
      <div className="text-3xl sm:text-4xl leading-none">{phase.emoji}</div>
      <div className="font-display font-bold text-slate-900 text-base sm:text-lg leading-tight">
        {phase.title}
      </div>
      <div className="text-[11px] sm:text-xs text-slate-600 font-mono mt-auto">
        {phase.sub}
      </div>
      {unlocked && (
        <div className="text-[10px] font-semibold text-accent-gold uppercase tracking-widest mt-1">
          Predict →
        </div>
      )}
    </button>
  )
}
