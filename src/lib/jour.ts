/**
 * LE JOUR DU JEU — celui de la base, pas celui du navigateur.
 *
 * ── LE DÉFAUT ─────────────────────────────────────────────────────────────
 * Tout ce qui est quotidien dans le jeu est décidé par Postgres avec
 * `current_date` : la réclamation des crampons (`claim_daily`), le bonus de
 * groupe (`reclamer_bonus_de_groupe`), la fenêtre « a parié aujourd'hui ».
 * Postgres est en UTC. Le navigateur, lui, calculait la même date avec
 * `getFullYear()/getMonth()/getDate()` — donc dans le fuseau du joueur.
 *
 * À Trois-Rivières (UTC−4), de 20 h à minuit, les deux ne sont pas le même
 * jour : la base est déjà demain. L'interface disait alors « déjà réclamé »
 * sur une journée que la base aurait payée, et affichait une série fausse.
 * Une seule définition pour tout le monde, et c'est celle qui paie.
 *
 * ── LA RÈGLE ──────────────────────────────────────────────────────────────
 * `jourDuJeu()` rend `AAAA-MM-JJ` en UTC, exactement ce que `current_date`
 * écrit dans `profiles.last_claim` et `group_bonus_paid.jour`. Toute
 * comparaison de date avec une valeur venue de la base passe par ici.
 */
export function jourDuJeu(decalageJours = 0): string {
  const d = new Date()
  if (decalageJours) d.setUTCDate(d.getUTCDate() + decalageJours)
  return d.toISOString().slice(0, 10)
}
