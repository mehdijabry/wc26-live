import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtDate(iso: string, opts?: Intl.DateTimeFormatOptions) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  })
}

export function timeUntil(iso: string) {
  const target = new Date(iso).getTime()
  const now = Date.now()
  const delta = target - now
  if (delta <= 0) return { d: 0, h: 0, m: 0, s: 0, done: true }
  const d = Math.floor(delta / 86_400_000)
  const h = Math.floor((delta % 86_400_000) / 3_600_000)
  const m = Math.floor((delta % 3_600_000) / 60_000)
  const s = Math.floor((delta % 60_000) / 1000)
  return { d, h, m, s, done: false }
}

export function userTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// ESPN national-team abbreviation → ISO 3166-1 alpha-2 country code for flagcdn.
// Used as a fallback when ESPN doesn't return a team logo URL.
const ESPN_ABBR_TO_ISO2: Record<string, string> = {
  // CAF (Africa)
  MAR: 'ma', SEN: 'sn', EGY: 'eg', ALG: 'dz', NGA: 'ng', GHA: 'gh', CIV: 'ci', CMR: 'cm',
  TUN: 'tn', RSA: 'za', MLI: 'ml', BFA: 'bf', GNB: 'gw', GAB: 'ga', CGO: 'cg', AGO: 'ao',
  // CONMEBOL (South America)
  ARG: 'ar', BRA: 'br', URU: 'uy', COL: 'co', CHI: 'cl', PAR: 'py', PER: 'pe', ECU: 'ec',
  BOL: 'bo', VEN: 've',
  // CONCACAF (N./C. America + Caribbean)
  USA: 'us', MEX: 'mx', CAN: 'ca', CRC: 'cr', PAN: 'pa', JAM: 'jm', HON: 'hn', SLV: 'sv',
  GUA: 'gt', HAI: 'ht', CUB: 'cu', TRI: 'tt',
  // UEFA (Europe)
  ESP: 'es', POR: 'pt', FRA: 'fr', ENG: 'gb-eng', GER: 'de', ITA: 'it', NED: 'nl', BEL: 'be',
  CRO: 'hr', SUI: 'ch', AUT: 'at', DEN: 'dk', SWE: 'se', NOR: 'no', POL: 'pl', UKR: 'ua',
  SRB: 'rs', WAL: 'gb-wls', SCO: 'gb-sct', NIR: 'gb-nir', IRL: 'ie', CZE: 'cz', SVK: 'sk',
  TUR: 'tr', GRE: 'gr', RUS: 'ru', HUN: 'hu', ROU: 'ro', BUL: 'bg', ISL: 'is', ALB: 'al',
  BIH: 'ba', MNE: 'me', MKD: 'mk', SVN: 'si',
  // AFC (Asia)
  JPN: 'jp', KOR: 'kr', IRN: 'ir', KSA: 'sa', AUS: 'au', QAT: 'qa', UAE: 'ae', JOR: 'jo',
  IRQ: 'iq', OMA: 'om', UZB: 'uz', CHN: 'cn', VIE: 'vn', THA: 'th', LBN: 'lb', SYR: 'sy',
  IDN: 'id', IND: 'in',
  // OFC (Oceania)
  NZL: 'nz', FIJ: 'fj', SOL: 'sb', PNG: 'pg', TAH: 'pf',
}

/**
 * Returns a usable logo/flag URL for a team given its primary URL and abbr.
 * If `primary` is set we use it; otherwise we fall back to flagcdn for
 * national teams whose ISO2 code we know.
 */
export function teamBadgeFallback(primary: string | undefined, abbr: string | undefined): string | undefined {
  if (primary) return primary
  if (!abbr) return undefined
  const iso = ESPN_ABBR_TO_ISO2[abbr.toUpperCase()]
  if (!iso) return undefined
  return `https://flagcdn.com/w80/${iso}.png`
}
