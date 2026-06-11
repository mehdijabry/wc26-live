import { useState } from 'react'
import { QuickFinalePicker } from './QuickFinalePicker'

/**
 * Phase picker hub — landing screen for /predictions.
 *
 * Instead of dropping the user straight into the 8-step bracket wizard,
 * we surface 7 cards: one per phase + 'Full bracket'. The user can
 * pick the phase they care about and just predict that phase, then
 * generate a shareable poster. Lower friction = more posters shared.
 *
 * MVP scope: only 'Final + 3rd place' and 'Full bracket' are wired.
 * The other 5 phases are gated behind a 'Coming soon' badge.
 */

type Phase = {
  id: 'groups' | 'r32' | 'r16' | 'qf' | 'sf' | 'final' | 'full'
  emoji: string
  title: string
  sub: string
  status: 'ready' | 'soon'
  accent: 'gold' | 'silver' | 'bronze' | 'green' | 'red' | 'blue' | 'slate'
}

// Order MATTERS — follows the actual tournament progression
// (group stage → R32 → ... → final). A tournament never starts with
// the final, so the picker shouldn't either. The 'Final + 3rd place'
// shortcut sits at the bottom near the full bracket option, framed as
// a quick way to share your champion pick without filling everything.
const PHASES: Phase[] = [
  { id: 'groups', emoji: '🌍', title: 'Groups + best thirds', sub: '12 groups · 36 picks', status: 'soon', accent: 'slate' },
  { id: 'r32', emoji: '🏟️', title: 'Round of 32', sub: '16 matches · the big kick-off', status: 'soon', accent: 'green' },
  { id: 'r16', emoji: '🎯', title: 'Round of 16', sub: '8 matches · the deciding round', status: 'soon', accent: 'blue' },
  { id: 'qf', emoji: '🔥', title: 'Quarter-finals', sub: '4 matches · last 8 standing', status: 'soon', accent: 'red' },
  { id: 'sf', emoji: '⚔️', title: 'Semi-finals', sub: '2 matches · last 4 standing', status: 'soon', accent: 'silver' },
  { id: 'final', emoji: '🏆', title: 'Final + 3rd place', sub: 'Just your champion + finalist + 3rd', status: 'ready', accent: 'gold' },
  { id: 'full', emoji: '📋', title: 'Full bracket', sub: 'Whole tournament · complete poster', status: 'ready', accent: 'slate' },
]

export function PhasePickerHub({ onFullBracket }: { onFullBracket: () => void }) {
  const [openModal, setOpenModal] = useState<Phase['id'] | null>(null)

  function handleClick(phase: Phase) {
    if (phase.status === 'soon') return
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
          Pick a phase, lock in your picks, generate your poster — and share it with friends.
          Or fill the whole bracket in one go for a complete tournament poster.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {PHASES.map((p) => (
          <PhaseCard key={p.id} phase={p} onClick={() => handleClick(p)} />
        ))}
      </div>

      {/* Modal pickers — one per ready phase. */}
      <QuickFinalePicker
        open={openModal === 'final'}
        onClose={() => setOpenModal(null)}
      />
    </section>
  )
}

function PhaseCard({ phase, onClick }: { phase: Phase; onClick: () => void }) {
  const ready = phase.status === 'ready'
  const accentBg = {
    gold: 'bg-amber-50 group-hover:bg-amber-100 border-amber-200',
    silver: 'bg-slate-50 group-hover:bg-slate-100 border-slate-200',
    bronze: 'bg-orange-50 group-hover:bg-orange-100 border-orange-200',
    green: 'bg-emerald-50 group-hover:bg-emerald-100 border-emerald-200',
    red: 'bg-rose-50 group-hover:bg-rose-100 border-rose-200',
    blue: 'bg-sky-50 group-hover:bg-sky-100 border-sky-200',
    slate: 'bg-slate-50 group-hover:bg-slate-100 border-slate-200',
  }[phase.accent]
  const ring = ready
    ? 'hover:border-accent-gold hover:shadow-lg cursor-pointer'
    : 'opacity-75 cursor-not-allowed'

  return (
    <button
      onClick={onClick}
      disabled={!ready}
      className={
        `group relative rounded-2xl p-4 sm:p-5 border-2 ${accentBg} ${ring} ` +
        'text-left transition-all flex flex-col gap-2 min-h-[140px] sm:min-h-[160px]'
      }
    >
      {!ready && (
        <span className="absolute top-2.5 right-2.5 text-[9px] uppercase tracking-widest font-mono text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
          Soon
        </span>
      )}
      <div className="text-3xl sm:text-4xl leading-none">{phase.emoji}</div>
      <div className="font-display font-bold text-slate-900 text-base sm:text-lg leading-tight">
        {phase.title}
      </div>
      <div className="text-[11px] sm:text-xs text-slate-600 font-mono mt-auto">
        {phase.sub}
      </div>
      {ready && (
        <div className="text-[10px] font-semibold text-accent-gold uppercase tracking-widest mt-1">
          Predict →
        </div>
      )}
    </button>
  )
}
