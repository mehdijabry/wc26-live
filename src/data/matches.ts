// FIFA World Cup 2026 — match schedule.
//
// Group-stage block (M01..M72) is GENERATED from ESPN's /tournament
// feed and cross-verified against the December 2025 draw (teams.ts).
// Source: scripts/regen-matches.py — re-run after any fixture change
// (rare; FIFA's published schedule is locked once the draw lands).
//
// Knockout block (R32, R16, QF, SF, TP, FINAL) uses symbolic placeholders
// (W-A, RU-C, 3-DEF, etc.) that the bracket wizard resolves when the
// user predicts group standings. Real team codes get filled in by
// bracket.ts at render time, NOT here — keeping these symbolic means
// the schedule structure survives any change of opinion in the wizard.
//
// Stadium codes match src/data/stadiums.ts (atl, bos, dal, gdl, hou,
// kan, lax, mex, mia, mty, nyc, phi, sea, sfo, tor, van).
// Team codes match src/data/teams.ts (48 qualified nations).

export type MatchStage =
  | 'group'
  | 'r32'
  | 'r16'
  | 'qf'
  | 'sf'
  | 'tp' // third-place playoff
  | 'final'

export type Match = {
  id: string
  stage: MatchStage
  group?: string
  home: string // team code
  away: string // team code
  kickoffUTC: string // ISO
  stadium: string // stadium id
  homeScore?: number
  awayScore?: number
  status: 'scheduled' | 'live' | 'finished'
  minute?: number
  broadcast?: { region: string; channel: string }[]
}

// Helper to build ISO from local kick (we use UTC for storage)
const t = (d: string) => `${d}:00.000Z`

