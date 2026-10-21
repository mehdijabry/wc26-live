-- ============================================================
-- 046 — LES DROITS D'ACCES, FIGES NOIR SUR BLANC
--
-- POURQUOI. A partir du 30 octobre 2026, Supabase cesse d'accorder
-- automatiquement l'acces Data API aux tables creees dans le schema
-- "public". Les tables qui existent aujourd'hui gardent leurs droits :
-- ce projet-ci ne risque rien.
--
-- LE DANGER EST AILLEURS, et il est dans leur propre courriel :
-- « This includes migrations that recreate your schema ». Ces fichiers
-- de migration SONT le chemin de reconstruction — nouveau projet,
-- branche d'apercu, `supabase db reset`. Rejoues apres le 30 octobre,
-- ils creaient 21 tables sur 28 SANS AUCUN DROIT, donc injoignables par
-- l'API : le jeu entier mort, sans qu'une ligne de code ait change.
-- Une panne qui n'arrive qu'au pire moment, le jour ou l'on restaure.
--
-- CE QUE CE FICHIER CONTIENT. Exactement les droits en vigueur le
-- 21/10/2026, releves sur la base elle-meme et non devines. Les
-- reinventer de tete aurait rejoue l'incident des pressings : la policy
-- autorisait la ligne, le GRANT autorisait toutes les colonnes.
--
-- Sur le projet actuel il ne change RIEN — accorder ce qui est deja
-- accorde n'a aucun effet. Sur un projet reconstruit, il rend le site
-- joignable comme il l'est aujourd'hui.
--
-- CE QU'IL NE FAIT PAS : il ne resserre rien. Vingt-neuf tables
-- accordent encore tout a `anon` (l'ancien defaut de Supabase, ou seule
-- la RLS protege). Resserrer est une autre decision, qui se prend table
-- par table et se verifie — pas un effet de bord d'une migration de
-- compatibilite.
--
-- A TENIR DESORMAIS : toute migration qui cree une table porte ses
-- propres `grant`. Dix-huit fichiers sur dix-neuf le font deja ; ce
-- fichier-ci ne rattrape que le passe, il ne couvrira pas l'avenir —
-- il s'execute AVANT les migrations suivantes.
-- ============================================================

-- abonnements
grant delete, insert, select on public.abonnements to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.abonnements to service_role;

-- admin_grants
grant delete, insert, references, select, trigger, truncate, update on public.admin_grants to anon;
grant delete, insert, references, select, trigger, truncate, update on public.admin_grants to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.admin_grants to service_role;

-- amities
grant delete, insert, references, select, trigger, truncate, update on public.amities to anon;
grant delete, insert, references, select, trigger, truncate, update on public.amities to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.amities to service_role;

-- articles
grant delete, insert, references, select, trigger, truncate, update on public.articles to anon;
grant delete, insert, references, select, trigger, truncate, update on public.articles to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.articles to service_role;

-- avatars
grant delete, insert, references, select, trigger, truncate, update on public.avatars to anon;
grant delete, insert, references, select, trigger, truncate, update on public.avatars to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.avatars to service_role;

-- bet_legs
grant delete, insert, references, select, trigger, truncate, update on public.bet_legs to anon;
grant delete, insert, references, select, trigger, truncate, update on public.bet_legs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.bet_legs to service_role;

-- bet_slips
grant delete, insert, references, select, trigger, truncate, update on public.bet_slips to anon;
grant delete, insert, references, select, trigger, truncate, update on public.bet_slips to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.bet_slips to service_role;

-- bets
grant delete, insert, references, select, trigger, truncate, update on public.bets to anon;
grant delete, insert, references, select, trigger, truncate, update on public.bets to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.bets to service_role;

-- bracket_predictions
grant delete, insert, references, select, trigger, truncate, update on public.bracket_predictions to anon;
grant delete, insert, references, select, trigger, truncate, update on public.bracket_predictions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.bracket_predictions to service_role;

-- copies_paris
grant delete, insert, references, select, trigger, truncate, update on public.copies_paris to anon;
grant delete, insert, references, select, trigger, truncate, update on public.copies_paris to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.copies_paris to service_role;

-- group_bonus_paid
grant delete, insert, references, select, trigger, truncate, update on public.group_bonus_paid to anon;
grant delete, insert, references, select, trigger, truncate, update on public.group_bonus_paid to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.group_bonus_paid to service_role;

