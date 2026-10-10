/**
 * Les icônes de football, colorées, et seulement là où elles décorent.
 *
 * ── POURQUOI UNE IMAGE ET PAS UN SVG EN LIGNE ─────────────────────────────
 * Elles sont dans `public/media/icones/`, donc servies, mises en cache par le
 * navigateur, et hors du bundle — dix-sept fichiers inlinés pèseraient 90 Ko
 * dans un fragment que tout le monde télécharge. Surtout, la MÊME adresse
 * sert au studio pour les reels et aux courriels du kit TikTok, qui ne
 * peuvent pas lire notre bundle. C'est la convention déjà posée pour les
 * autres ressources permanentes (voir public/media/README.md).
 *
 * Conséquence assumée : on ne peut pas les recolorer en CSS. On ne le veut
 * pas — elles gardent les couleurs du sujet, vert du terrain, jaune et rouge
 * des cartons.
 *
 * ── OÙ ELLES ONT LE DROIT D'APPARAÎTRE ────────────────────────────────────
 * Décoratif uniquement : états vides, en-têtes de pages éditoriales, et trois
 * endroits du jeu où elles nomment une chose qui n'avait pas d'image.
 *
 * JAMAIS dans ce qui porte un sens — cotes, soldes, direct, navigation. Le
 * design « Stoppage Time » repose sur « une couleur = un sens » (doré = le
 * jeu, mauve = les pressings, rouge = le direct) et des icônes multicolores
 * au milieu de ça dilueraient le repérage. Décision de Mehdi, 2026-10-10 :
 * « coloré sur le décoratif ».
 *
 * ── TAILLE ────────────────────────────────────────────────────────────────
 * Mesuré sur les dix-sept à 24, 40 et 56 px. À 24 px tout reste lisible SAUF
 * `football-free-kick` et `goal-post`, qui s'empâtent — ces deux-là ne
 * s'emploient donc qu'à 40 px ou plus. Le plancher dur est à 24.
 */

export type NomIcone =
  | 'football'
  | 'football-club-flag'
  | 'football-free-kick'
  | 'football-strike'
  | 'football-studs'
  | 'goal-post'
  | 'goalkeeper-gloves'
  | 'ground'
  | 'offside-flag'
  | 'panelty-card'
  | 'penalty-card'
  | 'referee'
  | 'score-board'
  | 'stopwatch'
  | 'strategy'
  | 'substitution-board'
  | 'whistle'

export function Icone({
  nom,
  taille = 48,
  className,
}: {
  nom: NomIcone
  taille?: number
  className?: string
}) {
  const t = Math.max(taille, 24)
  return (
    <img
      src={`/media/icones/${nom}.svg`}
      // Décoratives : elles répètent un texte qui est déjà là. Une alternative
      // textuelle ferait lire deux fois la même chose à un lecteur d'écran.
      alt=""
      aria-hidden="true"
      width={t}
      height={t}
      draggable={false}
      // PAS de `loading="lazy"`. Mesuré le 10/10/2026 sur /responsible-gambling :
      // l'icône d'en-tête n'était pas encore peinte à la première capture, et
      // apparaissait après coup. Ces fichiers pèsent 4 à 10 Ko — les différer
      // ne fait rien gagner et fait sursauter la page au chargement.
      decoding="async"
      className={className}
      style={{ width: t, height: t }}
    />
  )
}

export default Icone
