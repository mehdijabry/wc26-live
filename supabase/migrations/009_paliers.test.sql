-- Test des paliers. Annulé par l'exception finale : rien ne subsiste.
--
-- On vérifie les deux choses qui comptent : la grille elle-même, et le fait
-- qu'un bulletin perdu retire EXACTEMENT la perte du palier où se trouvait le
-- joueur AVANT le règlement — jamais celle du palier d'après, jamais plus que
-- le solde disponible.
do $$
declare
  v_user uuid; r text := '';
  s bigint; v_press bigint; v_pen integer;
begin
  select id into v_user from public.profiles limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- ── 1. La grille ────────────────────────────────────────────────────────
  r := r || format(' [1] palier(0)=1 → %s |',      public.palier_de(0) = 1);
  r := r || format(' [2] palier(999)=1 → %s |',    public.palier_de(999) = 1);
  r := r || format(' [3] palier(1000)=2 → %s |',   public.palier_de(1000) = 2);
  r := r || format(' [4] palier(1999)=2 → %s |',   public.palier_de(1999) = 2);
  r := r || format(' [5] palier(2000)=3 → %s |',   public.palier_de(2000) = 3);
  r := r || format(' [6] palier(3750)=4 → %s |',   public.palier_de(3750) = 4);
  r := r || format(' [7] palier(5500)=5 → %s |',   public.palier_de(5500) = 5);
  r := r || format(' [8] palier(99999)=5 → %s |',  public.palier_de(99999) = 5);

  r := r || format(' [9] perte(1999)=0 → %s |',    public.perte_du_palier(1999) = 0);
  r := r || format(' [10] perte(2000)=15 → %s |',  public.perte_du_palier(2000) = 15);
  r := r || format(' [11] perte(3750)=30 → %s |',  public.perte_du_palier(3750) = 30);
  r := r || format(' [12] perte(5500)=45 → %s |',  public.perte_du_palier(5500) = 45);
  r := r || format(' [13] perte(50000)=45 → %s |', public.perte_du_palier(50000) = 45);

  -- ── 2. Un match et un bulletin perdant, rejoués à chaque palier ─────────
  insert into public.match_odds (match_id, home, draw, away, kickoff)
    values ('TP-A', 2.00, 3.40, 3.80, now() + interval '2 hours')
    on conflict (match_id) do nothing;

  -- (a) sous 2 000 : on ne perd aucun pressing
  update public.profiles set crampons = 50, pressings = 1500 where id = v_user;
  insert into public.bet_slips (user_id, stake, odds) values (v_user, 5, 2.00) returning id into s;
  insert into public.bet_legs (slip_id, match_id, market, pick, odds) values (s, 'TP-A', '1x2', 'away', 3.80);
  insert into public.match_results (match_id, home_score, away_score, finished_at)
    values ('TP-A', 2, 0, now()) on conflict (match_id) do update set home_score = 2, away_score = 0;
  perform public.settle_slips_for_match('TP-A');
  select pressings into v_press from public.profiles where id = v_user;
  select penalty into v_pen from public.bet_slips where id = s;
  r := r || format(' [14] palier 2, solde reste 1500 → %s (%s) |', v_press = 1500, v_press);
  r := r || format(' [15] perte inscrite 0 → %s |', v_pen = 0);

  -- (b) palier 3 : 15 pressings
  update public.profiles set pressings = 2500 where id = v_user;
  insert into public.bet_slips (user_id, stake, odds) values (v_user, 5, 2.00) returning id into s;
  insert into public.bet_legs (slip_id, match_id, market, pick, odds) values (s, 'TP-A', '1x2', 'away', 3.80);
  perform public.settle_slips_for_match('TP-A');
  select pressings into v_press from public.profiles where id = v_user;
  select penalty into v_pen from public.bet_slips where id = s;
  r := r || format(' [16] palier 3, 2500-15=2485 → %s (%s) |', v_press = 2485, v_press);
  r := r || format(' [17] perte inscrite 15 → %s |', v_pen = 15);

  -- (c) palier 5 : 45 pressings
  update public.profiles set pressings = 6000 where id = v_user;
  insert into public.bet_slips (user_id, stake, odds) values (v_user, 5, 2.00) returning id into s;
  insert into public.bet_legs (slip_id, match_id, market, pick, odds) values (s, 'TP-A', '1x2', 'away', 3.80);
  perform public.settle_slips_for_match('TP-A');
  select pressings into v_press from public.profiles where id = v_user;
  r := r || format(' [18] palier 5, 6000-45=5955 → %s (%s) |', v_press = 5955, v_press);

  -- (d) la perte ne peut pas creuser sous zéro
  update public.profiles set pressings = 10 where id = v_user;
  insert into public.bet_slips (user_id, stake, odds) values (v_user, 5, 2.00) returning id into s;
  insert into public.bet_legs (slip_id, match_id, market, pick, odds) values (s, 'TP-A', '1x2', 'away', 3.80);
  perform public.settle_slips_for_match('TP-A');
  select pressings into v_press from public.profiles where id = v_user;
  r := r || format(' [19] solde 10 au palier 1, reste 10 → %s (%s) |', v_press = 10, v_press);

  -- (e) un bulletin GAGNANT paie toujours, et la série monte
  update public.profiles set pressings = 3000, current_streak = 0 where id = v_user;
  insert into public.bet_slips (user_id, stake, odds) values (v_user, 5, 2.00) returning id into s;
  insert into public.bet_legs (slip_id, match_id, market, pick, odds) values (s, 'TP-A', '1x2', 'home', 2.00);
  perform public.settle_slips_for_match('TP-A');
  select pressings into v_press from public.profiles where id = v_user;
  r := r || format(' [20] gain 5x2.00=10, 3000+10=3010 → %s (%s) |', v_press = 3010, v_press);

  raise exception E'RESULTATS --- %', r;
end $$;
