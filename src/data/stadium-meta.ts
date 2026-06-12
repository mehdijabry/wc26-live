// Extended metadata for each WC26 host stadium — used by the
// StadiumSheet modal. Photo + history come from Wikipedia at runtime
// (no hot-linking commons URLs that might 404). Climate uses
// climatological June-July averages from public sources (NOAA for US,
// SMN for Mexico, ECCC for Canada). Roof + surface describe each
// venue's normal configuration — FIFA mandates natural grass for the
// tournament, so the listed surface may be overlaid with temporary
// natural turf for WC26 matches.

export type StadiumMeta = {
  /** Wikipedia article title (URL-encoded form) for the page summary API. */
  wikiTitle: string
  /** ESPN venue.fullName values that map to this stadium. ESPN uses
   *  current sponsor names (e.g. 'Estadio Banorte' for what's still
   *  commonly known as Estadio Azteca). */
  espnNames: string[]
  opened: number
  roof: 'open' | 'fixed' | 'retractable'
  /** Stadium's standard playing surface. WC26 matches use natural
   *  grass overlays regardless. */
  surface: 'natural grass' | 'hybrid' | 'artificial turf'
  /** June-July climatological averages. */
  climate: {
    avgHighC: number
    avgLowC: number
    /** Short qualitative descriptor — 'dry', 'moderate', 'humid', 'very humid'. */
    humidity: string
    /** One-line note on the most relevant weather risk for matches. */
    risk: string
  }
}

