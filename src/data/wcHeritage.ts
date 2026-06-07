/**
 * Static FIFA World Cup heritage per nation.
 * Source: FIFA official records. Used by the History tab in TeamSheet
 * to show palmarès — appearances, titles, best result, last edition.
 * Keyed by ESPN national-team abbreviation (uppercase).
 */

export type WcHeritage = {
  appearances: number
  bestResult: string
  bestYear?: number
  titles?: number
  runnerUp?: number
  semifinalsCount?: number
  lastAppearance?: number
  lastResult?: string
}

export const WC_HERITAGE: Record<string, WcHeritage> = {
  // ─── Conmebol ────────────────────────────────────────────
  BRA: { appearances: 22, bestResult: 'Champions', bestYear: 2002, titles: 5, runnerUp: 2, semifinalsCount: 11, lastAppearance: 2022, lastResult: 'Quarter-finals' },
  ARG: { appearances: 18, bestResult: 'Champions', bestYear: 2022, titles: 3, runnerUp: 3, semifinalsCount: 6, lastAppearance: 2022, lastResult: 'Champions' },
  URU: { appearances: 14, bestResult: 'Champions', bestYear: 1950, titles: 2, runnerUp: 0, semifinalsCount: 5, lastAppearance: 2022, lastResult: 'Group stage' },
  COL: { appearances: 6, bestResult: 'Quarter-finals', bestYear: 2014, lastAppearance: 2018, lastResult: 'Round of 16' },
  CHI: { appearances: 9, bestResult: 'Third place', bestYear: 1962, lastAppearance: 2014, lastResult: 'Round of 16' },
  PAR: { appearances: 8, bestResult: 'Quarter-finals', bestYear: 2010, lastAppearance: 2010, lastResult: 'Quarter-finals' },
  ECU: { appearances: 4, bestResult: 'Round of 16', bestYear: 2006, lastAppearance: 2022, lastResult: 'Group stage' },
  PER: { appearances: 5, bestResult: 'Quarter-finals', bestYear: 1970, lastAppearance: 2018, lastResult: 'Group stage' },
  BOL: { appearances: 3, bestResult: 'Group stage', lastAppearance: 1994 },
  VEN: { appearances: 1, bestResult: 'First appearance', bestYear: 2026, lastAppearance: 2026 },

  // ─── UEFA ────────────────────────────────────────────────
  GER: { appearances: 20, bestResult: 'Champions', bestYear: 2014, titles: 4, runnerUp: 4, semifinalsCount: 13, lastAppearance: 2022, lastResult: 'Group stage' },
  ITA: { appearances: 18, bestResult: 'Champions', bestYear: 2006, titles: 4, runnerUp: 2, semifinalsCount: 8, lastAppearance: 2014, lastResult: 'Group stage' },
  FRA: { appearances: 16, bestResult: 'Champions', bestYear: 2018, titles: 2, runnerUp: 2, semifinalsCount: 6, lastAppearance: 2022, lastResult: 'Runner-up' },
  ESP: { appearances: 16, bestResult: 'Champions', bestYear: 2010, titles: 1, runnerUp: 0, semifinalsCount: 2, lastAppearance: 2022, lastResult: 'Round of 16' },
  ENG: { appearances: 16, bestResult: 'Champions', bestYear: 1966, titles: 1, runnerUp: 0, semifinalsCount: 3, lastAppearance: 2022, lastResult: 'Quarter-finals' },
  NED: { appearances: 11, bestResult: 'Runner-up', bestYear: 2010, runnerUp: 3, semifinalsCount: 5, lastAppearance: 2022, lastResult: 'Quarter-finals' },
  POR: { appearances: 8, bestResult: 'Third place', bestYear: 1966, semifinalsCount: 2, lastAppearance: 2022, lastResult: 'Quarter-finals' },
  BEL: { appearances: 14, bestResult: 'Third place', bestYear: 2018, semifinalsCount: 2, lastAppearance: 2022, lastResult: 'Group stage' },
  POL: { appearances: 9, bestResult: 'Third place', bestYear: 1974, semifinalsCount: 2, lastAppearance: 2022, lastResult: 'Round of 16' },
  CRO: { appearances: 6, bestResult: 'Runner-up', bestYear: 2018, runnerUp: 1, semifinalsCount: 2, lastAppearance: 2022, lastResult: 'Third place' },
  SUI: { appearances: 12, bestResult: 'Quarter-finals', bestYear: 1934, lastAppearance: 2022, lastResult: 'Round of 16' },
  AUT: { appearances: 7, bestResult: 'Third place', bestYear: 1954, lastAppearance: 1998 },
  DEN: { appearances: 6, bestResult: 'Quarter-finals', bestYear: 1998, lastAppearance: 2022, lastResult: 'Group stage' },
  SWE: { appearances: 12, bestResult: 'Runner-up', bestYear: 1958, runnerUp: 1, semifinalsCount: 2, lastAppearance: 2018, lastResult: 'Quarter-finals' },
  NOR: { appearances: 3, bestResult: 'Round of 16', bestYear: 1998, lastAppearance: 1998 },
  TUR: { appearances: 2, bestResult: 'Third place', bestYear: 2002, lastAppearance: 2002 },
  CZE: { appearances: 9, bestResult: 'Runner-up', bestYear: 1934, runnerUp: 2, semifinalsCount: 2, lastAppearance: 2006, lastResult: 'Group stage' },
  SCO: { appearances: 8, bestResult: 'Group stage', lastAppearance: 1998 },
  WAL: { appearances: 2, bestResult: 'Quarter-finals', bestYear: 1958, lastAppearance: 2022, lastResult: 'Group stage' },
  IRL: { appearances: 3, bestResult: 'Quarter-finals', bestYear: 1990, lastAppearance: 2002 },
  SVK: { appearances: 1, bestResult: 'Round of 16', bestYear: 2010, lastAppearance: 2010 },
  UKR: { appearances: 1, bestResult: 'Quarter-finals', bestYear: 2006, lastAppearance: 2006 },
  SRB: { appearances: 13, bestResult: 'Runner-up', bestYear: 1930, runnerUp: 0, semifinalsCount: 1, lastAppearance: 2022, lastResult: 'Group stage' },
  BIH: { appearances: 1, bestResult: 'Group stage', lastAppearance: 2014 },
  ISL: { appearances: 1, bestResult: 'Group stage', lastAppearance: 2018 },
  ALB: { appearances: 0, bestResult: 'First appearance', bestYear: 2026, lastAppearance: 2026 },

  // ─── CAF ─────────────────────────────────────────────────
  MAR: { appearances: 7, bestResult: 'Fourth place', bestYear: 2022, semifinalsCount: 1, lastAppearance: 2022, lastResult: 'Fourth place' },
  SEN: { appearances: 4, bestResult: 'Quarter-finals', bestYear: 2002, lastAppearance: 2022, lastResult: 'Round of 16' },
  CMR: { appearances: 9, bestResult: 'Quarter-finals', bestYear: 1990, lastAppearance: 2022, lastResult: 'Group stage' },
  NGA: { appearances: 7, bestResult: 'Round of 16', bestYear: 1994, lastAppearance: 2018, lastResult: 'Group stage' },
  GHA: { appearances: 5, bestResult: 'Quarter-finals', bestYear: 2010, lastAppearance: 2022, lastResult: 'Group stage' },
  CIV: { appearances: 3, bestResult: 'Group stage', lastAppearance: 2014 },
  EGY: { appearances: 3, bestResult: 'Group stage', lastAppearance: 2018 },
  TUN: { appearances: 6, bestResult: 'Group stage', lastAppearance: 2022 },
  ALG: { appearances: 4, bestResult: 'Round of 16', bestYear: 2014, lastAppearance: 2014 },
  RSA: { appearances: 3, bestResult: 'Group stage', lastAppearance: 2010 },
  ANG: { appearances: 1, bestResult: 'Group stage', lastAppearance: 2006 },
  CGO: { appearances: 0, bestResult: 'First appearance', lastAppearance: 2026 },
  CPV: { appearances: 0, bestResult: 'First appearance', lastAppearance: 2026 },

  // ─── CONCACAF ────────────────────────────────────────────
  USA: { appearances: 11, bestResult: 'Third place', bestYear: 1930, semifinalsCount: 1, lastAppearance: 2022, lastResult: 'Round of 16' },
  MEX: { appearances: 17, bestResult: 'Quarter-finals', bestYear: 1986, lastAppearance: 2022, lastResult: 'Group stage' },
  CAN: { appearances: 3, bestResult: 'Group stage', lastAppearance: 2022 },
  CRC: { appearances: 6, bestResult: 'Quarter-finals', bestYear: 2014, lastAppearance: 2022, lastResult: 'Group stage' },
  HON: { appearances: 3, bestResult: 'Group stage', lastAppearance: 2014 },
  PAN: { appearances: 1, bestResult: 'Group stage', lastAppearance: 2018 },
  JAM: { appearances: 1, bestResult: 'Group stage', lastAppearance: 1998 },
  HAI: { appearances: 1, bestResult: 'Group stage', lastAppearance: 1974 },
  CUB: { appearances: 1, bestResult: 'Quarter-finals', bestYear: 1938, lastAppearance: 1938 },
  TRI: { appearances: 1, bestResult: 'Group stage', lastAppearance: 2006 },

  // ─── AFC ─────────────────────────────────────────────────
  KOR: { appearances: 11, bestResult: 'Fourth place', bestYear: 2002, semifinalsCount: 1, lastAppearance: 2022, lastResult: 'Round of 16' },
  JPN: { appearances: 7, bestResult: 'Round of 16', bestYear: 2002, lastAppearance: 2022, lastResult: 'Round of 16' },
  IRN: { appearances: 6, bestResult: 'Group stage', lastAppearance: 2022 },
  KSA: { appearances: 6, bestResult: 'Round of 16', bestYear: 1994, lastAppearance: 2022, lastResult: 'Group stage' },
  AUS: { appearances: 6, bestResult: 'Round of 16', bestYear: 2006, lastAppearance: 2022, lastResult: 'Round of 16' },
  QAT: { appearances: 1, bestResult: 'Group stage', lastAppearance: 2022, lastResult: 'Group stage (host)' },
  UAE: { appearances: 1, bestResult: 'Group stage', lastAppearance: 1990 },
  IRQ: { appearances: 1, bestResult: 'Group stage', lastAppearance: 1986 },
  UZB: { appearances: 0, bestResult: 'First appearance', lastAppearance: 2026 },
  JOR: { appearances: 0, bestResult: 'First appearance', lastAppearance: 2026 },

  // ─── OFC ─────────────────────────────────────────────────
  NZL: { appearances: 2, bestResult: 'Group stage', lastAppearance: 2010 },
}

export function heritageFor(abbr: string | undefined | null): WcHeritage | null {
  if (!abbr) return null
  return WC_HERITAGE[abbr.toUpperCase()] ?? null
}
