-- Test du moteur de bulletins. Tout est annulé par l'exception finale :
-- aucune ligne, aucun crampon, aucun pressing ne subsiste après exécution.
do $$
declare
  v_user     uuid;
  v_crampons int;
  v_press    bigint;
  r          text := '';
  s1 bigint; s2 bigint; s3 bigint;
  v numeric; n int; st text; pay bigint;
  function_ok boolean;
begin
  select id into v_user from public.profiles limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  update public.profiles set crampons = 20, pressings = 0 where id = v_user;

  insert into public.match_odds (match_id, home, draw, away, kickoff, exact) values
    ('TEST-A', 2.00, 3.40, 3.80, now() + interval '2 hours', '{"2-1": 9.00, "1-0": 7.50}'::jsonb),
    ('TEST-B', 1.50, 4.20, 6.00, now() + interval '3 hours', '{"1-0": 6.00}'::jsonb),
    ('TEST-C', 1.90, 3.30, 4.10, now() - interval '1 hour',  null);

  -- 1 — combiné à deux jambes : la cote doit être le PRODUIT
  s1 := public.place_slip('[{"match_id":"TEST-A","market":"1x2","pick":"home"},
                            {"match_id":"TEST-B","market":"1x2","pick":"home"}]'::jsonb, 5);
  select odds into v from public.bet_slips where id = s1;
  r := r || format(' [1] cote combinee 2.00x1.50 attendu 3.00 obtenu %s → %s |', v, (v = 3.00));

  select count(*) into n from public.bet_legs where slip_id = s1;
  r := r || format(' [2] nb jambes attendu 2 obtenu %s → %s |', n, (n = 2));

  select crampons into v_crampons from public.profiles where id = v_user;
  r := r || format(' [3] crampons 20-5 attendu 15 obtenu %s → %s |', v_crampons, (v_crampons = 15));

  -- 4 — score exact : la cote vient de la grille serveur
  s2 := public.place_slip('[{"match_id":"TEST-A","market":"exact","pick":"2-1"}]'::jsonb, 3);
  select odds into v from public.bet_slips where id = s2;
  r := r || format(' [4] cote score exact attendu 9.00 obtenu %s → %s |', v, (v = 9.00));

  -- 5 — deux fois le même match dans UN bulletin : refus
  begin
    perform public.place_slip('[{"match_id":"TEST-A","market":"1x2","pick":"home"},
                                {"match_id":"TEST-A","market":"1x2","pick":"away"}]'::jsonb, 1);
    r := r || ' [5] doublon ACCEPTE → FAUX |';
  exception when others then
    r := r || format(' [5] doublon refuse (%s) → VRAI |', sqlerrm);
  end;

  -- 6 — match déjà commencé : refus
  begin
    perform public.place_slip('[{"match_id":"TEST-C","market":"1x2","pick":"home"}]'::jsonb, 1);
    r := r || ' [6] match commence ACCEPTE → FAUX |';
  exception when others then
    r := r || format(' [6] match commence refuse (%s) → VRAI |', sqlerrm);
  end;

  -- 7 — score absent de la grille : refus
  begin
    perform public.place_slip('[{"match_id":"TEST-A","market":"exact","pick":"9-9"}]'::jsonb, 1);
    r := r || ' [7] score hors grille ACCEPTE → FAUX |';
  exception when others then
    r := r || format(' [7] score hors grille refuse → VRAI |');
  end;

  -- 8 — mise supérieure au solde : refus
  begin
    perform public.place_slip('[{"match_id":"TEST-B","market":"1x2","pick":"home"}]'::jsonb, 999);
    r := r || ' [8] mise > solde ACCEPTEE → FAUX |';
  exception when others then
    r := r || ' [8] mise > solde refusee → VRAI |';
  end;

  select crampons into v_crampons from public.profiles where id = v_user;
  r := r || format(' [9] aucun debit orphelin apres 4 refus, attendu 12 obtenu %s → %s |',
                   v_crampons, (v_crampons = 12));

  -- 10 — un bulletin perdant
  s3 := public.place_slip('[{"match_id":"TEST-A","market":"1x2","pick":"away"}]'::jsonb, 2);

  -- Les résultats tombent : A finit 2-1 (victoire domicile), B finit 1-0.
  insert into public.match_results (match_id, home_score, away_score, scorer_ids, card_player_ids, finished_at)
  values ('TEST-A', 2, 1, '{}', '{}', now()), ('TEST-B', 1, 0, '{}', '{}', now());

  select status, payout into st, pay from public.bet_slips where id = s1;
  r := r || format(' [10] combine gagnant attendu won/15 obtenu %s/%s → %s |',
                   st, pay, (st = 'won' and pay = 15));

  select status, payout into st, pay from public.bet_slips where id = s2;
  r := r || format(' [11] score exact gagnant attendu won/27 obtenu %s/%s → %s |',
                   st, pay, (st = 'won' and pay = 27));

  select status, payout into st, pay from public.bet_slips where id = s3;
  r := r || format(' [12] pari perdant attendu lost/0 obtenu %s/%s → %s |',
                   st, pay, (st = 'lost' and pay = 0));

  select pressings into v_press from public.profiles where id = v_user;
  r := r || format(' [13] pressings credites attendu 42 obtenu %s → %s |', v_press, (v_press = 42));

  raise exception E'RESULTATS --- %', r;
end $$;
