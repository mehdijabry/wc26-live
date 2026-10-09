-- 008 — un pari buteur n'est pas perdu parce que la donnée est EN RETARD
--
-- CE QUI CLOCHAIT. ESPN ne remplit le détail des buts qu'APRÈS la fin du
-- match — parfois plusieurs minutes plus tard. Or le worker enregistre le
-- résultat à la seconde où la rencontre passe « terminée », donc trop tôt :
-- mesuré en production, 4 matchs sur 112 avec des buts avaient leurs
-- buteurs. Le marché buteur était donc quasiment inutilisable.
--
-- La 007 annulait alors la jambe (remboursement) plutôt que de la déclarer
-- perdue — c'était le bon réflexe, mais il tranchait trop tôt : une fois la
-- jambe annulée, l'arrivée tardive des buteurs ne pouvait plus la faire
-- gagner. Le joueur était remboursé au lieu d'être payé.
--
-- CE QU'ON FAIT. Quand des buts ont été marqués mais qu'aucun buteur n'est
-- encore connu, la jambe RESTE OUVERTE. Le worker complète les buteurs dès
-- qu'ESPN les publie, ce qui redéclenche le règlement et paie correctement.
-- Et pour qu'une jambe ne reste pas ouverte indéfiniment si la donnée ne
-- vient jamais, un balai l'annule au bout de 48 heures — là, et seulement
-- là, le remboursement est le bon dénouement.

create or replace function public.settle_slips_for_match(p_match text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  s record;
  v_cote numeric(20,6);
  v_gain bigint;
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

  update public.bet_slips s2
     set status = 'lost', payout = 0, settled_at = now()
   where s2.status = 'open'
     and exists (select 1 from public.bet_legs l
                  where l.slip_id = s2.id and l.status = 'lost');

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
       set pressings = pressings + v_gain
     where id = s.user_id;
  end loop;
end;
$$;

-- Le balai : les jambes buteur restées ouvertes 48 h après le résultat.
-- Si les buteurs ne sont jamais venus, on annule et on rembourse — mais
-- seulement après avoir laissé toutes ses chances à la donnée d'arriver.
create or replace function public.purger_paris_buteur_en_attente()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  m record;
  n integer := 0;
begin
  for m in
    select distinct l.match_id
      from public.bet_legs l
      join public.match_results r on r.match_id = l.match_id
     where l.market = 'scorer'
       and l.status = 'open'
       and r.finished_at < now() - interval '48 hours'
  loop
    update public.bet_legs
       set status = 'void'
     where match_id = m.match_id and market = 'scorer' and status = 'open';
    n := n + 1;
    -- Le règlement reprend la main : une jambe annulée sort du produit, et
    -- un bulletin entièrement annulé rembourse la mise en crampons.
    perform public.settle_slips_for_match(m.match_id);
  end loop;
  return n;
end;
$$;
