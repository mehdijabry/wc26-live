/**
 * Les cotes PENDANT le match.
 *
 * ── POURQUOI ON LES CALCULE AU LIEU DE LES ACHETER ────────────────────────
 * Mesuré le 12 octobre 2026, nos deux fournisseurs ne savent pas nous les
 * donner :
 *
 *   • ESPN, d'où viennent toutes nos cotes d'avant-match, les tient de
 *     DraftKings sous la forme `open` / `close` — l'ouverture et la clôture
 *     du marché d'AVANT le coup d'envoi. Une fois le match joué, le bloc
 *     `odds` disparaît entièrement de l'événement. Il n'y a jamais eu de
 *     prix en jeu à y lire.
 *   • Bzzoiro (BSD) l'écrit noir sur blanc dans sa documentation football :
 *     « multi-bookmaker odds (pre-match) ». Son flux live existe, mais c'est
 *     un module payant en WebSocket, et il ne diffuse qu'UN bookmaker par
 *     abonnement, avec un budget d'abonnements partagé. Un samedi à 180
 *     matchs, il n'y a pas de budget qui tienne.
 *
 * Or nous n'avons pas besoin de les acheter : `esperancesDeButs()` nous donne
 * déjà, à partir de la cote d'avant-match, les deux espérances de buts du
 * match. Le reste n'est que de l'arithmétique — et c'est exactement le modèle
 * qui fait déjà le prix du score exact et celui du marché buteur. Le calculer
 * nous-mêmes coûte zéro, couvre TOUS les matchs, et garantit que les trois
 * marchés racontent la même rencontre.
 *
 * ── LE MODÈLE ─────────────────────────────────────────────────────────────
 * Un but attendu se consomme avec le temps. À la 30ᵉ minute il reste les
 * deux tiers du match, donc les deux tiers des buts attendus ; à la 83ᵉ, il
 * n'en reste plus que 8 %. On applique donc les espérances d'avant-match au
 * TEMPS RESTANT, puis on regarde ce que le score actuel devient.
 *
 * C'est précisément la dynamique attendue : le Real mené à la 30ᵉ garde de
 * quoi renverser le match, donc sa cote bouge peu ; mené à la 83ᵉ, il n'a
 * presque plus de temps, et sa cote s'envole.
 *
 * ── LA LIMITE, ASSUMÉE ────────────────────────────────────────────────────
 * On ne modélise NI l'effet de chasse (l'équipe menée attaque plus, celle qui
 * mène se replie), NI les cartons rouges, NI les changements. Ces trois
 * effets sont réels et documentés, mais nous n'avons ici rien pour les
 * calibrer — et un modèle statistique privé de ses données n'échoue pas, il
 * INVENTE (leçon du marché buteur, 9 octobre 2026 : sept joueurs sortis à
 * exactement ×11,90 faute de statistiques). Mieux vaut une décroissance
 * temporelle juste et lisible qu'un facteur inventé. La marge la couvre.
 */

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320]

export function poisson(l: number, k: number): number {
  return (Math.exp(-l) * Math.pow(l, k)) / FACT[k]
}

/** Les probabilités 1X2 qu'impliquent deux espérances de buts. */
export function issuesDe(lh: number, la: number): [number, number, number] {
  let h = 0
  let d = 0
  let a = 0
  for (let i = 0; i <= 8; i++) {
    const pi = poisson(lh, i)
    for (let j = 0; j <= 8; j++) {
      const p = pi * poisson(la, j)
      if (i > j) h += p
      else if (i === j) d += p
      else a += p
    }
  }
  return [h, d, a]
}

/**
 * La durée de référence du modèle.
 *
 * 90 minutes réglementaires plus un temps additionnel forfaitaire. On ne
 * cherche pas à deviner l'arbitrage : ce chiffre ne sert qu'à éviter qu'une
 * espérance de buts tombe à zéro pile à la 90ᵉ alors qu'il reste à jouer.
 */
export const DUREE_MODELE = 94

/**
 * On ferme les paris ce nombre de minutes avant la fin.
 *
 * Réglé à CINQ par Mehdi le 12/10/2026. UNE SEULE constante à changer, ici —
 * la base la lit par `closes_at`, jamais en dur.
 */
export const FERMETURE_AVANT_FIN = 5

/**
 * Notre marge sur le marché en jeu.
 *
 * Plus large que celle d'un bookmaker sur l'avant-match (~5 %) parce que
 * notre horloge a du retard sur la sienne : voir `SUSPENSION_APRES_BUT`.
 */
export const MARGE_LIVE = 0.06

