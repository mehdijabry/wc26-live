// FIFA World Cup 2026 — 48 teams (real qualified + plausible draw placeholders for unfilled slots).
// Note: actual group draw happens Dec 5, 2025. Slots marked TBD are intercontinental playoff winners or pending qualifiers at time of build.

export type Team = {
  code: string // ISO 3166-1 alpha-3 (or 'TBD-x')
  name: string
  flag: string // emoji
  confed: 'UEFA' | 'CONMEBOL' | 'AFC' | 'CAF' | 'OFC' | 'CONCACAF' | 'TBD'
  fifaRank?: number
  group?: string
}

export const teams: Team[] = [
  // Hosts (CONCACAF)
  { code: 'CAN', name: 'Canada', flag: '🇨🇦', confed: 'CONCACAF', fifaRank: 28, group: 'A' },
  { code: 'MEX', name: 'Mexico', flag: '🇲🇽', confed: 'CONCACAF', fifaRank: 17, group: 'A' },
  { code: 'USA', name: 'United States', flag: '🇺🇸', confed: 'CONCACAF', fifaRank: 16, group: 'D' },

  // UEFA — top qualifiers
  { code: 'ESP', name: 'Spain', flag: '🇪🇸', confed: 'UEFA', fifaRank: 1, group: 'B' },
  { code: 'FRA', name: 'France', flag: '🇫🇷', confed: 'UEFA', fifaRank: 2, group: 'D' },
  { code: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', confed: 'UEFA', fifaRank: 4, group: 'K' },
  { code: 'POR', name: 'Portugal', flag: '🇵🇹', confed: 'UEFA', fifaRank: 5, group: 'F' },
  { code: 'GER', name: 'Germany', flag: '🇩🇪', confed: 'UEFA', fifaRank: 9, group: 'G' },
  { code: 'NED', name: 'Netherlands', flag: '🇳🇱', confed: 'UEFA', fifaRank: 6, group: 'I' },
  { code: 'BEL', name: 'Belgium', flag: '🇧🇪', confed: 'UEFA', fifaRank: 8, group: 'C' },
  { code: 'CRO', name: 'Croatia', flag: '🇭🇷', confed: 'UEFA', fifaRank: 10, group: 'L' },
  { code: 'SUI', name: 'Switzerland', flag: '🇨🇭', confed: 'UEFA', fifaRank: 19, group: 'H' },
  { code: 'AUT', name: 'Austria', flag: '🇦🇹', confed: 'UEFA', fifaRank: 22, group: 'E' },
  { code: 'NOR', name: 'Norway', flag: '🇳🇴', confed: 'UEFA', fifaRank: 33, group: 'J' },
  { code: 'TUR', name: 'Turkey', flag: '🇹🇷', confed: 'UEFA', fifaRank: 27, group: 'B' },
  { code: 'POL', name: 'Poland', flag: '🇵🇱', confed: 'UEFA', fifaRank: 30, group: 'G' },
  { code: 'DEN', name: 'Denmark', flag: '🇩🇰', confed: 'UEFA', fifaRank: 21, group: 'I' },
  { code: 'CZE', name: 'Czechia', flag: '🇨🇿', confed: 'UEFA', fifaRank: 36, group: 'K' },
  { code: 'SCO', name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', confed: 'UEFA', fifaRank: 38, group: 'F' },

  // CONMEBOL
  { code: 'ARG', name: 'Argentina', flag: '🇦🇷', confed: 'CONMEBOL', fifaRank: 3, group: 'E' },
  { code: 'BRA', name: 'Brazil', flag: '🇧🇷', confed: 'CONMEBOL', fifaRank: 7, group: 'H' },
  { code: 'COL', name: 'Colombia', flag: '🇨🇴', confed: 'CONMEBOL', fifaRank: 12, group: 'J' },
  { code: 'URU', name: 'Uruguay', flag: '🇺🇾', confed: 'CONMEBOL', fifaRank: 14, group: 'C' },
  { code: 'ECU', name: 'Ecuador', flag: '🇪🇨', confed: 'CONMEBOL', fifaRank: 23, group: 'L' },
  { code: 'PAR', name: 'Paraguay', flag: '🇵🇾', confed: 'CONMEBOL', fifaRank: 41, group: 'B' },

  // AFC
  { code: 'JPN', name: 'Japan', flag: '🇯🇵', confed: 'AFC', fifaRank: 18, group: 'F' },
  { code: 'KOR', name: 'South Korea', flag: '🇰🇷', confed: 'AFC', fifaRank: 23, group: 'C' },
  { code: 'IRN', name: 'Iran', flag: '🇮🇷', confed: 'AFC', fifaRank: 20, group: 'G' },
  { code: 'AUS', name: 'Australia', flag: '🇦🇺', confed: 'AFC', fifaRank: 26, group: 'A' },
  { code: 'KSA', name: 'Saudi Arabia', flag: '🇸🇦', confed: 'AFC', fifaRank: 58, group: 'D' },
  { code: 'UZB', name: 'Uzbekistan', flag: '🇺🇿', confed: 'AFC', fifaRank: 57, group: 'I' },
  { code: 'JOR', name: 'Jordan', flag: '🇯🇴', confed: 'AFC', fifaRank: 67, group: 'L' },
  { code: 'IRQ', name: 'Iraq', flag: '🇮🇶', confed: 'AFC', fifaRank: 58, group: 'H' },

  // CAF
  { code: 'MAR', name: 'Morocco', flag: '🇲🇦', confed: 'CAF', fifaRank: 13, group: 'A' },
  { code: 'SEN', name: 'Senegal', flag: '🇸🇳', confed: 'CAF', fifaRank: 18, group: 'E' },
  { code: 'EGY', name: 'Egypt', flag: '🇪🇬', confed: 'CAF', fifaRank: 32, group: 'J' },
  { code: 'ALG', name: 'Algeria', flag: '🇩🇿', confed: 'CAF', fifaRank: 36, group: 'K' },
  { code: 'TUN', name: 'Tunisia', flag: '🇹🇳', confed: 'CAF', fifaRank: 41, group: 'B' },
  { code: 'CIV', name: 'Ivory Coast', flag: '🇨🇮', confed: 'CAF', fifaRank: 40, group: 'F' },
  { code: 'CMR', name: 'Cameroon', flag: '🇨🇲', confed: 'CAF', fifaRank: 53, group: 'D' },
  { code: 'GHA', name: 'Ghana', flag: '🇬🇭', confed: 'CAF', fifaRank: 73, group: 'I' },
  { code: 'RSA', name: 'South Africa', flag: '🇿🇦', confed: 'CAF', fifaRank: 56, group: 'G' },

  // OFC
  { code: 'NZL', name: 'New Zealand', flag: '🇳🇿', confed: 'OFC', fifaRank: 86, group: 'H' },

  // CONCACAF (besides hosts)
  { code: 'PAN', name: 'Panama', flag: '🇵🇦', confed: 'CONCACAF', fifaRank: 35, group: 'L' },
  { code: 'CRC', name: 'Costa Rica', flag: '🇨🇷', confed: 'CONCACAF', fifaRank: 50, group: 'C' },
  { code: 'JAM', name: 'Jamaica', flag: '🇯🇲', confed: 'CONCACAF', fifaRank: 65, group: 'E' },

  // Intercontinental playoff winners (TBD until March 2026)
  { code: 'PLY-1', name: 'Playoff Winner 1', flag: '🏁', confed: 'TBD', group: 'K' },
  { code: 'PLY-2', name: 'Playoff Winner 2', flag: '🏁', confed: 'TBD', group: 'J' },
]

export const groups: Record<string, string[]> = teams.reduce((acc, t) => {
  if (!t.group) return acc
  acc[t.group] = acc[t.group] || []
  acc[t.group].push(t.code)
  return acc
}, {} as Record<string, string[]>)

export function teamByCode(code: string): Team | undefined {
  return teams.find((t) => t.code === code)
}
