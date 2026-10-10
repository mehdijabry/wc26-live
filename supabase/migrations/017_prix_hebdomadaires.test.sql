-- Test des prix hebdomadaires. Annule par l'exception finale.
do $$
declare
  u uuid[]; g uuid; r text := '';
  sem0 timestamptz; v_n integer; i integer; k integer;
  b bigint; p record; v_av bigint; v_ap bigint; v_prix bigint;
begin
  select array_agg(id order by id) into u from (select id from public.profiles order by id limit 5) x;
  if array_length(u,1) < 5 then raise exception 'Il faut 5 profils'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u[1]::text)::text, true);

  sem0 := public.debut_semaine() - interval '7 days';

  -- Fixture isole sur la semaine precedente ET la fenetre de sept jours.
  delete from public.ranking_events where user_id = any(u) and created_at >= sem0;
  delete from public.bet_slips      where user_id = any(u) and created_at >= sem0;
  delete from public.bets           where user_id = any(u) and created_at >= sem0;
  delete from public.weekly_prizes  where user_id = any(u);

  -- place_bet_guard() DEBITE la mise a la pose : il faut de quoi payer
  -- 25 paris a 5 crampons. Tout est annule a la fin du bloc.
  update public.profiles set crampons = 500 where id = any(u);

  insert into public.leagues (slug, name, owner_id) values ('tstprx0001','Podium',u[1]) returning id into g;
  insert into public.league_members (league_id, user_id)
  select g, x from unnest(u) x;
  r := r || format(' [1] groupe de 5 -> %s |', (select count(*) from public.league_members where league_id = g) = 5);

  -- Cinq matchs cotes, et cinq paris par joueur DANS la semaine precedente.
  for k in 1..5 loop
    insert into public.match_odds (match_id, home, draw, away, kickoff)
    values ('TP-W'||k, 2.00, 3.40, 3.80, now() + interval '2 hours')
    on conflict (match_id) do update set home = 2.00;
    delete from public.bets where match_id = 'TP-W'||k;
  end loop;

  for i in 1..5 loop
    for k in 1..5 loop
      -- Le joueur 5 ne pose que deux paris : il casse le taux d'assiduite.
      if i = 5 and k > 2 then continue; end if;
      insert into public.bets (user_id, match_id, pick, stake, odds, status)
      values (u[i], 'TP-W'||k, 'home', 5, 2.00, 'open') returning id into b;
      update public.bets set created_at = sem0 + interval '1 day' where id = b;
      -- Des points decroissants : u1 premier, u2 deuxieme, etc.
      insert into public.ranking_events (user_id, bet_id, points, created_at)
      values (u[i], b, (6 - i) * 100, sem0 + interval '1 day');
    end loop;
  end loop;

  -- 4 assidus sur 5 actifs : taux de 0,800.
  v_n := public.cloturer_semaine(sem0::date);
  r := r || format(' [2] 3 prix inscrits -> %s (%s) |', v_n = 3, v_n);

  select * into p from public.weekly_prizes where league_id = g and user_id = u[1];
  r := r || format(' [3] u1 premier -> %s (%s) |', p.rang = 1, p.rang);
  r := r || format(' [4] taux 0,800 -> %s (%s) |', p.taux = 0.800, p.taux);
  r := r || format(' [5] 50 x 0,8 = 40 crampons -> %s (%s) |', p.crampons = 40, p.crampons);
  r := r || format(' [6] 10 x 0,8 = 8 pressings -> %s (%s) |', p.pressings = 8, p.pressings);
  v_prix := p.id;

  select * into p from public.weekly_prizes where league_id = g and user_id = u[3];
  r := r || format(' [7] u3 troisieme, 20 x 0,8 = 16 -> %s (%s) |', p.crampons = 16, p.crampons);

  select count(*) into v_n from public.weekly_prizes where league_id = g and user_id = u[4];
  r := r || format(' [8] u4 quatrieme : aucun prix -> %s (%s) |', v_n = 0, v_n);

  -- Rejouer la cloture ne duplique rien.
  v_n := public.cloturer_semaine(sem0::date);
  r := r || format(' [9] cloture rejouee : 0 nouveau -> %s (%s) |', v_n = 0, v_n);

  -- La reclamation, en crampons.
  select crampons into v_av from public.profiles where id = u[1];
  select * into p from public.reclamer_prix(v_prix, 'crampons');
  select crampons into v_ap from public.profiles where id = u[1];
  r := r || format(' [10] +40 crampons -> %s (%s) |', v_ap = v_av + 40, v_ap - v_av);

  -- Deuxieme reclamation la meme semaine : refusee.
  begin
    perform public.reclamer_prix(v_prix, 'pressings');
    r := r || ' [11] double reclamation -> AUCUNE exception |';
  exception when others then
    r := r || format(' [11] double reclamation refusee -> %s |', sqlerrm like '%déjà réclamé%');
  end;

  raise exception E'RESULTATS --- %', r;
end $$;
