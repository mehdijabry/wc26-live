-- 040 — LES MARCHÉS DÉRIVÉS
--
-- Mehdi, 19/10/2026 : « donne-moi cinq autres types de pari qu'on pourrait
-- ajouter avec les infos qu'on a », puis « ajoute-les un par un ».
--
-- ─── CE QUI REND CES MARCHÉS POSSIBLES ───────────────────────────────────
-- `lam_home` et `lam_away` — les deux espérances de buts — sont déjà rangées
-- sur chaque ligne de `match_odds` depuis la 025. Tout événement qui
-- s'exprime en fonction des deux nombres de buts se lit donc sur la même
-- loi de Poisson que le score exact : aucune donnée de plus, aucun appel de
-- plus, et trois marchés qui racontent forcément la même rencontre.
--
-- ─── ET CE QUI LES REND RÉGLABLES ────────────────────────────────────────
-- Mesuré sur les 295 matchs terminés du 18/10 : corners, tirs et possession
-- ne sont publiés que sur 156 d'entre eux, les scores de mi-temps sur AUCUN,
-- le détail des buts sur 62 %. Le score final, lui, est sur 100 %. Ces
-- marchés se règlent donc partout où l'on prend des paris — ce qui n'aurait
-- pas été vrai d'un marché corners, qui aurait fini annulé une fois sur deux.
--
-- ─── LA GRILLE VOYAGE AVEC LES COTES ─────────────────────────────────────
-- Même colonne, même ligne, même instant que `exact` : on ne peut pas
-- afficher le prix d'un marché calculé sur une rencontre et en régler un
-- autre. C'est la règle posée en 006 et elle ne change pas.

alter table public.match_odds
  add column if not exists marches jsonb;

-- ─── LE PREMIER MARCHÉ : PLUS / MOINS 2,5 BUTS ───────────────────────────
-- Le plus joué au monde après le 1X2, et le seul qui permette de parier sur
-- un match sans avoir d'avis sur son vainqueur.
alter table public.bet_legs drop constraint if exists bet_legs_market_check;
alter table public.bet_legs
  add constraint bet_legs_market_check
  check (market in ('1x2', 'exact', 'scorer', 'ou25'));

-- ─── LE PRIX D'UN CHOIX ──────────────────────────────────────────────────
-- Une seule porte, comme avant : la cote est celle du serveur, jamais celle
-- du client. Les marchés dérivés se lisent tous dans `marches`, ce qui veut
-- dire que les quatre suivants n'auront RIEN à changer ici.
create or replace function public.cote_du_choix(p_match text, p_market text, p_pick text)
returns numeric
language plpgsql stable set search_path = public as $$
declare
  o public.match_odds%rowtype;
  v numeric;
begin
  select * into o from public.match_odds where match_id = p_match;
  if not found then return null; end if;

  if p_market = '1x2' then
    v := case p_pick when 'home' then o.home when 'draw' then o.draw when 'away' then o.away else null end;
  elsif p_market = 'exact' then
    v := nullif(o.exact ->> p_pick, '')::numeric;
  elsif p_market = 'scorer' then
    -- p_pick est l'identifiant ESPN du joueur. On le cherche dans la liste
    -- publiée pour CE match : un joueur absent n'est pas pariable.
    select (j ->> 'cote')::numeric into v
      from public.match_scorers s, jsonb_array_elements(s.players) j
     where s.match_id = p_match and j ->> 'id' = p_pick
     limit 1;
  else
    -- TOUS LES MARCHÉS DÉRIVÉS PASSENT PAR ICI. Une entrée absente de la
    -- grille rend null, donc le pari est refusé : un marché que le worker
    -- n'a pas su coter n'est pas jouable, et c'est voulu.
    v := nullif(o.marches -> p_market ->> p_pick, '')::numeric;
  end if;

  if v is null or v < 1.01 or v > 1000 then return null; end if;
  return v;
end;
$$;

