-- Test des dons et des codes d'inscription. Annule par l'exception finale.
do $$
declare
  u uuid[]; r text := ''; c public.signup_codes; v record;
  av_c integer; av_a integer; n integer;
begin
  select array_agg(id order by id) into u from (select id from public.profiles order by id limit 2) x;
  if array_length(u,1) < 2 then raise exception 'Il faut 2 profils'; end if;

  delete from public.signup_code_uses where user_id = any(u);
  delete from public.admin_grants where user_id = any(u);
  update public.profiles set crampons = 10, analyses_offertes = 0 where id = any(u);

  -- [1] Un don credite et laisse une trace.
  perform public.admin_crediter(u[1], 40, 0, 3, 'test');
  select crampons, analyses_offertes into av_c, av_a from public.profiles where id = u[1];
  r := r || format(' [1] 10+40=%s et 3 analyses -> %s |', av_c, av_c = 50 and av_a = 3);
  r := r || format(' [2] trace posee -> %s |',
        (select count(*) from public.admin_grants where user_id = u[1] and source = 'admin') = 1);

  -- [3] Un debit ne descend jamais sous zero.
  perform public.admin_crediter(u[1], -999, 0, 0, 'correction');
  select crampons into av_c from public.profiles where id = u[1];
  r := r || format(' [3] solde plancher = %s -> %s |', av_c, av_c = 0);

  -- [4] Creer un code, le reclamer.
  select * into c from public.creer_code_inscription(50, 2, 3, 'promo fb', null);
  r := r || format(' [4] code %s sur 8 caracteres -> %s |', c.code, length(c.code) = 8);

  perform set_config('request.jwt.claims', json_build_object('sub', u[2]::text)::text, true);
  select * into v from public.reclamer_code_inscription(c.code);
  select crampons, analyses_offertes into av_c, av_a from public.profiles where id = u[2];
  r := r || format(' [5] 10+50=%s et 2 analyses -> %s |', av_c, av_c = 60 and av_a = 2);

  -- [6] Deux fois le meme compte : refuse.
  begin
    perform public.reclamer_code_inscription(c.code);
    r := r || ' [6] FUITE : reclame deux fois |';
  exception when sqlstate 'P0019' then
    r := r || ' [6] second essai refuse -> true |';
  end;

  -- [7] Le compteur du code a bouge une seule fois.
  select uses into n from public.signup_codes where id = c.id;
  r := r || format(' [7] uses = %s -> %s |', n, n = 1);

  -- [8] Un code inconnu ne dit rien.
  r := r || format(' [8] code bidon -> %s |', not exists (select 1 from public.code_inscription('ZZZZZZZZ')));

  -- [9] L'annonce publique n'expose pas le code lui-meme.
  r := r || format(' [9] annonce = %s crampons -> %s |',
        (select crampons from public.code_inscription(c.code)),
        (select crampons from public.code_inscription(c.code)) = 50);

  -- [10] Le deblocage consomme un credit AU LIEU de payer, et seulement
  -- quand il y avait quelque chose a payer.
  delete from public.prediction_unlocks where user_id = u[2] and jour = current_date;
  update public.profiles set crampons = 10, analyses_offertes = 1 where id = u[2];
  select * into v from public.debloquer_pronostic('etest1', 'crampons');  -- 1re du jour : gratuite
  r := r || format(' [10] 1re du jour gratuite, credit intact -> %s |',
        not v.offert and (select analyses_offertes from public.profiles where id = u[2]) = 1);

  select * into v from public.debloquer_pronostic('etest2', 'crampons');  -- 2e : payante
  select crampons, analyses_offertes into av_c, av_a from public.profiles where id = u[2];
  r := r || format(' [11] 2e offerte par le credit (cout %s, credit %s, solde %s) -> %s |',
        v.crampons, av_a, av_c, v.offert and av_a = 0 and av_c = 10);

  select * into v from public.debloquer_pronostic('etest3', 'crampons');  -- 3e : plus de credit
  select crampons into av_c from public.profiles where id = u[2];
  r := r || format(' [12] 3e payee (cout %s, solde %s) -> %s |', v.crampons, av_c, not v.offert and av_c < 10);

  raise exception 'RESULTAT:%', r;
end $$;
