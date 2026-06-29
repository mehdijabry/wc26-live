import { useMemo } from 'react'
import {
  BRACKET_STAGES,
  deriveBracket,
  deriveGroupStandings,
  deriveLiveGroups,
  deriveQualified,
  relativeTime,
  useTournament,
  type BracketMatch,
  type BracketStage,
} from '../store/tournament'

/**
 * /wc26 bracket section — everything is derived live from ESPN via the
 * shared tournament store. Zero static fixtures: when ESPN publishes a
 * scoreline the next round's competitors auto-resolve from "Winner of M..."
 * placeholders to the actual 3-letter codes. The cascade is the feed's job,
 * not ours — we just bucket events by season.slug and render.
 *
 * Sections, top to bottom:
 *   1. Headline stats   — groups / qualified / best-3rds / KO matches left
 *   2. Qualifiers band  — 12 winners + 12 runners-up + 8 best 3rd-placed
 *   3. Knockout bracket — R32 → Final, two-column grid per round
 *
 * The existing <Groups> component renders the live standings BELOW this,
 * so the page reads: "who's already through" → "how they get to the final"
 * → "current group state".
 */
export function Bracket() {
  const { events, fetchedAt, loading } = useTournament()

  const { groups, qualified, stages, orderedStages, koLeft, totalKo } = useMemo(() => {
    const groups = deriveLiveGroups(events)
    const standings = deriveGroupStandings(events, groups)
    const qualified = deriveQualified(standings)
    const stages = deriveBracket(events)
    const allKo = BRACKET_STAGES.flatMap((s) => stages[s])

    // Order: "what's still to play" first in canonical order (R32 → Final),
    // then any round that's already entirely settled at the bottom. The fan
    // opens /wc26 to find out what happens next — once R32 is done, R16
    // owns the top of the page; once R16 is done, QF does. Rounds with no
    // fixtures at all (e.g. before the draw) are filtered out completely.
    type StageDescriptor = {
      stage: BracketStage
      matches: BracketMatch[]
      status: 'active' | 'completed'
      lastDate: string
    }
    const descriptors: StageDescriptor[] = BRACKET_STAGES
      .map((s) => {
        const m = stages[s]
        if (m.length === 0) return null
        const allPost = m.every((x) => x.status === 'post')
        const lastDate = m.map((x) => x.date ?? '').sort().slice(-1)[0] ?? ''
        return { stage: s, matches: m, status: allPost ? 'completed' : 'active', lastDate }
      })
      .filter((d): d is StageDescriptor => d !== null)
    const active = descriptors.filter((d) => d.status === 'active')              // canonical order preserved
    const completed = descriptors.filter((d) => d.status === 'completed').sort((a, b) => b.lastDate.localeCompare(a.lastDate))

    return {
      groups,
      qualified,
      stages,
      orderedStages: [...active, ...completed],
      koLeft: allKo.filter((m) => m.status !== 'post').length,
      totalKo: allKo.length,
    }
  }, [events])

  const qCount = qualified.firsts.length + qualified.seconds.length + qualified.bestThirds.length
  const totalThirds = qualified.bestThirds.length + qualified.remainingThirds.length

  return (
    <section id="bracket" className="py-16 sm:py-20 border-t border-slate-200/70">
      <div className="container max-w-6xl mx-auto px-6">
        <header className="mb-8">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-2">
            Bracket · Round of 32 → Final
          </div>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-ink-900 tracking-tight">
            Who plays <span className="text-accent-gold">whom</span> on the road to MetLife
          </h2>
          <p className="mt-3 text-sm text-slate-600 max-w-2xl leading-relaxed">
            Live from ESPN. Every winner cascades into its slot in the next round automatically — no waiting on a manual update.
          </p>
          <div className="mt-3 flex items-center flex-wrap gap-2 text-[10px] font-mono text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Auto-refresh · ESPN · {loading && !events.length ? 'loading…' : relativeTime(fetchedAt)}
            </span>
            {qualified.provisional && (
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                Best-3rd cutoff is provisional (FIFA tiebreakers tied)
              </span>
            )}
          </div>
        </header>

        {/* ───── Stats row ───── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          <StatCard label="Groups" value={String(groups.length || 12)} />
          <StatCard label="Qualified · R32" value={String(qCount)} suffix="/ 32" />
          <StatCard
            label="Best 3rds"
            value={String(qualified.bestThirds.length)}
            suffix={`/ ${totalThirds || 12}`}
          />
          <StatCard label="KO matches left" value={String(koLeft)} suffix={`/ ${totalKo || 31}`} />
        </div>

        {/* ───── Qualifiers band ───── */}
        {qCount > 0 && (
          <>
            <SectionEyebrow
              left="Qualified for the round of 32"
              right={`${qualified.firsts.length} + ${qualified.seconds.length} + ${qualified.bestThirds.length} = ${qCount}`}
            />
            <div className="grid gap-3 mb-10">
              <QualifiedBucket label="1st · group winners" tone="winner" codes={qualified.firsts} />
              <QualifiedBucket label="2nd · runners-up" tone="runnerUp" codes={qualified.seconds} />
              <QualifiedBucket
                label={`Best ${qualified.bestThirds.length} of ${totalThirds || 12} third-placed`}
                tone="bestThird"
                codes={qualified.bestThirds}
              />
            </div>
          </>
        )}

        {/* ───── Knockout bracket ───── */}
        <SectionEyebrow left="Knockout bracket · who plays whom" right={`${totalKo || 31} matches`} />

        {orderedStages.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {events.length === 0
              ? 'Loading ESPN feed…'
              : 'No knockout fixtures published yet — the bracket fills in as ESPN releases the draw.'}
          </div>
        )}

        {orderedStages.map(({ stage, matches, status }, i) => (
          <RoundBlock
            key={stage}
            stage={stage}
            matches={matches}
            statusBadge={status}
            // The first round in the ordered list is the "focus" — visually
            // dialed up because it's either currently playing or the next
            // one to play. Once its last match goes 'post', the next
            // round automatically takes this slot on the following render.
            isFocus={i === 0 && status === 'active'}
          />
        ))}

        {/* ───── Legend ───── */}
        <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] font-mono text-slate-600">
          <LegendDot color="#639922" label="Winner → R32" />
          <LegendDot color="#1D9E75" label="Runner-up → R32" />
          <LegendDot color="#EF9F27" label="Best 3rd (in)" />
          <LegendDot color="#E24B4A" label="Live" />
          <LegendDot color="#F59E0B" label="Final" />
        </div>
      </div>
    </section>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────