-- ─── LE RÈGLEMENT ────────────────────────────────────────────────────────
-- On ne réécrit que la branche des marchés : le reste de
-- `settle_slips_for_match` (paliers, débits, bulletins) est inchangé et
-- vient de la 012. Une fonction d'AIGUILLAGE le garde lisible et fera que
-- les quatre marchés suivants n'ajouteront qu'un `when` ici.
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
    -- Personne n'a marqué : perdu, et c'est certain. Des buts mais aucun nom
    -- encore : ON NE TRANCHE PAS, le worker complétera et repassera ici.
    if d + e = 0 then return 'lost'; end if;
    if r.scorer_ids is null or array_length(r.scorer_ids, 1) is null then return 'open'; end if;
    return case when p_pick = any (r.scorer_ids) then 'won' else 'lost' end;

  elsif p_market = 'ou25' then
    return case
      when p_pick = 'plus'  and d + e >= 3 then 'won'
      when p_pick = 'moins' and d + e <= 2 then 'won'
      when p_pick in ('plus', 'moins') then 'lost'
      else 'void' end;

  end if;
  return 'void';
end;
$$;

create or replace function public.settle_slips_for_match(p_match text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.match_results%rowtype;
  s record;
  v_cote numeric(20,6);
  v_gain bigint;
  v_perte integer;
  v_solde bigint;
begin
  select * into r from public.match_results where match_id = p_match;
  if not found then return; end if;

  -- LA BRANCHE DES MARCHÉS EST SORTIE DANS `issue_du_choix`.
  -- C'est ce qui fait que les quatre marchés suivants n'ajouteront qu'un
  -- `elsif` là-bas, sans jamais retoucher aux paliers ni aux débits — la
  -- partie de cette fonction qu'on n'a aucune envie de réécrire à chaque
  -- nouveau pari.
  update public.bet_legs l
     set status = public.issue_du_choix(r, l.market, l.pick)
   where l.match_id = p_match and l.status = 'open';

  for s in
    select s2.* from public.bet_slips s2
     where s2.status = 'open'
       and exists (select 1 from public.bet_legs l
                    where l.slip_id = s2.id and l.status = 'lost')
  loop
    select pressings into v_solde from public.profiles where id = s.user_id for update;
    v_perte := least(public.perte_du_palier(coalesce(v_solde, 0)), greatest(coalesce(v_solde, 0), 0))::integer;

    update public.bet_slips
       set status = 'lost', payout = 0, penalty = v_perte, settled_at = now()
     where id = s.id;

    update public.profiles
       set pressings = greatest(pressings - v_perte, 0),
           current_streak = 0
     where id = s.user_id;
  end loop;

  for s in
    select s3.* from public.bet_slips s3
     where s3.status = 'open'
       and not exists (select 1 from public.bet_legs l
                        where l.slip_id = s3.id and l.status = 'open')
  loop
    if not exists (select 1 from public.bet_legs l
                    where l.slip_id = s.id and l.status = 'won') then
      update public.bet_slips
         set status = 'void', payout = 0, settled_at = now()
       where id = s.id;
      update public.profiles
         set crampons = crampons + s.stake
       where id = s.user_id;
      continue;
    end if;

    select coalesce(exp(sum(ln(l.odds))), 1) into v_cote
      from public.bet_legs l
     where l.slip_id = s.id and l.status = 'won';

    v_gain := round(s.stake * least(v_cote, 10000))::bigint;

    update public.bet_slips
       set status = 'won', payout = v_gain, settled_at = now()
     where id = s.id;

    update public.profiles
       set pressings = pressings + v_gain,
           current_streak = current_streak + 1,
           best_streak = greatest(best_streak, current_streak + 1)
     where id = s.user_id;

    -- LES POINTS. Sur la cote RÉELLEMENT encaissée — celle des jambes
    -- gagnantes — et pas sur la cote posée à la prise du pari : une jambe
    -- annulée fait tomber la cote, et il serait malhonnête de payer des
    -- points sur un risque qui n'a pas été couru.
    perform public.inscrire_points(s.user_id, s.id, null, s.stake, v_cote);
  end loop;
end;
$$;
