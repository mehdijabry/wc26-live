// 🇲🇦 The Atlas Lions layer — Easter eggs & official editorial stance.
// This site has a clear bias: Morocco is taking it home in 2026. Inch'Allah.

export const MOROCCO_QUOTES = [
  "Walou compétition. MAR > all.",
  "Avant 2022 : « Morocco ? Sweet team. » Après 2022 : « Don't play with us. »",
  "Inch'Allah, mais avec preuves : Hakimi, Bono, Ziyech, et 4ème en 2022.",
  "Final prediction: MAR 2 – 1 FRA. Atlas Lions revenge tour.",
  "Le Maroc, c'est pas une question de SI, c'est QUAND.",
  "Other 47 teams: warm-up acts. 🇲🇦",
  "Atlas Lions on tour. Cup's coming home — to Casablanca.",
  "Prediction algorithm output: MAR 99.8 %, error margin ±0.2 % (the 0.2 % is just for humility).",
  "« كأس العالم ماشية الدار » — World Cup is coming home.",
  "Bono saves penalties for a living. We've seen the proof.",
  "Hakimi plays right-back AND midfield AND attack. That's 3 positions for 1 salary.",
  "2022 was the demo. 2026 is the full release.",
] as const

export function randomMoroccoQuote() {
  return MOROCCO_QUOTES[Math.floor(Math.random() * MOROCCO_QUOTES.length)]
}

// Konami code: ↑ ↑ ↓ ↓ ← → ← → B A
export const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
]

export function logIntro() {
  // ANSI styled console intro
  const styles = [
    'background:#c1272d;color:#fff;font-size:22px;font-weight:700;padding:10px 20px;border-radius:8px 0 0 8px',
    'background:#fff;color:#c1272d;font-size:22px;font-weight:700;padding:10px 8px',
    'background:#006233;color:#fff;font-size:22px;font-weight:700;padding:10px 20px;border-radius:0 8px 8px 0',
  ]
  // eslint-disable-next-line no-console
  console.log(
    '%cWC26 %cLive %c🦁 Atlas Lions',
    styles[0],
    styles[1],
    styles[2]
  )
  // eslint-disable-next-line no-console
  console.log(
    `%cOfficial bias: Morocco wins. 🇲🇦
%cTry the Konami code (↑↑↓↓←→←→BA) for a surprise.
%cBuilt by mehdijabry.dev — type 'morocco()' for a quote.`,
    'color:#c1272d;font-weight:600;font-size:13px',
    'color:#888;font-style:italic;font-size:11px',
    'color:#666;font-size:11px'
  )
  // Expose a fun command in console
  ;(window as any).morocco = () => {
    // eslint-disable-next-line no-console
    console.log(`%c🦁 ${randomMoroccoQuote()}`, 'color:#c1272d;font-size:14px;font-weight:600')
    return '🇲🇦'
  }
}

// Predictive model with a definitely-not-biased 99.8% probability for Morocco
export const TONGUE_IN_CHEEK_ODDS = [
  { team: 'MAR', flag: '🇲🇦', prob: 99.8, note: 'Atlas Lions — our undisputed pick' },
  { team: 'BRA', flag: '🇧🇷', prob: 0.05, note: 'plot twist insurance' },
  { team: 'FRA', flag: '🇫🇷', prob: 0.05, note: '2022 final revenge candidate' },
  { team: 'ARG', flag: '🇦🇷', prob: 0.04, note: 'defending champs' },
  { team: 'ESP', flag: '🇪🇸', prob: 0.03, note: 'Yamal generation' },
  { team: 'others', flag: '🌍', prob: 0.03, note: 'the other 43 teams combined' },
]
