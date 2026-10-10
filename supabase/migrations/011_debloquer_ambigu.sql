-- 011 — le déblocage d'un pronostic échouait sur un conflit de noms
--
-- SYMPTÔME. « Could not unlock right now. » sur TOUS les matchs, y compris le
-- premier de la journée qui est pourtant offert (Mehdi, 2026-10-10, en prod).
--
-- CAUSE. `debloquer_pronostic` est déclarée
--
--     returns table (deja boolean, crampons integer, pressings integer, rang integer)
--
-- ce qui met `crampons` et `pressings` dans la portée du corps PL/pgSQL EN TANT
-- QUE VARIABLES. Or le corps écrivait :
--
--     update public.profiles set crampons = crampons - v_c where id = v_user;
--
-- Le `crampons` de droite est alors ambigu — la variable de sortie, qui vaut
-- NULL, ou la colonne. PostgreSQL ne devine pas et lève
-- « column reference "crampons" is ambiguous ». La fonction n'a donc JAMAIS pu
-- aboutir, même avec un coût de zéro, puisque l'UPDATE s'exécute quand même.
--
-- CORRECTIF. On donne un alias à la table et on qualifie la lecture. Le côté
-- gauche d'un SET est toujours une colonne, c'est la lecture à droite qui
-- devait être levée d'ambiguïté.
--
-- LEÇON, pour les prochaines. Une fonction `returns table (...)` ne doit jamais
-- nommer une colonne de sortie comme une colonne qu'elle met à jour. Ici le
-- risque était invisible à la relecture et indétectable sans exécuter la
-- fonction avec un vrai utilisateur connecté — ce que ni le typage, ni le
-- build, ni le rendu de la carte ne font.

create or replace function public.debloquer_pronostic(p_match text, p_monnaie text)
returns table (deja boolean, crampons integer, pressings integer, rang integer)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_n integer;
  v_c integer;
  v_p integer;
  v_profil record;
begin
  if v_user is null then
    raise exception 'Connexion requise' using errcode = 'P0004';
  end if;
  if p_monnaie not in ('crampons', 'pressings') then
    raise exception 'Monnaie inconnue' using errcode = 'P0009';
  end if;

  if exists (select 1 from public.prediction_unlocks u
              where u.user_id = v_user and u.match_id = p_match) then
    select count(*) into v_n from public.prediction_unlocks u
     where u.user_id = v_user and u.jour = current_date;
    return query select true, 0, 0, v_n::integer;
    return;
  end if;

  select count(*) into v_n from public.prediction_unlocks u
   where u.user_id = v_user and u.jour = current_date;
  select pp.crampons, pp.pressings into v_c, v_p from public.prix_pronostic(v_n) pp;

  select * into v_profil from public.profiles where id = v_user for update;

  if p_monnaie = 'crampons' then
    if v_profil.crampons < v_c then
      raise exception 'Crampons insuffisants' using errcode = 'P0003';
    end if;
    -- L'ALIAS EST LE CORRECTIF : `pr.crampons` ne peut plus être confondu
    -- avec la colonne de sortie du même nom.
    update public.profiles pr set crampons = pr.crampons - v_c where pr.id = v_user;
    v_p := 0;
  else
    if v_profil.pressings < v_p then
      raise exception 'Pressings insuffisants' using errcode = 'P0010';
    end if;
    update public.profiles pr set pressings = pr.pressings - v_p where pr.id = v_user;
    v_c := 0;
  end if;

  insert into public.prediction_unlocks (user_id, match_id, cout_crampons, cout_pressings)
  values (v_user, p_match, v_c, v_p);

  return query select false, v_c, v_p, (v_n + 1)::integer;
end;
$$;

revoke all on function public.debloquer_pronostic(text, text) from public;
grant execute on function public.debloquer_pronostic(text, text) to authenticated;
