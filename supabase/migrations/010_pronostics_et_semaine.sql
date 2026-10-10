-- 010 — le pronostic se débloque, et la semaine se récompense
--
-- DEUX MÉCANIQUES, UNE SEULE IDÉE : donner une raison de revenir chaque jour.
--
-- 1. LE PRONOSTIC À DÉBLOQUER. Le premier de la journée est offert — c'est lui
--    qui fait ouvrir l'application. Les suivants se paient, et le prix double :
--
--        1er   offert
--        2e    1 crampon   ou  10 pressings
--        3e    2           ou  20
--        4e    4           ou  40
--        5e    8           ou  80
--        6e    16          ou 160
--
--    POURQUOI CE RAPPORT (Mehdi, 2026-10-10). Le crampon est la ressource rare
--    — cinq par jour, et c'est aussi ce qui permet de parier. Le pressing est
--    le cumul. Un barème à « 2 crampons puis 4 » aurait tué l'échelle dès la
--    deuxième marche (2 + 4 > 5 par jour), et 1 pressing n'aurait rien coûté à
--    qui en a trois cents. Ici le premier payant vaut à peu près un pari
--    gagnant moyen, et le doublement rend le sixième dissuasif sans plafond
--    artificiel.
--
--    Un match déjà débloqué reste ouvert pour toujours, gratuitement, et ne
--    compte qu'une fois dans la journée : on paie le pronostic, pas la lecture.
--
-- 2. LA SEMAINE DE CONNEXION. La réclamation quotidienne montait toujours de 5.
--    Elle monte maintenant avec l'assiduité : 5, 6, 7, 8, 9, 10, 11 — et le
--    septième jour verse en plus un bonus en pressings. Une semaine complète
--    donne 56 crampons au lieu de 35, ce qui finance précisément les
--    pronostics ci-dessus. Un jour manqué remet la série à un.

alter table public.profiles add column if not exists claim_streak integer not null default 0;

-- ── La réclamation quotidienne, avec la semaine ────────────────────────────
-- Il faut la SUPPRIMER d'abord : `create or replace` refuse de changer le type
-- de retour, et on ajoute ici `jour` et `bonus` à ce qu'elle renvoyait.
drop function if exists public.claim_daily();
create or replace function public.claim_daily()
returns table (solde integer, deja_reclame boolean, jour integer, bonus integer)
language plpgsql security definer set search_path = public as $$
declare
  p record;
  v_jour integer;
  v_gain integer;
  v_bonus integer := 0;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Profil introuvable' using errcode = 'P0004';
  end if;

  if p.last_claim = current_date then
    return query select p.crampons, true, greatest(p.claim_streak, 1), 0;
    return;
  end if;

  -- La série ne tient que si la veille a été réclamée. Sinon on repart à un —
  -- c'est ce qui en fait une série et pas un compteur.
  if p.last_claim = current_date - 1 and p.claim_streak between 1 and 6 then
    v_jour := p.claim_streak + 1;
  else
    v_jour := 1;
  end if;

  v_gain := 4 + v_jour;                     -- 5 le premier jour, 11 le septième

  -- Le septième jour paie le bonus, puis la semaine recommence.
  if v_jour = 7 then
    v_bonus := 100;
  end if;

  update public.profiles
     set crampons = p.crampons + v_gain,
         pressings = p.pressings + v_bonus,
         claim_streak = case when v_jour = 7 then 0 else v_jour end,
         last_claim = current_date
   where id = p.id;

  return query select p.crampons + v_gain, false, v_jour, v_bonus;
end;
$$;

revoke all on function public.claim_daily() from public;
grant execute on function public.claim_daily() to authenticated;

-- ── Les pronostics débloqués ───────────────────────────────────────────────
create table if not exists public.prediction_unlocks (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  match_id    text not null,
  jour        date not null default current_date,
  cout_crampons integer not null default 0,
  cout_pressings integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, match_id)
);

create index if not exists unlocks_user_jour_idx on public.prediction_unlocks (user_id, jour);

alter table public.prediction_unlocks enable row level security;
-- Lecture seule pour le joueur : l'écriture passe uniquement par la fonction
-- ci-dessous, qui est security definer. Personne ne se débloque un pronostic
-- gratuitement en écrivant la ligne lui-même.
drop policy if exists "unlocks_read_own" on public.prediction_unlocks;
create policy "unlocks_read_own" on public.prediction_unlocks
  for select using (auth.uid() = user_id);

-- ── Le prix du prochain pronostic ──────────────────────────────────────────
-- `n` = nombre déjà débloqués aujourd'hui. Le premier est offert, puis le prix
-- double. Plafonné au 10e pour que rien ne déborde.
create or replace function public.prix_pronostic(n integer)
returns table (crampons integer, pressings integer)
language sql immutable set search_path = public as $$
  select
    case when n <= 0 then 0 else (1 << least(n - 1, 9)) end::integer,
    case when n <= 0 then 0 else 10 * (1 << least(n - 1, 9)) end::integer;
$$;

grant execute on function public.prix_pronostic(integer) to anon, authenticated;

-- ── Débloquer ──────────────────────────────────────────────────────────────
-- Renvoie le coût réellement payé. Idempotente : un match déjà débloqué ne se
-- repaie jamais, et ne consomme pas une marche de l'échelle.
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
    update public.profiles set crampons = crampons - v_c where id = v_user;
    v_p := 0;
  else
    if v_profil.pressings < v_p then
      raise exception 'Pressings insuffisants' using errcode = 'P0010';
    end if;
    update public.profiles set pressings = pressings - v_p where id = v_user;
    v_c := 0;
  end if;

  insert into public.prediction_unlocks (user_id, match_id, cout_crampons, cout_pressings)
  values (v_user, p_match, v_c, v_p);

  return query select false, v_c, v_p, (v_n + 1)::integer;
end;
$$;

revoke all on function public.debloquer_pronostic(text, text) from public;
grant execute on function public.debloquer_pronostic(text, text) to authenticated;
