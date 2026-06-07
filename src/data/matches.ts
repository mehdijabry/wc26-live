// Match schedule — group stage (key fixtures by group). Real fixtures published by FIFA after draw.
// Times stored in UTC ISO 8601 and converted to user TZ in the UI.

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
  // ─── OPENING MATCH ───
  { id: 'M01', stage: 'group', group: 'A', home: 'MEX', away: 'TBD-A3', kickoffUTC: t('2026-06-11T20:00'), stadium: 'mex', status: 'scheduled',
    broadcast: [{ region: 'FR', channel: 'TF1 / beIN Sports' }, { region: 'CA', channel: 'TSN / RDS' }, { region: 'US', channel: 'FOX / Telemundo' }] },

  // Day 1+
  { id: 'M02', stage: 'group', group: 'A', home: 'CAN', away: 'AUS', kickoffUTC: t('2026-06-12T19:00'), stadium: 'tor', status: 'scheduled' },
  { id: 'M03', stage: 'group', group: 'B', home: 'ESP', away: 'TUR', kickoffUTC: t('2026-06-12T22:00'), stadium: 'lax', status: 'scheduled' },
  { id: 'M04', stage: 'group', group: 'C', home: 'BEL', away: 'KOR', kickoffUTC: t('2026-06-13T16:00'), stadium: 'phi', status: 'scheduled' },
  { id: 'M05', stage: 'group', group: 'C', home: 'URU', away: 'CRC', kickoffUTC: t('2026-06-13T19:00'), stadium: 'mia', status: 'scheduled' },
  { id: 'M06', stage: 'group', group: 'D', home: 'USA', away: 'KSA', kickoffUTC: t('2026-06-13T22:00'), stadium: 'nyc', status: 'scheduled' },
  { id: 'M07', stage: 'group', group: 'D', home: 'FRA', away: 'CMR', kickoffUTC: t('2026-06-14T01:00'), stadium: 'dal', status: 'scheduled' },
  { id: 'M08', stage: 'group', group: 'E', home: 'ARG', away: 'JAM', kickoffUTC: t('2026-06-14T18:00'), stadium: 'hou', status: 'scheduled' },
  { id: 'M09', stage: 'group', group: 'E', home: 'SEN', away: 'AUT', kickoffUTC: t('2026-06-14T21:00'), stadium: 'atl', status: 'scheduled' },
  { id: 'M10', stage: 'group', group: 'F', home: 'POR', away: 'JPN', kickoffUTC: t('2026-06-15T00:00'), stadium: 'sea', status: 'scheduled' },
  { id: 'M11', stage: 'group', group: 'F', home: 'CIV', away: 'SCO', kickoffUTC: t('2026-06-15T03:00'), stadium: 'sfo', status: 'scheduled' },
  { id: 'M12', stage: 'group', group: 'G', home: 'GER', away: 'POL', kickoffUTC: t('2026-06-15T18:00'), stadium: 'kan', status: 'scheduled' },
  { id: 'M13', stage: 'group', group: 'G', home: 'IRN', away: 'RSA', kickoffUTC: t('2026-06-15T21:00'), stadium: 'bos', status: 'scheduled' },
  { id: 'M14', stage: 'group', group: 'H', home: 'BRA', away: 'NZL', kickoffUTC: t('2026-06-16T01:00'), stadium: 'mia', status: 'scheduled' },
  { id: 'M15', stage: 'group', group: 'H', home: 'SUI', away: 'IRQ', kickoffUTC: t('2026-06-16T04:00'), stadium: 'dal', status: 'scheduled' },
  { id: 'M16', stage: 'group', group: 'I', home: 'NED', away: 'UZB', kickoffUTC: t('2026-06-16T18:00'), stadium: 'phi', status: 'scheduled' },
  { id: 'M17', stage: 'group', group: 'I', home: 'DEN', away: 'GHA', kickoffUTC: t('2026-06-16T21:00'), stadium: 'tor', status: 'scheduled' },
  { id: 'M18', stage: 'group', group: 'J', home: 'COL', away: 'BOL', kickoffUTC: t('2026-06-17T00:00'), stadium: 'nyc', status: 'scheduled' },
  { id: 'M19', stage: 'group', group: 'J', home: 'NOR', away: 'EGY', kickoffUTC: t('2026-06-17T03:00'), stadium: 'lax', status: 'scheduled' },
  { id: 'M20', stage: 'group', group: 'K', home: 'ENG', away: 'COD', kickoffUTC: t('2026-06-17T19:00'), stadium: 'atl', status: 'scheduled' },
  { id: 'M21', stage: 'group', group: 'K', home: 'CZE', away: 'ALG', kickoffUTC: t('2026-06-17T22:00'), stadium: 'gdl', status: 'scheduled' },
  { id: 'M22', stage: 'group', group: 'L', home: 'CRO', away: 'JOR', kickoffUTC: t('2026-06-18T01:00'), stadium: 'mty', status: 'scheduled' },
  { id: 'M23', stage: 'group', group: 'L', home: 'ECU', away: 'PAN', kickoffUTC: t('2026-06-18T04:00'), stadium: 'hou', status: 'scheduled' },

  // Second round (matchday 2) — abbreviated sample
  { id: 'M24', stage: 'group', group: 'A', home: 'CAN', away: 'MEX', kickoffUTC: t('2026-06-19T19:00'), stadium: 'van', status: 'scheduled' },
  { id: 'M25', stage: 'group', group: 'B', home: 'ESP', away: 'PAR', kickoffUTC: t('2026-06-19T22:00'), stadium: 'kan', status: 'scheduled' },
  { id: 'M26', stage: 'group', group: 'D', home: 'FRA', away: 'USA', kickoffUTC: t('2026-06-20T22:00'), stadium: 'nyc', status: 'scheduled' },
  { id: 'M27', stage: 'group', group: 'F', home: 'POR', away: 'CIV', kickoffUTC: t('2026-06-22T22:00'), stadium: 'atl', status: 'scheduled' },
  { id: 'M28', stage: 'group', group: 'H', home: 'BRA', away: 'SUI', kickoffUTC: t('2026-06-23T22:00'), stadium: 'dal', status: 'scheduled' },

  // Knockout placeholders (winners determined dynamically by predictions)
  { id: 'R32-1', stage: 'r32', home: 'W-A', away: 'RU-C', kickoffUTC: t('2026-06-28T17:00'), stadium: 'phi', status: 'scheduled' },
  { id: 'R32-2', stage: 'r32', home: 'W-B', away: 'RU-D', kickoffUTC: t('2026-06-28T21:00'), stadium: 'nyc', status: 'scheduled' },
  { id: 'R32-3', stage: 'r32', home: 'W-C', away: '3-DEF', kickoffUTC: t('2026-06-29T17:00'), stadium: 'mia', status: 'scheduled' },
  { id: 'R32-4', stage: 'r32', home: 'W-D', away: '3-BEF', kickoffUTC: t('2026-06-29T21:00'), stadium: 'dal', status: 'scheduled' },

  { id: 'R16-1', stage: 'r16', home: 'W-R32-1', away: 'W-R32-2', kickoffUTC: t('2026-07-04T20:00'), stadium: 'lax', status: 'scheduled' },
  { id: 'QF-1', stage: 'qf', home: 'W-R16-1', away: 'W-R16-2', kickoffUTC: t('2026-07-09T21:00'), stadium: 'bos', status: 'scheduled' },
  { id: 'SF-1', stage: 'sf', home: 'W-QF-1', away: 'W-QF-2', kickoffUTC: t('2026-07-14T22:00'), stadium: 'dal', status: 'scheduled' },
  { id: 'TP', stage: 'tp', home: 'L-SF-1', away: 'L-SF-2', kickoffUTC: t('2026-07-18T18:00'), stadium: 'mia', status: 'scheduled' },
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
