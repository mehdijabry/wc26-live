/**
 * Static FAQ corpus for the /explained section.
 *
 * Pattern per entry:
 *   slug       — URL fragment for the standalone page (/explained/<slug>)
 *   question   — H1 + the question Google might surface in a snippet
 *   short      — 1-2 sentence direct answer (used in the FAQPage JSON-LD
 *                'acceptedAnswer.text' field and as the meta description)
 *   long       — full editorial answer (3-5 paragraphs of HTML-safe text)
 *   related    — slugs of related FAQ entries for the in-page rail
 *   tags       — for grouping on the index page
 *
 * Facts cross-checked against the FIFA Regulations of the 2026 FIFA
 * World Cup (May 2025 publication) and the FIFA Laws of the Game 2025/26.
 */

export type FaqEntry = {
  slug: string
  question: string
  short: string
  long: string[]
  related: string[]
  tags: Array<'format' | 'rules' | 'qualification' | 'logistics' | 'history'>
}

export const WC_FAQ: FaqEntry[] = [
  {
    slug: 'format',
    question: 'How does the FIFA World Cup 2026 format work?',
    short: '48 teams, 12 groups of 4, group stage of 72 matches, then a 32-team knockout round, all the way to the final on July 19, 2026.',
    long: [
      'The 2026 edition is the first FIFA World Cup with 48 teams instead of the long-standing 32. The qualification was expanded so every confederation got more slots — UEFA (16 teams), CAF (9), AFC (8), CONMEBOL (6), CONCACAF (6, including the three hosts), OFC (1) and two inter-confederation playoff winners (2).',
      'The 48 teams are split into 12 groups of 4 (named A through L). Each team plays the other three in its group once, so the group stage runs 72 matches over the first two weeks.',
      'The top two from each group advance to a Round of 32, plus the 8 best third-placed teams across all groups. That makes 32 teams in the knockout bracket — Round of 32, Round of 16, quarter-finals, semi-finals, third-place playoff, final. 104 matches in total across the tournament, up from 64 in Qatar 2022.',
      'The final is on Sunday July 19, 2026, at MetLife Stadium in East Rutherford, New Jersey. The whole tournament runs across 16 host cities in the United States, Canada and Mexico.',
    ],
    related: ['best-thirds', 'host-cities', 'schedule'],
    tags: ['format'],
  },
  {
    slug: 'best-thirds',
    question: 'What is the best third-placed teams rule at WC2026?',
    short: 'Across the 12 groups, the 8 third-placed teams with the best records advance to the Round of 32 alongside the 24 group winners and runners-up.',
    long: [
      "With 12 groups, simply taking the top two from each group only fills 24 of the 32 knockout slots. To round it out to a 32-team bracket, FIFA brings in the eight best third-placed teams across all groups — measured first by points, then by goal difference, then goals scored, then disciplinary points, then drawing of lots.",
      "Practically: if you finish third in your group with 4 points and a +1 goal difference, you're competing against the other 11 third-placed teams from the other groups. The top 8 of those 12 go through.",
      'This is the same rule UEFA used to handle 24-team Euros (six groups, four best thirds) — battle-tested but unforgiving. A team can be eliminated despite never losing a match if their group was unforgiving on goals.',
      'For predictions: most predictors assume around 3-4 points and a non-negative goal difference is the cut-off for sneaking in as a best third. Anything lower and the math gets risky.',
    ],
    related: ['format', 'tiebreakers', 'knockout-rules'],
    tags: ['format', 'rules'],
  },
  {
    slug: 'host-cities',
    question: 'Which cities are hosting the 2026 World Cup?',
    short: '16 cities across the US, Mexico, and Canada — 11 in the US (Atlanta, Boston, Dallas, Houston, Kansas City, LA, Miami, NY/NJ, Philadelphia, San Francisco, Seattle), 3 in Mexico (Mexico City, Guadalajara, Monterrey), 2 in Canada (Toronto, Vancouver).',
    long: [
      'The 16 host stadiums are spread across the three host nations. The United States is taking the lion\'s share with 11 venues, Mexico hosts at 3 and Canada at 2. Most matches happen in the US, with Mexico opening the tournament and the US hosting the final.',
      'United States — Atlanta (Mercedes-Benz Stadium), Boston (Gillette Stadium), Dallas (AT&T Stadium), Houston (NRG Stadium), Kansas City (Arrowhead Stadium), Los Angeles (SoFi Stadium), Miami (Hard Rock Stadium), New York / New Jersey (MetLife Stadium), Philadelphia (Lincoln Financial Field), San Francisco Bay Area (Levi\'s Stadium, Santa Clara), Seattle (Lumen Field).',
      'Mexico — Mexico City (Estadio Azteca), Guadalajara (Estadio Akron), Monterrey (Estadio BBVA). Estadio Azteca becomes the first stadium to host three World Cup tournaments (1970, 1986, 2026).',
      'Canada — Toronto (BMO Field, expanded for 2026), Vancouver (BC Place). Vancouver and Toronto each host five group stage matches plus knockout games up to the Round of 16.',
    ],
    related: ['format', 'schedule'],
    tags: ['logistics', 'format'],
  },
  {
    slug: 'schedule',
    question: 'When does the 2026 World Cup start and finish?',
    short: 'The opening match is on Thursday, June 11, 2026, in Mexico City. The final is on Sunday, July 19, 2026, at MetLife Stadium in New Jersey. 39 days total, 104 matches.',
    long: [
      'The tournament runs from June 11 to July 19, 2026 — 39 days end to end. The opening match is the Mexico vs Switzerland Group A fixture at Estadio Azteca (Mexico City), the curtain-raiser for the host that already wrote World Cup history in 1970 and 1986.',
      'Group stage: June 11 to June 27. Each of the 48 teams plays three matches over the two-week stretch, with most days having 4-6 matches at staggered kick-off times so fans can follow more than one team.',
      'Round of 32: June 28 to July 3. Round of 16: July 4 to July 7. Quarter-finals: July 9 to July 11. Semi-finals: July 14 and July 15. Third-place playoff: July 18. Final: Sunday, July 19, at MetLife Stadium, kickoff at 3 PM ET (19:00 UTC).',
      "Two extra days of rest before the semi-finals and final compared to Qatar 2022. FIFA's response to the heavy schedule in the expanded format — eight extra knockout matches need eight more rest days somewhere.",
    ],
    related: ['format', 'host-cities'],
    tags: ['format', 'logistics'],
  },
  {
    slug: 'tiebreakers',
    question: 'How are group stage tiebreakers decided at WC2026?',
    short: 'In order: points, goal difference, goals scored, head-to-head record, head-to-head goal difference, head-to-head goals, then FIFA-prescribed criteria like disciplinary points and finally drawing of lots.',
    long: [
      'When two or more teams finish a group on the same points, FIFA applies a strict tiebreaker ladder. Step 1: overall goal difference. Step 2: overall goals scored. Step 3: head-to-head points among the tied teams. Step 4: head-to-head goal difference. Step 5: head-to-head goals scored.',
      'If teams are still level after the head-to-head triangle, FIFA brings in the disciplinary fair-play points: -1 for a yellow card, -3 for an indirect red, -4 for a direct red, -5 for yellow then red on the same player. Whoever has fewer disciplinary points goes through.',
      'If even that doesn\'t separate them, the very last step is FIFA Ranking position at the start of the tournament, and finally a literal drawing of lots in Zurich. Drawing of lots has never been needed in the modern era, but the regulation is still on the books.',
      "Predictor implication: goal difference is the highest-weight stat after points. A 3-1 win is worth more than three 1-0 wins in a tight group, even though the points total is the same. Tournament-grade scoreboards (this one included) sort the table the same way live.",
    ],
    related: ['best-thirds', 'format'],
    tags: ['rules', 'format'],
  },
  {
    slug: 'knockout-rules',
    question: 'How do extra time and penalty shootouts work at WC2026?',
    short: 'Knockout matches level after 90 minutes go to 30 minutes of extra time (two 15-minute halves). Still level → penalty shootout, best of 5 alternating kicks, then sudden death.',
    long: [
      'All knockout matches — Round of 32 onwards — must produce a winner on the night. If the match is level after the regulation 90 minutes plus stoppage time, the teams play extra time: two halves of 15 minutes each, no golden goal rule. The team with more goals after extra time wins.',
      'If extra time also ends level, the match goes to a penalty shootout. The shootout starts with 5 alternating kicks per team, taken by 5 different players nominated from those on the field at the end of extra time. Whoever has scored more after 5 kicks each wins.',
      'If the shootout is still level after 5 kicks each, it goes to sudden death: each team takes one more kick, and the first team to lead after equal kicks wins. Any player who hasn\'t shot yet — including the goalkeeper — must shoot before any player can take a second kick.',
      "Substitutions in extra time: FIFA allows one additional substitution per team during extra time on top of the five already permitted during regulation. Squad rules also let coaches name 26 players for the tournament (up from 23 pre-2022) — more depth for the busy knockout stretch.",
    ],
    related: ['tiebreakers', 'var'],
    tags: ['rules'],
  },
  {
    slug: 'var',
    question: 'How does VAR work at the 2026 World Cup?',
    short: 'VAR officials review goals, penalty decisions, direct red cards and mistaken identity. Referees can be called to a pitchside monitor for a final look before changing a decision.',
    long: [
      "VAR (Video Assistant Referee) is fully integrated into WC2026. Four match-incident categories are reviewable: (1) goals and the build-up to them, (2) penalty decisions, (3) direct red-card incidents (not second yellows), and (4) mistaken identity when a card is shown.",
      'The protocol is unchanged from 2022 in principle. The VAR officials watch the broadcast feeds in a central operations room and flag potential errors to the on-field referee, who decides whether to make a pitchside review. The referee\'s decision after the review is final.',
      'New for 2026: semi-automated offside technology is in use at every venue. AI-assisted limb-tracking from multiple cameras builds a 3D skeleton of every player on every frame, so offside calls take a few seconds instead of a few minutes. The visual reconstruction is also shown on the stadium big screen.',
      "There's also a new connected-ball technology — a sensor embedded inside the official Adidas match ball that tracks the precise moment of contact. The data feeds into the VAR's offside and handball reviews, removing some of the older guesswork on the timing of a pass.",
    ],
    related: ['knockout-rules'],
    tags: ['rules'],
  },
  {
    slug: 'qualified-teams',
    question: 'Which teams qualified for the 2026 World Cup?',
    short: '48 teams in total — Argentina (defending champs), France (2022 runners-up), Brazil, Spain, Germany, England, Portugal, Morocco, plus the three hosts US/Mexico/Canada and dozens more across all six confederations.',
    long: [
      'The 48-team field includes the three hosts (US, Mexico, Canada) qualifying automatically, then 13 from UEFA, 9 from CAF, 8 from AFC, 6 from CONMEBOL, 6 from CONCACAF (in addition to the hosts), 1 from OFC, plus 2 winners from the inter-confederation playoffs.',
      "Notable storylines: Argentina enters as defending world champions with Messi's last dance. France are 2022 runners-up. Spain just won Euro 2024 and Morocco — first African semi-finalists in 2022 — are back as the AFCON\'s biggest brand. New entries include Cape Verde and Curaçao (first-ever appearances), Uzbekistan (first World Cup for Central Asia), and Jordan (first for Jordan).",
      "Notable omission: Italy. Twice champions, runners-up in 2022, and again missed qualification — Türkiye took the European playoff spot in Group B. Other surprises: Sweden made it for the first time since 2018; Norway are back after a 28-year absence.",
      'For per-team previews, see the team pages on this site — every nation has a dedicated breakdown with the squad, recent form, WC heritage, and the new revelation defining their 2026 cycle.',
    ],
    related: ['format', 'host-cities'],
    tags: ['qualification', 'format'],
  },
  {
    slug: 'discipline',
    question: 'Are yellow cards carried over between matches at the World Cup?',
    short: 'Yes — yellow cards are carried over through the quarter-finals. A player who picks up two yellows across separate matches is suspended for the next match. Yellows are wiped after the quarter-finals.',
    long: [
      'FIFA carries forward yellow cards through the knockout stage. A first booking stays on a player\'s record for the rest of the group stage, and the Round of 32, and the Round of 16. A second booking in any of those matches triggers a one-match suspension.',
      'After the quarter-finals are complete, all yellow cards are wiped clean. This avoids what happened to several players in past tournaments — booked in the quarters, banned from the semis on a technicality, even though their previous booking might have been weeks earlier.',
      'Red cards (direct red or two yellows in the same match) trigger an automatic next-match suspension regardless of stage, plus a FIFA disciplinary committee review which can extend the ban based on the severity of the offence.',
      "Coaches plan around this carefully. Star players already on a yellow are sometimes substituted earlier in tight matches, or pulled from must-not-lose group games entirely — Argentina notably benched players for this reason during the 2022 run.",
    ],
    related: ['knockout-rules'],
    tags: ['rules'],
  },
  {
    slug: 'squad-rules',
    question: 'How many players does each WC2026 squad have, and can injured players be replaced?',
    short: 'Each squad has 26 players. An injured player can be replaced up to 24 hours before the team\'s first group match (FIFA medical sign-off required). After that, the squad is locked.',
    long: [
      "FIFA confirmed the squad size at 26 players for WC2026, the same as Qatar 2022 (up from the previous 23). Coaches need the extra depth for the expanded tournament — 64 matches becomes 104, knockout rounds get longer, and the heat across many North-American venues forces more rotation.",
      'A team must include three goalkeepers in the 26. Three minimum is non-negotiable for FIFA — if any GK becomes unavailable for the rest of the tournament, the squad must be backfilled by FIFA medical exemption rules.',
      'Injury replacements: a player ruled unfit by the team doctor can be swapped out up to 24 hours before the team\'s first group-stage match, with FIFA medical sign-off. Once the team has played its opening match, the squad is locked. After that, only an emergency goalkeeper replacement is permitted, and only with FIFA approval.',
      "On match day each team can name 11 starters plus 12 substitutes on the bench. Five substitutions are allowed during regulation (in up to three substitution windows so the game isn't stop-start) plus one additional substitution during extra time in knockout matches.",
    ],
    related: ['format', 'knockout-rules'],
    tags: ['rules', 'logistics'],
  },
]

/** Synchronous lookup by slug — used by /explained/:slug. */
export function faqBySlug(slug: string): FaqEntry | null {
  return WC_FAQ.find((f) => f.slug === slug) ?? null
}
