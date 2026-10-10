-- 009 — cinq paliers jusqu'aux 7 500, et un risque qui monte avec eux
--
-- CE QUI MANQUAIT. L'objectif était un mur unique : 7 500 pressings, 5 $.
-- Entre 0 et 7 500 il ne se passait rien, et surtout un bulletin perdu ne
-- coûtait jamais un pressing — on ne pouvait que monter. Un jeu où l'on ne
-- perd rien n'a pas de tension, et un objectif sans marche intermédiaire ne
-- donne jamais le sentiment d'avancer.
--
-- CE QU'ON POSE (Mehdi, 2026-10-10). Cinq paliers. Les deux premiers, jusqu'à
-- 2 000 pressings, sont un terrain d'apprentissage : on y perd sa mise en
-- crampons comme avant, mais jamais ses pressings. Au-delà de 2 000, chaque
-- bulletin perdu coûte, et d'autant plus qu'on est monté haut :
--
--     palier 1   0 – 1 000      aucune perte
--     palier 2   1 000 – 2 000  aucune perte
--     palier 3   2 000 – 3 750  15 pressings par bulletin perdu
--     palier 4   3 750 – 5 500  30
--     palier 5   5 500 – 7 500  45   ← le plafond voulu
--
-- TROIS GARDE-FOUS. Le solde ne descend jamais sous zéro ; la perte est
-- calculée sur le solde AVANT règlement ; et le palier se DÉDUIT du solde, il
-- n'est stocké nulle part — pas de colonne à tenir synchronisée, donc pas de
-- dérive possible entre ce qu'on affiche et ce qu'on applique.

-- La perte subie, gardée sur le bulletin : sans elle, « Mes paris » ne pourrait
-- pas expliquer au joueur pourquoi son solde a baissé.
alter table public.bet_slips add column if not exists penalty integer not null default 0;

-- ── La règle, en un seul endroit ────────────────────────────────────────────
-- Le site lit la même table dans src/lib/jeu.ts (PALIERS). Les deux doivent
-- bouger ensemble.
create or replace function public.palier_de(p_pressings bigint)
returns integer
language sql immutable set search_path = public as $$
  select case
    when p_pressings >= 5500 then 5
    when p_pressings >= 3750 then 4
    when p_pressings >= 2000 then 3
    when p_pressings >= 1000 then 2
    else 1
  end;
$$;

create or replace function public.perte_du_palier(p_pressings bigint)
returns integer
language sql immutable set search_path = public as $$
  select case public.palier_de(p_pressings)
    when 5 then 45
    when 4 then 30
    when 3 then 15
    else 0
  end;
$$;

grant execute on function public.palier_de(bigint) to anon, authenticated;
grant execute on function public.perte_du_palier(bigint) to anon, authenticated;

-- ── Le règlement des bulletins, repris mot pour mot de la 008 ──────────────
-- Seul le passage « bulletin perdu » change, plus la série qui n'était pas
-- entretenue côté bulletins.
create or replace function public.settle_slips_for_match(p_match text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  s record;
  v_cote numeric(20,6);
  v_gain bigint;
  v_perte integer;
  v_solde bigint;
begin
  select * into r from public.match_results where match_id = p_match;
  if not found then return; end if;

  update public.bet_legs l
     set status = case
       when l.market = '1x2' then
         case when l.pick = (case
                when r.home_score > r.away_score then 'home'
                when r.home_score < r.away_score then 'away'
                else 'draw' end)
         then 'won' else 'lost' end
       when l.market = 'exact' then
         case when l.pick = (r.home_score::text || '-' || r.away_score::text)
         then 'won' else 'lost' end
       when l.market = 'scorer' then
         case
           -- Personne n'a marqué : le pari est perdu, et c'est certain.
           when r.home_score + r.away_score = 0 then 'lost'
           -- Des buts, mais aucun nom encore : ON NE TRANCHE PAS. La jambe
           -- reste ouverte, le worker complétera, et ce même déclencheur
           -- repassera. Le balai ci-dessous rattrape les cas désespérés.
           when r.scorer_ids is null or array_length(r.scorer_ids, 1) is null then 'open'
           when l.pick = any (r.scorer_ids) then 'won'
           else 'lost'
         end
       else 'void'
     end
   where l.match_id = p_match and l.status = 'open';

  -- Un bulletin qui contient une jambe perdue est perdu — et c'est ICI que le
  -- palier se paie. Le solde est lu AVANT le débit (un gain encaissé dans la
  -- même passe ne doit pas faire monter le tarif de la punition), la perte est
  -- bornée au solde disponible, et elle est inscrite sur le bulletin pour
  -- rester lisible après coup.
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
  end loop;
end;
$$;

-- ── Les paris simples de l'ancien système suivent la même règle ────────────
-- Sinon il suffirait de jouer un simple pour ne jamais risquer un pressing.
create or replace function public.settle_bets_on_result()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b record;
  gagnant text := case
    when new.home_score > new.away_score then 'home'
    when new.home_score < new.away_score then 'away'
    else 'draw' end;
  gain bigint;
  v_perte integer;
  v_solde bigint;
begin
  for b in
    select * from public.bets where match_id = new.match_id and status = 'open'
  loop
    if b.pick = gagnant then
      gain := round(b.stake * b.odds)::bigint;
      update public.bets
         set status = 'won', payout = gain, settled_at = now()
       where id = b.id;
      update public.profiles
         set pressings = pressings + gain,
             current_streak = current_streak + 1,
             best_streak = greatest(best_streak, current_streak + 1)
       where id = b.user_id;
    else
      select pressings into v_solde from public.profiles where id = b.user_id for update;
      v_perte := least(public.perte_du_palier(coalesce(v_solde, 0)), greatest(coalesce(v_solde, 0), 0))::integer;
      update public.bets
         set status = 'lost', payout = 0, settled_at = now()
       where id = b.id;
      update public.profiles
         set pressings = greatest(pressings - v_perte, 0),
             current_streak = 0
       where id = b.user_id;
    end if;
  end loop;
  return new;
end;
$$;
