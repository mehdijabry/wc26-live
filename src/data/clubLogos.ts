// Real club logos via API-Football media CDN (free, public, CORS-friendly).
// Pattern: https://media.api-sports.io/football/teams/{id}.png
// Source of IDs: api-football.com (free signup); we hardcode the ones we need.

export const CLUB_LOGOS: Record<string, string> = {
  // Top European clubs
  'Real Madrid':            'https://media.api-sports.io/football/teams/541.png',
  'FC Barcelona':           'https://media.api-sports.io/football/teams/529.png',
  'Bayern München':         'https://media.api-sports.io/football/teams/157.png',
  'Paris Saint-Germain':    'https://media.api-sports.io/football/teams/85.png',
  'Manchester United':      'https://media.api-sports.io/football/teams/33.png',
  'Manchester City':        'https://media.api-sports.io/football/teams/50.png',
  'Arsenal':                'https://media.api-sports.io/football/teams/42.png',
  'Liverpool':              'https://media.api-sports.io/football/teams/40.png',
  'Chelsea':                'https://media.api-sports.io/football/teams/49.png',
  'Tottenham':              'https://media.api-sports.io/football/teams/47.png',
  'Aston Villa':            'https://media.api-sports.io/football/teams/66.png',
  'West Ham United':        'https://media.api-sports.io/football/teams/48.png',
  'AC Milan':               'https://media.api-sports.io/football/teams/489.png',
  'Inter Milan':            'https://media.api-sports.io/football/teams/505.png',
  'Juventus':               'https://media.api-sports.io/football/teams/496.png',
  'Napoli':                 'https://media.api-sports.io/football/teams/492.png',
  'Atlético Madrid':        'https://media.api-sports.io/football/teams/530.png',
  'Borussia Dortmund':      'https://media.api-sports.io/football/teams/165.png',
  'Bayer Leverkusen':       'https://media.api-sports.io/football/teams/168.png',
  'RB Leipzig':             'https://media.api-sports.io/football/teams/173.png',

  // Saudi / MLS / other
  'Al-Nassr':               'https://media.api-sports.io/football/teams/2939.png',
  'Al-Hilal':               'https://media.api-sports.io/football/teams/2932.png',
  'Inter Miami CF':         'https://media.api-sports.io/football/teams/9568.png',
  'LAFC':                   'https://media.api-sports.io/football/teams/1599.png',

  // Atlas Lions clubs
  'Fenerbahçe':             'https://media.api-sports.io/football/teams/611.png',
  'Marseille':              'https://media.api-sports.io/football/teams/81.png',
  'Al-Duhail':              'https://media.api-sports.io/football/teams/3105.png',
  'West Ham':               'https://media.api-sports.io/football/teams/48.png',
}

// Get logo with graceful fallback to a generic shield emoji-PNG placeholder.
export function getClubLogo(clubName: string): string | null {
  return CLUB_LOGOS[clubName] ?? null
}
