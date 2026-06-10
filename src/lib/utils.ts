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
//
// Coverage: all 211 FIFA member associations + a few historical aliases ESPN
// occasionally still emits (TPE for Taiwan, KOR/PRK split, etc.). We map from
// ESPN's 3-letter code (mostly IOC/FIFA), with ENG/SCO/WAL/NIR mapped to the
// UK constituent flag subdomains flagcdn supports.
const ESPN_ABBR_TO_ISO2: Record<string, string> = {
  // ─── CAF (Africa, 54) ───
  MAR: 'ma', SEN: 'sn', EGY: 'eg', ALG: 'dz', NGA: 'ng', GHA: 'gh', CIV: 'ci', CMR: 'cm',
  TUN: 'tn', RSA: 'za', MLI: 'ml', BFA: 'bf', GNB: 'gw', GAB: 'ga', CGO: 'cg', AGO: 'ao',
  KEN: 'ke', UGA: 'ug', TAN: 'tz', ETH: 'et', SUD: 'sd', LBY: 'ly', MAD: 'mg', MOZ: 'mz',
  ZAM: 'zm', ZIM: 'zw', BOT: 'bw', NAM: 'na', NIG: 'ne', TCD: 'td', CTA: 'cf', COD: 'cd',
  BEN: 'bj', TOG: 'tg', MTN: 'mr', LBR: 'lr', SLE: 'sl', GUI: 'gn', EQG: 'gq', CPV: 'cv',
  STP: 'st', COM: 'km', DJI: 'dj', ERI: 'er', MWI: 'mw', LES: 'ls', SWZ: 'sz', RWA: 'rw',
  BDI: 'bi', SOM: 'so', SSD: 'ss', GAM: 'gm', MRI: 'mu', SEY: 'sc',
  // ESPN sometimes uses DRC instead of COD
  DRC: 'cd', CAF: 'cf',
  // ─── CONMEBOL (South America, 10) ───
  ARG: 'ar', BRA: 'br', URU: 'uy', COL: 'co', CHI: 'cl', PAR: 'py', PER: 'pe', ECU: 'ec',
  BOL: 'bo', VEN: 've',
  // ─── CONCACAF (N./C. America + Caribbean, 41) ───
  USA: 'us', MEX: 'mx', CAN: 'ca', CRC: 'cr', PAN: 'pa', JAM: 'jm', HON: 'hn', SLV: 'sv',
  GUA: 'gt', HAI: 'ht', CUB: 'cu', TRI: 'tt', NCA: 'ni', BLZ: 'bz', DOM: 'do', BAR: 'bb',
  BAH: 'bs', BER: 'bm', GUY: 'gy', SUR: 'sr', ATG: 'ag', GRN: 'gd', VIN: 'vc', DMA: 'dm',
  LCA: 'lc', AIA: 'ai', TCA: 'tc', VGB: 'vg', CAY: 'ky', MSR: 'ms', ARU: 'aw', CUW: 'cw',
  PUR: 'pr', VIR: 'vi', SKN: 'kn', PUE: 'pr',
  // ─── UEFA (Europe, 55) ───
  ESP: 'es', POR: 'pt', FRA: 'fr', ENG: 'gb-eng', GER: 'de', ITA: 'it', NED: 'nl', BEL: 'be',
  CRO: 'hr', SUI: 'ch', AUT: 'at', DEN: 'dk', SWE: 'se', NOR: 'no', POL: 'pl', UKR: 'ua',
  SRB: 'rs', WAL: 'gb-wls', SCO: 'gb-sct', NIR: 'gb-nir', IRL: 'ie', CZE: 'cz', SVK: 'sk',
  TUR: 'tr', GRE: 'gr', RUS: 'ru', HUN: 'hu', ROU: 'ro', BUL: 'bg', ISL: 'is', ALB: 'al',
  BIH: 'ba', MNE: 'me', MKD: 'mk', SVN: 'si', AND: 'ad', ARM: 'am', AZE: 'az', BLR: 'by',
  CYP: 'cy', EST: 'ee', FIN: 'fi', FRO: 'fo', GEO: 'ge', GIB: 'gi', KOS: 'xk', LAT: 'lv',
  LIE: 'li', LTU: 'lt', LUX: 'lu', MLT: 'mt', MDA: 'md', MON: 'mc', SMR: 'sm', ISR: 'il',
  // ─── AFC (Asia, 47) ───
  JPN: 'jp', KOR: 'kr', IRN: 'ir', KSA: 'sa', AUS: 'au', QAT: 'qa', UAE: 'ae', JOR: 'jo',
  IRQ: 'iq', OMA: 'om', UZB: 'uz', CHN: 'cn', VIE: 'vn', THA: 'th', LBN: 'lb', SYR: 'sy',
  IDN: 'id', IND: 'in', PAK: 'pk', AFG: 'af', KGZ: 'kg', TJK: 'tj', TKM: 'tm', KAZ: 'kz',
  BAN: 'bd', BHR: 'bh', KUW: 'kw', YEM: 'ye', HKG: 'hk', MAC: 'mo', MYA: 'mm', MAS: 'my',
  PHI: 'ph', MGL: 'mn', NEP: 'np', PRK: 'kp', SRI: 'lk', SGP: 'sg', TPE: 'tw', PLE: 'ps',
  BHU: 'bt', BRU: 'bn', TLS: 'tl', MDV: 'mv', LAO: 'la', CAM: 'kh', GUM: 'gu', MNP: 'mp',
  // Alternative ESPN codes
  PRC: 'cn', ROK: 'kr',
  // ─── OFC (Oceania, 11) ───
  NZL: 'nz', FIJ: 'fj', SOL: 'sb', PNG: 'pg', TAH: 'pf', COK: 'ck', VAN: 'vu', SAM: 'ws',
  TGA: 'to', ASA: 'as', NCL: 'nc',
}

/**
 * Returns a usable logo/flag URL for a team given its primary URL and abbr.
 * If `primary` is set we use it; otherwise we fall back to flagcdn for
 * national teams whose ISO2 code we know.
 *
 * For the rare team that isn't in our ESPN_ABBR_TO_ISO2 map (e.g. ESPN
 * sometimes returns a 2-letter or invented abbr), we return undefined and
 * let the caller render a placeholder. Better to show nothing than a
 * broken-image icon.
 */
export function teamBadgeFallback(primary: string | undefined, abbr: string | undefined): string | undefined {
  // Filter out ESPN's "no logo" placeholder URLs — they encode a generic
  // shield, not a flag. Detected by the magic substring 'soccer-ball-default'
  // or 'default-team-logo' that ESPN uses for unsupported teams.
  const primaryClean = primary && !/default-team-logo|soccer-ball-default|\/500-dark\/soccer\.png$/.test(primary)
    ? primary
    : undefined
  if (primaryClean) return primaryClean
  if (!abbr) return undefined
  const iso = ESPN_ABBR_TO_ISO2[abbr.toUpperCase()]
  if (!iso) return undefined
  return `https://flagcdn.com/w80/${iso}.png`
}
