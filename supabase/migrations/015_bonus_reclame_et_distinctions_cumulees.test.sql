-- Test de la reclamation et des distinctions cumulees. Annule a la fin.
do $$
declare
  u1 uuid; u2 uuid; u3 uuid; u4 uuid; u5 uuid; r text := '';
  gA uuid; gB uuid; e record; d record; v_av bigint; v_ap bigint;
begin
  select id into u1 from public.profiles order by id limit 1;
  select id into u2 from public.profiles order by id offset 1 limit 1;
  select id into u3 from public.profiles order by id offset 2 limit 1;
  select id into u4 from public.profiles order by id offset 3 limit 1;
  select id into u5 from public.profiles order by id offset 4 limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u1::text)::text, true);

  -- Fixture isole : on vide la fenetre de sept jours des cinq profils.
  delete from public.bet_slips where user_id in (u1,u2,u3,u4,u5) and created_at >= now() - interval '7 days';
  delete from public.bets      where user_id in (u1,u2,u3,u4,u5) and created_at >= now() - interval '7 days';
  delete from public.group_bonus_paid where user_id = u1 and jour = current_date;

  -- Deux groupes de trois, u1 dans les deux : c'est tout l'enjeu.
  insert into public.leagues (slug, name, owner_id) values ('tstdbl0001','Collegues',u1) returning id into gA;
  insert into public.leagues (slug, name, owner_id) values ('tstdbl0002','Famille',u1)  returning id into gB;
  insert into public.league_members (league_id,user_id) values (gA,u1),(gA,u2),(gA,u3),(gB,u1),(gB,u4),(gB,u5);
  r := r || format(' [1] u1 dans 2 groupes -> %s |',
        (select count(*) from public.league_members where user_id = u1) = 2);

  -- Cotes + paris : tout le monde joue dans A, u1 seul dans B.
  insert into public.match_odds (match_id, home, draw, away, kickoff)
  values ('TP-DBL', 2.00, 3.40, 3.80, now() + interval '2 hours')
  on conflict (match_id) do update set home = 2.00;
  delete from public.bets where match_id = 'TP-DBL';
  insert into public.bets (user_id,match_id,pick,stake,odds,status) values (u1,'TP-DBL','home',5,2.00,'open');
  insert into public.bets (user_id,match_id,pick,stake,odds,status) values (u2,'TP-DBL','home',5,2.00,'open');
  insert into public.bets (user_id,match_id,pick,stake,odds,status) values (u3,'TP-DBL','home',5,2.00,'open');

  select * into e from public.groupe_etat('tstdbl0001');
  r := r || format(' [2] Collegues : 3/3 actifs -> %s (%s/%s) |', e.taux_jour = 1.000, e.ont_parie_jour, e.actifs);
  select * into e from public.groupe_etat('tstdbl0002');
  r := r || format(' [3] Famille : 1/1 actif (u4,u5 dormants) -> %s (%s/%s) |',
        e.taux_jour = 1.000, e.ont_parie_jour, e.actifs);

  -- La reclamation : u1 choisit Collegues.
  select crampons into v_av from public.profiles where id = u1;
  select * into d from public.reclamer_bonus_de_groupe('tstdbl0001');
  select crampons into v_ap from public.profiles where id = u1;
  r := r || format(' [4] 3 crampons verses -> %s (%s) |', d.crampons = 3, d.crampons);
  r := r || format(' [5] solde +3 -> %s (%s) |', v_ap = v_av + 3, v_ap - v_av);
  r := r || format(' [6] groupe nomme -> %s (%s) |', d.groupe = 'Collegues', d.groupe);

  -- Deuxieme reclamation, autre groupe : refusee, et elle le DIT.
  select * into d from public.reclamer_bonus_de_groupe('tstdbl0002');
  r := r || format(' [7] deuxieme refusee -> %s |', d.deja = true);
  r := r || format(' [8] renvoie le groupe deja reclame -> %s (%s) |', d.groupe = 'Collegues', d.groupe);
  select crampons into v_ap from public.profiles where id = u1;
  r := r || format(' [9] rien verse en plus -> %s (%s) |', v_ap = v_av + 3, v_ap - v_av);

  -- Les distinctions se cumulent : u1 est premier du jour dans les deux.
  perform public.inscrire_points(u1, null, (select id from public.bets where user_id=u1 and match_id='TP-DBL'), 5, 2.00);
  select * into d from public.distinctions(u1);
  r := r || format(' [10] or x2 (premier des deux groupes) -> %s (%s) |', d.orees = 2, d.orees);

  raise exception E'RESULTATS --- %', r;
end $$;
