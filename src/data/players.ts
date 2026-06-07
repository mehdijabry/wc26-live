// Player profiles — mock data with realistic structure for v1.
// In v2, will hydrate from Sofascore + ESPN + FIFA.com via Worker proxy.

export type Position = 'GK' | 'DEF' | 'MID' | 'ATT'

export type Player = {
  id: string
  name: string
  teamCode: string // team ISO code (national)
  clubName: string
  clubLeague: string
  position: Position
  shirtNumber: number
  age: number
  height: number // cm
  preferredFoot: 'L' | 'R' | 'B'
  photo?: string // URL
  // Season stats (mock — would come from Sofascore /player/{id})
  season: {
    matches: number
    starts: number
    minutes: number
    goals: number
    assists: number
    yellows: number
    reds: number
    avgRating: number // /10
    keyPasses?: number
    tackles?: number
    clearances?: number
    interceptions?: number
    shots?: number
  }
  formLast5: number[] // last 5 match ratings
  injured?: boolean
  suspended?: boolean
}

// Sample players (we ship a curated set for demo; expandable to 736 squad players later)
export const players: Player[] = [
  // ARGENTINA
  {
    id: 'p-messi', name: 'Lionel Messi', teamCode: 'ARG', clubName: 'Inter Miami CF', clubLeague: 'MLS',
    position: 'ATT', shirtNumber: 10, age: 38, height: 170, preferredFoot: 'L',
    season: { matches: 28, starts: 26, minutes: 2240, goals: 22, assists: 11, yellows: 2, reds: 0, avgRating: 8.4, shots: 96, keyPasses: 75 },
    formLast5: [8.8, 7.9, 9.2, 8.1, 8.6],
  },
  {
    id: 'p-emi-martinez', name: 'Emiliano Martínez', teamCode: 'ARG', clubName: 'Aston Villa', clubLeague: 'Premier League',
    position: 'GK', shirtNumber: 23, age: 33, height: 195, preferredFoot: 'R',
    season: { matches: 32, starts: 32, minutes: 2880, goals: 0, assists: 0, yellows: 4, reds: 0, avgRating: 7.1 },
    formLast5: [7.4, 6.9, 7.2, 7.5, 7.0],
  },
  // FRANCE
  {
    id: 'p-mbappe', name: 'Kylian Mbappé', teamCode: 'FRA', clubName: 'Real Madrid', clubLeague: 'La Liga',
    position: 'ATT', shirtNumber: 10, age: 27, height: 178, preferredFoot: 'R',
    season: { matches: 30, starts: 29, minutes: 2580, goals: 24, assists: 8, yellows: 3, reds: 0, avgRating: 8.2, shots: 134, keyPasses: 52 },
    formLast5: [8.5, 7.4, 8.9, 9.1, 7.8],
  },
  {
    id: 'p-dembele', name: 'Ousmane Dembélé', teamCode: 'FRA', clubName: 'Paris Saint-Germain', clubLeague: 'Ligue 1',
    position: 'ATT', shirtNumber: 11, age: 29, height: 178, preferredFoot: 'B',
    season: { matches: 27, starts: 25, minutes: 2050, goals: 15, assists: 12, yellows: 4, reds: 0, avgRating: 7.9, shots: 78, keyPasses: 64 },
    formLast5: [7.6, 8.4, 7.2, 8.0, 8.3],
  },
  // BRAZIL
  {
    id: 'p-vinicius', name: 'Vinícius Jr.', teamCode: 'BRA', clubName: 'Real Madrid', clubLeague: 'La Liga',
    position: 'ATT', shirtNumber: 7, age: 26, height: 176, preferredFoot: 'R',
    season: { matches: 28, starts: 28, minutes: 2520, goals: 18, assists: 10, yellows: 6, reds: 1, avgRating: 8.0, shots: 102, keyPasses: 58 },
    formLast5: [8.2, 7.5, 8.7, 7.9, 8.4],
  },
  {
    id: 'p-rodrygo', name: 'Rodrygo', teamCode: 'BRA', clubName: 'Real Madrid', clubLeague: 'La Liga',
    position: 'ATT', shirtNumber: 11, age: 25, height: 174, preferredFoot: 'R',
    season: { matches: 30, starts: 24, minutes: 2150, goals: 12, assists: 8, yellows: 3, reds: 0, avgRating: 7.5, shots: 67, keyPasses: 41 },
    formLast5: [7.2, 7.8, 7.4, 7.9, 7.6],
  },
  // SPAIN
  {
    id: 'p-yamal', name: 'Lamine Yamal', teamCode: 'ESP', clubName: 'FC Barcelona', clubLeague: 'La Liga',
    position: 'ATT', shirtNumber: 19, age: 18, height: 180, preferredFoot: 'L',
    season: { matches: 31, starts: 28, minutes: 2410, goals: 14, assists: 16, yellows: 2, reds: 0, avgRating: 8.6, shots: 88, keyPasses: 92 },
    formLast5: [9.1, 8.4, 8.7, 8.9, 9.0],
  },
  {
    id: 'p-pedri', name: 'Pedri', teamCode: 'ESP', clubName: 'FC Barcelona', clubLeague: 'La Liga',
    position: 'MID', shirtNumber: 8, age: 23, height: 174, preferredFoot: 'R',
    season: { matches: 29, starts: 28, minutes: 2480, goals: 6, assists: 10, yellows: 5, reds: 0, avgRating: 7.9, keyPasses: 71, tackles: 42 },
    formLast5: [7.8, 8.1, 7.5, 8.2, 7.9],
  },
  // ENGLAND
  {
    id: 'p-bellingham', name: 'Jude Bellingham', teamCode: 'ENG', clubName: 'Real Madrid', clubLeague: 'La Liga',
    position: 'MID', shirtNumber: 5, age: 22, height: 186, preferredFoot: 'R',
    season: { matches: 28, starts: 27, minutes: 2400, goals: 12, assists: 9, yellows: 6, reds: 0, avgRating: 8.0, keyPasses: 58, tackles: 65 },
    formLast5: [8.2, 7.6, 8.5, 7.9, 8.1],
  },
  {
    id: 'p-saka', name: 'Bukayo Saka', teamCode: 'ENG', clubName: 'Arsenal', clubLeague: 'Premier League',
    position: 'ATT', shirtNumber: 7, age: 24, height: 178, preferredFoot: 'L',
    season: { matches: 30, starts: 29, minutes: 2640, goals: 16, assists: 13, yellows: 3, reds: 0, avgRating: 7.9, shots: 101, keyPasses: 88 },
    formLast5: [7.8, 8.2, 7.6, 8.1, 7.9],
  },
  // PORTUGAL
  {
    id: 'p-ronaldo', name: 'Cristiano Ronaldo', teamCode: 'POR', clubName: 'Al-Nassr', clubLeague: 'Saudi Pro League',
    position: 'ATT', shirtNumber: 7, age: 41, height: 187, preferredFoot: 'R',
    season: { matches: 26, starts: 25, minutes: 2230, goals: 31, assists: 4, yellows: 3, reds: 1, avgRating: 8.1, shots: 142, keyPasses: 28 },
    formLast5: [8.7, 7.9, 8.4, 9.0, 7.6],
  },
  {
    id: 'p-fernandes', name: 'Bruno Fernandes', teamCode: 'POR', clubName: 'Manchester United', clubLeague: 'Premier League',
    position: 'MID', shirtNumber: 8, age: 31, height: 179, preferredFoot: 'R',
    season: { matches: 32, starts: 31, minutes: 2780, goals: 14, assists: 12, yellows: 7, reds: 0, avgRating: 7.6, keyPasses: 95, tackles: 38 },
    formLast5: [7.4, 7.9, 7.2, 7.8, 7.5],
  },
  // GERMANY
  {
    id: 'p-musiala', name: 'Jamal Musiala', teamCode: 'GER', clubName: 'Bayern München', clubLeague: 'Bundesliga',
    position: 'MID', shirtNumber: 10, age: 22, height: 184, preferredFoot: 'R',
    season: { matches: 26, starts: 24, minutes: 2050, goals: 11, assists: 14, yellows: 2, reds: 0, avgRating: 8.0, keyPasses: 82, tackles: 28 },
    formLast5: [8.2, 7.6, 8.5, 8.0, 8.4],
  },
  // NETHERLANDS
  {
    id: 'p-vandijk', name: 'Virgil van Dijk', teamCode: 'NED', clubName: 'Liverpool', clubLeague: 'Premier League',
    position: 'DEF', shirtNumber: 4, age: 34, height: 193, preferredFoot: 'R',
    season: { matches: 32, starts: 32, minutes: 2880, goals: 3, assists: 1, yellows: 4, reds: 0, avgRating: 7.8, tackles: 48, clearances: 124, interceptions: 51 },
    formLast5: [7.9, 7.6, 8.1, 7.4, 7.8],
  },
  // MEXICO
  {
    id: 'p-edson-alvarez', name: 'Edson Álvarez', teamCode: 'MEX', clubName: 'West Ham United', clubLeague: 'Premier League',
    position: 'MID', shirtNumber: 4, age: 28, height: 187, preferredFoot: 'R',
    season: { matches: 29, starts: 27, minutes: 2410, goals: 2, assists: 1, yellows: 9, reds: 1, avgRating: 7.0, tackles: 95, clearances: 41, interceptions: 62 },
    formLast5: [7.1, 6.8, 7.4, 6.9, 7.2],
  },
  // USA
  {
    id: 'p-pulisic', name: 'Christian Pulisic', teamCode: 'USA', clubName: 'AC Milan', clubLeague: 'Serie A',
    position: 'ATT', shirtNumber: 10, age: 27, height: 178, preferredFoot: 'R',
    season: { matches: 31, starts: 28, minutes: 2480, goals: 14, assists: 9, yellows: 4, reds: 0, avgRating: 7.6, shots: 75, keyPasses: 62 },
    formLast5: [7.8, 7.4, 7.9, 7.3, 7.7],
  },
  // MOROCCO
  {
    id: 'p-hakimi', name: 'Achraf Hakimi', teamCode: 'MAR', clubName: 'Paris Saint-Germain', clubLeague: 'Ligue 1',
    position: 'DEF', shirtNumber: 2, age: 27, height: 181, preferredFoot: 'R',
    season: { matches: 30, starts: 30, minutes: 2700, goals: 7, assists: 12, yellows: 6, reds: 0, avgRating: 7.8, tackles: 71, interceptions: 55, keyPasses: 58 },
    formLast5: [7.9, 7.5, 8.2, 7.6, 8.0],
  },
  // CANADA
  {
    id: 'p-david', name: 'Jonathan David', teamCode: 'CAN', clubName: 'Juventus', clubLeague: 'Serie A',
    position: 'ATT', shirtNumber: 20, age: 26, height: 182, preferredFoot: 'R',
    season: { matches: 28, starts: 26, minutes: 2300, goals: 17, assists: 5, yellows: 3, reds: 0, avgRating: 7.6, shots: 88, keyPasses: 32 },
    formLast5: [7.8, 7.4, 7.9, 7.5, 8.0],
  },
]

