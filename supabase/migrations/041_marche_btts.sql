-- 041 — MARCHE 2 : LES DEUX EQUIPES MARQUENT
--
-- Deuxieme marche le plus joue au monde, et celui qui se combine le mieux
-- avec le 1X2 : « le Real gagne ET les deux marquent » double la cote sans
-- rien ajouter au moteur.
--
-- IL N'EST PAS REDONDANT AVEC LE PLUS/MOINS, contrairement a ce qu'on croit
-- souvent : 3-0 fait plus de 2,5 buts sans que les deux marquent, et 1-1
-- fait exactement l'inverse. Les deux marches decoupent la meme grille de
-- Poisson selon deux axes differents, et c'est ce qui les rend jouables
-- ensemble sur un meme bulletin.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : toucher a `cote_du_choix`, ni aux
-- paliers, ni aux debits. La plomberie posee en 040 absorbe tout marche
-- derive ; il ne reste qu'a l'autoriser et a dire comment il se regle.
--
-- Accents volontairement absents : l'editeur SQL de Supabase mange l'UTF-8
-- au collage, et un commentaire illisible dans `pg_proc` ne sert personne.

alter table public.bet_legs drop constraint if exists bet_legs_market_check;
alter table public.bet_legs
  add constraint bet_legs_market_check
  check (market in ('1x2', 'exact', 'scorer', 'ou25', 'btts'));

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

  end if;
  return 'void';
end;
$$;
