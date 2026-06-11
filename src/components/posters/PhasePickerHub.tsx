import { useState } from 'react'
import { QuickFinalePicker } from './QuickFinalePicker'

/**
 * Phase picker hub — the new landing screen for /predictions.
 *
 * Instead of dropping the user straight into the 8-step bracket wizard,
 * we surface 7 cards: one per phase + 'Full bracket'. The user can
 * pick the phase they care about and just predict that phase, then
 * generate a shareable poster. Lower friction = more posters shared.
 *
 * MVP scope: only 'Finale + 3rd place' and 'Full bracket' are wired.
 * The other 5 phases (Groups, R32, R16, QF, SF) are gated behind a
 * 'Bientôt' badge and a soft tooltip. They'll land in a follow-up
 * once we've validated the modal design with the Finale flow.
 */

type Phase = {
  id: 'groups' | 'r32' | 'r16' | 'qf' | 'sf' | 'final' | 'full'
  emoji: string
  title: string
  sub: string
  status: 'ready' | 'soon'
  accent: 'gold' | 'silver' | 'bronze' | 'green' | 'red' | 'blue' | 'slate'
}

const PHASES: Phase[] = [
  { id: 'final', emoji: '🏆', title: 'Finale + 3ᵉ place', sub: 'Champion · Finaliste · 3ᵉ', status: 'ready', accent: 'gold' },
  { id: 'sf', emoji: '⚔️', title: 'Demi-finales', sub: '2 matchs · les 4 dernières', status: 'soon', accent: 'silver' },
  { id: 'qf', emoji: '🔥', title: '1/4 de finale', sub: '4 matchs · les 8 dernières', status: 'soon', accent: 'red' },
  { id: 'r16', emoji: '🎯', title: '1/8 de finale', sub: '8 matchs · le tour clé', status: 'soon', accent: 'blue' },
  { id: 'r32', emoji: '🏟️', title: '1/16 de finale', sub: '16 matchs · le grand début', status: 'soon', accent: 'green' },
  { id: 'groups', emoji: '🌍', title: 'Groupes + meilleurs 3ᵉ', sub: '12 groupes · 36 picks', status: 'soon', accent: 'slate' },
  { id: 'full', emoji: '📋', title: 'Bracket complet', sub: 'Tout le tournoi · poster intégral', status: 'ready', accent: 'slate' },
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
          Mes prédictions WC26
        </div>
        <h1 className="font-display font-bold text-3xl sm:text-4xl text-slate-900">
          Quelle phase tu veux pronostiquer ?
        </h1>
        <p className="text-slate-600 mt-2 max-w-2xl">
          Choisis une phase, fais tes picks, génère ton poster — et partage-le aux potes.
          Tu peux aussi remplir tout le bracket en une fois et avoir un poster intégral.
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
          Bientôt
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
          Pronostiquer →
        </div>
      )}
    </button>
  )
}
