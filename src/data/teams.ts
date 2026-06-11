// FIFA World Cup 2026 — 48 qualified teams + final group draw.
//
// Final draw held December 5, 2025 at the JFK Center for the Performing
// Arts, Washington DC. Source: Wikipedia + FIFA official + ESPN match
// schedule (all three cross-checked). Earlier versions of this file
// shipped pre-draw placeholder assignments — those have been replaced
// in full. Cameroon, Poland, Denmark, Costa Rica, Jamaica and Bolivia
// did NOT qualify and have been removed from the dataset.

export type Team = {
  code: string // ISO 3166-1 alpha-3 (ESPN-style abbreviations)
  name: string
  flag: string // emoji
  confed: 'UEFA' | 'CONMEBOL' | 'AFC' | 'CAF' | 'OFC' | 'CONCACAF'
  fifaRank?: number
  group?: string
}

export const teams: Team[] = [
  // ─── Group A ──────────────────────────────────────────────────
  { code: 'MEX', name: 'Mexico',         flag: '🇲🇽', confed: 'CONCACAF', fifaRank: 17, group: 'A' },
  { code: 'RSA', name: 'South Africa',   flag: '🇿🇦', confed: 'CAF',      fifaRank: 56, group: 'A' },
  { code: 'KOR', name: 'South Korea',    flag: '🇰🇷', confed: 'AFC',      fifaRank: 23, group: 'A' },
  { code: 'CZE', name: 'Czechia',        flag: '🇨🇿', confed: 'UEFA',     fifaRank: 36, group: 'A' },

  // ─── Group B ──────────────────────────────────────────────────
  { code: 'CAN', name: 'Canada',                 flag: '🇨🇦', confed: 'CONCACAF', fifaRank: 28, group: 'B' },
  { code: 'BIH', name: 'Bosnia and Herzegovina', flag: '🇧🇦', confed: 'UEFA',     fifaRank: 75, group: 'B' },
  { code: 'QAT', name: 'Qatar',                  flag: '🇶🇦', confed: 'AFC',      fifaRank: 46, group: 'B' },
  { code: 'SUI', name: 'Switzerland',            flag: '🇨🇭', confed: 'UEFA',     fifaRank: 19, group: 'B' },

  // ─── Group C ──────────────────────────────────────────────────
  { code: 'BRA', name: 'Brazil',   flag: '🇧🇷', confed: 'CONMEBOL', fifaRank: 7,  group: 'C' },
  { code: 'MAR', name: 'Morocco',  flag: '🇲🇦', confed: 'CAF',      fifaRank: 13, group: 'C' },
  { code: 'HAI', name: 'Haiti',    flag: '🇭🇹', confed: 'CONCACAF', fifaRank: 83, group: 'C' },
  { code: 'SCO', name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', confed: 'UEFA',     fifaRank: 38, group: 'C' },

  // ─── Group D ──────────────────────────────────────────────────
  { code: 'USA', name: 'United States', flag: '🇺🇸', confed: 'CONCACAF', fifaRank: 16, group: 'D' },
  { code: 'PAR', name: 'Paraguay',      flag: '🇵🇾', confed: 'CONMEBOL', fifaRank: 41, group: 'D' },
  { code: 'AUS', name: 'Australia',     flag: '🇦🇺', confed: 'AFC',      fifaRank: 26, group: 'D' },
  { code: 'TUR', name: 'Turkey',        flag: '🇹🇷', confed: 'UEFA',     fifaRank: 27, group: 'D' },

  // ─── Group E ──────────────────────────────────────────────────
  { code: 'GER', name: 'Germany',     flag: '🇩🇪', confed: 'UEFA',     fifaRank: 9,  group: 'E' },
  { code: 'CUW', name: 'Curaçao',     flag: '🇨🇼', confed: 'CONCACAF', fifaRank: 91, group: 'E' },
  { code: 'CIV', name: 'Ivory Coast', flag: '🇨🇮', confed: 'CAF',      fifaRank: 40, group: 'E' },
  { code: 'ECU', name: 'Ecuador',     flag: '🇪🇨', confed: 'CONMEBOL', fifaRank: 23, group: 'E' },

  // ─── Group F ──────────────────────────────────────────────────
  { code: 'NED', name: 'Netherlands', flag: '🇳🇱', confed: 'UEFA', fifaRank: 6,  group: 'F' },
  { code: 'JPN', name: 'Japan',       flag: '🇯🇵', confed: 'AFC',  fifaRank: 18, group: 'F' },
  { code: 'SWE', name: 'Sweden',      flag: '🇸🇪', confed: 'UEFA', fifaRank: 37, group: 'F' },
  { code: 'TUN', name: 'Tunisia',     flag: '🇹🇳', confed: 'CAF',  fifaRank: 41, group: 'F' },

  // ─── Group G ──────────────────────────────────────────────────
  { code: 'BEL', name: 'Belgium',     flag: '🇧🇪', confed: 'UEFA', fifaRank: 8,  group: 'G' },
  { code: 'EGY', name: 'Egypt',       flag: '🇪🇬', confed: 'CAF',  fifaRank: 32, group: 'G' },
  { code: 'IRN', name: 'Iran',        flag: '🇮🇷', confed: 'AFC',  fifaRank: 20, group: 'G' },
  { code: 'NZL', name: 'New Zealand', flag: '🇳🇿', confed: 'OFC',  fifaRank: 86, group: 'G' },

  // ─── Group H ──────────────────────────────────────────────────
  { code: 'ESP', name: 'Spain',        flag: '🇪🇸', confed: 'UEFA',     fifaRank: 1,  group: 'H' },
  { code: 'CPV', name: 'Cape Verde',   flag: '🇨🇻', confed: 'CAF',      fifaRank: 70, group: 'H' },
  { code: 'KSA', name: 'Saudi Arabia', flag: '🇸🇦', confed: 'AFC',      fifaRank: 58, group: 'H' },
  { code: 'URU', name: 'Uruguay',      flag: '🇺🇾', confed: 'CONMEBOL', fifaRank: 14, group: 'H' },

  // ─── Group I ──────────────────────────────────────────────────
  { code: 'FRA', name: 'France',  flag: '🇫🇷', confed: 'UEFA', fifaRank: 2,  group: 'I' },
  { code: 'SEN', name: 'Senegal', flag: '🇸🇳', confed: 'CAF',  fifaRank: 18, group: 'I' },
  { code: 'IRQ', name: 'Iraq',    flag: '🇮🇶', confed: 'AFC',  fifaRank: 58, group: 'I' },
  { code: 'NOR', name: 'Norway',  flag: '🇳🇴', confed: 'UEFA', fifaRank: 33, group: 'I' },

  // ─── Group J ──────────────────────────────────────────────────
  { code: 'ARG', name: 'Argentina', flag: '🇦🇷', confed: 'CONMEBOL', fifaRank: 3,  group: 'J' },
  { code: 'ALG', name: 'Algeria',   flag: '🇩🇿', confed: 'CAF',      fifaRank: 36, group: 'J' },
  { code: 'AUT', name: 'Austria',   flag: '🇦🇹', confed: 'UEFA',     fifaRank: 22, group: 'J' },
  { code: 'JOR', name: 'Jordan',    flag: '🇯🇴', confed: 'AFC',      fifaRank: 67, group: 'J' },

  // ─── Group K ──────────────────────────────────────────────────
  { code: 'POR', name: 'Portugal',   flag: '🇵🇹', confed: 'UEFA',     fifaRank: 5,  group: 'K' },
  { code: 'COD', name: 'DR Congo',   flag: '🇨🇩', confed: 'CAF',      fifaRank: 60, group: 'K' },
  { code: 'UZB', name: 'Uzbekistan', flag: '🇺🇿', confed: 'AFC',      fifaRank: 57, group: 'K' },
  { code: 'COL', name: 'Colombia',   flag: '🇨🇴', confed: 'CONMEBOL', fifaRank: 12, group: 'K' },

  // ─── Group L ──────────────────────────────────────────────────
  { code: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', confed: 'UEFA',     fifaRank: 4,  group: 'L' },
  { code: 'CRO', name: 'Croatia', flag: '🇭🇷', confed: 'UEFA',     fifaRank: 10, group: 'L' },
  { code: 'GHA', name: 'Ghana',   flag: '🇬🇭', confed: 'CAF',      fifaRank: 73, group: 'L' },
  { code: 'PAN', name: 'Panama',  flag: '🇵🇦', confed: 'CONCACAF', fifaRank: 35, group: 'L' },
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

// Continental champions — the site's official pick for each confederation.
// One title per continent, displayed subtly on the group list (text-only, no emoji).
export const CONTINENTAL_CHAMPIONS: Record<string, { code: string; short: string; label: string; tone: string }> = {
  CAF:      { code: 'MAR', short: 'CAF champ',      label: 'Champion of Africa',        tone: 'from-red-700/15 via-yellow-700/5 to-green-700/15 ring-red-500/20' },
  UEFA:     { code: 'ESP', short: 'UEFA champ',     label: 'Champion of Europe',        tone: 'from-red-600/10 via-yellow-600/5 to-yellow-700/10 ring-yellow-500/20' },
  CONMEBOL: { code: 'ARG', short: 'CONMEBOL champ', label: 'Champion of South America', tone: 'from-sky-600/15 via-white/5 to-sky-600/15 ring-sky-400/20' },
  AFC:      { code: 'JPN', short: 'AFC champ',      label: 'Champion of Asia',          tone: 'from-red-600/15 via-white/5 to-red-700/15 ring-red-500/20' },
  CONCACAF: { code: 'USA', short: 'CONCACAF champ', label: 'Champion of CONCACAF',      tone: 'from-blue-700/15 via-white/5 to-red-700/15 ring-blue-400/20' },
  OFC:      { code: 'NZL', short: 'OFC champ',      label: 'Champion of Oceania',       tone: 'from-slate-600/10 via-white/5 to-slate-700/10 ring-slate-400/20' },
}

export function getContinentalChampion(teamCode: string) {
  const champ = Object.values(CONTINENTAL_CHAMPIONS).find((c) => c.code === teamCode)
  return champ
}
