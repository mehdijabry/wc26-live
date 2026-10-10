-- Test de ma_saison(). Annule par l'exception finale.
do $$
declare
  u uuid[]; r text := ''; s record; v_attendu integer; v_pts bigint;
begin
  select array_agg(id order by id) into u from (select id from public.profiles order by id limit 3) x;
  if array_length(u,1) < 3 then raise exception 'Il faut 3 profils'; end if;

  -- Points connus : le joueur 1 doit finir derriere le 2 et devant le 3.
  update public.profiles set ranking_points = 500 where id = u[1];
  update public.profiles set ranking_points = 900 where id = u[2];
  update public.profiles set ranking_points = 100 where id = u[3];

  perform set_config('request.jwt.claims', json_build_object('sub', u[1]::text)::text, true);
  select * into s from public.ma_saison();

  r := r || format(' [1] points lus -> %s |', s.points = 500);
  -- Un seul joueur au-dessus des 500 points parmi ces trois, mais la base en
  -- contient d'autres : on compte reellement.
  select (1 + count(*))::integer into v_attendu
    from public.profiles q where coalesce(q.ranking_points,0) > 500;
  r := r || format(' [2] rang = %s (attendu %s) -> %s |', s.rang, v_attendu, s.rang = v_attendu);

  -- Egalite : meme points que le 2e, donc meme rang.
  update public.profiles set ranking_points = 900 where id = u[1];
  select * into s from public.ma_saison();
  select (1 + count(*))::integer into v_attendu
    from public.profiles q where coalesce(q.ranking_points,0) > 900;
  r := r || format(' [3] a egalite, meme rang -> %s |', s.rang = v_attendu);

  -- Les paris de la semaine suivent nb_paris() sur la meme fenetre.
  select public.nb_paris(u[1], public.debut_semaine(),
                         public.debut_semaine() + interval '7 days')
    into v_attendu;
  r := r || format(' [4] paris semaine = %s -> %s |', s.paris_semaine, s.paris_semaine = v_attendu);

  -- Sans session, la fonction ne rend aucune ligne (et surtout pas celle
  -- d'un autre joueur).
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.ma_saison()) then
    r := r || ' [5] FUITE : une ligne sans session |';
  else
    r := r || ' [5] anonyme -> aucune ligne -> true |';
  end if;

  raise exception 'RESULTAT:%', r;
end $$;
