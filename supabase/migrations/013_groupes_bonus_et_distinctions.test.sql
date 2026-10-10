-- Test du bonus de groupe et des distinctions. Annule par l'exception finale.
do $$
declare
  u1 uuid; u2 uuid; u3 uuid; r text := '';
  g1 uuid; g2 uuid;
  e record; v_n integer; v_av bigint; v_ap bigint;
begin
  select id into u1 from public.profiles order by id limit 1;
  select id into u2 from public.profiles order by id offset 1 limit 1;
  select id into u3 from public.profiles order by id offset 2 limit 1;

  -- ISOLER LE FIXTURE. u1, u2 et u3 sont de VRAIS profils : s'ils ont parie
  -- recemment, le test mesure la production et pas la fonction. On vide donc
  -- leur fenetre de sept jours -- tout est annule a la fin du bloc.
  delete from public.bet_slips where user_id in (u1,u2,u3) and created_at >= now() - interval '7 days';
  delete from public.bets      where user_id in (u1,u2,u3) and created_at >= now() - interval '7 days';

  -- Deux groupes : un de trois membres, un de deux.
  insert into public.leagues (slug, name, owner_id) values ('tstgrp0001', 'Test A', u1) returning id into g1;
  insert into public.leagues (slug, name, owner_id) values ('tstgrp0002', 'Test B', u1) returning id into g2;
  insert into public.league_members (league_id, user_id) values (g1,u1),(g1,u2),(g1,u3),(g2,u1),(g2,u2);

  -- Une cote, puis des paris posés AUJOURD'HUI par u1 et u2 seulement.
  insert into public.match_odds (match_id, home, draw, away, kickoff)
  values ('TP-GRP', 2.00, 3.40, 3.80, now() + interval '2 hours')
  on conflict (match_id) do update set home = 2.00;
  delete from public.bets where match_id = 'TP-GRP';
  insert into public.bets (user_id, match_id, pick, stake, odds, status) values (u1,'TP-GRP','home',5,2.00,'open');
  insert into public.bets (user_id, match_id, pick, stake, odds, status) values (u2,'TP-GRP','home',5,2.00,'open');

  select * into e from public.groupe_etat('tstgrp0001');
  r := r || format(' [1] 3 membres -> %s (%s) |', e.membres = 3, e.membres);
  r := r || format(' [2] 2 actifs -> %s (%s) |', e.actifs = 2, e.actifs);
  r := r || format(' [3] 2 ont parie -> %s (%s) |', e.ont_parie_jour = 2, e.ont_parie_jour);
  -- u3 n'a pas parie depuis 7 jours : il ne compte PAS au denominateur.
  r := r || format(' [4] taux 2/2 = 1,000 -> %s (%s) |', e.taux_jour = 1.000, e.taux_jour);
  r := r || format(' [5] bonus 3 crampons -> %s (%s) |', e.bonus_jour = 3, e.bonus_jour);
  r := r || format(' [6] 3 membres = 1 recompense -> %s (%s) |', e.recompenses = 1, e.recompenses);

  select * into e from public.groupe_etat('tstgrp0002');
  r := r || format(' [7] groupe de 2 : aucun bonus -> %s (%s) |', e.bonus_jour = 0, e.bonus_jour);
  r := r || format(' [8] groupe de 2 : aucune recompense -> %s (%s) |', e.recompenses = 0, e.recompenses);

  -- Le versement
  delete from public.group_bonus_paid where jour = current_date;
  select crampons into v_av from public.profiles where id = u1;
  v_n := public.verser_bonus_de_groupe();
  select crampons into v_ap from public.profiles where id = u1;
  r := r || format(' [9] u1 credite de 3 -> %s (%s) |', v_ap = v_av + 3, v_ap - v_av);

  select count(*) into v_n from public.group_bonus_paid where user_id = u1 and jour = current_date;
  r := r || format(' [10] une seule ligne malgre 2 groupes -> %s (%s) |', v_n = 1, v_n);

  -- Rejouer ne doit rien reverser.
  perform public.verser_bonus_de_groupe();
  select crampons into v_ap from public.profiles where id = u1;
  r := r || format(' [11] rejouer ne reverse rien -> %s (%s) |', v_ap = v_av + 3, v_ap - v_av);

  -- u3 n'a pas joue : pas de bonus.
  select count(*) into v_n from public.group_bonus_paid where user_id = u3 and jour = current_date;
  r := r || format(' [12] u3 inactif, rien verse -> %s (%s) |', v_n = 0, v_n);

  raise exception E'RESULTATS --- %', r;
end $$;
