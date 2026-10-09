-- 005 — la mise minimum passe de 3 crampons à 1.
--
-- POURQUOI. Un joueur reçoit 5 crampons par jour. Avec un plancher à 3, il
-- ne pouvait placer qu'UN pari quotidien, et le second était impossible :
-- il lui restait 2 crampons inutilisables, perdus le lendemain faute de
-- pouvoir être misés. Le plancher mangeait 40 % de la dotation.
--
-- À 1, les 5 crampons sont tous jouables : jusqu'à cinq paris par jour, ou
-- un gros, au choix du joueur. C'est lui qui arbitre, ce qui était l'idée
-- depuis le début.
--
-- Le plafond de 1000 ne bouge pas : il protège d'une saisie absurde, pas
-- du solde — celui-ci est déjà vérifié par place_bet_guard().
--
-- La contrainte porte le nom généré par Postgres à la création de la table
-- dans 004_paris.sql (`stake integer not null check (...)`). On la nomme
-- explicitement en la recréant, pour que la prochaine migration n'ait plus
-- à deviner.

alter table public.bets drop constraint if exists bets_stake_check;

alter table public.bets
  add constraint bets_stake_check check (stake >= 1 and stake <= 1000);

-- Contrôle : doit rendre « stake >= 1 AND stake <= 1000 ».
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'bets_stake_check';
