-- 004_paris.sql — le jeu passe du score exact au pari sur cotes réelles
--
-- Ce que ça change, et pourquoi.
--
-- Jusqu'ici on devinait un score exact et un barème fixe donnait des points.
-- C'était plat : tous les matchs valaient pareil, et le joueur ne décidait
-- de rien d'autre que son pronostic. Désormais il choisit AUSSI combien il
-- engage, et la cote réelle du match fixe le rendement. Un favori rapporte
-- peu, une surprise rapporte gros, et miser gros reste un choix.
--
-- Deux monnaies, volontairement :
--   • CRAMPONS — ce qu'on mise. 5 offerts par jour, à réclamer en se
--     connectant ; non réclamés, ils sont perdus. Mise minimum 3.
--   • PRESSINGS — ce qu'on gagne. C'est le score, et c'est lui qui se
--     convertit en récompense.
--
-- LE POINT DE SÉCURITÉ CENTRAL : la cote n'est JAMAIS celle qu'envoie le
-- navigateur. Sans ça, n'importe qui poste un pari à cote 1000 et vide la
-- cagnotte. Le worker alimente `match_odds`, et un déclencheur BEFORE INSERT
-- écrase ce que le client a envoyé par la cote enregistrée côté serveur. Le
-- client n'a donc que deux choses à dire : sur quoi, et combien.

-- 1. le portefeuille, sur le profil ------------------------------------------
alter table public.profiles
  add column if not exists crampons   integer not null default 5,
  add column if not exists pressings  bigint  not null default 0,
  -- Date de la dernière réclamation quotidienne. Nulle = jamais réclamé.
  add column if not exists last_claim date;