// Custom WC2026 Hub player rating algorithm (0-100)
// Factors: consistency, weighted output by position, quality, recent form, availability
export function computeRating(p: Player): { score: number; tier: string; tierColor: string } {
  const s = p.season
  const minutesPossible = s.matches * 90 || 1
  const consistency = Math.min(15, (s.minutes / minutesPossible) * 15)

  let output = 0
  if (p.position === 'ATT') output = s.goals * 1.2 + s.assists * 0.9 + (s.shots || 0) * 0.08
  else if (p.position === 'MID') output = s.assists * 1.3 + (s.keyPasses || 0) * 0.15 + (s.tackles || 0) * 0.1 + s.goals * 1.0
  else if (p.position === 'DEF') output = (s.tackles || 0) * 0.2 + (s.clearances || 0) * 0.12 + (s.interceptions || 0) * 0.18 + s.assists * 0.5
  else output = (s.matches - 0) * 0.3 // GK simplified
  output = Math.min(30, output)

  const quality = Math.max(0, Math.min(15, (s.avgRating - 6.5) * 10))
  const form = p.formLast5.length > 0
    ? Math.max(0, Math.min(20, (p.formLast5.reduce((a, b) => a + b, 0) / p.formLast5.length - 6.5) * 12))
    : 10
  const availability = (p.injured ? -8 : 0) + (p.suspended ? -4 : 0)
  const reliability = 15 // cap base
  const total = Math.round(consistency + output + quality + form + availability + reliability)
  const score = Math.max(0, Math.min(100, total))

  let tier = 'Watch', tierColor = 'text-slate-400'
  if (score >= 90) { tier = 'Elite ⭐'; tierColor = 'text-accent-gold' }
  else if (score >= 80) { tier = 'Top form 🔥'; tierColor = 'text-orange-400' }
  else if (score >= 70) { tier = 'Reliable ✅'; tierColor = 'text-accent-green' }
  else if (score >= 60) { tier = 'Watch 📈'; tierColor = 'text-blue-400' }
  else { tier = 'Wildcard ⚠️'; tierColor = 'text-slate-500' }
  return { score, tier, tierColor }
}
