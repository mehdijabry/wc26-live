/**
 * FIFA WC26 deterministic knockout bracket template.
 *
 * Source: ESPN's live tournament feed for WC26 R32 (see the R32_TEMPLATE
 * validation script at scripts/verify-bracket.py — every slot below was
 * cross-checked against ESPN's actual matchups on 2026-06-30 and matched
 * byte-for-byte). The R16 → QF → SF → Final pattern is FIFA's standard
 * "side by side" ladder confirmed by ESPN's shortName codes ("RD16 W1 @
 * RD16 W2" etc.).
 *
 * Previous version of this file used FIFA "Annex C" symbolic slots like
 * `3-ABCDF` for the third-placed teams and a bipartite matcher to solve
 * which advancing 3rd went into which slot. That was wrong — the WC26
 * bracket actually pre-assigns which group's 3rd goes to which R32 slot,
 * so each slot is literally "3D", "3E", "3F", …, no matcher required.
 * The bad version was pairing NED (1F) against USA (1D) in the same
 * quarter-final path when they can't actually meet before the semi.
 *
 * Match numbers below correspond to FIFA's official numbering (73-104).
 * Our internal ids stay sequential (R32-1..R32-16, R16-1..R16-8, etc.).
 */

// Every slot is exactly two chars: position ('1' | '2' | '3') + group letter.
export type GroupPos = `${'1' | '2' | '3'}${string}`

export type R32Slot = {
  id: string          // internal id: 'R32-1' ... 'R32-16'
  fifaMatch: number   // 73-88
  home: GroupPos      // e.g. '1F', '2C', '3D'
  away: GroupPos
  venue: string
}

// R32 — 16 matches, order matches ESPN's R32 chronology.
// Each slot has a literal group-position for both sides. No more '3-XXXXX'
// wildcards: ESPN and FIFA agree, this is the exact matchup.
export const R32_TEMPLATE: R32Slot[] = [
  { id: 'R32-1',  fifaMatch: 73, home: '2A', away: '2B', venue: 'Los Angeles' },
  { id: 'R32-2',  fifaMatch: 74, home: '1C', away: '2F', venue: 'Houston' },
  { id: 'R32-3',  fifaMatch: 75, home: '1E', away: '3D', venue: 'Foxborough' },
  { id: 'R32-4',  fifaMatch: 76, home: '1F', away: '2C', venue: 'Philadelphia' },
  { id: 'R32-5',  fifaMatch: 77, home: '2E', away: '2I', venue: 'Miami' },
  { id: 'R32-6',  fifaMatch: 78, home: '1I', away: '3F', venue: 'Atlanta' },
  { id: 'R32-7',  fifaMatch: 79, home: '1A', away: '3E', venue: 'Mexico City' },
  { id: 'R32-8',  fifaMatch: 80, home: '1L', away: '3K', venue: 'San Francisco' },
  { id: 'R32-9',  fifaMatch: 81, home: '1G', away: '3I', venue: 'Guadalajara' },
  { id: 'R32-10', fifaMatch: 82, home: '1D', away: '3B', venue: 'Dallas' },
  { id: 'R32-11', fifaMatch: 83, home: '1H', away: '2J', venue: 'Seattle' },
  { id: 'R32-12', fifaMatch: 84, home: '2K', away: '2L', venue: 'Kansas City' },
  { id: 'R32-13', fifaMatch: 85, home: '1B', away: '3J', venue: 'Monterrey' },
  { id: 'R32-14', fifaMatch: 86, home: '2D', away: '2G', venue: 'New York / New Jersey' },
  { id: 'R32-15', fifaMatch: 87, home: '1J', away: '2H', venue: 'Vancouver' },
  { id: 'R32-16', fifaMatch: 88, home: '1K', away: '3L', venue: 'Toronto' },
]

