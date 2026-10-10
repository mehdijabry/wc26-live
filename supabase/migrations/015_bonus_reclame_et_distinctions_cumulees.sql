-- 015 — le joueur choisit son groupe, et porte toutes ses distinctions
--
-- CE QUI CHANGE (Mehdi, 2026-10-10). La 014 interdisait d'appartenir à
-- plusieurs groupes pour empêcher le cumul du bonus. C'était une solution de
-- force : elle réglait le problème d'argent en amputant le produit — on ne
-- pouvait plus avoir un groupe de collègues ET un groupe de famille.
--
-- La bonne réponse n'est pas de limiter l'appartenance, c'est de limiter LA
-- RÉCLAMATION. Un joueur peut être dans autant de groupes qu'il veut ; le
-- soir, il réclame UNE SEULE récompense et il choisit laquelle. Le cumul est
-- impossible pour la même raison qu'avant — la clé primaire (joueur, jour) —
-- mais c'est lui qui arbitre, pas un `order by taux desc`.
--
-- LES DISTINCTIONS, ELLES, SE CUMULENT. Être premier dans trois groupes est
-- un exploit, pas une occasion de tricher : ça ne verse rien. On les compte
-- donc toutes, et l'interface affiche « GOAT ×3 ».

-- ── On rouvre l'appartenance multiple ─────────────────────────────────────
drop index if exists public.league_members_un_seul_groupe;

-- ── Rejoindre ne fait plus quitter ────────────────────────────────────────
create or replace function public.rejoindre_groupe(p_slug text)
returns table (groupe uuid, nom text, quitte text)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_cible uuid;
  v_nom text;
begin
  if v_user is null then
    raise exception 'Connexion requise' using errcode = 'P0004';
  end if;

  select l.id, l.name into v_cible, v_nom from public.leagues l where l.slug = p_slug;
  if v_cible is null then
    raise exception 'Groupe introuvable' using errcode = 'P0011';
  end if;

  insert into public.league_members (league_id, user_id)
  values (v_cible, v_user)
  on conflict (league_id, user_id) do nothing;

  -- `quitte` reste dans la signature mais vaut toujours NULL : on ne quitte
  -- plus rien. La colonne est conservée pour que l'appelant n'ait pas à
  -- changer de forme, et l'interface ne montre son message que si elle est
  -- renseignée — donc jamais.
  return query select v_cible, v_nom, null::text;
end;
$$;

revoke all on function public.rejoindre_groupe(text) from public;
grant execute on function public.rejoindre_groupe(text) to authenticated;

create or replace function public.creer_groupe(p_slug text, p_nom text)
returns table (groupe uuid, nom text, quitte text)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Connexion requise' using errcode = 'P0004';
  end if;
  if char_length(coalesce(p_nom, '')) < 1 then
    raise exception 'Nom requis' using errcode = 'P0012';
  end if;

  insert into public.leagues (slug, name, owner_id)
  values (p_slug, left(p_nom, 60), v_user)
  returning id into v_id;

  insert into public.league_members (league_id, user_id) values (v_id, v_user);

  return query select v_id, left(p_nom, 60), null::text;
end;
$$;

revoke all on function public.creer_groupe(text, text) from public;
grant execute on function public.creer_groupe(text, text) to authenticated;

