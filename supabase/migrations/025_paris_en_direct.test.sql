-- Test des paris en direct. Annulé par l'exception finale : rien ne subsiste.
do $$
declare
  v_user uuid; r text := ''; s bigint; v numeric;
begin
  select id into v_user from public.profiles limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);
  update public.profiles set crampons = 60 where id = v_user;

  insert into public.match_odds
    (match_id, home, draw, away, kickoff, closes_at, live, minute, home_score, away_score, exact, suspended_until) values
    -- À venir : ferme au coup d'envoi, comme avant.
    ('LV-A', 2.00, 3.40, 3.80, now() + interval '2 hours', now() + interval '2 hours',
     false, null, null, null, '{"2-1": 9.00}'::jsonb, null),
    -- En cours, 30e : ouvert, cote live.
    ('LV-B', 3.03, 3.34, 2.30, now() - interval '30 minutes', now() + interval '54 minutes',
     true, 30, 0, 1, '{"1-1": 6.50}'::jsonb, null),
    -- En cours, 86e : passé la fermeture.
    ('LV-C', 1.05, 9.00, 40.0, now() - interval '86 minutes', now() - interval '1 minute',
     true, 86, 2, 0, null, null),
    -- En cours, un but vient de tomber : marché gelé.
    ('LV-D', 2.10, 3.30, 3.40, now() - interval '55 minutes', now() + interval '29 minutes',
     true, 55, 1, 1, null, now() + interval '60 seconds');
  insert into public.match_scorers (match_id, players) values
    ('LV-B', '[{"id":"111","nom":"Attaquant","poste":"F","equipe":"dom","cote":3.50}]'::jsonb);

  -- 1 — un match EN COURS accepte désormais un pari
  s := public.place_slip('[{"match_id":"LV-B","market":"1x2","pick":"home"}]'::jsonb, 2);
  select odds into v from public.bet_slips where id = s;
  r := r || format(' [1] pari en direct accepte, cote %s → %s |', v, (v = 3.03));

  -- 2 — et c'est bien la cote LIVE du serveur, pas celle d'avant-match
  r := r || format(' [2] cote live retenue → %s |', (v <> 1.50));

  -- 3 — passé la fermeture, refus
  begin
    perform public.place_slip('[{"match_id":"LV-C","market":"1x2","pick":"home"}]'::jsonb, 2);
    r := r || ' [3] 86e ACCEPTE → FAUX |';
  exception when others then r := r || ' [3] 86e refuse → VRAI |';
  end;

  -- 4 — marché gelé après un but, refus
  begin
    perform public.place_slip('[{"match_id":"LV-D","market":"1x2","pick":"draw"}]'::jsonb, 2);
    r := r || ' [4] marche gele ACCEPTE → FAUX |';
  exception when others then r := r || ' [4] marche gele refuse → VRAI |';
  end;

  -- 5 — le marché buteur ferme au coup d'envoi
  begin
    perform public.place_slip('[{"match_id":"LV-B","market":"scorer","pick":"111"}]'::jsonb, 2);
    r := r || ' [5] buteur en direct ACCEPTE → FAUX |';
  exception when others then r := r || ' [5] buteur en direct refuse → VRAI |';
  end;

  -- 6 — un match à venir reste pariable
  s := public.place_slip('[{"match_id":"LV-A","market":"1x2","pick":"home"}]'::jsonb, 2);
  r := r || format(' [6] match a venir accepte → %s |', (s is not null));

  -- 7 — une ligne SANS date de fermeture est fermée, pas ouverte
  --     (c'est la garde qui protège d'un rattrapage oublié)
  update public.match_odds set closes_at = null where match_id = 'LV-A';
  begin
    perform public.place_slip('[{"match_id":"LV-A","market":"1x2","pick":"draw"}]'::jsonb, 2);
    r := r || ' [7] closes_at nul ACCEPTE → FAUX |';
  exception when others then r := r || ' [7] closes_at nul refuse → VRAI |';
  end;

  -- 8 — combiné d'un match à venir et d'un match en cours
  update public.match_odds set closes_at = now() + interval '2 hours' where match_id = 'LV-A';
  s := public.place_slip('[{"match_id":"LV-A","market":"1x2","pick":"home"},
                           {"match_id":"LV-B","market":"1x2","pick":"away"}]'::jsonb, 3);
  select odds into v from public.bet_slips where id = s;
  r := r || format(' [8] combine avant+direct cote %s attendu 4.60 → %s |', v, (v = 4.60));

  -- 9 — la mise est plafonnée sur un match en direct
  -- ON RECHARGE D'ABORD. Sans ça le refus viendrait du solde insuffisant et
  -- le test passerait pour la mauvaise raison — il faut que la seule chose
  -- qui puisse refuser 101, ici, soit le plafond.
  update public.profiles set crampons = 5000 where id = v_user;
  begin
    perform public.place_slip('[{"match_id":"LV-B","market":"1x2","pick":"home"}]'::jsonb, 101);
    r := r || ' [9] mise 101 en direct ACCEPTE → FAUX |';
  exception when others then r := r || ' [9] mise 101 en direct refuse → VRAI |';
  end;

  -- 10 — mais pas sur un match à venir
  s := public.place_slip('[{"match_id":"LV-A","market":"1x2","pick":"away"}]'::jsonb, 400);
  r := r || format(' [10] mise 400 avant-match accepte → %s |', (s is not null));

  -- 11 — un combiné qui CONTIENT un match en direct est plafonné lui aussi
  --      (sinon on contourne en ajoutant un match à venir)
  update public.profiles set crampons = 5000 where id = v_user;
  begin
    perform public.place_slip('[{"match_id":"LV-A","market":"1x2","pick":"draw"},
                                {"match_id":"LV-B","market":"1x2","pick":"draw"}]'::jsonb, 300);
    r := r || ' [11] combine avec direct a 300 ACCEPTE → FAUX |';
  exception when others then r := r || ' [11] combine avec direct a 300 refuse → VRAI |';
  end;

  raise exception 'ROLLBACK VOULU —%', r;
end $$;
