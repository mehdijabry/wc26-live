-- Test du marché buteur. Annulé par l'exception finale : rien ne subsiste.
do $$
declare
  v_user uuid; r text := ''; s1 bigint; s2 bigint; s3 bigint; s4 bigint;
  v numeric; st text; pay bigint; v_press bigint; v_cr int;
begin
  select id into v_user from public.profiles limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);
  update public.profiles set crampons = 40, pressings = 0 where id = v_user;

  insert into public.match_odds (match_id, home, draw, away, kickoff, exact) values
    ('TB-A', 2.00, 3.40, 3.80, now() + interval '2 hours', '{"2-1": 9.00}'::jsonb),
    ('TB-B', 1.50, 4.20, 6.00, now() + interval '3 hours', '{"1-0": 6.00}'::jsonb),
    ('TB-C', 2.50, 3.10, 2.90, now() + interval '4 hours', null),
    ('TB-D', 2.50, 3.10, 2.90, now() + interval '5 hours', null),
    ('TB-E', 2.50, 3.10, 2.90, now() + interval '6 hours', null);
  insert into public.match_scorers (match_id, players) values
    ('TB-A', '[{"id":"111","nom":"Attaquant","poste":"F","equipe":"dom","cote":3.50},
               {"id":"222","nom":"Defenseur","poste":"D","equipe":"ext","cote":10.00}]'::jsonb),
    ('TB-B', '[{"id":"333","nom":"Milieu","poste":"M","equipe":"dom","cote":6.00}]'::jsonb),
    ('TB-C', '[{"id":"444","nom":"Ailier","poste":"F","equipe":"dom","cote":4.00}]'::jsonb),
    ('TB-D', '[{"id":"555","nom":"Pointe","poste":"F","equipe":"dom","cote":5.00}]'::jsonb),
    ('TB-E', '[{"id":"666","nom":"Avant","poste":"F","equipe":"dom","cote":4.50}]'::jsonb);

  -- 1 — la cote vient de la liste du serveur
  s1 := public.place_slip('[{"match_id":"TB-A","market":"scorer","pick":"111"}]'::jsonb, 2);
  select odds into v from public.bet_slips where id = s1;
  r := r || format(' [1] cote buteur attendu 3.50 obtenu %s → %s |', v, (v = 3.50));

  -- 2 — un joueur absent de la liste n'est pas pariable
  begin
    perform public.place_slip('[{"match_id":"TB-A","market":"scorer","pick":"999"}]'::jsonb, 1);
    r := r || ' [2] joueur hors liste ACCEPTE → FAUX |';
  exception when others then r := r || ' [2] joueur hors liste refuse → VRAI |';
  end;

  -- 3 — combiné des TROIS marchés dans un seul bulletin
  s2 := public.place_slip('[{"match_id":"TB-A","market":"1x2","pick":"home"},
                            {"match_id":"TB-B","market":"exact","pick":"1-0"},
                            {"match_id":"TB-C","market":"scorer","pick":"444"}]'::jsonb, 3);
  select odds into v from public.bet_slips where id = s2;
  r := r || format(' [3] 2.00x6.00x4.00 attendu 48.00 obtenu %s → %s |', v, (v = 48.00));

  -- 4 — un pari buteur sur un match SANS donnee de buteur
  s3 := public.place_slip('[{"match_id":"TB-D","market":"scorer","pick":"555"}]'::jsonb, 4);
  -- 5 — un pari buteur sur un match nul vierge
  s4 := public.place_slip('[{"match_id":"TB-E","market":"scorer","pick":"666"}]'::jsonb, 5);

  select crampons into v_cr from public.profiles where id = v_user;
  r := r || format(' [4] crampons 40-2-3-4-5 attendu 26 obtenu %s → %s |', v_cr, (v_cr = 26));

  -- Les resultats. TB-A : 2-1, buteurs 111 et 777.
  -- TB-B : 1-0 buteur 888. TB-C : 1-0 buteur 444. TB-D : 3-1 mais AUCUN
  -- buteur identifie. TB-E : 0-0, donc personne n'a marque.
  insert into public.match_results (match_id, home_score, away_score, scorer_ids, card_player_ids, finished_at) values
    ('TB-A', 2, 1, '{111,777}', '{}', now()),
    ('TB-B', 1, 0, '{888}',     '{}', now()),
    ('TB-C', 1, 0, '{444}',     '{}', now()),
    ('TB-D', 3, 1, '{}',        '{}', now()),
    ('TB-E', 0, 0, '{}',        '{}', now());

  select status, payout into st, pay from public.bet_slips where id = s1;
  r := r || format(' [5] buteur trouve attendu won/7 obtenu %s/%s → %s |', st, pay, (st='won' and pay=7));

  select status, payout into st, pay from public.bet_slips where id = s2;
  r := r || format(' [6] combine 3 marches attendu won/144 obtenu %s/%s → %s |', st, pay, (st='won' and pay=144));

  select status into st from public.bet_slips where id = s3;
  r := r || format(' [7] buts marques mais aucun buteur connu : attendu void obtenu %s → %s |', st, (st='void'));

  select status into st from public.bet_slips where id = s4;
  r := r || format(' [8] match 0-0, personne n a marque : attendu lost obtenu %s → %s |', st, (st='lost'));

  select crampons into v_cr from public.profiles where id = v_user;
  r := r || format(' [9] mise remboursee sur le bulletin annule, attendu 30 obtenu %s → %s |', v_cr, (v_cr = 30));

  select pressings into v_press from public.profiles where id = v_user;
  r := r || format(' [10] pressings attendu 151 obtenu %s → %s |', v_press, (v_press = 151));

  raise exception E'RESULTATS --- %', r;
end $$;
