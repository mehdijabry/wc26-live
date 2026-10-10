-- 014 — un joueur, un groupe
--
-- CE QU'ON CHANGE (Mehdi, 2026-10-10). Le bonus quotidien se versait au
-- MEILLEUR groupe de chaque joueur, une fois par jour : la clé primaire
-- (joueur, jour) empêchait le cumul, mais rien n'empêchait d'appartenir à
-- quinze groupes et d'être compté dans le taux de participation de chacun.
--
-- La règle devient : UN SEUL GROUPE D'AMIS. Pour en rejoindre un autre, il
-- faut quitter le sien. C'est plus simple à comprendre, plus simple à coder,
-- et ça supprime l'arbitrage « quel groupe paie ? » au lieu de le résoudre.
--
-- AUCUN RISQUE DE MIGRATION : au moment de poser cette contrainte, la base
-- comptait zéro groupe et zéro adhésion. La fonctionnalité existait mais
-- n'avait jamais servi — vérifié avant, pas supposé.

-- ── La contrainte ─────────────────────────────────────────────────────────
-- La clé primaire était (groupe, joueur), ce qui autorisait un joueur dans
-- plusieurs groupes. L'unicité porte maintenant sur le JOUEUR SEUL.
create unique index if not exists league_members_un_seul_groupe
  on public.league_members (user_id);

-- ── Rejoindre, c'est quitter puis entrer ──────────────────────────────────
-- En une seule transaction : sans ça, un joueur pourrait se retrouver sans
-- groupe si la seconde moitié échouait — et il n'aurait aucun moyen de
-- revenir, puisque le lien d'invitation de son ancien groupe est chez
-- quelqu'un d'autre.
--
-- Renvoie le groupe quitté, pour que l'interface puisse le dire.
create or replace function public.rejoindre_groupe(p_slug text)
returns table (groupe uuid, nom text, quitte text)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_cible uuid;
  v_nom text;
  v_avant text;
begin
  if v_user is null then
    raise exception 'Connexion requise' using errcode = 'P0004';
  end if;

  select l.id, l.name into v_cible, v_nom from public.leagues l where l.slug = p_slug;
  if v_cible is null then
    raise exception 'Groupe introuvable' using errcode = 'P0011';
  end if;

  -- Déjà dedans : on ne fait rien et on ne ment pas en disant qu'on a quitté.
  if exists (select 1 from public.league_members m
              where m.user_id = v_user and m.league_id = v_cible) then
    return query select v_cible, v_nom, null::text;
    return;
  end if;

  select l.name into v_avant
    from public.league_members m
    join public.leagues l on l.id = m.league_id
   where m.user_id = v_user;

  delete from public.league_members m where m.user_id = v_user;
  insert into public.league_members (league_id, user_id) values (v_cible, v_user);

  return query select v_cible, v_nom, v_avant;
end;
$$;

revoke all on function public.rejoindre_groupe(text) from public;
grant execute on function public.rejoindre_groupe(text) to authenticated;

-- ── Créer un groupe, c'est aussi quitter le sien ──────────────────────────
create or replace function public.creer_groupe(p_slug text, p_nom text)
returns table (groupe uuid, nom text, quitte text)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_avant text;
begin
  if v_user is null then
    raise exception 'Connexion requise' using errcode = 'P0004';
  end if;
  if char_length(coalesce(p_nom, '')) < 1 then
    raise exception 'Nom requis' using errcode = 'P0012';
  end if;

  select l.name into v_avant
    from public.league_members m
    join public.leagues l on l.id = m.league_id
   where m.user_id = v_user;

  insert into public.leagues (slug, name, owner_id)
  values (p_slug, left(p_nom, 60), v_user)
  returning id into v_id;

  delete from public.league_members m where m.user_id = v_user;
  insert into public.league_members (league_id, user_id) values (v_id, v_user);

  return query select v_id, left(p_nom, 60), v_avant;
end;
$$;

revoke all on function public.creer_groupe(text, text) from public;
grant execute on function public.creer_groupe(text, text) to authenticated;

-- ── Le versement se simplifie ─────────────────────────────────────────────
-- Plus d'arbitrage « quel groupe paie ? » : il n'y en a qu'un. On garde la
-- clé primaire (joueur, jour) — elle ne protège plus du cumul de groupes,
-- devenu impossible, mais elle protège toujours d'un cron rejoué.
create or replace function public.verser_bonus_de_groupe()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_pose integer := 0;
begin
  with bornes as (
    select (current_date)::timestamptz     as jour0,
           (current_date + 1)::timestamptz as jour1,
           now() - interval '7 days'       as actif0
  ),
  groupes as (
    select mb.league_id,
           count(*) filter (where public.a_parie(mb.user_id, b.actif0, b.jour1))::numeric as actifs,
           count(*) filter (where public.a_parie(mb.user_id, b.actif0, b.jour1)
                              and public.a_parie(mb.user_id, b.jour0, b.jour1))::numeric as ont_joue,
           count(*) as membres
      from public.league_members mb cross join bornes b
     group by mb.league_id
    having count(*) >= 3
  ),
  taux as (
    select league_id, case when actifs = 0 then 0 else ont_joue / actifs end as t
      from groupes
  ),
  pose as (
    insert into public.group_bonus_paid (user_id, jour, league_id, crampons, taux)
    select mb.user_id, current_date, tx.league_id, round(3 * tx.t)::integer, round(tx.t, 3)
      from public.league_members mb
      join taux tx on tx.league_id = mb.league_id
     cross join bornes b
     -- Seuls ceux qui ont eux-mêmes joué touchent le bonus : il récompense la
     -- participation, pas l'appartenance.
     where public.a_parie(mb.user_id, b.jour0, b.jour1)
       and round(3 * tx.t)::integer > 0
    on conflict (user_id, jour) do nothing
    returning user_id, crampons
  )
  update public.profiles p
     set crampons = p.crampons + x.crampons
    from pose x
   where x.user_id = p.id;

  get diagnostics v_pose = row_count;
  return v_pose;
end;
$$;

revoke all on function public.verser_bonus_de_groupe() from public;