-- ── La réclamation du soir ────────────────────────────────────────────────
-- Remplace le versement automatique. Le joueur appelle, avec le groupe de
-- son choix ; la base vérifie tout et refuse un second appel dans la journée.
--
-- POURQUOI PLUS DE CRON. Payer automatiquement le meilleur groupe aurait
-- retiré le choix — et le choix EST la fonctionnalité. Un joueur qui oublie
-- perd son bonus, exactement comme il perd ses crampons quotidiens non
-- réclamés : la règle existe déjà dans le jeu, elle ne surprend personne.
create or replace function public.reclamer_bonus_de_groupe(p_slug text)
returns table (crampons integer, taux numeric, groupe text, deja boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ligue uuid;
  v_nom text;
  v_membres integer;
  v_actifs integer;
  v_joue integer;
  v_taux numeric;
  v_gain integer;
  v_jour0 timestamptz := (current_date)::timestamptz;
  v_jour1 timestamptz := (current_date + 1)::timestamptz;
  v_actif0 timestamptz := now() - interval '7 days';
begin
  if v_user is null then
    raise exception 'Connexion requise' using errcode = 'P0004';
  end if;

  -- Déjà réclamé aujourd'hui : on le dit, on ne paie pas deux fois.
  if exists (select 1 from public.group_bonus_paid g
              where g.user_id = v_user and g.jour = current_date) then
    return query
      select g.crampons, g.taux, coalesce(l.name, ''), true
        from public.group_bonus_paid g
        left join public.leagues l on l.id = g.league_id
       where g.user_id = v_user and g.jour = current_date;
    return;
  end if;

  select l.id, l.name into v_ligue, v_nom from public.leagues l where l.slug = p_slug;
  if v_ligue is null then
    raise exception 'Groupe introuvable' using errcode = 'P0011';
  end if;
  if not exists (select 1 from public.league_members m
                  where m.league_id = v_ligue and m.user_id = v_user) then
    raise exception 'Vous n''êtes pas dans ce groupe' using errcode = 'P0013';
  end if;

  -- Le bonus récompense la PARTICIPATION : il faut avoir joué soi-même.
  if not public.a_parie(v_user, v_jour0, v_jour1) then
    raise exception 'Il faut avoir parié aujourd''hui' using errcode = 'P0014';
  end if;

  select count(*),
         count(*) filter (where public.a_parie(m.user_id, v_actif0, v_jour1)),
         count(*) filter (where public.a_parie(m.user_id, v_actif0, v_jour1)
                            and public.a_parie(m.user_id, v_jour0, v_jour1))
    into v_membres, v_actifs, v_joue
    from public.league_members m
   where m.league_id = v_ligue;

  if v_membres < 3 then
    raise exception 'Un groupe récompense à partir de trois membres' using errcode = 'P0015';
  end if;

  v_taux := case when v_actifs = 0 then 0 else round(v_joue::numeric / v_actifs, 3) end;
  v_gain := round(3 * v_taux)::integer;

  insert into public.group_bonus_paid (user_id, jour, league_id, crampons, taux)
  values (v_user, current_date, v_ligue, v_gain, v_taux);

  if v_gain > 0 then
    update public.profiles p set crampons = p.crampons + v_gain where p.id = v_user;
  end if;

  return query select v_gain, v_taux, v_nom, false;
end;
$$;

revoke all on function public.reclamer_bonus_de_groupe(text) from public;
grant execute on function public.reclamer_bonus_de_groupe(text) to authenticated;

-- Le versement automatique disparaît : il décidait à la place du joueur.
drop function if exists public.verser_bonus_de_groupe();

-- ── Les distinctions se comptent, toutes ──────────────────────────────────
-- Elles ne se stockent toujours pas : on la porte tant qu'on est sur le
-- podium du jour, et le GOAT est le vainqueur de la dernière semaine close.
-- Ce qui change, c'est qu'on ne garde plus « la meilleure » : être premier
-- dans trois groupes se dit « GOAT ×3 ». Ça ne verse rien, donc rien à
-- protéger — c'est un exploit, pas une faille.
drop function if exists public.distinctions(uuid);
create or replace function public.distinctions(p_user uuid)
returns table (orees integer, argents integer, bronzes integer, goats integer)
language sql stable security definer set search_path = public as $$
  with bornes as (
    select (current_date)::timestamptz     as jour0,
           (current_date + 1)::timestamptz as jour1,
           public.debut_semaine() - interval '7 days' as sem0,
           public.debut_semaine()                     as sem1
  ),
  mes as (select mb.league_id from public.league_members mb where mb.user_id = p_user),
  -- Les points de CHAQUE membre de CHACUN de mes groupes, sur les deux
  -- fenêtres, en une seule passe.
  pts as (
    select m.league_id, mb.user_id,
           coalesce((select sum(e.points) from public.ranking_events e
                      where e.user_id = mb.user_id
                        and e.created_at >= b.jour0 and e.created_at < b.jour1), 0) as jour,
           coalesce((select sum(e.points) from public.ranking_events e
                      where e.user_id = mb.user_id
                        and e.created_at >= b.sem0 and e.created_at < b.sem1), 0) as sem
      from mes m
      join public.league_members mb on mb.league_id = m.league_id
     cross join bornes b
  ),
  rangs as (
    select p.league_id,
           (select count(*) + 1 from pts q
             where q.league_id = p.league_id and q.jour > p.jour)::integer as rang_jour,
           p.jour,
           (select count(*) from pts q
             where q.league_id = p.league_id and q.sem > p.sem)::integer   as devant_sem,
           p.sem
      from pts p
     where p.user_id = p_user
  )
  select count(*) filter (where rang_jour = 1 and jour > 0)::integer,
         count(*) filter (where rang_jour = 2 and jour > 0)::integer,
         count(*) filter (where rang_jour = 3 and jour > 0)::integer,
         count(*) filter (where devant_sem = 0 and sem > 0)::integer
    from rangs;
$$;

grant execute on function public.distinctions(uuid) to anon, authenticated;
