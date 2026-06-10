import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  API_BASE,
  api,
  eventTeams,
  getCachedTeamForm,
  prefetchTeamForms,
  statusLabel,
  type EspnEvent,
  type HistoryResponse,
  type RosterAthlete,
  type RosterResponse,
} from '../../lib/api'
import { useTournament, matchesForTeam } from '../../store/tournament'
import { teamBadgeFallback } from '../../lib/utils'
import { heritageFor } from '../../data/wcHeritage'
import { narrativeFor } from '../../data/wcNarratives'

/**
 * /team/:abbr — full standalone preview page per WC2026 nation. This is
 * the SEO-facing version of the TeamSheet modal: same data sources, but
 * every section is visible on first paint (no tabs), every block is a
 * real DOM section Google can index, and the URL is canonical and
 * shareable.
 *
 * SEO output per page:
 *   - <title> 'Brazil at FIFA World Cup 2026 · Squad, Schedule & Stats'
 *   - <meta description> with key heritage + opening fixture
 *   - canonical, og tags
 *   - JSON-LD SportsTeam with the live ESPN roster as members[]
 *
 * Reuses existing endpoints:
 *   - /teams/{code}                    team metadata + logo
 *   - api.roster(code)                 current squad
 *   - api.history(code)                last N matches across all comps
 *   - useTournament().events           WC fixtures (next match, group)
 *   - getCachedTeamForm / prefetch     last-5 form colour
 *   - heritageFor(abbr)                static WC titles / appearances
 */

// WC2026 participants — abbr -> display name. Static well-known facts,
// used for synchronous title rendering before ESPN data arrives. Keys
// match ESPN's team.abbreviation (uppercase).
const WC26_TEAM_NAMES: Record<string, string> = {
  // Hosts
  USA: 'United States', MEX: 'Mexico', CAN: 'Canada',
  // UEFA — Italy didn't qualify; Türkiye took the European spot in Group B
  FRA: 'France', ESP: 'Spain', GER: 'Germany', ENG: 'England',
  POR: 'Portugal', NED: 'Netherlands', BEL: 'Belgium', CRO: 'Croatia',
  SUI: 'Switzerland', AUT: 'Austria', SWE: 'Sweden', NOR: 'Norway',
  CZE: 'Czechia', SCO: 'Scotland', BIH: 'Bosnia & Herzegovina',
  TUR: 'Türkiye',
  // CONMEBOL
  ARG: 'Argentina', BRA: 'Brazil', URU: 'Uruguay', COL: 'Colombia',
  ECU: 'Ecuador', PAR: 'Paraguay',
  // CAF
  MAR: 'Morocco', SEN: 'Senegal', GHA: 'Ghana', CIV: "Côte d'Ivoire",
  EGY: 'Egypt', ALG: 'Algeria', TUN: 'Tunisia', RSA: 'South Africa',
  CPV: 'Cabo Verde', COD: 'DR Congo',
  // AFC
  JPN: 'Japan', KOR: 'South Korea', AUS: 'Australia', IRN: 'Iran',
  KSA: 'Saudi Arabia', QAT: 'Qatar', UZB: 'Uzbekistan', JOR: 'Jordan',
  IRQ: 'Iraq',
  // CONCACAF
  HAI: 'Haiti', CUW: 'Curaçao', PAN: 'Panama',
  // OFC
  NZL: 'New Zealand',
}

type EspnTeamPayload = {
  team?: {
    id?: string
    displayName?: string
    shortDisplayName?: string
    nickname?: string
    abbreviation?: string
    location?: string
    color?: string
    logos?: Array<{ href?: string }>
  }
}