export const stadiumMeta: Record<string, StadiumMeta> = {
  atl: {
    wikiTitle: 'Mercedes-Benz_Stadium',
    espnNames: ['Mercedes-Benz Stadium'],
    opened: 2017,
    roof: 'retractable',
    surface: 'artificial turf',
    climate: {
      avgHighC: 31, avgLowC: 22,
      humidity: 'humid',
      risk: 'Frequent late-afternoon thunderstorms in June and July.',
    },
  },
  bos: {
    wikiTitle: 'Gillette_Stadium',
    espnNames: ['Gillette Stadium'],
    opened: 2002,
    roof: 'open',
    surface: 'artificial turf',
    climate: {
      avgHighC: 27, avgLowC: 18,
      humidity: 'moderate',
      risk: 'Coastal weather — occasional fog or quick-moving storms.',
    },
  },
  dal: {
    wikiTitle: 'AT%26T_Stadium',
    espnNames: ['AT&T Stadium'],
    opened: 2009,
    roof: 'retractable',
    surface: 'artificial turf',
    climate: {
      avgHighC: 35, avgLowC: 24,
      humidity: 'moderate',
      risk: 'Extreme heat — heat-stress mitigation expected if roof open.',
    },
  },
  gdl: {
    wikiTitle: 'Estadio_Akron',
    espnNames: ['Estadio Akron'],
    opened: 2010,
    roof: 'open',
    surface: 'natural grass',
    climate: {
      avgHighC: 28, avgLowC: 15,
      humidity: 'moderate',
      risk: 'Rainy season — short, heavy late-afternoon downpours common.',
    },
  },
  hou: {
    wikiTitle: 'NRG_Stadium',
    espnNames: ['NRG Stadium'],
    opened: 2002,
    roof: 'retractable',
    surface: 'artificial turf',
    climate: {
      avgHighC: 33, avgLowC: 24,
      humidity: 'very humid',
      risk: 'Heat + humidity peak in July — roof likely closed for player welfare.',
    },
  },
  kan: {
    wikiTitle: 'Arrowhead_Stadium',
    espnNames: ['Arrowhead Stadium', 'GEHA Field at Arrowhead Stadium'],
    opened: 1972,
    roof: 'open',
    surface: 'natural grass',
    climate: {
      avgHighC: 31, avgLowC: 21,
      humidity: 'humid',
      risk: 'Hot, humid, with severe thunderstorm potential.',
    },
  },
  lax: {
    wikiTitle: 'SoFi_Stadium',
    espnNames: ['SoFi Stadium'],
    opened: 2020,
    roof: 'fixed',
    surface: 'natural grass',
    climate: {
      avgHighC: 25, avgLowC: 17,
      humidity: 'dry',
      risk: 'Marine layer mornings — clears by mid-afternoon. Mild overall.',
    },
  },
  mex: {
    wikiTitle: 'Estadio_Azteca',
    espnNames: ['Estadio Azteca', 'Estadio Banorte'],
    opened: 1966,
    roof: 'open',
    surface: 'natural grass',
    climate: {
      avgHighC: 23, avgLowC: 12,
      humidity: 'moderate',
      risk: 'Altitude (2240m) + rainy season — afternoon storms, thinner air.',
    },
  },
  mia: {
    wikiTitle: 'Hard_Rock_Stadium',
    espnNames: ['Hard Rock Stadium'],
    opened: 1987,
    roof: 'open',
    surface: 'natural grass',
    climate: {
      avgHighC: 32, avgLowC: 25,
      humidity: 'very humid',
      risk: 'Daily thunderstorms expected — kickoff times tilted later to dodge them.',
    },
  },
  mty: {
    wikiTitle: 'Estadio_BBVA',
    espnNames: ['Estadio BBVA', 'Estadio BBVA Bancomer'],
    opened: 2015,
    roof: 'open',
    surface: 'natural grass',
    climate: {
      avgHighC: 34, avgLowC: 23,
      humidity: 'moderate',
      risk: 'Hot and dusty — wind-shielded by surrounding mountains.',
    },
  },
  nyc: {
    wikiTitle: 'MetLife_Stadium',
    espnNames: ['MetLife Stadium'],
    opened: 2010,
    roof: 'open',
    surface: 'artificial turf',
    climate: {
      avgHighC: 28, avgLowC: 19,
      humidity: 'moderate',
      risk: 'Generally mild, occasional thunderstorm cells in July.',
    },
  },
  phi: {
    wikiTitle: 'Lincoln_Financial_Field',
    espnNames: ['Lincoln Financial Field'],
    opened: 2003,
    roof: 'open',
    surface: 'natural grass',
    climate: {
      avgHighC: 30, avgLowC: 20,
      humidity: 'humid',
      risk: 'Hot, humid mid-Atlantic summer with thunderstorm risk.',
    },
  },
  sfo: {
    wikiTitle: 'Levi%27s_Stadium',
    espnNames: ["Levi's Stadium"],
    opened: 2014,
    roof: 'open',
    surface: 'natural grass',
    climate: {
      avgHighC: 27, avgLowC: 14,
      humidity: 'dry',
      risk: 'Dry, mild Mediterranean summer — almost zero rain risk.',
    },
  },
  sea: {
    wikiTitle: 'Lumen_Field',
    espnNames: ['Lumen Field'],
    opened: 2002,
    roof: 'open',
    surface: 'artificial turf',
    climate: {
      avgHighC: 23, avgLowC: 13,
      humidity: 'dry',
      risk: 'Coolest WC26 venue — Pacific summer is dry and mild.',
    },
  },
  tor: {
    wikiTitle: 'BMO_Field',
    espnNames: ['BMO Field'],
    opened: 2007,
    roof: 'open',
    surface: 'natural grass',
    climate: {
      avgHighC: 26, avgLowC: 17,
      humidity: 'moderate',
      risk: 'Lake-influenced — fast-changing skies, occasional storm cells.',
    },
  },
  van: {
    wikiTitle: 'BC_Place',
    espnNames: ['BC Place'],
    opened: 1983,
    roof: 'retractable',
    surface: 'artificial turf',
    climate: {
      avgHighC: 22, avgLowC: 14,
      humidity: 'moderate',
      risk: 'Coolest with potential drizzle — retractable roof gives flexibility.',
    },
  },
}
