-- Test des points de classement. Annulé par l'exception finale.
do $$
declare
  v_user uuid; r text := '';
  v_av bigint; v_ap bigint; v_n integer; v_bet bigint;
begin
  select id into v_user from public.profiles limit 1;
  -- Un vrai pari : la cle etrangere de ranking_events refuse un identifiant
  -- invente, et elle a raison. Tout est annule a la fin du bloc.
  -- place_bet_guard() refuse un pari sur un match sans cote publiee, et la
  -- cote qu'il retient est CELLE DE LA TABLE, pas celle envoyee. D'ou la
  -- ligne de cotes a 2,00 : c'est elle qui donne les 100 points attendus.
  insert into public.match_odds (match_id, home, draw, away, kickoff)
  values ('TP-POINTS', 2.00, 3.40, 3.80, now() + interval '2 hours')
  on conflict (match_id) do update set home = 2.00;
  delete from public.bets where match_id = 'TP-POINTS';
  insert into public.bets (user_id, match_id, pick, stake, odds, status)
  values (v_user, 'TP-POINTS', 'home', 5, 2.00, 'open')
  returning id into v_bet;

  -- ── 1. La formule ───────────────────────────────────────────────────────
  r := r || format(' [1] 10 jetons a cote 1,00 = 100 -> %s (%s) |',
        public.points_du_pari(10, 1.00) = 100, public.points_du_pari(10, 1.00));
  r := r || format(' [2] 10 a 2,00 = 200 -> %s (%s) |',
        public.points_du_pari(10, 2.00) = 200, public.points_du_pari(10, 2.00));
  r := r || format(' [3] 10 a 4,50 = 450 -> %s (%s) |',
        public.points_du_pari(10, 4.50) = 450, public.points_du_pari(10, 4.50));
  r := r || format(' [4] plafond a 5 : 10 a 400 = 500 -> %s (%s) |',
        public.points_du_pari(10, 400) = 500, public.points_du_pari(10, 400));
  r := r || format(' [5] jamais zero : 1 a 1,01 -> %s (%s) |',
        public.points_du_pari(1, 1.01) > 0, public.points_du_pari(1, 1.01));

  -- ── 2. L'inscription est idempotente ────────────────────────────────────
  select ranking_points into v_av from public.profiles where id = v_user;
  perform public.inscrire_points(v_user, null, v_bet, 5, 2.00);
  select ranking_points into v_ap from public.profiles where id = v_user;
  r := r || format(' [6] +100 au cumul -> %s (%s) |', v_ap = v_av + 100, v_ap - v_av);

  perform public.inscrire_points(v_user, null, v_bet, 5, 2.00);
  select ranking_points into v_ap from public.profiles where id = v_user;
  r := r || format(' [7] deux fois ne compte qu une -> %s (%s) |', v_ap = v_av + 100, v_ap - v_av);

  select count(*) into v_n from public.ranking_events where bet_id = v_bet;
  r := r || format(' [8] une seule ligne au registre -> %s (%s) |', v_n = 1, v_n);

  -- ── 3. Le cumul est bien la somme du registre ───────────────────────────
  r := r || format(' [9] cumul = somme du registre -> %s |',
        (select ranking_points from public.profiles where id = v_user)
        = (select coalesce(sum(points),0) from public.ranking_events where user_id = v_user));

  -- ── 4. Le classement general ne trie plus sur le solde ──────────────────
  r := r || format(' [10] la vue expose ranking_points -> %s |',
        exists (select 1 from information_schema.columns
                 where table_name = 'leaderboard' and column_name = 'ranking_points'));

  raise exception E'RESULTATS --- %', r;
end $$;