function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-xl bg-slate-100/70 px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 font-display text-2xl sm:text-3xl text-ink-900 tracking-tight tabular-nums">
        {value}
        {suffix && <span className="text-xs sm:text-sm text-slate-400 font-normal ml-1">{suffix}</span>}
      </div>
    </div>
  )
}

function SectionEyebrow({ left, right }: { left: string; right?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mt-8 mb-3 flex-wrap">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500 font-semibold">{left}</div>
      {right && <div className="font-mono text-[10px] text-slate-400 tracking-wider">{right}</div>}
    </div>
  )
}

function QualifiedBucket({ label, tone, codes }: { label: string; tone: 'winner' | 'runnerUp' | 'bestThird'; codes: string[] }) {
  const dot = tone === 'winner' ? '#639922' : tone === 'runnerUp' ? '#1D9E75' : '#EF9F27'
  const pillCls =
    tone === 'winner' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' :
    tone === 'runnerUp' ? 'bg-teal-50 text-teal-900 border-teal-200' :
    'bg-amber-50 text-amber-900 border-amber-200'
  return (
    <div>
      <div className="text-[11px] text-slate-600 mb-1.5 flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: dot }} />
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {codes.length === 0 && (
          <span className="text-[11px] text-slate-400 italic">No team locked yet — group matches still in progress.</span>
        )}
        {codes.map((c) => (
          <span
            key={c}
            className={'inline-flex items-center justify-center min-w-[42px] px-2.5 py-1 text-[12px] font-mono font-semibold tracking-wider border rounded-md ' + pillCls}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  )
}

const STAGE_TITLE: Record<BracketStage, string> = {
  'round-of-32': 'Round of 32',
  'round-of-16': 'Round of 16',
  'quarterfinals': 'Quarter-finals',
  'semifinals': 'Semi-finals',
  '3rd-place-match': 'Third-place playoff',
  'final': 'Final',
}

function RoundBlock({ stage, matches, statusBadge, isFocus }: { stage: BracketStage; matches: BracketMatch[]; statusBadge: 'active' | 'completed'; isFocus?: boolean }) {
  if (matches.length === 0) return null
  const sortedDates = matches.map((m) => m.date).filter((d): d is string => !!d).sort()
  const range = sortedDates.length
    ? `${formatDayShort(sortedDates[0])}${sortedDates.length > 1 ? ' → ' + formatDayShort(sortedDates[sortedDates.length - 1]) : ''}`
    : ''
  const fixturesLabel = `${matches.length} ${matches.length === 1 ? 'fixture' : 'fixtures'}`
  const isFinal = stage === 'final'
  const isThird = stage === '3rd-place-match'
  const hasLive = matches.some((m) => m.status === 'in')
  const isCompleted = statusBadge === 'completed'

  // Focus round: visually dialed up — heavier title, paper-elev background,
  // bigger padding. The "what's playing now or next" lives here. Completed
  // rounds get dimmed so they read as "results, for reference".
  const wrapperCls = isFocus
    ? 'mt-6 rounded-2xl border-2 border-accent-gold/40 bg-amber-50/30 p-4 sm:p-5'
    : isCompleted
      ? 'mt-6 opacity-75'
      : 'mt-6'

  return (
    <div className={wrapperCls}>
      <RoundHead
        title={STAGE_TITLE[stage]}
        meta={`${fixturesLabel}${range ? ' · ' + range : ''}`}
        statusBadge={statusBadge}
        hasLive={hasLive}
        isFocus={isFocus}
      />
      <div className={'grid gap-2 ' + (matches.length === 1 ? 'sm:grid-cols-1' : 'sm:grid-cols-2')}>
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            highlight={isFinal ? 'final' : isThird ? 'third' : undefined}
          />
        ))}
      </div>
    </div>
  )
}