export function TeamPage() {
  const { abbr: rawAbbr } = useParams<{ abbr: string }>()
  const abbr = (rawAbbr ?? '').toUpperCase()

  // Synchronous fallback display name — lets <title> + h1 render at
  // first paint instead of waiting for ESPN. Falls back to the abbr
  // itself for teams we haven't curated (rare given the 48 nations
  // are fully mapped).
  const displayNameFallback = WC26_TEAM_NAMES[abbr] ?? abbr

  const [team, setTeam] = useState<EspnTeamPayload['team'] | null>(null)
  const [roster, setRoster] = useState<RosterResponse | null>(null)
  const [history, setHistory] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const events = useTournament((s) => s.events)
  const heritage = heritageFor(abbr)

  // Prefetch form for this team so the headline KPI populates fast.
  useEffect(() => {
    if (!abbr) return
    void prefetchTeamForms([abbr])
  }, [abbr])

  // One Promise.all batch — team, roster, history all hit in parallel.
  useEffect(() => {
    if (!abbr) return
    let stop = false
    setLoading(true)
    setTeam(null)
    setRoster(null)
    setHistory(null)
    Promise.all([
      fetch(`${API_BASE}/teams/${abbr.toLowerCase()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d as EspnTeamPayload | null)?.team ?? null)
        .catch(() => null),
      api.roster(abbr).catch(() => null),
      api.history(abbr).catch(() => null),
    ])
      .then(([t, r, h]) => {
        if (stop) return
        setTeam(t)
        setRoster(r)
        setHistory(h)
      })
      .finally(() => !stop && setLoading(false))
    return () => { stop = true }
  }, [abbr])

  // WC tournament matches for this team (group fixtures + KO matches if
  // they've made it). Falls back to history if no WC data yet — useful
  // pre-kickoff so 'Next match' still renders an upcoming game.
  const wcMatches = useMemo(() => (abbr ? matchesForTeam(events, abbr) : []), [events, abbr])
  const nextMatch = wcMatches.find((ev) => ev.status?.type?.state !== 'post')

  // Form sources: ESPN tournament events once games are played, else
  // the team-history payload that already gathers qualifiers + amicaux
  // + nations-league recent results. Same picker InfosTab uses inside
  // the modal — keeps the two views numerically identical.
  const formColour = getCachedTeamForm(abbr)
  const summary = history?.summary ?? null

  // SEO meta + JSON-LD
  useEffect(() => {
    if (!abbr) return
    const niceName = team?.displayName ?? displayNameFallback
    const title = `${niceName} at FIFA World Cup 2026 · Squad, Schedule & Stats`
    document.title = title

    // SEO description: first sentence of the editorial narrative if we
    // have one (richer + reads naturally), otherwise the data digest.
    const narrativeFirst = narrative
      ? narrative.split(/[.\n]/)[0].trim() + '.'
      : ''
    const dataDigest = [
      summary
        ? `${summary.won}W ${summary.drawn}D ${summary.lost}L last ${summary.played} matches`
        : '',
      heritage
        ? `${heritage.appearances} WC appearances${heritage.titles ? `, ${heritage.titles} title${heritage.titles > 1 ? 's' : ''}` : ''}`
        : '',
      nextMatch ? `Next: ${nextMatch.shortName ?? nextMatch.name}` : '',
    ].filter(Boolean).join(' · ')
    const desc = narrativeFirst
      ? `${narrativeFirst} ${dataDigest}`.trim()
      : `Everything on ${niceName} for the FIFA World Cup 2026: ${dataDigest}`
    setMeta('description', desc)

    setLink('canonical', `https://pressing90.live/team/${abbr.toLowerCase()}`)
    setOg('og:title', title)
    setOg('og:url', `https://pressing90.live/team/${abbr.toLowerCase()}`)
    setOg('og:description', descParts.join(' · '))

    setJsonLd('team-page', {
      '@context': 'https://schema.org',
      '@type': 'SportsTeam',
      name: niceName,
      url: `https://pressing90.live/team/${abbr.toLowerCase()}`,
      sport: 'Football',
      ...(team?.logos?.[0]?.href && { logo: team.logos[0].href }),
      ...(roster?.athletes && roster.athletes.length > 0 && {
        member: roster.athletes.slice(0, 30).map((a: RosterAthlete) => ({
          '@type': 'Person',
          name: a.fullName ?? a.displayName,
          ...(a.position?.displayName && { jobTitle: a.position.displayName }),
        })),
      }),
      memberOf: {
        '@type': 'SportsOrganization',
        name: 'FIFA',
      },
    })
    return () => {
      const tag = document.querySelector('script[data-ld-key="team-page"]')
      if (tag) tag.remove()
    }
  }, [abbr, team, summary, heritage, nextMatch, roster, displayNameFallback, narrative])

  // Group letter from the WC group derivation (synchronously available
  // once the tournament store has events). Empty string when we're not
  // ready yet — harmless.
  const groupLetter = useMemo(() => {
    if (!abbr || events.length === 0) return ''
    // Find any group-stage event where this team plays — first competitor
    // pair gives us a neighbour, but we don't actually need the group
    // here. Instead just label from heritageFor via the WC qualifying
    // round if we ever add it; for now leave empty. The Hero shows the
    // group letter via WC_GROUP_MAP lookup in a follow-up.
    return ''
  }, [abbr, events])

  const logo = teamBadgeFallback(team?.logos?.[0]?.href, abbr)
  const narrative = narrativeFor(abbr)

  return (
    <div className="container max-w-4xl mx-auto px-6 py-12">
      {/* Breadcrumb back link */}
      <nav className="mb-6">
        <Link to="/wc26" className="text-xs font-mono uppercase tracking-[0.18em] text-slate-500 hover:text-accent-gold">
          ← All WC26 teams
        </Link>
      </nav>

      {/* Hero */}
      <header className="mb-10 flex items-center gap-5">
        {logo ? (
          <img
            src={logo}
            alt={`${displayNameFallback} crest`}
            className="w-20 h-20 sm:w-24 sm:h-24 object-contain shrink-0"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        ) : (
          <span className="text-6xl shrink-0">🏳️</span>
        )}
        <div className="min-w-0">
          <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500">
            FIFA World Cup 2026 {groupLetter && `· Group ${groupLetter}`}
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-5xl text-ink-900 tracking-tight leading-[1.1] mt-1">
            {team?.displayName ?? displayNameFallback}
          </h1>
          {team?.nickname && (
            <div className="mt-1 text-sm italic text-slate-600">
              ‟{team.nickname}”
            </div>
          )}
        </div>
      </header>

      {/* Editorial narrative — 5-8 lines of identity, recent achievements,
          WC history, and an encouragement note in the team's native
          football culture. Renders directly after the hero so visitors
          (and Google) read the story before the data tables. */}
      {narrative && (
        <section className="mb-10 rounded-2xl border-l-4 border-accent-gold bg-paper-elev p-5 sm:p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-3">
            The story so far
          </div>
          <p className="font-display text-base sm:text-lg leading-relaxed text-ink-900 whitespace-pre-line">
            {narrative}
          </p>
        </section>
      )}

      {/* KPI strip — form + summary */}
      <section className="mb-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Form">
          {formColour ? (
            <div className="flex gap-1">
              {formColour.lastFive.map((r, i) => (
                <span
                  key={i}
                  className={
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ' +
                    (r === 'W' ? 'bg-emerald-500' : r === 'D' ? 'bg-slate-400' : 'bg-red-500')
                  }
                >
                  {r}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-slate-400 text-xs font-mono">…</span>
          )}
        </Kpi>
        <Kpi label="Goals" value={summary ? `+${summary.goalsFor} / -${summary.goalsAgainst}` : '—'} />
        <Kpi
          label="Results"
          value={summary ? (
            <>
              <span className="text-emerald-600">{summary.won}W</span>{' '}
              <span className="text-slate-500">{summary.drawn}D</span>{' '}
              <span className="text-red-500">{summary.lost}L</span>
            </>
          ) : '—'}
        />
        <Kpi label="Squad size" value={roster?.athletes?.length ? String(roster.athletes.length) : '—'} />
      </section>

      {/* Next match */}
      {nextMatch && (
        <section className="mb-10">
          <h2 className="font-display font-bold text-xl text-ink-900 mb-3">Next match</h2>
          <NextMatchCard ev={nextMatch} />
        </section>
      )}

      {/* WC heritage */}
      {heritage && (
        <section className="mb-10">
          <h2 className="font-display font-bold text-xl text-ink-900 mb-3">
            World Cup heritage
          </h2>
          <div className="rounded-2xl border border-slate-200 bg-paper-elev p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <Kpi label="Appearances" value={String(heritage.appearances)} />
            <Kpi label="Best result" value={heritage.bestResult} />
            <Kpi label="Titles" value={heritage.titles ? String(heritage.titles) : '—'} />
            <Kpi label="Last edition" value={heritage.lastResult ?? '—'} />
          </div>
        </section>
      )}

      {/* Squad */}
      <section className="mb-10">
        <h2 className="font-display font-bold text-xl text-ink-900 mb-3">Squad</h2>
        {roster?.athletes && roster.athletes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {roster.athletes.slice(0, 30).map((a) => (
              <PlayerRow key={a.id} a={a} />
            ))}
          </div>
        ) : loading ? (
          <div className="text-sm text-slate-500">Loading squad from ESPN…</div>
        ) : (
          <div className="text-sm text-slate-500">
            Squad not yet announced — federations typically publish 1-2 weeks before kickoff.
          </div>
        )}
      </section>

      {/* Recent results */}
      {history?.events && history.events.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display font-bold text-xl text-ink-900 mb-3">Recent results</h2>
          <div className="space-y-2">
            {history.events
              .filter((ev) => (ev.status?.type as { state?: string } | undefined)?.state === 'post')
              .slice(-10)
              .reverse()
              .map((ev) => (
                <HistoryRow key={ev.id} ev={ev} teamCode={abbr} />
              ))}
          </div>
        </section>
      )}

      {/* CTAs */}
      <section className="rounded-2xl bg-marine-950 text-cream p-6 sm:p-8 mb-8">
        <h2 className="font-display font-bold text-2xl mb-2">
          Make your bracket
        </h2>
        <p className="text-cream/80 mb-5 max-w-xl">
          Pick whether {team?.displayName ?? displayNameFallback} go all the way — share
          a poster, climb the global leaderboard, follow along with live scores.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/predictions"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 transition-colors"
          >
            Start your bracket →
          </Link>
          <Link
            to="/wc26"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-cream text-sm font-semibold transition-colors"
          >
            All groups
          </Link>
        </div>
      </section>

      <footer className="text-xs text-slate-500 font-mono">
        Data sources: ESPN public API · FIFA archives · live history endpoint.
        Refreshed at every page load. Not affiliated with FIFA.
      </footer>
    </div>
  )
}

// ---------- subcomponents -----------------------------------------------

function Kpi({ label, value, children }: { label: string; value?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-paper-elev p-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 font-display font-bold text-xl text-ink-900">
        {children ?? value}
      </div>
    </div>
  )
}

function NextMatchCard({ ev }: { ev: EspnEvent }) {
  const { home, away } = eventTeams(ev)
  const s = statusLabel(ev)
  const when = ev.date
    ? new Date(ev.date).toLocaleString(undefined, {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : ''
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500 mb-1">
          {when} · {s.live ? 'LIVE' : s.label}
        </div>
        <div className="font-display font-semibold text-base text-ink-900">
          {home?.team?.displayName ?? home?.team?.abbreviation} vs {away?.team?.displayName ?? away?.team?.abbreviation}
        </div>
        {ev.competitions?.[0] && (
          <div className="text-xs text-slate-600 mt-1">
            {(ev.competitions[0] as { venue?: { fullName?: string } }).venue?.fullName ?? ''}
          </div>
        )}
      </div>
    </div>
  )
}

function PlayerRow({ a }: { a: RosterAthlete }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <span className="w-7 h-7 rounded-full bg-slate-100 inline-flex items-center justify-center text-[11px] font-bold text-slate-700">
        {a.jersey ?? '–'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink-900 truncate">
          {a.displayName ?? a.fullName}
        </div>
        <div className="text-[11px] text-slate-500 truncate">
          {[a.position?.abbreviation, a.age ? `${a.age}y` : null].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  )
}

function HistoryRow({ ev, teamCode }: { ev: EspnEvent; teamCode: string }) {
  const competitors = ev.competitions?.[0]?.competitors ?? []
  const mine = competitors.find((c) => c.team?.abbreviation?.toUpperCase() === teamCode)
  const other = competitors.find((c) => c.team?.abbreviation?.toUpperCase() !== teamCode)
  const myRaw = (mine as { score?: unknown } | undefined)?.score
  const opRaw = (other as { score?: unknown } | undefined)?.score
  const my = typeof myRaw === 'object' && myRaw ? Number((myRaw as { value?: number }).value ?? 0) : Number(myRaw ?? 0)
  const op = typeof opRaw === 'object' && opRaw ? Number((opRaw as { value?: number }).value ?? 0) : Number(opRaw ?? 0)
  const myN = Number.isFinite(my) ? my : 0
  const opN = Number.isFinite(op) ? op : 0
  const result: 'W' | 'D' | 'L' = myN > opN ? 'W' : myN === opN ? 'D' : 'L'
  const tone = result === 'W' ? 'bg-emerald-500' : result === 'D' ? 'bg-slate-400' : 'bg-red-500'
  const date = ev.date ? new Date(ev.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' }) : ''
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-paper-elev px-4 py-2.5">
      <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${tone}`}>
        {result}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-mono text-slate-500">{date}</div>
        <div className="text-sm text-ink-900 truncate">
          {mine?.team?.displayName} {myN} - {opN} {other?.team?.displayName}
        </div>
      </div>
    </div>
  )
}

// ---------- meta helpers -------------------------------------------------

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
function setJsonLd(key: string, ld: unknown) {
  document.querySelectorAll(`script[data-ld-key="${key}"]`).forEach((n) => n.remove())
  const tag = document.createElement('script')
  tag.type = 'application/ld+json'
  tag.setAttribute('data-ld-key', key)
  tag.textContent = JSON.stringify(ld)
  document.head.appendChild(tag)
}
