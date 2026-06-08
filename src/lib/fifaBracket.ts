/**
 * FIFA WC26 deterministic knockout bracket template.
 *
 * Source: FIFA official "Knockout stage match schedule" article
 * (https://www.fifa.com/.../articles/knockout-stage-match-schedule-bracket)
 *
 * The R32 template fixes which group-position faces which — group winners
 * never face other group winners, runners-up may face other runners-up or
 * a third, and the 8 advancing third-placed teams slot into 8 designated
 * R32 matches based on which 8 groups they came from (FIFA's "Annex C"
 * 495 scenarios — we solve via bipartite matching instead of hard-coding).
 *
 * Match numbers below correspond to FIFA's official numbering (73-104).
 * Our internal koMatchIds() uses sequential R32-1..R32-16 / R16-1..R16-8
 * which we map onto FIFA's via R32_TEMPLATE order.
 */

export type GroupPos = `1${string}` | `2${string}` | `3-${string}`

export type R32Slot = {
  id: string          // internal id: 'R32-1' ... 'R32-16'
  fifaMatch: number   // 73-88
  home: GroupPos      // e.g. '1A', '2B', '3-ABCDF'
  away: GroupPos
  venue: string
}

// R32 — 16 matches. The 3-XXXXX slots take their team from the 8 advancing
// 3rd-placed teams, constrained to the groups in the string (per FIFA Annex C).
export const R32_TEMPLATE: R32Slot[] = [
  { id: 'R32-1',  fifaMatch: 73, home: '2A',       away: '2B',        venue: 'Los Angeles' },
  { id: 'R32-2',  fifaMatch: 74, home: '1E',       away: '3-ABCDF',   venue: 'Boston' },
  { id: 'R32-3',  fifaMatch: 75, home: '1F',       away: '2C',        venue: 'Monterrey' },
  { id: 'R32-4',  fifaMatch: 76, home: '1C',       away: '2F',        venue: 'Houston' },
  { id: 'R32-5',  fifaMatch: 77, home: '1I',       away: '3-CDFGH',   venue: 'New York / New Jersey' },
  { id: 'R32-6',  fifaMatch: 78, home: '2E',       away: '2I',        venue: 'Dallas' },
  { id: 'R32-7',  fifaMatch: 79, home: '1A',       away: '3-CEFHI',   venue: 'Mexico City' },
  { id: 'R32-8',  fifaMatch: 80, home: '1L',       away: '3-EHIJK',   venue: 'Atlanta' },
  { id: 'R32-9',  fifaMatch: 81, home: '1D',       away: '3-BEFIJ',   venue: 'San Francisco' },
  { id: 'R32-10', fifaMatch: 82, home: '1G',       away: '3-AEHIJ',   venue: 'Seattle' },
  { id: 'R32-11', fifaMatch: 83, home: '2K',       away: '2L',        venue: 'Toronto' },
  { id: 'R32-12', fifaMatch: 84, home: '1H',       away: '2J',        venue: 'Los Angeles' },
  { id: 'R32-13', fifaMatch: 85, home: '1B',       away: '3-EFGIJ',   venue: 'Vancouver' },
  { id: 'R32-14', fifaMatch: 86, home: '1J',       away: '2H',        venue: 'Miami' },
  { id: 'R32-15', fifaMatch: 87, home: '1K',       away: '3-DEIJL',   venue: 'Kansas City' },
  { id: 'R32-16', fifaMatch: 88, home: '2D',       away: '2G',        venue: 'Dallas' },
]

// R16 — winner of R32-i meets winner of R32-j, per FIFA's bracket lines.
// Internal ids R16-1..R16-8 map to FIFA matches 89-96.
export const R16_TEMPLATE: Array<{ id: string; fifaMatch: number; sources: [string, string]; venue: string }> = [
  { id: 'R16-1', fifaMatch: 89, sources: ['R32-2', 'R32-5'],   venue: 'Philadelphia' },        // W74 v W77
  { id: 'R16-2', fifaMatch: 90, sources: ['R32-1', 'R32-3'],   venue: 'Houston' },             // W73 v W75
  { id: 'R16-3', fifaMatch: 91, sources: ['R32-4', 'R32-6'],   venue: 'New York / New Jersey'},// W76 v W78
  { id: 'R16-4', fifaMatch: 92, sources: ['R32-7', 'R32-8'],   venue: 'Mexico City' },          // W79 v W80
  { id: 'R16-5', fifaMatch: 93, sources: ['R32-11', 'R32-12'], venue: 'Dallas' },               // W83 v W84
  { id: 'R16-6', fifaMatch: 94, sources: ['R32-9', 'R32-10'],  venue: 'Seattle' },              // W81 v W82
  { id: 'R16-7', fifaMatch: 95, sources: ['R32-14', 'R32-16'], venue: 'Atlanta' },              // W86 v W88
  { id: 'R16-8', fifaMatch: 96, sources: ['R32-13', 'R32-15'], venue: 'Vancouver' },            // W85 v W87
]

