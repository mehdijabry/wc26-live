-- 019 — Donner des crampons, et offrir l'entrée par un lien.
--
-- Deux demandes de Mehdi (2026-10-10) :
--   1. envoyer des jetons au compte de son choix depuis le panneau admin ;
--   2. générer un lien d'inscription qui offre un nombre de crampons ET un
--      nombre d'analyses IA, tous deux fixés avant de créer le lien — pour
--      la promotion Facebook.
--
-- ── POURQUOI UN COMPTEUR D'ANALYSES ET PAS DES LIGNES PRÉ-POSÉES ──────────
-- Une analyse se débloque par une ligne `prediction_unlocks (user_id,
-- match_id)`. Offrir des analyses à l'avance supposerait de choisir les
-- matchs à la place du joueur — et ils n'existent pas encore au moment où le
-- lien est créé. Le crédit est donc un COMPTEUR sur le profil, consommé au
-- moment du déblocage.
--
-- ── QUI A LE DROIT ────────────────────────────────────────────────────────
-- Le panneau d'administration ne s'authentifie PAS auprès de Supabase : il
-- tient une session auprès du worker, qui porte la clé de service. Les
-- fonctions d'administration ne sont donc exécutables que par `service_role`
-- — jamais par `anon` ni `authenticated`, sinon n'importe quel visiteur
-- connecté se créditerait lui-même.

alter table public.profiles
  add column if not exists analyses_offertes integer not null default 0;

do $$ begin
  alter table public.profiles
    add constraint profiles_analyses_offertes_positif check (analyses_offertes >= 0);
exception when duplicate_object then null; end $$;

-- ── La trace des dons ─────────────────────────────────────────────────────
-- Un don est un mouvement de monnaie décidé à la main : il doit laisser une
-- ligne, sinon un écart de solde devient impossible à expliquer.
create table if not exists public.admin_grants (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  crampons   integer not null default 0,
  pressings  integer not null default 0,
  analyses   integer not null default 0,
  motif      text,
  source     text not null default 'admin',
  created_at timestamptz not null default now()
);

create index if not exists admin_grants_user_idx on public.admin_grants (user_id, created_at desc);

alter table public.admin_grants enable row level security;
-- Aucune policy : personne n'y accède hors `service_role`, qui les ignore.

