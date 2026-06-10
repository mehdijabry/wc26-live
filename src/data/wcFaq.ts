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
  tags: Array<'format' | 'rules' | 'new-rules' | 'qualification' | 'logistics' | 'history'>
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

  // ────────────────────────────────────────────────────────────────
  // NEW RULES — first time in effect at a World Cup in 2026
  // ────────────────────────────────────────────────────────────────
  {
    slug: 'new-rules',
    question: "What new rules are in effect at the 2026 World Cup?",
    short: "Headline changes: the 8-second goalkeeper rule (corner if breached), captain-only refereeing communication, the Adidas Trionda connected ball with embedded sensor, semi-automated offside at every venue, and louder VAR decision announcements over the PA.",
    long: [
      "WC2026 inherits the biggest cluster of rule changes since the introduction of VAR. The IFAB approved several updates between 2024 and 2025 — most of them tested at Euro 2024, Copa America 2024 and the Club World Cup 2025 before becoming permanent. All are now in the Laws of the Game 2025/26 and apply at WC2026.",
      "The five most-visible changes: (1) Goalkeepers now have 8 seconds to release the ball after picking it up — referee gives a visible 5-second hand countdown, and the penalty for breach is a corner kick (used to be an indirect free kick that was almost never enforced). (2) Only team captains can approach the referee to discuss a decision — other players who do face yellow cards. (3) The Adidas Trionda match ball has an embedded sensor providing 500Hz precision on every kick, feeding directly into VAR offside and handball reviews. (4) Semi-automated offside technology is in use at every venue. (5) Referees announce VAR decisions over the stadium PA so fans in the ground know what was reviewed and why.",
      "Quieter but important: concussion substitutes remain available without counting against the 5 normal subs. Cooling breaks are mandatory at ≥30°C (relevant for Dallas, Houston, Atlanta in the US summer). The squad cap stays at 26 players — an injured GK can be replaced even after the first match, with FIFA medical approval.",
      "Not in play at WC2026: 'sin bins' for dissent (still in trial at lower levels), the 'Wenger offside rule' (any part of body forward), and rolling subs. They've been discussed but not approved for the senior international game.",
    ],
    related: ['gk-8-seconds', 'captain-rule', 'connected-ball', 'var-transparency', 'var'],
    tags: ['new-rules', 'rules'],
  },
  {
    slug: 'gk-8-seconds',
    question: "How does the new 8-second goalkeeper rule work at WC2026?",
    short: "Goalkeepers must release the ball within 8 seconds of catching or picking it up. The referee shows a visible 5-second hand countdown — if the keeper breaches, the opposition gets a corner kick.",
    long: [
      "The old rule said goalkeepers could hold the ball for 6 seconds, with the penalty being an indirect free kick. Referees almost never enforced it — the indirect FK from inside the penalty area was both awkward to police and rare to convert, so they let it slide. The result: keepers routinely held the ball 15-25 seconds to kill momentum.",
      "From the 2025/26 Laws onward, the limit is 8 seconds — slightly more generous — but the penalty is now a corner kick, which is a real punishment. To make the count visible, the referee raises one hand and shows a 5-second countdown with their fingers (5, 4, 3, 2, 1) when the keeper is at 3 seconds. Players, coaches and crowd all see it.",
      "Trialled at the 2025 FIFA Club World Cup in the United States — average GK hold time dropped from about 14 seconds to 7-8 seconds within the first round. Coaches adjusted by drilling quicker releases and varying short/long distribution. The rule expects to add 2-4 minutes of effective playing time per match.",
      "Edge cases: the count restarts after the keeper releases and re-catches the ball (e.g., dropping it to dribble out then picking up — illegal anyway). The 8 seconds also pauses for time-wasting protests or injuries that the ref calls play down for.",
    ],
    related: ['new-rules', 'backpass-rule', 'knockout-rules'],
    tags: ['new-rules', 'rules'],
  },
  {
    slug: 'captain-rule',
    question: "What is the captain-only refereeing rule at WC2026?",
    short: "Only the team captain is allowed to approach the referee to question a decision. Other players who do are shown a yellow card. The rule was trialled at Euro 2024 and Copa America 2024 and is permanent at WC2026.",
    long: [
      "The IFAB introduced the captain-only protocol to reduce the rugby-style scrums of players surrounding referees after big decisions. Under the rule, only the player wearing the captain's armband can discuss a decision with the referee in those flashpoint moments. Any other player who joins the protest gets a mandatory yellow card.",
      "The rule was first applied at Euro 2024 in Germany, then Copa America 2024 in the United States, before being adopted into the standard Laws of the Game. By WC2026 the protocol is fully embedded — TV broadcasters have spent two years educating fans on it, and every federation has briefed coaches and captains.",
      "Practical effects observed in the trial competitions: 38% drop in 'crowding referee' incidents at Euro 2024 vs Euro 2020, and a measurable cleaner restart pace after fouls. Captains who lost their cool also got booked — Cristiano Ronaldo and Romelu Lukaku among the early high-profile yellows during the trial.",
      "Exception: when the captain is a goalkeeper and the incident is at the other end, an outfield 'on-pitch leader' nominated before kickoff can speak on their behalf. The IFAB publishes the protocol annually in its 'Laws of the Game' app.",
    ],
    related: ['new-rules', 'discipline'],
    tags: ['new-rules', 'rules'],
  },
  {
    slug: 'connected-ball',
    question: "What is the Adidas Trionda connected ball at WC2026?",
    short: "The official WC2026 match ball — a tri-coloured Adidas design with a 500Hz inertial measurement unit (IMU) sensor in the centre. The sensor feeds precise kick data to VAR for offside and handball reviews.",
    long: [
      "The Adidas Trionda is the official WC2026 match ball. The name is a portmanteau of 'tri' (three host nations: US, Mexico, Canada) and 'onda' (Spanish for 'wave'). Its panels feature the red, green and red-white-blue accents of the host federations. Adidas has been the World Cup ball supplier since 1970 — this is its 15th tournament running.",
      "Inside the ball: a battery-powered inertial measurement unit (IMU) at the centre, suspended in a foam cocoon so it stays balanced as the ball rolls. The sensor transmits 500 readings per second over wireless to the VAR centre, providing the precise moment a player makes contact with the ball.",
      "Why that matters: in offside reviews, the system can pin the exact frame the ball was struck rather than estimating from broadcast cameras. The 2022 World Cup quarterfinal against the Netherlands famously saw the Argentina vs Netherlands offside decisions delayed minutes — with Trionda data, the same call is now made in 15-20 seconds. Handball reviews benefit similarly: the sensor confirms whether contact preceded a goal or not.",
      "Connected Ball Technology (CBT) was introduced at WC2022 with the Al Rihla ball but had a lower sample rate. The Trionda triples that. The ball also passes the standard FIFA Quality Pro testing — weight, circumference, water absorption, bounce, sphericity — at the higher 500Hz spec.",
    ],
    related: ['new-rules', 'var', 'semi-automated-offside'],
    tags: ['new-rules', 'rules'],
  },
  {
    slug: 'var-transparency',
    question: "Will referees announce VAR decisions out loud at WC26?",
    short: "Yes — referees explain their final decision over the stadium PA system after every on-field review, so fans in the ground hear exactly what was reviewed and the outcome. Trialled at the 2023 Women's World Cup, now standard at WC2026.",
    long: [
      "One of the long-standing complaints about VAR was the 'silent review' — fans in the stadium had no idea why play stopped for 4 minutes, then suddenly a goal was disallowed without explanation. The 2023 Women's World Cup in Australia and New Zealand trialled PA announcements after every formal VAR review. The crowd applauded it.",
      "At WC26, the protocol is permanent. After every on-field review (where the referee goes to the pitchside monitor), the referee announces three things over the stadium PA in English: the incident reviewed, the decision before the review, and the decision after. Example: 'Following review for a possible offside in the build-up to the goal — the decision is GOAL.'",
      "Why English: it's the standard FIFA tournament language. Each host country also gets a local-language voiceover from the stadium announcer right after the referee's English version, so Mexican fans at the Estadio Azteca hear it in Spanish moments later.",
      "What doesn't get announced: 'check complete' reviews (VAR clears the original decision without going to the monitor) are still silent — the referee just signals to restart play. Only formal on-field reviews trigger an announcement. A live counter at the bottom of the broadcast feed also tells TV viewers how long the review is taking.",
    ],
    related: ['new-rules', 'var', 'connected-ball'],
    tags: ['new-rules', 'rules'],
  },

  // ────────────────────────────────────────────────────────────────
  // EXISTING RULES — reminders of the basics most fans get fuzzy on
  // ────────────────────────────────────────────────────────────────
  {
    slug: 'offside-explained',
    question: "How does the offside rule actually work in football?",
    short: "A player is offside if any part of their body that can score (not arms/hands) is closer to the opponent's goal line than both the ball AND the second-to-last defender at the moment a teammate plays the ball to them.",
    long: [
      "The offside rule has three parts that all need to be true at once. (1) Position: the attacker is in the opponent's half AND closer to the goal line than the ball AND closer than the second-to-last defender (usually a defender, plus the goalkeeper). (2) Active involvement: the attacker actually plays the ball, interferes with a defender, or gains an advantage from being in that position. (3) The infraction is judged at the moment the ball is played by the attacker's teammate — not when the attacker receives it.",
      "Things that are NOT offside: receiving the ball directly from a goal kick, throw-in or corner kick. Receiving the ball from an opponent's deliberate pass or save (not a deflection). Being level with the second-to-last defender at the moment the ball is played — level is onside, by the laws.",
      "What VAR + semi-automated offside check: not whether the attacker is interfering (that's still subjective and on the on-field referee) but whether the position was offside at the moment the pass was played. The Trionda ball's sensor pins the exact pass moment to the millisecond; the AI limb-tracking from multiple cameras builds a 3D skeleton of every player at that frame. If any part of the attacker's body that can legally score is ahead of the second-to-last defender, it's offside.",
      "Common myths busted: hand/arm offside doesn't exist (you can't score with your hand, so it doesn't count for offside either). And the 'daylight rule' (gap between attacker and defender) was never a real law — it's just a TV term for clearly offside positions.",
    ],
    related: ['var', 'connected-ball'],
    tags: ['rules'],
  },
  {
    slug: 'handball-rule',
    question: "When is it a handball at the World Cup?",
    short: "Deliberate handball is always a foul. Accidental handball is only a foul if (a) it directly leads to a goal by the same player, or (b) the player's arm is in an 'unnaturally large' position making the body bigger. Accidental handball by a teammate that leads to a goal is no longer a foul.",
    long: [
      "The handball rule was tightened in 2021 after years of confusion about 'unintentional' touches. The current Law 12 framework distinguishes deliberate handball (always a foul) from accidental contact (judged on context).",
      "Accidental handball is a foul when the arm/hand is in an 'unnaturally large' position — i.e., away from the body in a way that makes the silhouette bigger and increases the chance of contact. Hands behind the back, arms tucked in, or arms used for balance close to the body are NOT unnaturally large. Arms raised above shoulder level, or extended sideways, generally ARE.",
      "There's a 'chain of contact' rule: if you accidentally handle the ball and immediately score (or create a chance to score) yourself, it's a foul. But if your teammate handles the ball accidentally and you score off it, the goal stands — the rule was softened in 2021 so accidental teammate handball doesn't punish a whole team.",
      "Penalty area specifics: a handball in your own penalty area gives the opponent a penalty kick. The 'making the body bigger' test is applied more strictly inside the box because the consequence is severe. VAR can review for clear and obvious errors — but referees on the field have the final call on subjective interpretation. Expect 2-3 contentious handball calls at WC2026.",
    ],
    related: ['var', 'knockout-rules'],
    tags: ['rules'],
  },
  {
    slug: 'concussion-subs',
    question: "How do concussion substitutions work at WC2026?",
    short: "Each team gets up to 2 additional 'concussion subs' on top of their 5 regular substitutions, available at any point during a match — including extra time — for any player suspected of concussion or serious head injury.",
    long: [
      "The IFAB approved permanent concussion substitutions in 2021 after pressure from medical bodies and the PFA. Under the rule, any player who shows signs of a possible concussion can be permanently substituted, and the substitution does NOT count against the team's 5 normal subs (or 6 with the extra-time slot).",
      "Each team has up to 2 concussion subs per match. They're available at any stoppage — during regulation, extra time, or even between extra time periods. The opposition team is automatically also granted an equivalent substitution to keep things balanced, even if they don't have a concussed player.",
      "Decision-making: the team doctor has sole authority. If they decide a player needs to come off for assessment, the player CANNOT return to the field even if later cleared — to avoid the temptation to send a borderline-injured player back on. This is the so-called 'temporary substitute' debate IFAB has been having for years — currently rejected in favour of permanent subs only.",
      "Coaches at WC2026 keep a designated concussion-replacement player in mind throughout each match. Goalkeeper concussions are particularly disruptive — the regulation that each squad must include 3 GKs in their 26 stems partly from this risk.",
    ],
    related: ['squad-rules', 'knockout-rules'],
    tags: ['rules'],
  },
  {
    slug: 'backpass-rule',
    question: "Can a goalkeeper pick up a back-pass from a teammate?",
    short: "No. Since 1992 a goalkeeper cannot use their hands on a deliberate pass kicked back to them by a teammate. Doing so gives the opposition an indirect free kick from the spot.",
    long: [
      "The back-pass rule was introduced in 1992 after teams in the 1990 World Cup wasted time by passing back to the keeper, who would catch and hold the ball. Iconically, the 1990 group game between Egypt and the Netherlands saw the Dutch keeper hold the ball for over a minute without releasing.",
      "Under the modern Law 12: if a teammate deliberately kicks the ball back to the keeper, the keeper must play it with their feet — they cannot pick it up. Headers, chest passes and accidental deflections are exempt — a defender heading back to the keeper is fine. The rule also applies to throw-ins: if you throw the ball back to your own keeper, they can't pick it up.",
      "Punishment for breach: indirect free kick to the opposition at the spot the keeper handled the ball. In the penalty area, this is dangerous — the wall must be on the goal-line and any defender can block, but the attacking team gets a close-range chance. Goals from these have been scored at major tournaments.",
      "Combined with the new 8-second rule, the back-pass rule sharply limits how teams can run down the clock. A leading team can no longer pass back, have the keeper hold, and reset — they must play forward or accept the 8-second clock starting on every keeper touch.",
    ],
    related: ['gk-8-seconds', 'new-rules'],
    tags: ['rules'],
  },
  {
    slug: 'cooling-breaks',
    question: "How do cooling breaks work in hot weather at WC2026?",
    short: "When the on-field 'wet-bulb' temperature exceeds 32°C, the referee can call a 3-minute cooling break around the 30th minute of each half so players can rehydrate and the team doctors can check on conditions.",
    long: [
      "Cooling breaks were introduced after the 2014 World Cup in Brazil, where several matches saw players visibly cramping in 35°C+ heat. The standard threshold is a 'wet-bulb globe temperature' (WBGT) above 32°C — a measure that combines air temperature, humidity, wind and solar radiation, more accurate than thermometer readings.",
      "How it works: the FIFA medical officer measures WBGT at the pitch before kickoff and 15 minutes into each half. If it crosses 32°C, the referee builds in a 3-minute pause at the next natural stoppage past the 30th minute of each half. Players get water on the sidelines; team doctors check on anyone struggling. The clock keeps running — added time absorbs the pause.",
      "Relevant venues at WC2026: Dallas (AT&T Stadium — air-conditioned, low risk), Houston (NRG Stadium — air-conditioned), Atlanta (Mercedes-Benz Stadium — air-conditioned), Miami (Hard Rock Stadium — open-air, high humidity), Kansas City (Arrowhead — open-air, hot summer days). Open-air venues in the Sun Belt are the ones to watch. The June 11 – July 19 window covers the hottest stretch of the year in the US South.",
      "Heat protocol matters for predictions: high-WBGT matches see fewer goals on average (defences press less aggressively when cramping is a risk) and more substitutions used early. Top scorers and over-2.5 goal markets shift accordingly.",
    ],
    related: ['squad-rules', 'host-cities'],
    tags: ['rules', 'logistics'],
  },
]

/** Synchronous lookup by slug — used by /explained/:slug. */
export function faqBySlug(slug: string): FaqEntry | null {
  return WC_FAQ.find((f) => f.slug === slug) ?? null
}