// QF — 4 matches, FIFA 97-100.
export const QF_TEMPLATE: Array<{ id: string; fifaMatch: number; sources: [string, string]; venue: string }> = [
  { id: 'QF-1', fifaMatch:  97, sources: ['R16-1', 'R16-2'], venue: 'Boston' },        // W89 v W90
  { id: 'QF-2', fifaMatch:  98, sources: ['R16-5', 'R16-6'], venue: 'Los Angeles' },   // W93 v W94
  { id: 'QF-3', fifaMatch:  99, sources: ['R16-3', 'R16-4'], venue: 'Miami' },         // W91 v W92
  { id: 'QF-4', fifaMatch: 100, sources: ['R16-7', 'R16-8'], venue: 'Kansas City' },   // W95 v W96
]

// SF — 2 matches, FIFA 101-102.
export const SF_TEMPLATE: Array<{ id: string; fifaMatch: number; sources: [string, string]; venue: string }> = [
  { id: 'SF-1', fifaMatch: 101, sources: ['QF-1', 'QF-2'], venue: 'Dallas' },          // W97 v W98
  { id: 'SF-2', fifaMatch: 102, sources: ['QF-3', 'QF-4'], venue: 'Atlanta' },         // W99 v W100
]

// Final + bronze-medal match.
export const FINAL_TEMPLATE = { id: 'FINAL', fifaMatch: 104, sources: ['SF-1', 'SF-2'] as const, venue: 'New York / New Jersey' }
export const BRONZE_TEMPLATE = { id: 'TP-1',  fifaMatch: 103, sources: ['SF-1', 'SF-2'] as const, venue: 'Miami' }

/**
 * Resolve a GroupPos placeholder (e.g. '1A', '2B', '3-ABCDF') to a team
 * code, given the user's group standings and 3rd-place assignment.
 *
 * @param pos  Slot in the FIFA template ('1A' / '2B' / '3-ABCDF' etc.)
 * @param groupStandings  letter → [1st, 2nd, 3rd, 4th] codes
 * @param thirdAssignment  R32 slot id → code (from solveThirdPlaceAssignment)
 * @param r32SlotId  The current R32 slot we're resolving for, to look up the third
 */
export function resolveSlot(
  pos: GroupPos,
  groupStandings: Partial<Record<string, string[]>>,
  thirdAssignment: Map<string, string>,
  r32SlotId: string
): string | null {
  if (pos.startsWith('3-')) {
    return thirdAssignment.get(r32SlotId) ?? null
  }
  const placeChar = pos[0]
  const groupLetter = pos[1]
  const placeIndex = placeChar === '1' ? 0 : 1  // 1st or 2nd
  const ordered = groupStandings[groupLetter]
  return ordered?.[placeIndex] ?? null
}

/**
 * Bipartite-match the 8 advancing 3rd-placed teams to the 8 R32 slots that
 * need a 3rd, respecting each slot's allowed groups (the part after '3-').
 *
 * FIFA's Annex C precomputes this in a 495-row table; backtracking over 8
 * slots × 8 candidates is well under 1ms and gives a valid assignment for
 * every legal input, which is what we need for prediction UI.
 *
 * @param advancingThirds  Up to 8 team codes the user picked as advancing
 * @param thirdGroupOf  code → group letter the team finished 3rd in
 * @returns Map<R32_slot_id, team_code> for the 8 R32 slots needing a 3rd
 */
export function solveThirdPlaceAssignment(
  advancingThirds: string[],
  thirdGroupOf: (code: string) => string | undefined
): Map<string, string> {
  // The 8 R32 slots that consume a 3rd, in template order, with their
  // allowed-groups set.
  const thirdSlots = R32_TEMPLATE
    .filter((s) => s.away.startsWith('3-'))
    .map((s) => ({ id: s.id, allowed: new Set(s.away.slice(2).split('')) }))

  // Eligible candidates per slot — those whose 3rd-place group is allowed.
  const candidatesPerSlot = thirdSlots.map((slot) => ({
    id: slot.id,
    candidates: advancingThirds.filter((code) => {
      const g = thirdGroupOf(code)
      return !!g && slot.allowed.has(g)
    }),
  }))

  // Backtracking — assign each slot one of its candidates, never reusing
  // a team. Try slots in ascending order of candidate count so we fail
  // fast on the most-constrained slots.
  const ordered = [...candidatesPerSlot].sort((a, b) => a.candidates.length - b.candidates.length)
  const assignment = new Map<string, string>()
  const used = new Set<string>()

  function backtrack(i: number): boolean {
    if (i === ordered.length) return true
    const { id, candidates } = ordered[i]
    for (const code of candidates) {
      if (used.has(code)) continue
      assignment.set(id, code)
      used.add(code)
      if (backtrack(i + 1)) return true
      assignment.delete(id)
      used.delete(code)
    }
    return false
  }
  backtrack(0)
  return assignment
}

/**
 * Helper — given the user's full groupStandings, returns a map from
 * 3rd-placed team code to its group letter. The wizard uses this to
 * feed solveThirdPlaceAssignment().
 */
export function buildThirdGroupMap(
  groupStandings: Partial<Record<string, string[]>>
): Map<string, string> {
  const out = new Map<string, string>()
  for (const [letter, ordered] of Object.entries(groupStandings)) {
    if (ordered && ordered.length >= 3) out.set(ordered[2], letter)
  }
  return out
}