-- ── Les codes d'inscription ───────────────────────────────────────────────
create table if not exists public.signup_codes (
  id          bigserial primary key,
  code        text not null unique,
  libelle     text,
  crampons    integer not null default 0 check (crampons >= 0),
  analyses    integer not null default 0 check (analyses >= 0),
  max_uses    integer check (max_uses is null or max_uses > 0),
  uses        integer not null default 0,
  expires_at  timestamptz,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.signup_code_uses (
  code_id    bigint not null references public.signup_codes(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  crampons   integer not null default 0,
  analyses   integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (code_id, user_id)
);

-- UN SEUL CODE PAR COMPTE, À VIE. Sans cet index, il suffirait de générer
-- plusieurs liens et de tous les réclamer avec le même compte.
create unique index if not exists signup_code_uses_un_par_compte
  on public.signup_code_uses (user_id);

alter table public.signup_codes enable row level security;
alter table public.signup_code_uses enable row level security;

-- Le code se LIT sans compte : la page d'atterrissage doit pouvoir annoncer
-- « 50 crampons et 3 analyses offertes » à quelqu'un qui n'est pas encore
-- inscrit.
--
-- UNE FONCTION, PAS UNE VUE. Une vue lisible par `anon` se liste : il
-- suffirait d'un `select *` pour récupérer tous les codes en circulation et
-- réclamer le plus généreux. Ici il faut déjà CONNAÎTRE le code pour
-- apprendre quoi que ce soit, et la fonction ne rend rien d'autre que
-- l'annonce.
drop view if exists public.signup_code_public;

create or replace function public.code_inscription(p_code text)
returns table (crampons integer, analyses integer, libelle text, valide boolean)
language sql stable security definer set search_path = public as $$
  select c.crampons,
         c.analyses,
         c.libelle,
         (c.actif
          and (c.expires_at is null or c.expires_at > now())
          and (c.max_uses is null or c.uses < c.max_uses))
    from public.signup_codes c
   where c.code = upper(trim(p_code));
$$;

grant execute on function public.code_inscription(text) to anon, authenticated;

-- ── Créditer un compte ────────────────────────────────────────────────────
create or replace function public.admin_crediter(
  p_cible uuid,
  p_crampons integer default 0,
  p_pressings integer default 0,
  p_analyses integer default 0,
  p_motif text default null
)
returns table (crampons bigint, pressings bigint, analyses integer)
language plpgsql security definer set search_path = public as $$
declare
  v_profil record;
begin
  if p_crampons = 0 and p_pressings = 0 and p_analyses = 0 then
    raise exception 'Rien à créditer' using errcode = 'P0011';
  end if;

  -- Un débit est autorisé (un montant négatif corrige une erreur), mais
  -- jamais jusqu'à un solde négatif : `greatest` plafonne à zéro.
  update public.profiles pr
     set crampons  = greatest(pr.crampons  + p_crampons,  0),
         pressings = greatest(pr.pressings + p_pressings, 0),
         analyses_offertes = greatest(pr.analyses_offertes + p_analyses, 0)
   where pr.id = p_cible
  returning pr.crampons, pr.pressings, pr.analyses_offertes into v_profil;

  if not found then
    raise exception 'Compte introuvable' using errcode = 'P0012';
  end if;

  insert into public.admin_grants (user_id, crampons, pressings, analyses, motif)
  values (p_cible, p_crampons, p_pressings, p_analyses, nullif(trim(coalesce(p_motif, '')), ''));

  return query select v_profil.crampons::bigint, v_profil.pressings::bigint, v_profil.analyses_offertes;
end;
$$;

revoke all on function public.admin_crediter(uuid, integer, integer, integer, text) from public, anon, authenticated;

-- ── Chercher un compte ────────────────────────────────────────────────────
-- Par pseudo OU par courriel : un compte tout neuf n'a pas encore de pseudo,
-- et c'est justement celui-là qu'on veut créditer après une inscription.
create or replace function public.admin_profils(p_q text default null, p_limite integer default 20)
returns table (
  id        uuid,
  alias     text,
  email     text,
  crampons  bigint,
  pressings bigint,
  analyses  integer,
  points    bigint,
  cree_le   timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id,
         p.alias,
         u.email::text,
         p.crampons::bigint,
         p.pressings::bigint,
         p.analyses_offertes,
         coalesce(p.ranking_points, 0)::bigint,
         p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
   where p_q is null
      or trim(p_q) = ''
      or p.alias ilike '%' || trim(p_q) || '%'
      or u.email ilike '%' || trim(p_q) || '%'
      or p.id::text = trim(p_q)
   order by p.created_at desc
   limit greatest(1, least(coalesce(p_limite, 20), 100));
$$;

revoke all on function public.admin_profils(text, integer) from public, anon, authenticated;

-- ── Créer un code ─────────────────────────────────────────────────────────
-- Huit caractères sans voyelle ni caractère ambigu : un code se recopie à la
-- main depuis un commentaire Facebook, et 0/O ou 1/I/l s'y perdent.
create or replace function public.nouveau_code_inscription()
returns text
language sql volatile set search_path = public as $$
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTVWXYZ',
                           1 + floor(random() * 30)::integer, 1), '')
    from generate_series(1, 8);
$$;

create or replace function public.creer_code_inscription(
  p_crampons integer,
  p_analyses integer,
  p_max_uses integer default null,
  p_libelle text default null,
  p_expire timestamptz default null
)
returns public.signup_codes
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_ligne public.signup_codes;
  i integer := 0;
begin
  if coalesce(p_crampons, 0) < 0 or coalesce(p_analyses, 0) < 0 then
    raise exception 'Montant négatif' using errcode = 'P0013';
  end if;
  if coalesce(p_crampons, 0) = 0 and coalesce(p_analyses, 0) = 0 then
    raise exception 'Un code doit offrir quelque chose' using errcode = 'P0014';
  end if;

  -- Collision quasi impossible (30^8), mais une boucle courte coûte moins
  -- qu'une erreur rendue à l'écran.
  loop
    i := i + 1;
    v_code := public.nouveau_code_inscription();
    exit when not exists (select 1 from public.signup_codes c where c.code = v_code) or i > 10;
  end loop;

  insert into public.signup_codes (code, libelle, crampons, analyses, max_uses, expires_at)
  values (v_code, nullif(trim(coalesce(p_libelle, '')), ''),
          coalesce(p_crampons, 0), coalesce(p_analyses, 0), p_max_uses, p_expire)
  returning * into v_ligne;

  return v_ligne;
end;
$$;

revoke all on function public.creer_code_inscription(integer, integer, integer, text, timestamptz) from public, anon, authenticated;

-- ── Réclamer un code ──────────────────────────────────────────────────────
-- Celle-ci s'exécute pour le JOUEUR : elle lit `auth.uid()` et ne prend donc
-- jamais l'identité d'un autre compte.
create or replace function public.reclamer_code_inscription(p_code text)
returns table (crampons integer, analyses integer, libelle text)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_code public.signup_codes;
begin
  if v_user is null then
    raise exception 'Connexion requise' using errcode = 'P0004';
  end if;

  select * into v_code from public.signup_codes c
   where c.code = upper(trim(p_code))
   for update;

  if not found then
    raise exception 'Code inconnu' using errcode = 'P0015';
  end if;
  if not v_code.actif then
    raise exception 'Code désactivé' using errcode = 'P0016';
  end if;
  if v_code.expires_at is not null and v_code.expires_at <= now() then
    raise exception 'Code expiré' using errcode = 'P0017';
  end if;
  if v_code.max_uses is not null and v_code.uses >= v_code.max_uses then
    raise exception 'Code épuisé' using errcode = 'P0018';
  end if;
  if exists (select 1 from public.signup_code_uses x where x.user_id = v_user) then
    raise exception 'Un seul code par compte' using errcode = 'P0019';
  end if;

  insert into public.signup_code_uses (code_id, user_id, crampons, analyses)
  values (v_code.id, v_user, v_code.crampons, v_code.analyses);

  update public.signup_codes c set uses = c.uses + 1 where c.id = v_code.id;

  update public.profiles pr
     set crampons = pr.crampons + v_code.crampons,
         analyses_offertes = pr.analyses_offertes + v_code.analyses
   where pr.id = v_user;

  insert into public.admin_grants (user_id, crampons, analyses, motif, source)
  values (v_user, v_code.crampons, v_code.analyses, v_code.code, 'code');

  return query select v_code.crampons, v_code.analyses, v_code.libelle;
end;
$$;

grant execute on function public.reclamer_code_inscription(text) to authenticated;

-- ── Le déblocage consomme d'abord un crédit offert ────────────────────────
-- La première analyse du jour est déjà gratuite (prix_pronostic(0) = 0) :
-- un crédit ne se consomme donc QUE quand il y aurait eu quelque chose à
-- payer. Sinon la promotion s'évaporerait sans rien offrir.
drop function if exists public.debloquer_pronostic(text, text);
create or replace function public.debloquer_pronostic(p_match text, p_monnaie text)
returns table (deja boolean, crampons integer, pressings integer, rang integer, offert boolean)
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
    return query select true, 0, 0, v_n::integer, false;
    return;
  end if;

  select count(*) into v_n from public.prediction_unlocks u
   where u.user_id = v_user and u.jour = current_date;
  select pp.crampons, pp.pressings into v_c, v_p from public.prix_pronostic(v_n) pp;

  select * into v_profil from public.profiles where id = v_user for update;

  if v_c > 0 and coalesce(v_profil.analyses_offertes, 0) > 0 then
    update public.profiles pr
       set analyses_offertes = pr.analyses_offertes - 1
     where pr.id = v_user;
    insert into public.prediction_unlocks (user_id, match_id, cout_crampons, cout_pressings)
    values (v_user, p_match, 0, 0);
    return query select false, 0, 0, (v_n + 1)::integer, true;
    return;
  end if;

  if p_monnaie = 'crampons' then
    if v_profil.crampons < v_c then
      raise exception 'Crampons insuffisants' using errcode = 'P0003';
    end if;
    -- L'ALIAS EST LE CORRECTIF : `pr.crampons` ne peut plus être confondu
    -- avec la colonne de sortie du même nom (migration 011).
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

  return query select false, v_c, v_p, (v_n + 1)::integer, false;
end;
$$;

grant execute on function public.debloquer_pronostic(text, text) to authenticated;