function RoundHead({ title, meta, statusBadge, hasLive, isFocus }: { title: string; meta: string; statusBadge: 'active' | 'completed'; hasLive?: boolean; isFocus?: boolean }) {
  // Focus round wears a louder badge so a fan glancing at the page knows
  // "this is what's live right now / what's next" without reading anything.
  const badge =
    hasLive
      ? { text: 'Live now', cls: 'bg-rose-100 text-rose-900 border-rose-300' }
      : isFocus
        ? { text: 'Up next', cls: 'bg-amber-100 text-amber-900 border-amber-300' }
        : statusBadge === 'active'
          ? { text: 'Upcoming', cls: 'bg-blue-50 text-blue-800 border-blue-200' }
          : { text: 'Completed', cls: 'bg-slate-100 text-slate-600 border-slate-200' }
  const titleCls = isFocus
    ? 'font-display font-bold text-xl sm:text-2xl text-ink-900 tracking-tight'
    : 'font-display font-bold text-sm text-ink-900 tracking-wider uppercase'
  return (
    <div className={'flex items-center justify-between gap-2 flex-wrap px-0.5 ' + (isFocus ? 'mb-4' : 'mb-2')}>
      <div className="flex items-center gap-2 min-w-0">
        <h3 className={titleCls}>{title}</h3>
        {badge && (
          <span className={(isFocus ? 'text-[10px]' : 'text-[9px]') + ' font-mono uppercase tracking-[0.12em] px-2 py-0.5 border rounded font-semibold ' + badge.cls}>
            {badge.text}
          </span>
        )}
      </div>
      <span className="text-[10px] font-mono text-slate-400 tracking-wider uppercase">{meta}</span>
    </div>
  )
}

function MatchCard({ match, highlight }: { match: BracketMatch; highlight?: 'final' | 'third' }) {
  const isLive = match.status === 'in'
  const isPost = match.status === 'post'
  const borderCls =
    highlight === 'final' ? 'border-amber-300 bg-amber-50/40' :
    highlight === 'third' ? 'border-blue-200 bg-blue-50/30' :
    isLive ? 'border-rose-300' :
    'border-slate-200'

  return (
    <div className={'rounded-lg border bg-white px-3 py-2 ' + borderCls}>
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 mb-1">
        {isLive && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />}
        <span>{formatMatchMeta(match)}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-[13px]">
        <TeamCell side="home" team={match.home} winner={isPost && match.home?.winner} />
        <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-slate-400">
          {isPost ? '–' : (highlight === 'final' ? 'Final' : (highlight === 'third' ? '3rd' : 'vs'))}
        </span>
        <TeamCell side="away" team={match.away} winner={isPost && match.away?.winner} />
      </div>
      {(match.venue || match.city) && (
        <div className="mt-1 text-[10px] font-mono text-slate-400 truncate">
          {[match.venue, match.city].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  )
}

function TeamCell({ side, team, winner }: { side: 'home' | 'away'; team: BracketMatch['home']; winner?: boolean }) {
  const align = side === 'home' ? 'justify-end text-right' : 'justify-start text-left'
  if (!team) {
    return <span className={'flex ' + align + ' text-slate-400 italic font-light text-[11px]'}>TBD</span>
  }
  const isPlaceholder = team.isPlaceholder
  const label = isPlaceholder ? team.name : team.abbr
  const showScore = team.score != null && !isPlaceholder
  return (
    <span className={'flex items-center gap-1.5 ' + align}>
      {side === 'home' && showScore && (
        <span className="font-mono tabular-nums text-slate-700 text-xs">{team.score}</span>
      )}
      <span
        className={
          (isPlaceholder
            ? 'text-slate-400 italic font-normal text-[11px]'
            : winner
              ? 'text-emerald-700 font-semibold tracking-wide'
              : 'text-ink-900 font-semibold tracking-wide')
        }
      >
        {label}
      </span>
      {side === 'away' && showScore && (
        <span className="font-mono tabular-nums text-slate-700 text-xs">{team.score}</span>
      )}
    </span>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  )
}

// ─── Date formatters ───────────────────────────────────────────────────

function formatDayShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()
  } catch { return '' }
}

function formatMatchMeta(m: BracketMatch): string {
  if (!m.date) return ''
  try {
    return new Date(m.date)
      .toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
        hour12: false,
        timeZoneName: 'short',
      })
      .toLowerCase()
  } catch { return '' }
}
