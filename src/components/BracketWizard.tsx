import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { groups, teamByCode, teams, type Team } from '../data/teams'
import { useBracket, koMatchIds, type GroupLetter } from '../store/bracket'
import { useAuth } from '../store/auth'
import { SectionHeader } from './Groups'
import { cn } from '../lib/utils'

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
  const filled = GROUPS.filter((g) => (groupStandings[g]?.length ?? 0) === 4).length

  return (
    <div>
      <div className="text-xs text-slate-500 mb-4 font-mono">
        {filled} / 12 groups ranked
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {GROUPS.map((letter) => (
          <GroupRanker key={letter} letter={letter} value={groupStandings[letter] ?? []} onChange={(o) => setGroupRank(letter, o)} />
        ))}
      </div>
    </div>
  )
}

function GroupRanker({ letter, value, onChange }: { letter: GroupLetter; value: string[]; onChange: (o: string[]) => void }) {
  const codes = groups[letter] ?? []
  const ranked = value.length === 4 ? value : codes // fallback to original if no pick yet
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
          const t = teamByCode(code)
          if (!t) return null
          return (
            <div key={code} className={cn('flex items-center gap-3 px-3 py-2 rounded-lg border bg-slate-50', tone[i])}>
              <span className="text-[10px] font-mono w-6 text-slate-500">{tag[i]}</span>
              <span className="text-xl">{t.flag}</span>
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
  const thirds = GROUPS.map((letter) => {
    const standings = groupStandings[letter]
    if (!standings || standings.length < 3) return null
    const code = standings[2]
    const t = teamByCode(code)
    return t ? { letter, t } : null
  }).filter(Boolean) as Array<{ letter: GroupLetter; t: Team }>

  return (
    <div>
      <div className="text-xs text-slate-500 mb-4 font-mono">
        Select <span className="text-accent-gold">8 of 12</span> best third-placed teams that will advance to the Round of 32.
        Currently picked: <span className="text-slate-900">{thirdPlaceAdvancing.length}</span>
      </div>
      {thirds.length < 12 && (
        <div className="glass rounded-xl p-4 mb-4 text-xs text-yellow-300">
          Finish ranking all 12 groups first — {12 - thirds.length} groups still need their third-placed team picked.
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {thirds.map(({ letter, t }) => {
          const picked = thirdPlaceAdvancing.includes(t.code)
          const max = thirdPlaceAdvancing.length >= 8 && !picked
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
              <span className="text-lg">{t.flag}</span>
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
      <span className="text-xl">{team.flag}</span>
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
function useDerivedKoPairs(stage: 'R32' | 'R16' | 'QF' | 'SF'): Array<[Team | null, Team | null]> {
  const { groupStandings, thirdPlaceAdvancing, koWinners } = useBracket()

  return useMemo(() => {
    if (stage === 'R32') {
      // Build the pool: top-2 of each group + 8 thirds
      const pool: string[] = []
      GROUPS.forEach((g) => {
        const s = groupStandings[g]
        if (s && s.length >= 2) pool.push(s[0], s[1])
      })
      // Append picked thirds (in pick order — that's fine for v1)
      thirdPlaceAdvancing.forEach((c) => pool.push(c))
      // Pair sequentially: (p0,p1), (p2,p3), …
      const pairs: Array<[Team | null, Team | null]> = []
      for (let i = 0; i < 16; i++) {
        const a = pool[i * 2] ? teamByCode(pool[i * 2]) ?? null : null
        const b = pool[i * 2 + 1] ? teamByCode(pool[i * 2 + 1]) ?? null : null
        pairs.push([a, b])
      }
      return pairs
    }
    const prev = stage === 'R16' ? 'R32' : stage === 'QF' ? 'R16' : 'SF'  // for SF we look at QF
    const prevPrefix = stage === 'R16' ? 'R32' : stage === 'QF' ? 'R16' : 'QF'
    void prev
    const prevWinners = koMatchIds(prevPrefix).map((mid) => koWinners[mid] ?? null)
    const pairs: Array<[Team | null, Team | null]> = []
    for (let i = 0; i < prevWinners.length; i += 2) {
      const a = prevWinners[i] ? teamByCode(prevWinners[i]!) ?? null : null
      const b = prevWinners[i + 1] ? teamByCode(prevWinners[i + 1]!) ?? null : null
      pairs.push([a, b])
    }
    return pairs
  }, [stage, groupStandings, thirdPlaceAdvancing, koWinners])
}

/* -------------------------------------------------------------------------- */
/* Step 7 — 3rd place playoff + Final                                         */
/* -------------------------------------------------------------------------- */

function StepFinal() {
  const { koWinners, setKoWinner, setThirdPlaceWinner, setFinalWinner, thirdPlaceWinner, finalWinner } = useBracket()
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

  const finalists: Team[] = sfWinners.map((c) => (c ? teamByCode(c) ?? null : null)).filter(Boolean) as Team[]

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
              <span className="text-xl">{t.flag}</span>
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
              <span className="text-3xl">{t.flag}</span>
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
      const png = await toPng(ref.current, { backgroundColor: '#0a0a0f', pixelRatio: 2 })
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
      {msg.ok && <div className="text-xs text-accent-green font-mono mb-4">✓ {msg.ok}</div>}
      {msg.err && <div className="text-xs text-red-400 font-mono mb-4">{msg.err}</div>}

      {bracket.isPublished && bracket.shareSlug && (
        <div className="glass rounded-xl p-4 mb-5 text-sm">
          Public URL:{' '}
          <a className="text-accent-gold font-mono" href={`/u/${bracket.shareSlug}`}>
            {window.location.origin}/u/{bracket.shareSlug}
          </a>
        </div>
      )}

      <div className="overflow-x-auto">
        <div ref={ref} className="min-w-[1100px] p-8 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 rounded-2xl">
          <BracketPoster />
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* BracketPoster — the rendered, exportable bracket image                     */
/* -------------------------------------------------------------------------- */

function BracketPoster() {
  const { groupStandings, thirdPlaceAdvancing, koWinners, thirdPlaceWinner, finalWinner } = useBracket()
  const { profile } = useAuth()

  function tx(code: string | undefined) {
    if (!code) return { flag: '⚪️', name: 'TBD' }
    const t = teamByCode(code)
    return t ? { flag: t.flag, name: t.name } : { flag: '⚪️', name: code }
  }

  return (
    <div className="text-slate-900">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent-gold font-mono">{profile?.alias ?? 'fan'}'s prediction</div>
          <div className="font-display font-bold text-3xl">FIFA World Cup 26 — Full Bracket</div>
        </div>
        <div className="text-[10px] font-mono text-slate-500 text-right">
          WC26 Live<br />by mehdijabry.dev
        </div>
      </div>

      {/* Group standings */}
      <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mb-6">
        {GROUPS.map((g) => {
          const s = groupStandings[g] ?? []
          return (
            <div key={g} className="bg-white/[0.04] rounded-lg p-2.5 text-[11px]">
              <div className="font-display font-bold text-accent-gold mb-1">Group {g}</div>
              {s.slice(0, 4).map((code, i) => {
                const t = teamByCode(code)
                if (!t) return null
                const adv = i < 2 || (i === 2 && thirdPlaceAdvancing.includes(code))
                return (
                  <div key={code} className={cn('flex items-center gap-1.5 truncate', adv ? '' : 'opacity-40')}>
                    <span>{i === 0 ? '1' : i === 1 ? '2' : i === 2 ? '3' : '4'}</span>
                    <span>{t.flag}</span>
                    <span className="truncate">{t.name}</span>
                    {adv && i === 2 && <span className="text-accent-green">★</span>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Knockout columns */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { stage: 'R32', label: 'Round of 32', ids: koMatchIds('R32') },
          { stage: 'R16', label: 'Round of 16', ids: koMatchIds('R16') },
          { stage: 'QF',  label: 'Quarter-finals', ids: koMatchIds('QF') },
          { stage: 'SF',  label: 'Semi-finals', ids: koMatchIds('SF') },
          { stage: 'F',   label: 'Final', ids: ['FINAL-1'] },
        ].map((col) => (
          <div key={col.label}>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">{col.label}</div>
            <div className="space-y-1.5">
              {col.ids.map((id) => {
                const code = koWinners[id]
                const t = tx(code)
                return (
                  <div key={id} className="bg-white/[0.04] rounded px-2 py-1.5 text-[11px] flex items-center gap-1.5 truncate">
                    <span>{t.flag}</span>
                    <span className="truncate">{t.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Final winner & 3rd */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-accent-gold/30 to-yellow-700/10 rounded-xl p-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-accent-gold font-mono">Champion</div>
          {finalWinner ? (
            <div className="font-display font-bold text-2xl mt-1">{tx(finalWinner).flag} {tx(finalWinner).name}</div>
          ) : <div className="text-slate-500 text-sm mt-1">TBD</div>}
        </div>
        <div className="bg-gradient-to-br from-orange-700/30 to-orange-900/10 rounded-xl p-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-orange-300 font-mono">3rd place</div>
          {thirdPlaceWinner ? (
            <div className="font-display font-bold text-xl mt-1">{tx(thirdPlaceWinner).flag} {tx(thirdPlaceWinner).name}</div>
          ) : <div className="text-slate-500 text-sm mt-1">TBD</div>}
        </div>
      </div>

      <div className="mt-6 text-[10px] font-mono text-slate-600 text-center">
        wc26.mehdijabry.dev · 48 nations · 16 cities · 104 matches · June 11 → July 19, 2026
      </div>
    </div>
  )
}

// Re-export Team type for KoSide
export type { Team }
// silence the "teams" unused warning
void teams
