import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { tournamentRules } from '../../data/tournament-rules'

/**
 * /rules — the official WC26 rules cheat-sheet. Pulled straight from
 * `tournamentRules` so the page and the AI assistant share one source.
 *
 * Why a dedicated page (vs. folding into /explained):
 *   - /explained is a long FAQ optimised for SEO / 'People also ask'.
 *   - This page is a glanceable reference: chiffres clés en cartes, sub
 *     rules, discipline thresholds — what a fan looks up mid-match.
 *
 * Edits to the rules themselves go in src/data/tournament-rules.ts AND
 * the worker mirror at worker/src/wc26-data/tournament-rules.ts.
 */
export function RulesPage() {
  const r = tournamentRules

  useEffect(() => {
    document.title = `${r.edition} rules · Format, subs, VAR — Pressing 90`
    setMeta('description',
      `Official rules of the ${r.edition}: ${r.total_teams} teams, ${r.format.group_stage.groups} groups, ${r.total_matches} matches, ${r.squad.substitutions_regulation}+${r.squad.substitutions_extra_time} substitutions, semi-automated offside, VAR. Quick reference for every WC26 fan.`
    )
    setLink('canonical', 'https://pressing90.live/rules')
    setOg('og:title', `${r.edition} rules · Pressing 90`)
    setOg('og:url', 'https://pressing90.live/rules')
    setOg('og:description', `48 teams · 12 groups · 32 in the knockout · 5+1 substitutions · semi-automated offside. The complete WC26 cheat-sheet.`)
  }, [r])

  const startDate = new Date(r.dates.start).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
  const endDate = new Date(r.dates.end).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="container max-w-3xl mx-auto px-6 pt-6 pb-16">
      <header className="mb-10">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 mb-3">
          Rules · Cheat-sheet
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-slate-900 tracking-tight leading-[1.1]">
          The <span className="text-accent-gold">WC26</span> rulebook
          <br />
          <span className="text-2xl sm:text-3xl text-slate-600 font-normal">in 60 seconds</span>
        </h1>
        <p className="mt-5 text-base text-slate-700 leading-relaxed">
          {r.hosts.join(' · ')} · {startDate} → {endDate}. The first 48-team World Cup.
          Below: the format, the squad rules, the discipline thresholds, and the tech
          in use this tournament. For the deep-dive on each rule, see{' '}
          <Link to="/explained" className="underline decoration-accent-gold underline-offset-2 hover:text-slate-900">
            /explained
          </Link>.
        </p>
      </header>

      {/* ───── Headline numbers ───── */}
      <section className="mb-12">
        <Eyebrow>The shape of the tournament</Eyebrow>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat value={r.total_teams} label="Teams" />
          <Stat value={r.format.group_stage.groups} label="Groups" />
          <Stat value={r.total_matches} label="Matches" />
          <Stat value={r.venues.total} label="Stadiums" />
        </div>
      </section>

      {/* ───── Group stage ───── */}
      <RuleBlock title="Group stage" eyebrow="Format">
        <ul className="space-y-2 text-slate-700 leading-relaxed">
          <li>
            <strong>{r.format.group_stage.groups} groups of {r.format.group_stage.teams_per_group}</strong> ·
            {' '}{r.format.group_stage.qualifiers_per_group}
          </li>
          <li>
            The <strong>{r.format.group_stage.best_third_placed} best third-placed</strong> teams complete the bracket
            for <strong>{r.format.group_stage.total_qualified_for_knockout} qualified</strong> for the knockout.
          </li>
          <li>
            Points: <strong>{r.format.group_stage.points.win}</strong> for a win,
            <strong> {r.format.group_stage.points.draw}</strong> for a draw,
            <strong> {r.format.group_stage.points.loss}</strong> for a loss.
          </li>
        </ul>
        <details className="mt-4 group">
          <summary className="cursor-pointer text-xs font-mono uppercase tracking-[0.12em] text-accent-gold font-semibold hover:text-yellow-700 select-none">
            Tiebreakers (in order) →
          </summary>
          <ol className="mt-3 list-decimal pl-5 text-sm text-slate-600 space-y-1 leading-relaxed">
            {r.format.group_stage.tiebreakers.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </details>
      </RuleBlock>

      {/* ───── Knockout ───── */}
      <RuleBlock title="Knockout rounds" eyebrow="Format">
        <ol className="grid grid-cols-2 gap-2 text-sm text-slate-700">
          {r.format.knockout.rounds.map((round, i) => (
            <li
              key={round}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 flex items-center gap-2"
            >
              <span className="font-mono text-[10px] text-slate-400 w-5">{String(i + 1).padStart(2, '0')}</span>
              <span className="font-semibold text-slate-900">{round}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-slate-600 leading-relaxed">
          Drawn matches go to <strong>{r.format.knockout.extra_time_minutes} minutes</strong> of extra time,
          then a <strong>penalty shootout</strong> if still level.
          {' '}The away-goals rule is <strong>not</strong> applied.
        </p>
      </RuleBlock>

      {/* ───── Squad & subs ───── */}
      <RuleBlock title="Squads & substitutions" eyebrow="Squad rules">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Stat value={r.squad.max_players} label="Players per squad" small />
          <Stat value={r.squad.max_goalkeepers} label="Goalkeepers" small />
          <Stat
            value={`${r.squad.substitutions_regulation}+${r.squad.substitutions_extra_time}`}
            label="Subs (90'+ ET)"
            small
          />
          <Stat value="+1" label="Concussion sub" small />
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          {r.squad.concussion_substitutions}.
        </p>
      </RuleBlock>

      {/* ───── Discipline ───── */}
      <RuleBlock title="Cards & suspensions" eyebrow="Discipline">
        <ul className="space-y-2 text-slate-700 leading-relaxed text-[15px]">
          <li>
            <strong>{r.discipline.yellow_cards_for_suspension} yellow cards</strong> across separate matches → one-match ban.
          </li>
          <li>{r.discipline.yellow_cards_reset_after}.</li>
          <li>{r.discipline.red_card_suspension}.</li>
        </ul>
      </RuleBlock>

      {/* ───── Technology ───── */}
      <RuleBlock title="Match technology" eyebrow="In use this tournament">
        <ul className="grid grid-cols-2 gap-2">
          <Tech name="VAR" on={r.technology.var} />
          <Tech name="Semi-automated offside" on={r.technology.semi_automated_offside} />
          <Tech name="Connected ball" on={r.technology.connected_ball_technology} />
          <Tech name="Goal-line technology" on={r.technology.goal_line_technology} />
        </ul>
      </RuleBlock>

      {/* ───── Venues & dates ───── */}
      <RuleBlock title="Hosts, venues & key dates" eyebrow="Where + when">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat value={r.venues.usa} label="USA" small />
          <Stat value={r.venues.canada} label="Canada" small />
          <Stat value={r.venues.mexico} label="Mexico" small />
        </div>
        <ul className="space-y-2 text-sm text-slate-700 leading-relaxed">
          <li>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-500">Opener</span>
            <br />
            {r.venues.opening_venue}
          </li>
          <li>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-500">Final</span>
            <br />
            {r.venues.final_venue}
          </li>
        </ul>
        <div className="mt-4">
          <Link
            to="/stadiums"
            className="text-xs font-mono uppercase tracking-[0.12em] text-accent-gold font-semibold hover:text-yellow-700"
          >
            All 16 stadiums →
          </Link>
        </div>
      </RuleBlock>

      {/* ───── Awards ───── */}
      <RuleBlock title="Trophies & individual awards" eyebrow="The prizes">
        <ul className="space-y-2 text-slate-700 leading-relaxed text-[15px]">
          {r.trophy_and_awards.map((a, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-accent-gold mt-1.5">●</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </RuleBlock>

      <footer className="mt-12 pt-6 border-t border-slate-200 text-xs text-slate-500 font-mono leading-relaxed">
        Source · FIFA Regulations for the {r.edition}.
        <br />
        {r.version_note}
      </footer>
    </div>
  )
}

// ─── Small presentational helpers ───────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent-gold font-semibold mb-3">
      {children}
    </div>
  )
}

function Stat({ value, label, small = false }: { value: string | number; label: string; small?: boolean }) {
  return (
    <div className={'rounded-2xl border border-slate-200 bg-paper-elev px-4 ' + (small ? 'py-3' : 'py-4')}>
      <div className={'font-display font-bold text-slate-900 tracking-tight ' + (small ? 'text-2xl' : 'text-4xl')}>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-mono uppercase tracking-[0.15em] text-slate-500">
        {label}
      </div>
    </div>
  )
}

function RuleBlock({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <header className="mb-4">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-slate-900 tracking-tight">
          {title}
        </h2>
      </header>
      {children}
    </section>
  )
}

function Tech({ name, on }: { name: string; on: boolean }) {
  return (
    <li className={
      'rounded-xl px-3 py-2 flex items-center gap-2 text-sm ' +
      (on
        ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
        : 'bg-slate-50 border border-slate-200 text-slate-500')
    }>
      <span className={'h-2 w-2 rounded-full ' + (on ? 'bg-emerald-500' : 'bg-slate-300')} />
      <span className="font-semibold">{name}</span>
      <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em]">
        {on ? 'in use' : 'off'}
      </span>
    </li>
  )
}

// ─── SEO helpers (duplicated from Explained — small + would be silly to share) ─

function setMeta(name: string, content: string) {
  let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  if (!tag) { tag = document.createElement('meta'); tag.name = name; document.head.appendChild(tag) }
  tag.content = content
}
function setOg(property: string, content: string) {
  let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null
  if (!tag) { tag = document.createElement('meta'); tag.setAttribute('property', property); document.head.appendChild(tag) }
  tag.content = content
}
function setLink(rel: string, href: string) {
  let tag = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!tag) { tag = document.createElement('link'); tag.rel = rel; document.head.appendChild(tag) }
  tag.href = href
}