-- 2. les cotes, côté serveur -------------------------------------------------
-- Alimentée par le worker pour les matchs À VENIR des compétitions retenues.
-- Écriture réservée au service_role (aucune policy d'insertion) ; lecture
-- publique, puisque les cotes s'affichent de toute façon.
create table if not exists public.match_odds (
  match_id    text primary key,
  home        numeric(7,2) not null check (home   >= 1.01 and home   <= 100),
  draw        numeric(7,2) not null check (draw   >= 1.01 and draw   <= 100),
  away        numeric(7,2) not null check (away   >= 1.01 and away   <= 100),
  kickoff     timestamptz,
  updated_at  timestamptz not null default now()
);

alter table public.match_odds enable row level security;
drop policy if exists "odds_read" on public.match_odds;
create policy "odds_read" on public.match_odds for select using (true);

-- 3. les paris ---------------------------------------------------------------
create table if not exists public.bets (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  match_id    text not null,
  pick        text not null check (pick in ('home', 'draw', 'away')),
  stake       integer not null check (stake >= 3 and stake <= 1000),
  -- Figée à la prise du pari, et posée par le déclencheur, pas par le client.
  odds        numeric(7,2) not null default 0,
  status      text not null default 'open' check (status in ('open', 'won', 'lost', 'void')),
  payout      bigint,
  created_at  timestamptz not null default now(),
  settled_at  timestamptz,
  -- Un seul pari par match et par joueur : c'est un jeu de pronostics, pas
  -- une table de casino.
  unique (user_id, match_id)
);

create index if not exists bets_match_idx on public.bets (match_id) where status = 'open';
create index if not exists bets_user_idx  on public.bets (user_id);

alter table public.bets enable row level security;
drop policy if exists "bets_read_own"   on public.bets;
create policy "bets_read_own"   on public.bets for select using (auth.uid() = user_id);
drop policy if exists "bets_insert_own" on public.bets;
create policy "bets_insert_own" on public.bets for insert with check (auth.uid() = user_id);
-- Volontairement : ni update ni delete. Un pari posé ne se reprend pas, et
-- seul le déclencheur de règlement y touche.

-- 4. prise d'un pari : cote serveur, débit des crampons, garde-fous ----------
create or replace function public.place_bet_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o record;
  solde int;
begin
  select * into o from public.match_odds where match_id = new.match_id;
  if not found then
    raise exception 'Aucune cote pour ce match' using errcode = 'P0001';
  end if;
  -- Le coup d'envoi est passé : trop tard, quoi qu'en dise le client.
  if o.kickoff is not null and o.kickoff <= now() then
    raise exception 'Le match a commencé' using errcode = 'P0002';
  end if;

  -- LA cote fait foi, celle du serveur. On écrase ce qu'a envoyé le client.
  new.odds := case new.pick
                when 'home' then o.home
                when 'draw' then o.draw
                else o.away
              end;

  select crampons into solde from public.profiles where id = new.user_id for update;
  if solde is null or solde < new.stake then
    raise exception 'Crampons insuffisants' using errcode = 'P0003';
  end if;

  update public.profiles set crampons = crampons - new.stake where id = new.user_id;

  new.status := 'open';
  new.payout := null;
  new.settled_at := null;
  return new;
end;
$$;

drop trigger if exists trg_place_bet on public.bets;
create trigger trg_place_bet
  before insert on public.bets
  for each row execute function public.place_bet_guard();

-- 5. règlement : quand un résultat tombe, on solde les paris ouverts ---------
-- Se greffe sur `match_results`, déjà alimentée par le worker. Le gain est en
-- PRESSINGS ; les crampons misés, eux, sont consommés — c'est la mise.
create or replace function public.settle_bets_on_result()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b record;
  gagnant text := case
    when new.home_score > new.away_score then 'home'
    when new.home_score < new.away_score then 'away'
    else 'draw' end;
  gain bigint;
begin
  for b in
    select * from public.bets where match_id = new.match_id and status = 'open'
  loop
    if b.pick = gagnant then
      gain := round(b.stake * b.odds)::bigint;
      update public.bets
         set status = 'won', payout = gain, settled_at = now()
       where id = b.id;
      update public.profiles
         set pressings = pressings + gain,
             current_streak = current_streak + 1,
             best_streak = greatest(best_streak, current_streak + 1)
       where id = b.user_id;
    else
      update public.bets
         set status = 'lost', payout = 0, settled_at = now()
       where id = b.id;
      update public.profiles
         set current_streak = 0
       where id = b.user_id;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_settle_bets on public.match_results;
create trigger trg_settle_bets
  after insert or update on public.match_results
  for each row execute function public.settle_bets_on_result();

-- 6. la réclamation quotidienne ----------------------------------------------
-- Une fois par jour, en se connectant. Non réclamés, les 5 crampons du jour
-- sont perdus — ils ne s'accumulent pas d'un jour sur l'autre. Ce qu'on a
-- déjà en réserve, en revanche, reste acquis.
-- Les colonnes de sortie s'appellent `solde` et non `crampons` : un paramètre
-- OUT qui porte le nom d'une colonne de la table qu'on met à jour rend les
-- références ambiguës pour PostgreSQL.
create or replace function public.claim_daily()
returns table (solde integer, deja_reclame boolean)
language plpgsql security definer set search_path = public as $$
declare
  p record;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Profil introuvable' using errcode = 'P0004';
  end if;

  if p.last_claim = current_date then
    return query select p.crampons, true;
    return;
  end if;

  update public.profiles
     set crampons = p.crampons + 5,
         last_claim = current_date
   where id = p.id;

  return query select p.crampons + 5, false;
end;
$$;

revoke all on function public.claim_daily() from public;
grant execute on function public.claim_daily() to authenticated;

-- 7. le classement se joue désormais sur les pressings -----------------------
-- Les nouvelles colonnes sont AJOUTÉES EN FIN de liste, jamais insérées au
-- milieu : `create or replace view` refuse de renommer ou réordonner une
-- colonne existante, et échouerait. L'ordre d'origine est donc conservé tel
-- quel, ce qui laisse aussi intact le composant qui fait `select *`.
create or replace view public.leaderboard as
  select id, alias, country, avatar_url,
         total_points, resolved_predictions, accuracy_pct,
         current_streak, best_streak, tier,
         pressings, crampons
    from public.profiles
   where pressings > 0
   order by pressings desc, best_streak desc
   limit 100;

grant select on public.leaderboard to anon, authenticated;

-- 8. le classement d'une ligue suit le même changement -----------------------
-- Les points comptés sont les PRESSINGS gagnés depuis l'adhésion, pour que
-- rejoindre une ligue reste jouable. Même raisonnement qu'en 003.
create or replace function public.league_table(p_slug text)
returns table (
  user_id    uuid,
  alias      text,
  avatar_url text,
  country    text,
  points     int,
  resolved   int,
  joined_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.alias,
         p.avatar_url,
         p.country,
         coalesce(sum(b.payout), 0)::int                         as points,
         count(b.id) filter (where b.status <> 'open')::int       as resolved,
         m.joined_at
    from public.leagues l
    join public.league_members m on m.league_id = l.id
    join public.profiles p       on p.id = m.user_id
    left join public.bets b
           on b.user_id = p.id
          and b.status in ('won', 'lost')
          and b.created_at >= m.joined_at
   where l.slug = p_slug
   group by p.id, p.alias, p.avatar_url, p.country, m.joined_at
   order by points desc, m.joined_at asc;
$$;

revoke all on function public.league_table(text) from public;
grant execute on function public.league_table(text) to anon, authenticated;