// R16 — 8 matches, FIFA 89-96. Standard "side by side" ladder: W(R32-2i-1)
// vs W(R32-2i). Confirmed by ESPN QF shortNames ("RD16 W1 @ RD16 W2" etc.).
export const R16_TEMPLATE: Array<{ id: string; fifaMatch: number; sources: [string, string]; venue: string }> = [
  { id: 'R16-1', fifaMatch: 89, sources: ['R32-1', 'R32-2'],   venue: 'Houston' },
  { id: 'R16-2', fifaMatch: 90, sources: ['R32-3', 'R32-4'],   venue: 'Philadelphia' },
  { id: 'R16-3', fifaMatch: 91, sources: ['R32-5', 'R32-6'],   venue: 'New York / New Jersey' },
  { id: 'R16-4', fifaMatch: 92, sources: ['R32-7', 'R32-8'],   venue: 'Mexico City' },
  { id: 'R16-5', fifaMatch: 93, sources: ['R32-9', 'R32-10'],  venue: 'Dallas' },
  { id: 'R16-6', fifaMatch: 94, sources: ['R32-11', 'R32-12'], venue: 'Seattle' },
  { id: 'R16-7', fifaMatch: 95, sources: ['R32-13', 'R32-14'], venue: 'Atlanta' },
  { id: 'R16-8', fifaMatch: 96, sources: ['R32-15', 'R32-16'], venue: 'Vancouver' },
]

// QF — 4 matches, FIFA 97-100. ESPN shortNames: RD16 W2@W1, W6@W5, W4@W3, W8@W7.
export const QF_TEMPLATE: Array<{ id: string; fifaMatch: number; sources: [string, string]; venue: string }> = [
  { id: 'QF-1', fifaMatch:  97, sources: ['R16-1', 'R16-2'], venue: 'Foxborough' },
  { id: 'QF-2', fifaMatch:  98, sources: ['R16-5', 'R16-6'], venue: 'Los Angeles' },
  { id: 'QF-3', fifaMatch:  99, sources: ['R16-3', 'R16-4'], venue: 'Miami' },
  { id: 'QF-4', fifaMatch: 100, sources: ['R16-7', 'R16-8'], venue: 'Kansas City' },
]

// SF — 2 matches, FIFA 101-102. ESPN: QFW2@QFW1, QW4@QFW3.
export const SF_TEMPLATE: Array<{ id: string; fifaMatch: number; sources: [string, string]; venue: string }> = [
  { id: 'SF-1', fifaMatch: 101, sources: ['QF-1', 'QF-2'], venue: 'Dallas' },
  { id: 'SF-2', fifaMatch: 102, sources: ['QF-3', 'QF-4'], venue: 'Atlanta' },
]

// Final + bronze-medal match.
export const FINAL_TEMPLATE = { id: 'FINAL', fifaMatch: 104, sources: ['SF-1', 'SF-2'] as const, venue: 'New York / New Jersey' }
export const BRONZE_TEMPLATE = { id: 'TP-1',  fifaMatch: 103, sources: ['SF-1', 'SF-2'] as const, venue: 'Miami' }

/**
 * Resolve a GroupPos placeholder ('1A', '2C', '3F', …) to a team code,
 * given the user's group standings. The standings map is a partial record
 * of letter → [1st, 2nd, 3rd, 4th] team codes.
 *
 * Signature preserved (thirdAssignment / r32SlotId params) for callsite
 * compatibility even though the new template doesn't need them — passing
 * `new Map()` and any id string works exactly the same.
 */
export function resolveSlot(
  pos: GroupPos,
  groupStandings: Partial<Record<string, string[]>>,
  _thirdAssignment?: Map<string, string>,
  _r32SlotId?: string
): string | null {
  const placeChar = pos[0]
  const groupLetter = pos[1]
  const placeIndex = placeChar === '1' ? 0 : placeChar === '2' ? 1 : placeChar === '3' ? 2 : -1
  if (placeIndex < 0) return null
  const ordered = groupStandings[groupLetter]
  return ordered?.[placeIndex] ?? null
}

/**
 * Kept for backwards compatibility with older wizard code. The new
 * template pre-assigns every 3rd-placed team to a specific R32 slot, so
 * there's nothing to solve. Returns an empty map — resolveSlot handles
 * the '3X' positions directly by reading the 3rd row of the group.
 */
export function solveThirdPlaceAssignment(
  _advancingThirds: string[],
  _thirdGroupOf: (code: string) => string | undefined
): Map<string, string> {
  return new Map()
}

/**
 * Kept for backwards compatibility. Not needed by the new template.
 */
export function buildThirdGroupMap(
  _groupStandings: Partial<Record<string, string[]>>
): Map<string, string> {
  return new Map()
}
