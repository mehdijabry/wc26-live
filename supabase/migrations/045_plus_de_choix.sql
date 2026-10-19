-- 045 — BEAUCOUP PLUS DE CHOIX SUR LES MARCHES DERIVES
--
-- Mehdi, 19/10/2026 : « tu donnes un choix par type, 2,5 ou rien ; essaye de
-- faire ca bien, au minimum 4 choix de paris sauf pour les paris ou il n'y a
-- pas possibilite de choix », puis « meme plus de choix si dispo ».
--
-- Il a raison : un seuil unique ne fait pas un marche. Sur un match ferme,
-- « plus de 2,5 » n'interesse personne ; sur un match ouvert, « moins de
-- 2,5 » non plus. Le joueur veut choisir SON seuil.
--
-- CE QU'ON PASSE DE 17 A 37 COTES PAR MATCH :
--   total de buts        0,5 · 1,5 · 2,5 · 3,5 · 4,5 · 5,5   → 12 choix
--   buts par equipe      1+ · 2+ · 3+ · 4+ pour chaque camp  →  8
--   vainqueur et ecart   nul, et 1 / 2 / 3+ pour chaque camp →  7
--   resultat + les deux marquent                             →  6
--   double chance        1X · 12 · X2                        →  3
--   les deux marquent    oui · non                           →  2
--
-- LES DEUX DERNIERS NE PEUVENT PAS S'ELARGIR, et c'est l'exception que
-- Mehdi prevoit : « les deux marquent » n'a pas de troisieme reponse, et un
-- match a trois issues n'a que trois paires. Les elargir voudrait dire
-- inventer des choix qui n'existent pas.
--
-- DEUX MARCHES REMPLACES, PAS SUPPRIMES. `ou25` (seuil unique) et `marge`
-- (ecart sans vainqueur) ne sont plus proposes, mais leurs branches restent :
-- des paris ont pu etre pris dessus entre 01h et 07h et doivent se denouer.
--
-- CE QUI N'A TOUJOURS PAS BOUGE : `cote_du_choix`, les paliers, les debits.
-- La plomberie de la 040 absorbe tout, migration apres migration.

alter table public.bet_legs drop constraint if exists bet_legs_market_check;
alter table public.bet_legs
  add constraint bet_legs_market_check
  check (market in ('1x2', 'exact', 'scorer',
                    'ou25', 'marge',             -- remplaces, encore reglables
                    'ou', 'btts', 'dc', 'vm', 'equipe', 'rbtts'));

create or replace function public.issue_du_choix(
  r public.match_results, p_market text, p_pick text
) returns text
language plpgsql immutable set search_path = public as $$
declare
  d int := r.home_score;
  e int := r.away_score;
  seuil numeric;
  palier int;
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

  elsif p_market = 'ou' then
    -- LE SEUIL SE LIT DANS LE CHOIX : « p25 » = plus de 2,5, « m15 » = moins
    -- de 1,5. Douze lignes presque identiques auraient dit la meme chose et
    -- auraient demande une migration de plus le jour ou l'on ajoute 6,5.
    -- Un choix mal forme rend 'void' : rembourse, jamais perdu par erreur.
    if p_pick !~ '^[pm][0-9]{2}$' then return 'void'; end if;
    seuil := substring(p_pick from 2)::numeric / 10;
    if left(p_pick, 1) = 'p' then
      return case when (d + e) > seuil then 'won' else 'lost' end;
    else
      return case when (d + e) < seuil then 'won' else 'lost' end;
    end if;

  elsif p_market = 'equipe' then
    -- « dom3 » = le domicile marque au moins trois buts.
    if p_pick !~ '^(dom|ext)[1-9]$' then return 'void'; end if;
    palier := right(p_pick, 1)::int;
    if left(p_pick, 3) = 'dom' then
      return case when d >= palier then 'won' else 'lost' end;
    else
      return case when e >= palier then 'won' else 'lost' end;
    end if;

  elsif p_market = 'vm' then
    -- Vainqueur ET ecart. « d2 » = le domicile gagne de deux buts,
    -- « x3 » = l'exterieur gagne de trois buts ou plus.
    return case
      when p_pick = 'nul' and d = e then 'won'
      when p_pick = 'd1'  and d - e = 1 then 'won'
      when p_pick = 'd2'  and d - e = 2 then 'won'
      when p_pick = 'd3'  and d - e >= 3 then 'won'
      when p_pick = 'x1'  and e - d = 1 then 'won'
      when p_pick = 'x2'  and e - d = 2 then 'won'
      when p_pick = 'x3'  and e - d >= 3 then 'won'
      when p_pick in ('nul','d1','d2','d3','x1','x2','x3') then 'lost'
      else 'void' end;

  elsif p_market = 'rbtts' then
    -- Resultat ET les deux marquent, en une seule case.
    return case
      when p_pick = (case when d > e then 'dom' when d < e then 'ext' else 'nul' end)
                    || '-' || (case when d > 0 and e > 0 then 'oui' else 'non' end)
      then 'won'
      when p_pick in ('dom-oui','dom-non','nul-oui','nul-non','ext-oui','ext-non') then 'lost'
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

  -- ── LES DEUX MARCHES REMPLACES, gardes pour denouer les paris pris ────
  elsif p_market = 'ou25' then
    return case
      when p_pick = 'plus'  and d + e >= 3 then 'won'
      when p_pick = 'moins' and d + e <= 2 then 'won'
      when p_pick in ('plus', 'moins') then 'lost'
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