/** Cote plancher et plafond — ce sont celles que la colonne accepte. */
const COTE_MIN = 1.01
const COTE_MAX = 100

export type EtatLive = {
  /** Minute en cours, 1 à 90+. */
  minute: number
  butsDom: number
  butsExt: number
}

export type CotesLive = {
  home: number
  draw: number
  away: number
  /** Minutes qu'il reste à jouer selon le modèle. */
  restant: number
}

/** Arrondi au centième, puis borné à ce que la colonne accepte. */
function prix(p: number): number {
  if (!(p > 0)) return COTE_MAX
  const c = (1 - MARGE_LIVE) / p
  return Math.min(COTE_MAX, Math.max(COTE_MIN, Math.round(c * 100) / 100))
}

/**
 * Les espérances de buts qu'il RESTE à jouer.
 *
 * Exportée parce que la grille des scores exacts en jeu s'en sert aussi : les
 * deux marchés doivent décrire la même fin de match.
 */
export function esperancesRestantes(
  lamDom: number,
  lamExt: number,
  minute: number,
): { dom: number; ext: number; restant: number } {
  const restant = Math.max(0, DUREE_MODELE - Math.max(0, minute))
  const r = restant / DUREE_MODELE
  return { dom: lamDom * r, ext: lamExt * r, restant }
}

/**
 * Les cotes 1X2 d'un match en cours.
 *
 * `lamDom` / `lamExt` sont les espérances d'AVANT-MATCH, figées au moment où
 * le marché a ouvert. On ne les recalcule jamais depuis la cote live : on
 * dériverait un peu plus à chaque tour, et au bout d'une heure le prix ne
 * décrirait plus le match mais ses propres arrondis.
 */
export function cotesLive1X2(
  lamDom: number,
  lamExt: number,
  etat: EtatLive,
): CotesLive {
  const { dom, ext, restant } = esperancesRestantes(lamDom, lamExt, etat.minute)
  const ecart = etat.butsDom - etat.butsExt

  let h = 0
  let d = 0
  let a = 0
  for (let i = 0; i <= 8; i++) {
    const pi = poisson(dom, i)
    for (let j = 0; j <= 8; j++) {
      const p = pi * poisson(ext, j)
      const fin = ecart + i - j
      if (fin > 0) h += p
      else if (fin === 0) d += p
      else a += p
    }
  }

  return { home: prix(h), draw: prix(d), away: prix(a), restant }
}

/**
 * La grille des scores exacts d'un match en cours.
 *
 * Le pari porte toujours sur le score FINAL. Un score déjà dépassé disparaît
 * donc de la grille tout seul — on ne peut plus parier 1-0 quand il y a déjà
 * deux buts — et c'est le modèle qui le fait, pas un filtre ajouté à côté.
 */
export function grilleLive(
  lamDom: number,
  lamExt: number,
  etat: EtatLive,
  margeExact: number,
  butsMax: number,
): Record<string, number> {
  const { dom, ext } = esperancesRestantes(lamDom, lamExt, etat.minute)
  const grille: Record<string, number> = {}
  for (let i = etat.butsDom; i <= butsMax; i++) {
    for (let j = etat.butsExt; j <= butsMax; j++) {
      const p = poisson(dom, i - etat.butsDom) * poisson(ext, j - etat.butsExt)
      // Même règle qu'en avant-match : aucun seuil de probabilité, mais un
      // plafond à 1 000. Voir `grilleScoresExacts` dans index.ts.
      const c = Math.min(Math.round(((1 - margeExact) / p) * 100) / 100, 1000)
      if (c < 1.01) continue
      grille[`${i}-${j}`] = c
    }
  }
  return grille
}

/**
 * La minute de jeu, lue depuis le statut ESPN.
 *
 * ESPN donne une horloge d'affichage (« 67' », « 45'+2 ») et une période.
 * On se fie d'abord à l'horloge ; quand elle manque, la période donne au
 * moins un plancher — mieux vaut une minute approchée qu'un match traité
 * comme s'il venait de commencer, ce qui rouvrirait des paris déjà clos.
 */
