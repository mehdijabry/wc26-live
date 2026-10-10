-- Test du déblocage. Annulé par l'exception finale : rien ne subsiste.
--
-- CE QU'IL AURAIT ATTRAPÉ. Le conflit de noms de la 010 ne se voyait ni au
-- typage, ni au build, ni au rendu de la carte — il fallait APPELER la
-- fonction avec un utilisateur connecté. C'est exactement ce que fait ce
-- bloc, en se faisant passer pour un vrai joueur.
do $$
declare
  v_user uuid; r text := '';
  v_c0 bigint; v_c1 bigint; v_c2 bigint;
  d1 record; d2 record; d3 record;
begin
  select id into v_user from public.profiles limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- Table rase pour ce joueur : le prix dépend du nombre déjà débloqué AUJOURD'HUI.
  delete from public.prediction_unlocks where user_id = v_user and jour = current_date;
  update public.profiles set crampons = 50, pressings = 500 where id = v_user;
  select crampons into v_c0 from public.profiles where id = v_user;

  -- (a) le premier du jour est offert, et il ne doit RIEN débiter
  select * into d1 from public.debloquer_pronostic('TEST-M1', 'crampons');
  select crampons into v_c1 from public.profiles where id = v_user;
  r := r || format(' [1] 1er offert, deja=false → %s |', d1.deja = false);
  r := r || format(' [2] coût 0 → %s (%s) |', d1.crampons = 0, d1.crampons);
  r := r || format(' [3] solde inchangé %s → %s (%s) |', v_c0, v_c1 = v_c0, v_c1);
  r := r || format(' [4] rang 1 → %s (%s) |', d1.rang = 1, d1.rang);

  -- (b) le deuxième coûte 1 crampon, et il est bien débité
  select * into d2 from public.debloquer_pronostic('TEST-M2', 'crampons');
  select crampons into v_c2 from public.profiles where id = v_user;
  r := r || format(' [5] 2e coûte 1 → %s (%s) |', d2.crampons = 1, d2.crampons);
  r := r || format(' [6] solde %s-1 → %s (%s) |', v_c1, v_c2 = v_c1 - 1, v_c2);
  r := r || format(' [7] rang 2 → %s (%s) |', d2.rang = 2, d2.rang);

  -- (c) rouvrir un match déjà payé ne repaie rien et ne consomme pas de marche
  select * into d3 from public.debloquer_pronostic('TEST-M2', 'crampons');
  r := r || format(' [8] déjà ouvert → %s |', d3.deja = true);
  r := r || format(' [9] recoût 0 → %s (%s) |', d3.crampons = 0, d3.crampons);
  r := r || format(' [10] solde toujours %s → %s |', v_c2,
        (select crampons from public.profiles where id = v_user) = v_c2);

  -- (d) payer en pressings débite bien l'autre monnaie
  perform public.debloquer_pronostic('TEST-M3', 'pressings');
  r := r || format(' [11] 3e en pressings, 500-20=480 → %s (%s) |',
        (select pressings from public.profiles where id = v_user) = 480,
        (select pressings from public.profiles where id = v_user));

  -- (e) solde insuffisant : on refuse, on ne creuse pas
  update public.profiles set crampons = 0 where id = v_user;
  begin
    perform public.debloquer_pronostic('TEST-M4', 'crampons');
    r := r || ' [12] refus si solde insuffisant → false (AUCUNE exception) |';
  exception when others then
    r := r || format(' [12] refus si solde insuffisant → %s |', sqlerrm like '%insuffisant%');
  end;

  raise exception E'RESULTATS --- %', r;
end $$;
