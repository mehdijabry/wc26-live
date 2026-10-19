-- 044 — MARCHE 5 : TOTAL PAR EQUIPE
--
-- Le seul des cinq qui porte sur UNE equipe. C'est le marche de celui qui
-- suit un club et pas un championnat : il n'a pas d'avis sur Getafe, mais il
-- sait que le Barca marque toujours. « Le Barca marque deux buts » paie 1,50
-- sans qu'il ait a parier sur un resultat dont il ne sait rien.
--
-- Il se combine avec les quatre autres sans jamais les contredire, parce
-- qu'il regarde un seul cote de la grille la ou eux regardent la somme ou la
-- difference.
--
-- DEUX SEUILS, PAS CINQ. « Trois buts et plus » tombe sous la barre du
-- jouable une fois sur deux, et quatre boutons par equipe rendraient la
-- carte illisible pour un marche qui en dit deja assez avec deux.
--
-- LES QUATRE CHOIX :
--   dom1  le domicile marque au moins un but
--   dom2  le domicile marque au moins deux buts
--   ext1  l'exterieur marque au moins un but
--   ext2  l'exterieur marque au moins deux buts
--
-- CINQUIEME ET DERNIER. Apres celui-ci, `issue_du_choix` couvre huit
-- marches et la plomberie posee en 040 n'a pas bouge d'une ligne.

alter table public.bet_legs drop constraint if exists bet_legs_market_check;
alter table public.bet_legs
  add constraint bet_legs_market_check
  check (market in ('1x2', 'exact', 'scorer', 'ou25', 'btts', 'dc', 'marge', 'equipe'));

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

  elsif p_market = 'equipe' then
    return case
      when p_pick = 'dom1' and d >= 1 then 'won'
      when p_pick = 'dom2' and d >= 2 then 'won'
      when p_pick = 'ext1' and e >= 1 then 'won'
      when p_pick = 'ext2' and e >= 2 then 'won'
      when p_pick in ('dom1', 'dom2', 'ext1', 'ext2') then 'lost'
      else 'void' end;

  end if;
  return 'void';
end;
$$;
