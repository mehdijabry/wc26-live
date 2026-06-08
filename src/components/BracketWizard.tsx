import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { useBracket, koMatchIds, type GroupLetter } from '../store/bracket'
import { useAuth } from '../store/auth'
import { useLiveBracketData, type LiveTeam } from '../lib/liveBracket'
import {
  R32_TEMPLATE,
  R16_TEMPLATE,
  QF_TEMPLATE,
  SF_TEMPLATE,
  resolveSlot,
  solveThirdPlaceAssignment,
  buildThirdGroupMap,
} from '../lib/fifaBracket'
import { SectionHeader } from './Groups'
import { LottieLoader } from './LottieLoader'
import { BracketPoster } from './BracketPoster'
import { cn } from '../lib/utils'

// Local alias so the per-step code reads cleanly.
type Team = LiveTeam

/**
 * Compact team logo — replaces the legacy emoji `{t.flag}` spans. Uses
 * the ESPN logo URL with a flagcdn fallback baked into the lookup.
 */
function Flag({ team, size = 'md' }: { team: Pick<LiveTeam, 'logo' | 'code'> | null | undefined; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const cls = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : size === 'xl' ? 'w-9 h-9' : 'w-5 h-5'
  if (!team) return <span className={cls + ' inline-block rounded-full bg-slate-200'} />
  if (!team.logo) return <span className={cls + ' inline-flex items-center justify-center text-base'}>🏳️</span>
  return (
    <img
      src={team.logo}
      alt=""
      loading="lazy"
      className={cls + ' object-contain shrink-0'}
      onError={(e) => (e.currentTarget.style.display = 'none')}
    />
  )
}

type Step = 'groups' | 'thirds' | 'r32' | 'r16' | 'qf' | 'sf' | 'final' | 'export'

const STEP_ORDER: Step[] = ['groups', 'thirds', 'r32', 'r16', 'qf', 'sf', 'final', 'export']
const STEP_LABEL: Record<Step, string> = {
  groups: 'Group standings',
  thirds: 'Best 3rd-placed',
  r32:    'Round of 32',
  r16:    'Round of 16',
  qf:     'Quarter-finals',
  sf:     'Semi-finals',
  final:  '3rd & Final',
  export: 'Publish & export',
}

const GROUPS: GroupLetter[] = ['A','B','C','D','E','F','G','H','I','J','K','L']

export function BracketWizard() {
  const [step, setStep] = useState<Step>('groups')
  const stepIdx = STEP_ORDER.indexOf(step)
  const { user } = useAuth()
  const bracket = useBracket()
  const groupStandings = bracket.groupStandings
  const thirdPlaceAdvancing = bracket.thirdPlaceAdvancing
  const koWinners = bracket.koWinners
  const finalWinner = bracket.finalWinner
  const thirdPlaceWinner = bracket.thirdPlaceWinner

  // Pull saved bracket from Supabase the moment the wizard mounts (once
  // per session). Previously this only fired in StepExport, so a user
  // visiting /bracket fresh saw an empty state instead of their saved
  // picks. Cloud > localStorage when both exist for a logged-in user.
  const loadedRef = useRef(false)
  useEffect(() => {
    if (!user || loadedRef.current) return
    loadedRef.current = true
    void bracket.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Auto-save (debounced 1.5s) on any state change while logged in. Drops
  // the need to remember pressing the Save button — every nudge of a team
  // arrow or KO winner click silently persists to Supabase. The Save
  // button in StepExport still works for manual confirmation.
  useEffect(() => {
    if (!user || !loadedRef.current) return
    const t = setTimeout(() => { void bracket.save() }, 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, groupStandings, thirdPlaceAdvancing, koWinners, finalWinner, thirdPlaceWinner])

  return (
    <section id="bracket-predict" className="py-20 sm:py-28 border-t border-slate-200/70">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="full-bracket prediction"
          title="Pick the entire tournament"
          sub="Rank every group, choose the 8 best third-placed teams, then click your winner all the way to the final. Export your bracket as a PNG, publish it to your profile, share with friends."
        />

        {/* Stepper */}
        <div className="mt-8 flex flex-wrap gap-1.5 mb-8">
          {STEP_ORDER.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-mono transition-colors flex items-center gap-2',
                step === s
                  ? 'bg-accent-gold text-ink-900 font-semibold'
                  : i < stepIdx
                    ? 'glass text-accent-green'
                    : 'glass glass-hover text-slate-600'
              )}
            >
              <span>{i + 1}</span>
              <span className="hidden sm:inline">{STEP_LABEL[s]}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {step === 'groups' && <StepGroups />}
            {step === 'thirds' && <StepThirds />}
            {step === 'r32'    && <StepKo stage="R32" titleHint="Click the team you think advances. Matchups follow the FIFA WC26 bracket template." />}
            {step === 'r16'    && <StepKo stage="R16" />}
            {step === 'qf'     && <StepKo stage="QF" />}
            {step === 'sf'     && <StepKo stage="SF" />}
            {step === 'final'  && <StepFinal />}
            {step === 'export' && <StepExport />}
          </motion.div>
        </AnimatePresence>

        {/* Nav buttons */}
        <div className="mt-8 flex items-center justify-between">
          <button
            disabled={stepIdx === 0}
            onClick={() => setStep(STEP_ORDER[Math.max(0, stepIdx - 1)])}
            className="px-4 py-2 rounded-full glass glass-hover text-sm disabled:opacity-30"
          >
            ← Back
          </button>
          <button
            disabled={stepIdx === STEP_ORDER.length - 1}
            onClick={() => setStep(STEP_ORDER[Math.min(STEP_ORDER.length - 1, stepIdx + 1)])}
            className="px-5 py-2 rounded-full bg-accent-gold text-ink-900 text-sm font-semibold disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Step 1 — Group standings (rank 1st, 2nd, 3rd, 4th per group)               */
/* -------------------------------------------------------------------------- */

function StepGroups() {
  const { groupStandings, setGroupRank } = useBracket()
  const { liveGroups, lookup, ready } = useLiveBracketData()
  const filled = GROUPS.filter((g) => (groupStandings[g]?.length ?? 0) === 4).length

  if (!ready) {
    return (
      <div className="glass rounded-2xl py-12 flex flex-col items-center justify-center">
        <LottieLoader name="ball-kick" size={100} caption="Fetching the draw from ESPN…" />
      </div>
    )
  }

  return (
    <div>
      <div className="text-xs text-slate-500 mb-4 font-mono">
        {filled} / 12 groups ranked · ESPN live data
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {GROUPS.map((letter) => (
          <GroupRanker
            key={letter}
            letter={letter}
            value={groupStandings[letter] ?? []}
            codes={liveGroups[letter]}
            lookup={lookup}
            onChange={(o) => setGroupRank(letter, o)}
          />
        ))}
      </div>
    </div>
  )
}

function GroupRanker({
  letter, value, codes, lookup, onChange,
}: {
  letter: GroupLetter
  value: string[]
  codes: string[]
  lookup: (code: string | undefined | null) => Team | undefined
  onChange: (o: string[]) => void
}) {
  // GUARD: a previously-saved ranking is only valid if its team set is
  // EXACTLY the live group's team set. Otherwise we fall back to the
  // live ESPN order. This used to be `value.length === 4 ? value : codes`
  // which silently kept stale picks across data refreshes — e.g. a user
  // who ranked Group A back when our derivation incorrectly placed
  // Morocco there would keep seeing Morocco in Group A even after the
  // groups were fixed. The validity check below uses set equality, so
  // a single mismatched team forces a reset.
  const liveSet = new Set(codes)
  const savedSet = new Set(value)
  const sameTeams =
    value.length === 4 &&
    codes.length === 4 &&
    value.every((c) => liveSet.has(c)) &&
    codes.every((c) => savedSet.has(c))
  const ranked = sameTeams ? value : codes

  // If we had to drop a stale ranking, persist the reset so the rest of
  // the wizard (best-3rd / R32 / etc.) doesn't see ghost codes.
  if (!sameTeams && value.length === 4) {
    // Defer to avoid setting state during render
    queueMicrotask(() => onChange([]))
  }

  const tone: Record<number, string> = { 0: 'border-accent-gold/40', 1: 'border-accent-green/40', 2: 'border-yellow-700/30', 3: 'border-red-900/30' }
  const tag: Record<number, string> = { 0: '1st', 1: '2nd', 2: '3rd', 3: '4th' }

  function move(idx: number, dir: -1 | 1) {
    const arr = [...ranked]
    const swap = idx + dir
    if (swap < 0 || swap >= arr.length) return
    ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    onChange(arr)
  }

  return (
    <div className="glass rounded-2xl p-4">
      <div className="font-display font-bold text-lg mb-3">
        Group <span className="text-accent-gold">{letter}</span>
      </div>
      <div className="space-y-1.5">
        {ranked.map((code, i) => {
          const t = lookup(code)
          if (!t) return null
          return (
            <div key={code} className={cn('flex items-center gap-3 px-3 py-2 rounded-lg border bg-slate-50', tone[i])}>
              <span className="text-[10px] font-mono w-6 text-slate-500">{tag[i]}</span>
              <Flag team={t} />
              <span className="text-sm flex-1 truncate">{t.name}</span>
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-500 hover:text-slate-900 text-xs leading-none disabled:opacity-20">▲</button>
                <button onClick={() => move(i, +1)} disabled={i === 3} className="text-slate-500 hover:text-slate-900 text-xs leading-none disabled:opacity-20">▼</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Step 2 — Best 3rd-placed teams (multi-select 8/12)                         */
/* -------------------------------------------------------------------------- */

function StepThirds() {
  const { groupStandings, thirdPlaceAdvancing, toggleThirdAdvancing } = useBracket()
  const { lookup } = useLiveBracketData()
  const thirds = GROUPS.map((letter) => {
    const standings = groupStandings[letter]
    if (!standings || standings.length < 3) return null
    const code = standings[2]
    const t = lookup(code)
    return t ? { letter, t } : null
  }).filter(Boolean) as Array<{ letter: GroupLetter; t: Team }>

  // GUARD: purge entries in thirdPlaceAdvancing that no longer correspond
  // to a current 3rd-placed team. Stale picks from a previous ranking
  // pinned the count at 8 → the disabled={max} guard then blocked the
  // user from making any new selection ("I can only select Ivory Coast
  // and Senegal" was the symptom).
  const validThirdCodes = new Set(thirds.map((t) => t.t.code))
  useEffect(() => {
    const stale = thirdPlaceAdvancing.filter((c) => !validThirdCodes.has(c))
    if (stale.length === 0) return
    // Deselect each stale code so the count goes back to "real picks"
    stale.forEach((c) => toggleThirdAdvancing(c))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thirdPlaceAdvancing.join(','), Array.from(validThirdCodes).sort().join(',')])

  // Only count picks that are still valid for the cap logic.
  const validPicked = thirdPlaceAdvancing.filter((c) => validThirdCodes.has(c))

  return (
    <div>
      <div className="text-xs text-slate-500 mb-4 font-mono">
        Select <span className="text-accent-gold">8 of 12</span> best third-placed teams that will advance to the Round of 32.
        Currently picked: <span className="text-slate-900">{validPicked.length}</span>
      </div>
      {thirds.length < 12 && (
        <div className="glass rounded-xl p-4 mb-4 text-xs text-yellow-300">
          Finish ranking all 12 groups first — {12 - thirds.length} groups still need their third-placed team picked.
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {thirds.map(({ letter, t }) => {
          const picked = thirdPlaceAdvancing.includes(t.code)
          const max = validPicked.length >= 8 && !picked
          return (
            <button
              key={t.code}
              disabled={max}
              onClick={() => toggleThirdAdvancing(t.code)}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all',
                picked
                  ? 'bg-accent-gold/10 border-accent-gold/40 ring-1 ring-accent-gold/30'
                  : 'glass glass-hover border-transparent',
                max ? 'opacity-30' : ''
              )}
            >
              <span className="text-[10px] font-mono text-slate-500 w-6">3{letter}</span>
              <Flag team={t} size="md" />
              <span className="text-xs flex-1 truncate">{t.name}</span>
              {picked && <span className="text-accent-gold text-xs">✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Step 3-6 — Generic KO step (R32, R16, QF, SF)                              */
/* -------------------------------------------------------------------------- */

function StepKo({ stage, titleHint }: { stage: 'R32' | 'R16' | 'QF' | 'SF'; titleHint?: string }) {
  const ids = koMatchIds(stage)
  const { koWinners, setKoWinner } = useBracket()
  const pairs = useDerivedKoPairs(stage)

  return (
    <div>
      {titleHint && <div className="text-xs text-slate-500 mb-4 font-mono">{titleHint}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ids.map((mid, i) => {
          const [a, b] = pairs[i] ?? [null, null]
          const pick = koWinners[mid]
          return (
            <div key={mid} className="glass rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
                {stage} · M{i + 1}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <KoSide team={a} selected={pick === a?.code} onClick={() => a && setKoWinner(mid, a.code)} />
                <KoSide team={b} selected={pick === b?.code} onClick={() => b && setKoWinner(mid, b.code)} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KoSide({ team, selected, onClick }: { team: Team | null; selected: boolean; onClick: () => void }) {
  if (!team) {
    return <div className="px-3 py-3 rounded-lg bg-slate-50 text-xs text-slate-600 font-mono">TBD</div>
  }
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors',
        selected
          ? 'bg-accent-gold/15 ring-1 ring-accent-gold/40'
          : 'bg-slate-50 hover:bg-white/[0.06]'
      )}
    >
      <Flag team={team} size="lg" />
      <span className="text-sm flex-1 truncate text-left">{team.name}</span>
      {selected && <span className="text-accent-gold text-xs">✓</span>}
    </button>
  )
}

/**
 * Derive the matchups for a given KO stage from previous picks.
 * R32: zip top-2 from groups + 8 best thirds (simplified: A1 v B2 etc).
 * R16+: zip winners of previous stage in order.
 */
/**
 * Build the matchups for any KO stage using the FIFA WC26 deterministic
 * template (src/lib/fifaBracket.ts) instead of the previous naive
 * sequential pairing.
 *
 * The old logic paired pool[0]vs pool[1], pool[2]vspool[3], … which paid
 * no attention to which group each team came from. That's why Brazil
 * (Group D 1st) was meeting Morocco (Group D 3rd) in R32 — both ended up
 * adjacent in the pool. FIFA's bracket explicitly forbids same-group
 * matchups in R32, so we encode the real M73-M88 template.
 *
 * For the 3rd-place slots ('3-ABCDF' etc.), we solve a bipartite match
 * between the user's 8 advancing 3rds and the 8 slots that need one,
 * respecting each slot's allowed-groups set (FIFA's Annex C 495 scenarios).
 */
function useDerivedKoPairs(stage: 'R32' | 'R16' | 'QF' | 'SF'): Array<[Team | null, Team | null]> {
  const { groupStandings, thirdPlaceAdvancing, koWinners } = useBracket()
  const { lookup } = useLiveBracketData()

  return useMemo(() => {
    if (stage === 'R32') {
      // Map each 3rd-placed team code → its group letter
      const thirdGroupMap = buildThirdGroupMap(groupStandings)
      // Solve which advancing 3rd goes to which R32 slot
      const thirdAssignment = solveThirdPlaceAssignment(
        thirdPlaceAdvancing,
        (code) => thirdGroupMap.get(code)
      )
      // Walk the 16 R32 slots in template order
      return R32_TEMPLATE.map<[Team | null, Team | null]>((slot) => {
        const homeCode = resolveSlot(slot.home, groupStandings, thirdAssignment, slot.id)
        const awayCode = resolveSlot(slot.away, groupStandings, thirdAssignment, slot.id)
        return [
          homeCode ? lookup(homeCode) ?? null : null,
          awayCode ? lookup(awayCode) ?? null : null,
        ]
      })
    }

    // R16 / QF / SF: each match consumes 2 specific upstream winners
    // (per FIFA template), not a sequential zip.
    const template =
      stage === 'R16' ? R16_TEMPLATE :
      stage === 'QF'  ? QF_TEMPLATE  :
                        SF_TEMPLATE
    return template.map<[Team | null, Team | null]>((m) => {
      const [sa, sb] = m.sources
      const wa = koWinners[sa]
      const wb = koWinners[sb]
      return [
        wa ? lookup(wa) ?? null : null,
        wb ? lookup(wb) ?? null : null,
      ]
    })
  }, [stage, groupStandings, thirdPlaceAdvancing, koWinners, lookup])
}

/* -------------------------------------------------------------------------- */
/* Step 7 — 3rd place playoff + Final                                         */
/* -------------------------------------------------------------------------- */

function StepFinal() {
  const { koWinners, setKoWinner, setThirdPlaceWinner, setFinalWinner, thirdPlaceWinner, finalWinner } = useBracket()
  const { lookup } = useLiveBracketData()
  const sfWinners = koMatchIds('SF').map((id) => koWinners[id])
  // SF losers (3rd place playoff)
  const sfLosers = useMemo(() => {
    const losers: string[] = []
    koMatchIds('SF').forEach((mid) => {
      const winner = koWinners[mid]
      // We don't track losers explicitly — but the SF matchup pairs are known
      // For v1, we recompute from previous stage:
      // We'll derive in component below from useDerivedKoPairs
      void mid; void winner
    })
    return losers
  }, [koWinners])
  void sfLosers

  // Use the derived pairs for SF to know who lost
  const sfPairs = useDerivedKoPairs('SF')
  const losers: Team[] = sfPairs
    .map(([a, b], i) => {
      const w = sfWinners[i]
      if (!w || !a || !b) return null
      return w === a.code ? b : a
    })
    .filter(Boolean) as Team[]

  const finalists: Team[] = sfWinners.map((c) => (c ? lookup(c) ?? null : null)).filter(Boolean) as Team[]

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">3rd-place playoff</div>
        <div className="glass rounded-xl p-3 grid grid-cols-2 gap-2">
          {losers.length === 0 && <div className="col-span-2 text-xs text-slate-500">Finish the semi-finals first.</div>}
          {losers.map((t) => (
            <button
              key={t.code}
              onClick={() => { setKoWinner('TP-1', t.code); setThirdPlaceWinner(t.code) }}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors',
                thirdPlaceWinner === t.code ? 'bg-orange-600/15 ring-1 ring-orange-500/40' : 'bg-slate-50 hover:bg-white/[0.06]'
              )}
            >
              <Flag team={t} size="lg" />
              <span className="text-sm flex-1 truncate text-left">{t.name}</span>
              {thirdPlaceWinner === t.code && <span className="text-orange-400 text-xs">🥉</span>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-accent-gold font-mono mb-2">Final · MetLife Stadium</div>
        <div className="glass rounded-xl p-3 grid grid-cols-2 gap-2">
          {finalists.length === 0 && <div className="col-span-2 text-xs text-slate-500">Finish the semi-finals first.</div>}
          {finalists.map((t) => (
            <button
              key={t.code}
              onClick={() => { setKoWinner('FINAL-1', t.code); setFinalWinner(t.code) }}
              className={cn(
                'flex items-center gap-3 px-4 py-4 rounded-xl transition-colors',
                finalWinner === t.code ? 'bg-gradient-to-br from-accent-gold/25 to-yellow-700/10 ring-2 ring-accent-gold/50' : 'bg-slate-50 hover:bg-white/[0.06]'
              )}
            >
              <Flag team={t} size="xl" />
              <span className="text-base font-display font-bold flex-1 text-left">{t.name}</span>
              {finalWinner === t.code && <span className="text-accent-gold text-2xl">🏆</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Step 8 — Export, publish, share                                            */
/* -------------------------------------------------------------------------- */

function StepExport() {
  const { user, profile } = useAuth()
  const bracket = useBracket()
  const [busy, setBusy] = useState<null | 'png' | 'save' | 'pub'>(null)
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({})
  const ref = useRef<HTMLDivElement>(null)

  // Auto-load existing bracket on first mount (if logged in)
  useEffect(() => { if (user) void bracket.load() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [user])

  async function downloadPng() {
    if (!ref.current) return
    setBusy('png')
    setMsg({})
    try {
      const png = await toPng(ref.current, { backgroundColor: '#0b0d12', pixelRatio: 2 })
      const link = document.createElement('a')
      link.download = `wc26-bracket-${profile?.alias ?? 'me'}.png`
      link.href = png
      link.click()
      setMsg({ ok: 'PNG downloaded' })
    } catch (e) {
      setMsg({ err: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    setBusy('save')
    setMsg({})
    const r = await bracket.save()
    if (r.error) setMsg({ err: r.error })
    else setMsg({ ok: 'Saved to your account' })
    setBusy(null)
  }

  async function publish() {
    setBusy('pub')
    setMsg({})
    const r = await bracket.publish()
    if (r.error) setMsg({ err: r.error })
    else setMsg({ ok: `Published → ${r.url}` })
    setBusy(null)
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <button
          onClick={save}
          disabled={!user || busy !== null}
          className="px-4 py-3 rounded-xl glass glass-hover text-sm flex flex-col items-center gap-1 disabled:opacity-40"
        >
          <span className="font-display font-bold text-base">💾 Save</span>
          <span className="text-[10px] text-slate-500 font-mono">{user ? 'to your account' : 'sign in first'}</span>
        </button>
        <button
          onClick={downloadPng}
          disabled={busy !== null}
          className="px-4 py-3 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm flex flex-col items-center gap-1 disabled:opacity-40"
        >
          <span className="font-display font-bold text-base">⬇️ Download PNG</span>
          <span className="text-[10px] font-mono">2x retina-ready</span>
        </button>
        <button
          onClick={publish}
          disabled={!user || busy !== null}
          className="px-4 py-3 rounded-xl glass glass-hover text-sm flex flex-col items-center gap-1 disabled:opacity-40"
        >
          <span className="font-display font-bold text-base">🚀 Publish</span>
          <span className="text-[10px] text-slate-500 font-mono">{user ? 'public profile' : 'sign in first'}</span>
        </button>
      </div>
      {busy && (
        <div className="flex items-center justify-center py-6">
          <LottieLoader name={busy === 'pub' ? 'trophy' : 'ball-spin'} size={64} />
        </div>
      )}
      {msg.ok && (
        <div className="bg-accent-green/10 border border-accent-green/30 rounded-xl px-4 py-3 mb-4 text-sm text-slate-800 flex items-center gap-3 flex-wrap">
          <span className="text-accent-green font-bold">✓</span>
          {msg.ok.startsWith('Published →') ? (
            <>
              <span className="font-mono text-xs">Published. Share this link:</span>
              <a
                href={msg.ok.replace('Published → ', '')}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-gold font-mono text-xs underline break-all"
              >
                {msg.ok.replace('Published → ', '')}
              </a>
            </>
          ) : (
            <span>{msg.ok}</span>
          )}
        </div>
      )}
      {msg.err && <div className="text-xs text-red-400 font-mono mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{msg.err}</div>}

      {bracket.isPublished && bracket.shareSlug && (
        <div className="glass rounded-xl p-4 mb-5 text-sm">
          Public URL:{' '}
          <a className="text-accent-gold font-mono" href={`/u/${bracket.shareSlug}`}>
            {window.location.origin}/u/{bracket.shareSlug}
          </a>
        </div>
      )}

      <div className="overflow-x-auto">
        <div ref={ref} className="min-w-[1800px] bg-[#0b0d12] rounded-2xl overflow-hidden">
          <BracketPoster data={{
            alias: profile?.alias ?? 'fan',
            groupStandings: bracket.groupStandings,
            thirdPlaceAdvancing: bracket.thirdPlaceAdvancing,
            koWinners: bracket.koWinners,
            thirdPlaceWinner: bracket.thirdPlaceWinner,
            finalWinner: bracket.finalWinner,
          }} />
        </div>
      </div>
    </div>
  )
}


// Re-export Team type for KoSide
export type { Team }