-- hits
grant delete, insert, references, select, trigger, truncate, update on public.hits to anon;
grant delete, insert, references, select, trigger, truncate, update on public.hits to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.hits to service_role;

-- leaderboard
grant delete, insert, references, select, trigger, truncate, update on public.leaderboard to anon;
grant delete, insert, references, select, trigger, truncate, update on public.leaderboard to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.leaderboard to service_role;

-- leads
grant delete, insert, references, select, trigger, truncate, update on public.leads to anon;
grant delete, insert, references, select, trigger, truncate, update on public.leads to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.leads to service_role;

-- league_members
grant delete, insert, references, select, trigger, truncate, update on public.league_members to anon;
grant delete, insert, references, select, trigger, truncate, update on public.league_members to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.league_members to service_role;

-- leagues
grant delete, insert, references, select, trigger, truncate, update on public.leagues to anon;
grant delete, insert, references, select, trigger, truncate, update on public.leagues to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.leagues to service_role;

-- match_odds
grant delete, insert, references, select, trigger, truncate, update on public.match_odds to anon;
grant delete, insert, references, select, trigger, truncate, update on public.match_odds to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.match_odds to service_role;

-- match_results
grant delete, insert, references, select, trigger, truncate, update on public.match_results to anon;
grant delete, insert, references, select, trigger, truncate, update on public.match_results to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.match_results to service_role;

-- match_scorers
grant delete, insert, references, select, trigger, truncate, update on public.match_scorers to anon;
grant delete, insert, references, select, trigger, truncate, update on public.match_scorers to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.match_scorers to service_role;

-- notifications
grant delete, select on public.notifications to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.notifications to service_role;

-- post_likes
grant delete, insert, select on public.post_likes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.post_likes to service_role;

-- posts
grant select on public.posts to anon;
grant delete, select on public.posts to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.posts to service_role;

-- prediction_unlocks
grant delete, insert, references, select, trigger, truncate, update on public.prediction_unlocks to anon;
grant delete, insert, references, select, trigger, truncate, update on public.prediction_unlocks to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.prediction_unlocks to service_role;

-- predictions
grant delete, insert, references, select, trigger, truncate, update on public.predictions to anon;
grant delete, insert, references, select, trigger, truncate, update on public.predictions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.predictions to service_role;

-- profiles
grant delete, insert, references, select, trigger, truncate on public.profiles to anon;
grant delete, insert, references, select, trigger, truncate on public.profiles to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.profiles to service_role;

-- public_brackets
grant delete, insert, references, select, trigger, truncate, update on public.public_brackets to anon;
grant delete, insert, references, select, trigger, truncate, update on public.public_brackets to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.public_brackets to service_role;

-- push_subscriptions
grant delete, insert, references, select, trigger, truncate, update on public.push_subscriptions to anon;
grant delete, insert, references, select, trigger, truncate, update on public.push_subscriptions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.push_subscriptions to service_role;

-- ranking_events
grant delete, insert, references, select, trigger, truncate, update on public.ranking_events to anon;
grant delete, insert, references, select, trigger, truncate, update on public.ranking_events to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.ranking_events to service_role;

-- signup_code_uses
grant delete, insert, references, select, trigger, truncate, update on public.signup_code_uses to anon;
grant delete, insert, references, select, trigger, truncate, update on public.signup_code_uses to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.signup_code_uses to service_role;

-- signup_codes
grant delete, insert, references, select, trigger, truncate, update on public.signup_codes to anon;
grant delete, insert, references, select, trigger, truncate, update on public.signup_codes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.signup_codes to service_role;

-- social_posts
grant delete, insert, references, select, trigger, truncate, update on public.social_posts to anon;
grant delete, insert, references, select, trigger, truncate, update on public.social_posts to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.social_posts to service_role;

-- transferts_crampons
grant delete, insert, references, select, trigger, truncate, update on public.transferts_crampons to anon;
grant delete, insert, references, select, trigger, truncate, update on public.transferts_crampons to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.transferts_crampons to service_role;

-- videos_matchs
grant select on public.videos_matchs to anon;
grant select on public.videos_matchs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.videos_matchs to service_role;

-- weekly_prizes
grant delete, insert, references, select, trigger, truncate, update on public.weekly_prizes to anon;
grant delete, insert, references, select, trigger, truncate, update on public.weekly_prizes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.weekly_prizes to service_role;
