import { useMemo } from 'react'
import { useTournament, deriveLiveGroups, deriveGroupStandings } from '../store/tournament'
import { teamBadgeFallback } from './utils'
import type { GroupLetter } from '../store/bracket'

/**
 * Live bracket data — replaces the legacy static `groups` / `teamByCode`
 * exports from `data/teams.ts`. Drives the BracketWizard (#bracket-predict)
 * with the actual ESPN draw so picks always match the real tournament.
 */

export type LiveTeam = {
  code: string         // ESPN abbreviation (uppercase) — used everywhere as the stable id
  name: string         // displayName e.g. "Morocco"
  shortName: string    // shortDisplayName e.g. "MAR"
  logo?: string        // ESPN logo URL, or flagcdn fallback if missing
}

export type LiveBracketData = {
  liveGroups: Record<GroupLetter, string[]>   // letter -> 4 team codes (ordered alphabetically)
  // Same 12 groups, but ordered by CURRENT standing (pts → GD → GF) so
  // index 0 is the 1st-placed team, index 3 the 4th. Only populated once
  // all six group matches per group have gone 'post'; before that a group
  // entry is either undefined or partial and shouldn't be used for sync.
  liveGroupStandings: Partial<Record<GroupLetter, string[]>>
  lookup: (code: string | undefined | null) => LiveTeam | undefined
  ready: boolean       // true once all 12 groups are known
}

const GROUPS: GroupLetter[] = ['A','B','C','D','E','F','G','H','I','J','K','L']

export function useLiveBracketData(): LiveBracketData {
  const events = useTournament((s) => s.events)
  return useMemo(() => {
    const groupsArr = deriveLiveGroups(events)

    // Build the lookup map first — every team in any group + every team in any event
    const lookup = new Map<string, LiveTeam>()
    for (const g of groupsArr) {
      for (const t of g.teams) {
        if (!lookup.has(t.abbr)) {
          lookup.set(t.abbr, {
            code: t.abbr,
            name: t.name,
            shortName: t.shortName,
            logo: teamBadgeFallback(t.logo, t.abbr),
          })
        }
      }
    }
    // Belt and braces: walk events to catch teams that may be involved in KO
    // but not in our 72 group-stage slice yet.
    for (const ev of events) {
      const cs = ev.competitions?.[0]?.competitors ?? []
      for (const c of cs) {
        const t = c.team
        if (!t?.abbreviation) continue
        const code = t.abbreviation.toUpperCase()
        if (lookup.has(code)) continue
        lookup.set(code, {
          code,
          name: t.displayName ?? code,
          shortName: t.shortDisplayName ?? code,
          logo: teamBadgeFallback(t.logo, code),
        })
      }
    }

    // Map letter → 4 codes
    const liveGroups: Record<GroupLetter, string[]> = {
      A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [], I: [], J: [], K: [], L: [],
    }
    for (const g of groupsArr) {
      if (g.letter in liveGroups) {
        liveGroups[g.letter as GroupLetter] = g.teams.map((t) => t.abbr)
      }
    }

    // Compute live standings (pts → GD → GF) — the ordering the bracket
    // needs to project actual current group winners into the R32 slots.
    // Only groups with a fully-settled matchday 3 get an entry, so callers
    // can safely trust the value length as "4 = confirmed final order".
    const standings = deriveGroupStandings(events, groupsArr)
    const liveGroupStandings: Partial<Record<GroupLetter, string[]>> = {}
    for (const s of standings) {
      const allSettled = s.rows.every((r) => r.record.played === 3)
      if (!allSettled) continue
      liveGroupStandings[s.letter as GroupLetter] = s.rows.map((r) => r.abbr)
    }

    const ready = GROUPS.every((g) => liveGroups[g].length === 4)

    return {
      liveGroups,
      liveGroupStandings,
      lookup: (code) => (code ? lookup.get(code.toUpperCase()) : undefined),
      ready,
    }
  }, [events])
}