export const matches: Match[] = [
  // ─── GROUP STAGE — M01..M72 ────────────────────────────────────
  // Generated from ESPN /tournament 2026-06-12. 12 groups × 6 matches.
  { id: 'M01', stage: 'group', group: 'A', home: 'MEX', away: 'RSA', kickoffUTC: t('2026-06-11T19:00'), stadium: 'mex', status: 'scheduled' },
  { id: 'M02', stage: 'group', group: 'A', home: 'KOR', away: 'CZE', kickoffUTC: t('2026-06-12T02:00'), stadium: 'gdl', status: 'scheduled' },
  { id: 'M03', stage: 'group', group: 'B', home: 'CAN', away: 'BIH', kickoffUTC: t('2026-06-12T19:00'), stadium: 'tor', status: 'scheduled' },
  { id: 'M04', stage: 'group', group: 'D', home: 'USA', away: 'PAR', kickoffUTC: t('2026-06-13T01:00'), stadium: 'lax', status: 'scheduled' },
  { id: 'M05', stage: 'group', group: 'B', home: 'QAT', away: 'SUI', kickoffUTC: t('2026-06-13T19:00'), stadium: 'sfo', status: 'scheduled' },
  { id: 'M06', stage: 'group', group: 'C', home: 'BRA', away: 'MAR', kickoffUTC: t('2026-06-13T22:00'), stadium: 'nyc', status: 'scheduled' },
  { id: 'M07', stage: 'group', group: 'C', home: 'HAI', away: 'SCO', kickoffUTC: t('2026-06-14T01:00'), stadium: 'bos', status: 'scheduled' },
  { id: 'M08', stage: 'group', group: 'D', home: 'AUS', away: 'TUR', kickoffUTC: t('2026-06-14T04:00'), stadium: 'van', status: 'scheduled' },
  { id: 'M09', stage: 'group', group: 'E', home: 'GER', away: 'CUW', kickoffUTC: t('2026-06-14T17:00'), stadium: 'hou', status: 'scheduled' },
  { id: 'M10', stage: 'group', group: 'F', home: 'NED', away: 'JPN', kickoffUTC: t('2026-06-14T20:00'), stadium: 'dal', status: 'scheduled' },
  { id: 'M11', stage: 'group', group: 'E', home: 'CIV', away: 'ECU', kickoffUTC: t('2026-06-14T23:00'), stadium: 'phi', status: 'scheduled' },
  { id: 'M12', stage: 'group', group: 'F', home: 'SWE', away: 'TUN', kickoffUTC: t('2026-06-15T02:00'), stadium: 'mty', status: 'scheduled' },
  { id: 'M13', stage: 'group', group: 'H', home: 'ESP', away: 'CPV', kickoffUTC: t('2026-06-15T16:00'), stadium: 'atl', status: 'scheduled' },
  { id: 'M14', stage: 'group', group: 'G', home: 'BEL', away: 'EGY', kickoffUTC: t('2026-06-15T19:00'), stadium: 'sea', status: 'scheduled' },
  { id: 'M15', stage: 'group', group: 'H', home: 'KSA', away: 'URU', kickoffUTC: t('2026-06-15T22:00'), stadium: 'mia', status: 'scheduled' },
  { id: 'M16', stage: 'group', group: 'G', home: 'IRN', away: 'NZL', kickoffUTC: t('2026-06-16T01:00'), stadium: 'lax', status: 'scheduled' },
  { id: 'M17', stage: 'group', group: 'I', home: 'FRA', away: 'SEN', kickoffUTC: t('2026-06-16T19:00'), stadium: 'nyc', status: 'scheduled' },
  { id: 'M18', stage: 'group', group: 'I', home: 'IRQ', away: 'NOR', kickoffUTC: t('2026-06-16T22:00'), stadium: 'bos', status: 'scheduled' },
  { id: 'M19', stage: 'group', group: 'J', home: 'ARG', away: 'ALG', kickoffUTC: t('2026-06-17T01:00'), stadium: 'kan', status: 'scheduled' },
  { id: 'M20', stage: 'group', group: 'J', home: 'AUT', away: 'JOR', kickoffUTC: t('2026-06-17T04:00'), stadium: 'sfo', status: 'scheduled' },
  { id: 'M21', stage: 'group', group: 'K', home: 'POR', away: 'COD', kickoffUTC: t('2026-06-17T17:00'), stadium: 'hou', status: 'scheduled' },
  { id: 'M22', stage: 'group', group: 'L', home: 'ENG', away: 'CRO', kickoffUTC: t('2026-06-17T20:00'), stadium: 'dal', status: 'scheduled' },
  { id: 'M23', stage: 'group', group: 'L', home: 'GHA', away: 'PAN', kickoffUTC: t('2026-06-17T23:00'), stadium: 'tor', status: 'scheduled' },
  { id: 'M24', stage: 'group', group: 'K', home: 'UZB', away: 'COL', kickoffUTC: t('2026-06-18T02:00'), stadium: 'mex', status: 'scheduled' },
  { id: 'M25', stage: 'group', group: 'A', home: 'CZE', away: 'RSA', kickoffUTC: t('2026-06-18T16:00'), stadium: 'atl', status: 'scheduled' },
  { id: 'M26', stage: 'group', group: 'B', home: 'SUI', away: 'BIH', kickoffUTC: t('2026-06-18T19:00'), stadium: 'lax', status: 'scheduled' },
  { id: 'M27', stage: 'group', group: 'B', home: 'CAN', away: 'QAT', kickoffUTC: t('2026-06-18T22:00'), stadium: 'van', status: 'scheduled' },
  { id: 'M28', stage: 'group', group: 'A', home: 'MEX', away: 'KOR', kickoffUTC: t('2026-06-19T01:00'), stadium: 'gdl', status: 'scheduled' },
  { id: 'M29', stage: 'group', group: 'D', home: 'USA', away: 'AUS', kickoffUTC: t('2026-06-19T19:00'), stadium: 'sea', status: 'scheduled' },
  { id: 'M30', stage: 'group', group: 'C', home: 'SCO', away: 'MAR', kickoffUTC: t('2026-06-19T22:00'), stadium: 'bos', status: 'scheduled' },
  { id: 'M31', stage: 'group', group: 'C', home: 'BRA', away: 'HAI', kickoffUTC: t('2026-06-20T00:30'), stadium: 'phi', status: 'scheduled' },
  { id: 'M32', stage: 'group', group: 'D', home: 'TUR', away: 'PAR', kickoffUTC: t('2026-06-20T03:00'), stadium: 'sfo', status: 'scheduled' },
  { id: 'M33', stage: 'group', group: 'F', home: 'NED', away: 'SWE', kickoffUTC: t('2026-06-20T17:00'), stadium: 'hou', status: 'scheduled' },
  { id: 'M34', stage: 'group', group: 'E', home: 'GER', away: 'CIV', kickoffUTC: t('2026-06-20T20:00'), stadium: 'tor', status: 'scheduled' },
  { id: 'M35', stage: 'group', group: 'E', home: 'ECU', away: 'CUW', kickoffUTC: t('2026-06-21T00:00'), stadium: 'kan', status: 'scheduled' },
  { id: 'M36', stage: 'group', group: 'F', home: 'TUN', away: 'JPN', kickoffUTC: t('2026-06-21T04:00'), stadium: 'mty', status: 'scheduled' },
  { id: 'M37', stage: 'group', group: 'H', home: 'ESP', away: 'KSA', kickoffUTC: t('2026-06-21T16:00'), stadium: 'atl', status: 'scheduled' },
  { id: 'M38', stage: 'group', group: 'G', home: 'BEL', away: 'IRN', kickoffUTC: t('2026-06-21T19:00'), stadium: 'lax', status: 'scheduled' },
  { id: 'M39', stage: 'group', group: 'H', home: 'URU', away: 'CPV', kickoffUTC: t('2026-06-21T22:00'), stadium: 'mia', status: 'scheduled' },
  { id: 'M40', stage: 'group', group: 'G', home: 'NZL', away: 'EGY', kickoffUTC: t('2026-06-22T01:00'), stadium: 'van', status: 'scheduled' },
  { id: 'M41', stage: 'group', group: 'J', home: 'ARG', away: 'AUT', kickoffUTC: t('2026-06-22T17:00'), stadium: 'dal', status: 'scheduled' },
  { id: 'M42', stage: 'group', group: 'I', home: 'FRA', away: 'IRQ', kickoffUTC: t('2026-06-22T21:00'), stadium: 'phi', status: 'scheduled' },
  { id: 'M43', stage: 'group', group: 'I', home: 'NOR', away: 'SEN', kickoffUTC: t('2026-06-23T00:00'), stadium: 'nyc', status: 'scheduled' },
  { id: 'M44', stage: 'group', group: 'J', home: 'JOR', away: 'ALG', kickoffUTC: t('2026-06-23T03:00'), stadium: 'sfo', status: 'scheduled' },
  { id: 'M45', stage: 'group', group: 'K', home: 'POR', away: 'UZB', kickoffUTC: t('2026-06-23T17:00'), stadium: 'hou', status: 'scheduled' },
  { id: 'M46', stage: 'group', group: 'L', home: 'ENG', away: 'GHA', kickoffUTC: t('2026-06-23T20:00'), stadium: 'bos', status: 'scheduled' },
  { id: 'M47', stage: 'group', group: 'L', home: 'PAN', away: 'CRO', kickoffUTC: t('2026-06-23T23:00'), stadium: 'tor', status: 'scheduled' },
  { id: 'M48', stage: 'group', group: 'K', home: 'COL', away: 'COD', kickoffUTC: t('2026-06-24T02:00'), stadium: 'gdl', status: 'scheduled' },
  { id: 'M49', stage: 'group', group: 'B', home: 'BIH', away: 'QAT', kickoffUTC: t('2026-06-24T19:00'), stadium: 'sea', status: 'scheduled' },
  { id: 'M50', stage: 'group', group: 'B', home: 'SUI', away: 'CAN', kickoffUTC: t('2026-06-24T19:00'), stadium: 'van', status: 'scheduled' },
  { id: 'M51', stage: 'group', group: 'C', home: 'MAR', away: 'HAI', kickoffUTC: t('2026-06-24T22:00'), stadium: 'atl', status: 'scheduled' },
  { id: 'M52', stage: 'group', group: 'C', home: 'SCO', away: 'BRA', kickoffUTC: t('2026-06-24T22:00'), stadium: 'mia', status: 'scheduled' },
  { id: 'M53', stage: 'group', group: 'A', home: 'CZE', away: 'MEX', kickoffUTC: t('2026-06-25T01:00'), stadium: 'mex', status: 'scheduled' },
  { id: 'M54', stage: 'group', group: 'A', home: 'RSA', away: 'KOR', kickoffUTC: t('2026-06-25T01:00'), stadium: 'mty', status: 'scheduled' },
  { id: 'M55', stage: 'group', group: 'E', home: 'CUW', away: 'CIV', kickoffUTC: t('2026-06-25T20:00'), stadium: 'phi', status: 'scheduled' },
  { id: 'M56', stage: 'group', group: 'E', home: 'ECU', away: 'GER', kickoffUTC: t('2026-06-25T20:00'), stadium: 'nyc', status: 'scheduled' },
  { id: 'M57', stage: 'group', group: 'F', home: 'JPN', away: 'SWE', kickoffUTC: t('2026-06-25T23:00'), stadium: 'dal', status: 'scheduled' },
  { id: 'M58', stage: 'group', group: 'F', home: 'TUN', away: 'NED', kickoffUTC: t('2026-06-25T23:00'), stadium: 'kan', status: 'scheduled' },
  { id: 'M59', stage: 'group', group: 'D', home: 'PAR', away: 'AUS', kickoffUTC: t('2026-06-26T02:00'), stadium: 'sfo', status: 'scheduled' },
  { id: 'M60', stage: 'group', group: 'D', home: 'TUR', away: 'USA', kickoffUTC: t('2026-06-26T02:00'), stadium: 'lax', status: 'scheduled' },
  { id: 'M61', stage: 'group', group: 'I', home: 'NOR', away: 'FRA', kickoffUTC: t('2026-06-26T19:00'), stadium: 'bos', status: 'scheduled' },
  { id: 'M62', stage: 'group', group: 'I', home: 'SEN', away: 'IRQ', kickoffUTC: t('2026-06-26T19:00'), stadium: 'tor', status: 'scheduled' },
  { id: 'M63', stage: 'group', group: 'H', home: 'CPV', away: 'KSA', kickoffUTC: t('2026-06-27T00:00'), stadium: 'hou', status: 'scheduled' },
  { id: 'M64', stage: 'group', group: 'H', home: 'URU', away: 'ESP', kickoffUTC: t('2026-06-27T00:00'), stadium: 'gdl', status: 'scheduled' },
  { id: 'M65', stage: 'group', group: 'G', home: 'EGY', away: 'IRN', kickoffUTC: t('2026-06-27T03:00'), stadium: 'sea', status: 'scheduled' },
  { id: 'M66', stage: 'group', group: 'G', home: 'NZL', away: 'BEL', kickoffUTC: t('2026-06-27T03:00'), stadium: 'van', status: 'scheduled' },
  { id: 'M67', stage: 'group', group: 'L', home: 'CRO', away: 'GHA', kickoffUTC: t('2026-06-27T21:00'), stadium: 'phi', status: 'scheduled' },
  { id: 'M68', stage: 'group', group: 'L', home: 'PAN', away: 'ENG', kickoffUTC: t('2026-06-27T21:00'), stadium: 'nyc', status: 'scheduled' },
  { id: 'M69', stage: 'group', group: 'K', home: 'COL', away: 'POR', kickoffUTC: t('2026-06-27T23:30'), stadium: 'mia', status: 'scheduled' },
  { id: 'M70', stage: 'group', group: 'K', home: 'COD', away: 'UZB', kickoffUTC: t('2026-06-27T23:30'), stadium: 'atl', status: 'scheduled' },
  { id: 'M71', stage: 'group', group: 'J', home: 'ALG', away: 'AUT', kickoffUTC: t('2026-06-28T02:00'), stadium: 'kan', status: 'scheduled' },
  { id: 'M72', stage: 'group', group: 'J', home: 'JOR', away: 'ARG', kickoffUTC: t('2026-06-28T02:00'), stadium: 'dal', status: 'scheduled' },

  // ─── KNOCKOUT STAGE — symbolic placeholders ──────────────────────
  // Resolved at render time by bracket.ts from the user's predicted
  // group standings. W-X = group winner; RU-X = runner-up; 3-XYZ =
  // one of the top 3rd-placed teams advancing from groups X/Y/Z.

  // Round of 32 — 16 matches across June 28-July 3
  { id: 'R32-1',  stage: 'r32', home: 'W-A',    away: 'RU-B',   kickoffUTC: t('2026-06-28T19:00'), stadium: 'lax', status: 'scheduled' },
  { id: 'R32-2',  stage: 'r32', home: 'W-C',    away: '3-FGH',  kickoffUTC: t('2026-06-29T17:00'), stadium: 'hou', status: 'scheduled' },
  { id: 'R32-3',  stage: 'r32', home: 'W-E',    away: '3-ABDF', kickoffUTC: t('2026-06-29T20:30'), stadium: 'bos', status: 'scheduled' },
  { id: 'R32-4',  stage: 'r32', home: 'W-B',    away: '3-EFGH', kickoffUTC: t('2026-06-30T17:00'), stadium: 'tor', status: 'scheduled' },
  { id: 'R32-5',  stage: 'r32', home: 'W-D',    away: 'RU-F',   kickoffUTC: t('2026-06-30T20:30'), stadium: 'sfo', status: 'scheduled' },
  { id: 'R32-6',  stage: 'r32', home: 'W-G',    away: '3-CDEF', kickoffUTC: t('2026-07-01T00:00'), stadium: 'dal', status: 'scheduled' },
  { id: 'R32-7',  stage: 'r32', home: 'W-F',    away: '3-ACDE', kickoffUTC: t('2026-07-01T17:00'), stadium: 'mty', status: 'scheduled' },
  { id: 'R32-8',  stage: 'r32', home: 'RU-A',   away: 'RU-C',   kickoffUTC: t('2026-07-01T20:30'), stadium: 'sea', status: 'scheduled' },
  { id: 'R32-9',  stage: 'r32', home: 'W-H',    away: '3-IJKL', kickoffUTC: t('2026-07-02T00:00'), stadium: 'atl', status: 'scheduled' },
  { id: 'R32-10', stage: 'r32', home: 'W-I',    away: 'RU-K',   kickoffUTC: t('2026-07-02T17:00'), stadium: 'nyc', status: 'scheduled' },
  { id: 'R32-11', stage: 'r32', home: 'W-K',    away: 'RU-L',   kickoffUTC: t('2026-07-02T20:30'), stadium: 'phi', status: 'scheduled' },
  { id: 'R32-12', stage: 'r32', home: 'W-L',    away: 'RU-J',   kickoffUTC: t('2026-07-03T00:00'), stadium: 'kan', status: 'scheduled' },
  { id: 'R32-13', stage: 'r32', home: 'W-J',    away: 'RU-I',   kickoffUTC: t('2026-07-03T17:00'), stadium: 'mia', status: 'scheduled' },
  { id: 'R32-14', stage: 'r32', home: 'RU-G',   away: 'RU-H',   kickoffUTC: t('2026-07-03T20:30'), stadium: 'van', status: 'scheduled' },
  { id: 'R32-15', stage: 'r32', home: 'RU-E',   away: 'RU-D',   kickoffUTC: t('2026-07-03T23:00'), stadium: 'gdl', status: 'scheduled' },
  { id: 'R32-16', stage: 'r32', home: '3-BCDE', away: '3-HIJK', kickoffUTC: t('2026-07-04T00:00'), stadium: 'mex', status: 'scheduled' },

  // Round of 16 — 8 matches July 4-7
  { id: 'R16-1', stage: 'r16', home: 'W-R32-1',  away: 'W-R32-2',  kickoffUTC: t('2026-07-04T20:00'), stadium: 'lax', status: 'scheduled' },
  { id: 'R16-2', stage: 'r16', home: 'W-R32-3',  away: 'W-R32-4',  kickoffUTC: t('2026-07-05T00:00'), stadium: 'dal', status: 'scheduled' },
  { id: 'R16-3', stage: 'r16', home: 'W-R32-5',  away: 'W-R32-6',  kickoffUTC: t('2026-07-05T17:00'), stadium: 'phi', status: 'scheduled' },
  { id: 'R16-4', stage: 'r16', home: 'W-R32-7',  away: 'W-R32-8',  kickoffUTC: t('2026-07-05T21:00'), stadium: 'mia', status: 'scheduled' },
  { id: 'R16-5', stage: 'r16', home: 'W-R32-9',  away: 'W-R32-10', kickoffUTC: t('2026-07-06T17:00'), stadium: 'nyc', status: 'scheduled' },
  { id: 'R16-6', stage: 'r16', home: 'W-R32-11', away: 'W-R32-12', kickoffUTC: t('2026-07-06T21:00'), stadium: 'atl', status: 'scheduled' },
  { id: 'R16-7', stage: 'r16', home: 'W-R32-13', away: 'W-R32-14', kickoffUTC: t('2026-07-07T17:00'), stadium: 'sfo', status: 'scheduled' },
  { id: 'R16-8', stage: 'r16', home: 'W-R32-15', away: 'W-R32-16', kickoffUTC: t('2026-07-07T21:00'), stadium: 'bos', status: 'scheduled' },

  // Quarter-finals — 4 matches July 9-11
  { id: 'QF-1', stage: 'qf', home: 'W-R16-1', away: 'W-R16-2', kickoffUTC: t('2026-07-09T21:00'), stadium: 'bos', status: 'scheduled' },
  { id: 'QF-2', stage: 'qf', home: 'W-R16-3', away: 'W-R16-4', kickoffUTC: t('2026-07-10T01:00'), stadium: 'lax', status: 'scheduled' },
  { id: 'QF-3', stage: 'qf', home: 'W-R16-5', away: 'W-R16-6', kickoffUTC: t('2026-07-10T21:00'), stadium: 'kan', status: 'scheduled' },
  { id: 'QF-4', stage: 'qf', home: 'W-R16-7', away: 'W-R16-8', kickoffUTC: t('2026-07-11T01:00'), stadium: 'mia', status: 'scheduled' },

  // Semi-finals — July 14-15
  { id: 'SF-1', stage: 'sf', home: 'W-QF-1', away: 'W-QF-2', kickoffUTC: t('2026-07-14T22:00'), stadium: 'dal', status: 'scheduled' },
  { id: 'SF-2', stage: 'sf', home: 'W-QF-3', away: 'W-QF-4', kickoffUTC: t('2026-07-15T22:00'), stadium: 'atl', status: 'scheduled' },

  // Third place playoff + Final
  { id: 'TP',    stage: 'tp',    home: 'L-SF-1', away: 'L-SF-2', kickoffUTC: t('2026-07-18T18:00'), stadium: 'mia', status: 'scheduled' },
  { id: 'FINAL', stage: 'final', home: 'W-SF-1', away: 'W-SF-2', kickoffUTC: t('2026-07-19T19:00'), stadium: 'nyc', status: 'scheduled' },
]

export function matchesByGroup(group: string) {
  return matches.filter((m) => m.group === group)
}

export function nextMatch() {
  const now = Date.now()
  return matches
    .filter((m) => new Date(m.kickoffUTC).getTime() > now)
    .sort((a, b) => new Date(a.kickoffUTC).getTime() - new Date(b.kickoffUTC).getTime())[0]
}

export function openingMatchUTC() {
  return matches[0].kickoffUTC
}

export function finalMatchUTC() {
  return matches.find((m) => m.stage === 'final')?.kickoffUTC ?? '2026-07-19T19:00:00.000Z'
}
