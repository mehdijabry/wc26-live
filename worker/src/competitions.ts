/**
 * L'ÉCUSSON D'UNE COMPÉTITION — jamais son nom.
 *
 * Mehdi, 18/10/2026 : « on n'écrit pas le nom du championnat ou de la coupe,
 * on met le logo de cette compétition ». Un écusson se reconnaît en un
 * dixième de seconde et ne dépend d'aucune langue ; son nom écrit prend une
 * ligne, se lit en arabe ou en latin selon le lecteur, et n'apprend rien à
 * personne.
 *
 * ── DEUX CLÉS POUR LA MÊME COMPÉTITION, ET C'EST VOULU ───────────────────
 * La chaîne de publication manipule deux identifiants selon l'endroit :
 * `AutoMatch.slug` porte le slug ESPN (`esp.1`), tandis que la colonne
 * `videos_matchs.competition` porte le LIBELLÉ anglais (`LaLiga`) — celui
 * de `SOURCES[].competition` et des clés de `LEAGUE_AR`. Exiger l'un ou
 * l'autre obligerait chaque appelant à savoir lequel il tient. La table
 * accepte donc les deux, et la résolution est insensible à la casse.
 *
 * ── LES IDENTIFIANTS SONT MESURÉS, PAS DEVINÉS ───────────────────────────
 * Chaque numéro vient de `leagues[0].logos[0].href` du tableau de bord ESPN
 * de la compétition, relevé le 18/10/2026 :
 *
 *   curl '…/soccer/<slug>/scoreboard' | jq '.leagues[0].logos[0].href'
 *
 * C'est ainsi que les cinq coupes nationales ont été ajoutées — leurs
 * numéros (40, 80, 2192, 2061, 182) n'ont RIEN à voir avec l'identifiant
 * de la compétition elle-même (3918, 3951, 3956, 3954, 3952), et les
 * déduire de la ligue aurait donné cinq adresses mortes. Le Mondial des
 * clubs et la Ligue des champions africaine répondent sous un autre slug
 * que le nôtre (`fifa.cwc`, `caf.champions`) ; c'est leur écusson qui est
 * rangé ici, pas leur slug.
 *
 * ── RIEN PLUTÔT QU'UN REPLI ──────────────────────────────────────────────
 * Une compétition inconnue rend `null`, et l'appelant ne dessine rien. Pas
 * d'écusson par défaut : trois reels de Ligue Europa sont déjà sortis
 * estampillés Ligue des champions parce qu'un repli existait.
 */

const ESPN = (n: number) => `https://a.espncdn.com/i/leaguelogos/soccer/500/${n}.png`

/** Clés en minuscules : slug ESPN et libellé anglais pour chaque entrée. */
const ECUSSONS: Record<string, string> = {
  // Sélections
  'fifa.world': ESPN(4), 'fifa world cup': ESPN(4),
  'uefa.euro': ESPN(74),
  'uefa.nations': ESPN(2395), 'uefa nations league': ESPN(2395),
  'caf.nations': ESPN(76),
  'concacaf.gold': ESPN(59),
  // Europe des clubs
  'uefa.champions': ESPN(2), 'uefa champions league': ESPN(2),
  'uefa.europa': ESPN(2310), 'uefa europa league': ESPN(2310),
  'uefa.europa.conf': ESPN(20296), 'uefa conference league': ESPN(20296),
  'uefa.super_cup': ESPN(1272), 'uefa super cup': ESPN(1272),
  // Les cinq grands championnats
  'eng.1': ESPN(23), 'premier league': ESPN(23),
  'esp.1': ESPN(15), 'laliga': ESPN(15), 'la liga': ESPN(15),
  'ita.1': ESPN(12), 'serie a': ESPN(12),
  'ger.1': ESPN(10), 'bundesliga': ESPN(10),
  'fra.1': ESPN(9), 'ligue 1': ESPN(9),
  // Les cinq coupes qui passent devant les championnats, et la Carabao
  'eng.fa': ESPN(40), 'fa cup': ESPN(40),
  'esp.copa_del_rey': ESPN(80), 'copa del rey': ESPN(80),
  'ita.coppa_italia': ESPN(2192), 'coppa italia': ESPN(2192),
  'ger.dfb_pokal': ESPN(2061), 'dfb-pokal': ESPN(2061),
  'fra.coupe_de_france': ESPN(182), 'coupe de france': ESPN(182),
  'eng.league_cup': ESPN(41), 'carabao cup': ESPN(41),
  // Le reste du football de club
  'club.world.cup': ESPN(1932), 'fifa club world cup': ESPN(1932),
  'conmebol.libertadores': ESPN(58), 'copa libertadores': ESPN(58),
  'conmebol.sudamericana': ESPN(1208),
  'caf.champions_league': ESPN(2391), 'caf champions league': ESPN(2391),
  // Autres championnats rencontrés dans les flux
  'ned.1': ESPN(11), 'por.1': ESPN(14), 'bel.1': ESPN(6), 'tur.1': ESPN(18),
  'sco.1': ESPN(45), 'usa.1': ESPN(19), 'mex.1': ESPN(22), 'bra.1': ESPN(85), 'arg.1': ESPN(1),
}

/**
 * L'écusson d'une compétition, par son slug ESPN ou par son libellé
 * anglais. `null` quand on n'en a pas — l'appelant ne dessine rien.
 *
 * Le suffixe de catégorie (`.w`, `.u20`, `.u23`) est retiré avant la
 * recherche : la Ligue des champions féminine garde l'écusson de la C1.
 */
export function logoCompetition(cle: string | null | undefined): string | null {
  const k = String(cle ?? '').trim().toLowerCase().replace(/\.(w|u\d{2})$/i, '')
  return k ? (ECUSSONS[k] ?? null) : null
}
