-- 043 — MARCHE 4 : ECART DE VICTOIRE
--
-- Le chainon manquant entre le 1X2 et le score exact. « Le Real gagne »
-- paie 1,35 et n'apprend rien ; « 2-0 » paie 9 et releve de la loterie.
-- « Le Real gagne, mais pas de trois buts » paie 3 a 4 et demande un vrai
-- avis de football — c'est le pari d'un amateur, pas d'un joueur.
--
-- L'ECART NE DIT PAS QUI GAGNE, et c'est volontaire : le dire doublerait le
-- nombre de boutons pour un marche qui se combine tres bien avec le 1X2 —
-- « Real vainqueur » + « ecart de deux buts » dit deja tout, et paie le
-- produit des deux cotes.
--
-- LE NUL Y FIGURE parce qu'un marche doit couvrir tout ce qui peut arriver :
-- sans lui, les trois autres choix perdraient ensemble sur un 1-1 sans que
-- personne ait pu parier dessus. Il recoupe le X du 1X2 a la marge pres —
-- c'est le cas chez tous les bookmakers, et un joueur y prend simplement le
-- meilleur des deux prix.
--
-- LES QUATRE CHOIX :
--   e1   le vainqueur l'emporte d'un but
--   e2   de deux buts
--   e3   de trois buts ou plus
--   nul  match nul

alter table public.bet_legs drop constraint if exists bet_legs_market_check;
alter table public.bet_legs
  add constraint bet_legs_market_check
  check (market in ('1x2', 'exact', 'scorer', 'ou25', 'btts', 'dc', 'marge'));

create or replace function public.issue_du_choix(
  r public.match_results, p_market text, p_pick text
) returns text
language plpgsql immutable set search_path = public as $$
declare
  d int := r.home_score;
  e int := r.away_score;
begin
  if p_market = '1x2' then
    return case when p_pick = (case when d > e then 'home' when d < e then 'away' else 'draw' end)
                then 'won' else 'lost' end;

  elsif p_market = 'exact' then
    return case when p_pick = (d::text || '-' || e::text) then 'won' else 'lost' end;

  elsif p_market = 'scorer' then
    -- Personne n'a marque : perdu, et c'est certain. Des buts mais aucun nom
    -- encore : ON NE TRANCHE PAS, le worker completera et repassera ici.
    if d + e = 0 then return 'lost'; end if;
    if r.scorer_ids is null or array_length(r.scorer_ids, 1) is null then return 'open'; end if;
    return case when p_pick = any (r.scorer_ids) then 'won' else 'lost' end;

  elsif p_market = 'ou25' then
    return case
      when p_pick = 'plus'  and d + e >= 3 then 'won'
      when p_pick = 'moins' and d + e <= 2 then 'won'
      when p_pick in ('plus', 'moins') then 'lost'
      else 'void' end;

  elsif p_market = 'btts' then
    return case
      when p_pick = 'oui' and d > 0 and e > 0 then 'won'
      when p_pick = 'non' and (d = 0 or e = 0) then 'won'
      when p_pick in ('oui', 'non') then 'lost'
      else 'void' end;

  elsif p_market = 'dc' then
    return case
      when p_pick = '1x' and d >= e then 'won'
      when p_pick = '12' and d <> e then 'won'
      when p_pick = 'x2' and e >= d then 'won'
      when p_pick in ('1x', '12', 'x2') then 'lost'
      else 'void' end;

  elsif p_market = 'marge' then
    return case
      when p_pick = 'e1'  and abs(d - e) = 1 then 'won'
      when p_pick = 'e2'  and abs(d - e) = 2 then 'won'
      when p_pick = 'e3'  and abs(d - e) >= 3 then 'won'
      when p_pick = 'nul' and d = e then 'won'
      when p_pick in ('e1', 'e2', 'e3', 'nul') then 'lost'
      else 'void' end;

  end if;
  return 'void';
end;
$$;
