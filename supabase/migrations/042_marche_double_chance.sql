-- 042 — MARCHE 3 : DOUBLE CHANCE
--
-- La marche BASSE qui manquait a l'echelle. Le 1X2 paie 2 a 3, le score
-- exact 8 a 15, et il n'y avait rien entre zero et deux : un joueur prudent
-- n'avait aucun moyen de rester en vie, alors meme que ce jeu PUNIT les
-- pertes par le palier (voir 009). La double chance paie 1,05 a 1,55 — peu,
-- mais elle transforme un pari en decision raisonnable, et c'est ce qui
-- elargit l'audience au-dela des joueurs qui aiment le risque.
--
-- Elle se lit sur les trois memes probabilites que le 1X2, additionnees deux
-- a deux. Aucune donnee de plus, aucun calcul de plus.
--
-- LES TROIS CHOIX, ecrits comme partout ailleurs dans le football :
--   1x  le domicile gagne OU match nul
--   12  l'un des deux gagne, pas de nul
--   x2  l'exterieur gagne OU match nul

alter table public.bet_legs drop constraint if exists bet_legs_market_check;
alter table public.bet_legs
  add constraint bet_legs_market_check
  check (market in ('1x2', 'exact', 'scorer', 'ou25', 'btts', 'dc'));

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

  end if;
  return 'void';
end;
$$;