export function minuteDuMatch(st: {
  displayClock?: string
  clock?: number
  period?: number
}): number {
  const dc = st.displayClock?.trim()
  if (dc) {
    // « 45'+2 » → 47 ; « 67' » → 67 ; « 90'+4' » → 94
    const m = dc.match(/(\d+)(?:\s*'\s*\+\s*(\d+))?/)
    if (m) {
      const base = Number(m[1])
      const sup = m[2] ? Number(m[2]) : 0
      if (Number.isFinite(base)) return base + sup
    }
  }
  if (typeof st.clock === 'number' && st.clock > 0) return Math.round(st.clock / 60)
  // Plancher par période : 2ᵉ mi-temps = au moins la 46ᵉ.
  if (st.period && st.period >= 2) return 46
  return 1
}

/**
 * Faut-il suspendre le marché, et jusqu'à quand ?
 *
 * ── LE SEUL VRAI DANGER DU PARI EN DIRECT ─────────────────────────────────
 * Entre le but et le moment où nous l'apprenons, notre prix décrit un match
 * qui n'existe plus. Quelqu'un devant sa télévision le sait avant nous et
 * peut miser sur une issue devenue quasi certaine, au prix d'avant le but.
 * Ce n'est pas un risque théorique : c'est LA faille connue du pari en jeu.
 *
 * Trois protections, et elles se cumulent :
 *   1. On relit le tableau de bord toutes les cinq secondes (le Durable
 *      Object `LivePoller` tourne déjà à cette cadence pour les alertes),
 *      ce qui réduit la fenêtre à quelques secondes au lieu d'une minute.
 *   2. Dès qu'un score change, on SUSPEND le marché le temps que la nouvelle
 *      cote soit publiée et vue — c'est ce que fait cette fonction.
 *   3. `closes_at` est une date ABSOLUE, réécrite à chaque tour. Si le
 *      poller meurt, elle n'est plus repoussée et le marché se ferme tout
 *      seul. La panne ferme les paris, elle ne les laisse jamais ouverts.
 */
export const SUSPENSION_APRES_BUT = 90

/**
 * ── CE QU'ON NE PEUT PAS FAIRE, ET POURQUOI ───────────────────────────────
 * Mehdi : « dans les applications de paris connues, les paris se ferment
 * toujours un peu AVANT le but ». C'est exact, et c'est le bon réflexe — un
 * bookmaker suspend sur le corner, le penalty accordé, l'attaque dangereuse,
 * parce qu'il reçoit ces événements en moins d'une seconde.
 *
 * Mesuré le 12/10/2026 sur deux journées complètes d'ESPN : le tableau de
 * bord ne publie QUE des faits accomplis — carton jaune, carton rouge, but,
 * penalty DÉJÀ marqué, but contre son camp. Huit types, pas un de plus. Ni
 * corner, ni tir cadré, ni penalty accordé, ni VAR. **Il n'existe aucun
 * signal d'avant-but dans notre source.** Et le tableau de bord lui-même a
 * déjà du retard sur la télévision.
 *
 * On ne peut donc pas fermer avant le but. On fait les deux seules choses
 * qui protègent vraiment :
 *   • on ferme à l'instant où on apprend quoi que ce soit (but OU carton
 *     rouge, voir `CARTON_ROUGE_FERME`) ;
 *   • on PLAFONNE la mise en direct, parce qu'une faille qu'on ne peut pas
 *     supprimer se borne.
 *
 * Pour vraiment fermer avant le but il faudrait un flux par action. BSD en
 * vend un (`websocket_plus` : position du ballon et actions avec
 * coordonnées, 3 $/mois) — mais **dix abonnements simultanés par socket**,
 * match et bookmaker comptés séparément. Jouable sur les quelques matchs où
 * l'on parie vraiment, pas sur les cent quatre-vingts d'un samedi.
 */

/**
 * Un carton rouge ferme le marché pour le reste du match.
 *
 * C'est le seul événement qui bouleverse une cote sans toucher au score, et
 * notre modèle ne le connaît pas (voir « LA LIMITE, ASSUMÉE » plus haut).
 * Rouvrir après quatre-vingt-dix secondes au prix d'avant l'expulsion serait
 * pire que tout : on annoncerait qu'il s'est passé quelque chose, puis on
 * vendrait le prix d'avant. Entre mal coter et ne plus coter, on arrête.
 */
export const CARTON_ROUGE_FERME = true

export function suspensionJusqua(scoreAChange: boolean, maintenant: number): string | null {
  if (!scoreAChange) return null
  return new Date(maintenant + SUSPENSION_APRES_BUT * 1000).toISOString()
}

/**
 * La date de fermeture des paris, toujours absolue.
 *
 * Rendue `null` quand le marché doit être considéré comme déjà fermé.
 */
export function fermetureLive(minute: number, maintenant: number): string {
  const restantPariable = DUREE_MODELE - FERMETURE_AVANT_FIN - minute
  if (restantPariable <= 0) return new Date(maintenant).toISOString()
  return new Date(maintenant + restantPariable * 60_000).toISOString()
}
