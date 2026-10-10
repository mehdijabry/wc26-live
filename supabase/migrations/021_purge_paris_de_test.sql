-- 021 — Les compteurs disaient vrai sur des données fausses.
--
-- « La barre est toujours à 5/5 et 7/7, règle ça une fois pour toutes. »
-- Quatrième signalement. Les trois premières fois j'ai répondu que les
-- compteurs étaient au maximum pour de bon. Mesure faite, deux causes
-- réelles — dont une que j'ai introduite ce matin.
--
-- ── 1. LA TABLE `bets` NE CONTIENT QUE DES PARIS DE TEST ─────────────────
-- Trois lignes, un seul compte, posées en ONZE SECONDES le 8 octobre 2026
-- pendant la construction de la couche de paris. Elle n'est plus alimentée
-- depuis la migration 006 (tout passe par `bet_slips`), mais `nb_paris()`
-- la compte encore : le compteur hebdomadaire affichait donc 7 au lieu de
-- 4, et « 2/7 paris gagnés » au lieu de 1/4.
--
-- On les SUPPRIME plutôt que de les exclure fonction par fonction : une
-- exclusion devrait être répétée dans `nb_paris`, `ma_saison`,
-- `league_table`, `groupe_etat`… et la première oubliée rouvrirait le
-- défaut. La table reste en place, vide.
--
-- `ranking_events` les référence avec `on delete cascade` : les points
-- qu'ils ont rapportés partent avec eux, et `ranking_points` se recalcule
-- juste après. Les crampons et pressings déjà crédités ne bougent pas —
-- un solde est un solde, on ne le reprend pas.
delete from public.bets;

update public.profiles p
   set ranking_points = coalesce((
         select sum(e.points) from public.ranking_events e where e.user_id = p.id
       ), 0);

-- ── 2. MA RÉPARATION DE LA 020 A MENTI ───────────────────────────────────
-- La 020 a réécrit tous les `claim_streak = 0` en 7, en supposant qu'un
-- zéro voulait dire « septième jour atteint ». C'est vrai pour la fonction
-- actuelle. Ce ne l'est PAS pour les comptes qui ont réclamé avant la
-- migration 010 : la colonne n'existait pas encore, ils ont gardé son
-- défaut, zéro — sans jamais avoir enchaîné sept jours.
--
-- Le jeu a trois jours. Une série de sept est matériellement impossible,
-- et la 020 en a fabriqué une : la barre s'affichait pleine à 7/7 sur un
-- compte qui venait de réclamer une seule fois.
--
-- Un compte qui a réclamé aujourd'hui a une série d'au moins 1, et rien
-- dans la base ne permet d'en prouver davantage — on ne garde pas
-- l'historique des réclamations. On écrit donc 1, la seule valeur
-- défendable.
update public.profiles
   set claim_streak = 1
 where claim_streak = 7 and last_claim = current_date;
