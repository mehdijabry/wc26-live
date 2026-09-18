/**
 * FIFA World Cup 2026 — official tournament rules and format.
 *
 * Surfaced to the AI assistant via the `get_tournament_rules` tool so it
 * can answer "how does the tournament work?", "how many teams qualify
 * from a group?", "how many subs are allowed?", etc. without making
 * things up.
 *
 * Source: FIFA Regulations for the 2026 World Cup (official). Values
 * here cover the expanded 48-team format — a meaningful change from
 * previous editions.
 *
 * If FIFA amends a rule mid-tournament (rare but happens), update the
 * relevant field and bump `version_note`. The static lore is fine — the
 * facts in here change on the order of years, not days.
 */

export interface TournamentRules {
  edition: string
  hosts: string[]
  dates: { start: string; end: string }
  total_matches: number
  total_teams: number
  format: {
    group_stage: {
      groups: number
      teams_per_group: number
      qualifiers_per_group: string
      best_third_placed: number
      total_qualified_for_knockout: number
      points: { win: number; draw: number; loss: number }
      tiebreakers: string[]
    }
    knockout: {
      rounds: string[]
      extra_time_minutes: number
      penalty_shootout: boolean
      away_goals_rule: boolean
    }
  }
  squad: {
    max_players: number
    max_goalkeepers: number
    substitutions_regulation: number
    substitutions_extra_time: number
    concussion_substitutions: string
  }
  discipline: {
    yellow_cards_for_suspension: number
    yellow_cards_reset_after: string
    red_card_suspension: string
  }
  technology: {
    var: boolean
    semi_automated_offside: boolean
    connected_ball_technology: boolean
    goal_line_technology: boolean
  }
  venues: {
    total: number
    usa: number
    canada: number
    mexico: number
    final_venue: string
    opening_venue: string
  }
  trophy_and_awards: string[]
  version_note: string
}

export const tournamentRules: TournamentRules = {
  edition: 'FIFA World Cup 2026',
  hosts: ['USA', 'Canada', 'Mexico'],
  dates: { start: '2026-06-11', end: '2026-07-19' },
  total_matches: 104,
  total_teams: 48,
  format: {
    group_stage: {
      groups: 12,
      teams_per_group: 4,
      qualifiers_per_group: 'Top 2 advance automatically (24 teams)',
      best_third_placed: 8,
      total_qualified_for_knockout: 32,
      points: { win: 3, draw: 1, loss: 0 },
      tiebreakers: [
        'Greater number of points obtained in all group matches',
        'Goal difference in all group matches',
        'Greater number of goals scored in all group matches',
        'Greater number of points obtained in the matches played between the teams concerned',
        'Goal difference resulting from the matches played between the teams concerned',
        'Greater number of goals scored in the matches played between the teams concerned',
        'Fair play points (yellow/red card deductions)',
        'Drawing of lots by FIFA',
      ],
    },
    knockout: {
      rounds: ['Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Third-place match', 'Final'],
      extra_time_minutes: 30,
      penalty_shootout: true,
      away_goals_rule: false,
    },
  },
  squad: {
    max_players: 26,
    max_goalkeepers: 3,
    substitutions_regulation: 5,
    substitutions_extra_time: 1,
    concussion_substitutions: 'Additional concussion substitution permitted (does not count toward 5)',
  },
  discipline: {
    yellow_cards_for_suspension: 2,
    yellow_cards_reset_after: 'Quarter-finals (yellow card accumulations are wiped after the QF round)',
    red_card_suspension: 'Minimum one-match ban; FIFA Disciplinary Committee may extend depending on offence',
  },
  technology: {
    var: true,
    semi_automated_offside: true,
    connected_ball_technology: true,
    goal_line_technology: true,
  },
  venues: {
    total: 16,
    usa: 11,
    canada: 2,
    mexico: 3,
    final_venue: 'MetLife Stadium, East Rutherford, NJ (USA)',
    opening_venue: 'Estadio Azteca, Mexico City (Mexico)',
  },
  trophy_and_awards: [
    'FIFA World Cup Trophy (winner)',
    'Golden Ball (best player of the tournament)',
    'Golden Boot (top scorer; assists used as tiebreaker)',
    'Golden Glove (best goalkeeper)',
    'Best Young Player Award (born on or after 1 Jan 2005)',
    'FIFA Fair Play Trophy (team with best disciplinary record advancing past R16)',
  ],
  version_note: 'Reflects FIFA WC 2026 regulations as published ahead of kickoff. Update if FIFA amends mid-tournament.',
}
