-- 006 — le bulletin : combinés, et plusieurs marchés par match
--
-- CE QUE ÇA CHANGE
--
-- `bets` était une ligne = un match = un pari simple, avec `unique (user_id,
-- match_id)`. Impossible d'y loger un combiné : un combiné est UN enjeu
-- unique réparti sur plusieurs matchs, dont la cote est le PRODUIT des
-- cotes et qui ne paie que si tout tombe. On passe donc à deux tables :
--
--   bet_slips  — le bulletin : un joueur, une mise, une cote totale, un sort
--   bet_legs   — ses sélections : un match, un marché, un choix, une cote
--
-- Un pari simple n'est plus qu'un bulletin à une seule jambe. Il n'y a donc
-- qu'un seul chemin de code à écrire, à tester et à surveiller.
--
-- `bets` n'est pas supprimée : trois paris de test y sont encore ouverts et
-- leur règlement continue de fonctionner. Elle devient héritée, et plus
-- rien de neuf n'y est écrit.
--
-- LES MARCHÉS
--
--   '1x2'   — domicile / nul / extérieur. Cote réelle, depuis match_odds.
--   'exact' — score exact, « 2-1 ». Pas de cote de marché disponible : elle
--             est DÉRIVÉE des cotes 1X2 par le worker (modèle de Poisson) et
--             rangée dans match_odds.exact. Voir syncCotes().
--
-- LA RÈGLE DE SÉCURITÉ, INCHANGÉE ET RENFORCÉE. Le navigateur n'envoie
-- jamais ni cote ni identité : il appelle place_slip() avec des choix et une
-- mise. La fonction lit auth.uid() elle-même, va chercher chaque cote en
-- base, vérifie chaque coup d'envoi, calcule le produit, débite — le tout
-- dans une seule transaction. Un refus ne laisse donc jamais de débit
-- orphelin, et il n'existe aucun moyen de se fabriquer une cote.

-- 1. la grille des scores exacts, à côté des cotes 1X2 ----------------------
-- Un objet { "0-0": 8.50, "1-0": 7.20, … } par match. En colonne plutôt
-- qu'en table : le front charge déjà match_odds, il reçoit la grille sans
-- une requête de plus, et l'organisation n'a pas 15 000 lignes à héberger.
alter table public.match_odds
  add column if not exists exact jsonb;

-- 2. le bulletin -------------------------------------------------------------
create table if not exists public.bet_slips (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  stake       integer not null check (stake >= 1 and stake <= 1000),
  -- Produit des cotes des jambes, posé par place_slip() et par personne
  -- d'autre. Plafonné à 10 000 : au-delà, un combiné à dix surprises
  -- viderait la cagnotte sur un coup de chance.
  odds        numeric(12,2) not null default 0 check (odds >= 1.01 and odds <= 10000),
  status      text not null default 'open' check (status in ('open', 'won', 'lost', 'void')),
  payout      bigint,
  created_at  timestamptz not null default now(),
  settled_at  timestamptz
);

-- 3. les sélections ----------------------------------------------------------
create table if not exists public.bet_legs (
  id        bigserial primary key,
  slip_id   bigint not null references public.bet_slips(id) on delete cascade,
  match_id  text not null,
  market    text not null check (market in ('1x2', 'exact')),
  -- '1x2' → 'home' | 'draw' | 'away'. 'exact' → '2-1'.
  pick      text not null,
  odds      numeric(7,2) not null check (odds >= 1.01 and odds <= 1000),
  status    text not null default 'open' check (status in ('open', 'won', 'lost', 'void')),
  -- Deux paris sur le MÊME match dans un même bulletin seraient soit
  -- contradictoires, soit une façon de s'offrir une cote sans risque.
  unique (slip_id, match_id)
);

create index if not exists legs_slip_idx  on public.bet_legs (slip_id);
create index if not exists legs_match_idx on public.bet_legs (match_id) where status = 'open';
create index if not exists slips_user_idx on public.bet_slips (user_id, created_at desc);

alter table public.bet_slips enable row level security;
alter table public.bet_legs  enable row level security;

-- Lecture : chacun ses bulletins. Aucune policy d'écriture — tout passe par
-- place_slip(), qui est security definer. Un client ne peut donc pas insérer
-- un bulletin à la main, même avec un jeton valide.
drop policy if exists "slips_read_own" on public.bet_slips;
create policy "slips_read_own" on public.bet_slips
  for select using (auth.uid() = user_id);

drop policy if exists "legs_read_own" on public.bet_legs;
create policy "legs_read_own" on public.bet_legs
  for select using (
    exists (select 1 from public.bet_slips s where s.id = slip_id and s.user_id = auth.uid())
  );

-- La cote d'un choix, lue en base et nulle part ailleurs.
create or replace function public.cote_du_choix(o public.match_odds, p_market text, p_pick text)
returns numeric
language plpgsql immutable set search_path = public as $$
declare v numeric;
begin
  if p_market = '1x2' then
    v := case p_pick
           when 'home' then o.home
           when 'draw' then o.draw
           when 'away' then o.away
           else null
         end;
  elsif p_market = 'exact' then
    -- La grille peut manquer (match coté avant le calcul) : pas de grille,
    -- pas de pari sur le score exact.
    v := nullif(o.exact ->> p_pick, '')::numeric;
  else
    v := null;
  end if;
  if v is null or v < 1.01 or v > 1000 then return null; end if;
  return v;
end;
$$;

-- 4. poser un bulletin -------------------------------------------------------
-- p_legs : [{ "match_id": "e123", "market": "1x2", "pick": "home" }, …]
create or replace function public.place_slip(p_legs jsonb, p_stake integer)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_user    uuid := auth.uid();
  v_n       integer;
  v_leg     jsonb;
  v_cote    numeric(7,2);
  v_total   numeric(20,6) := 1;
  v_solde   integer;
  v_slip    bigint;
  o         public.match_odds%rowtype;
begin
  if v_user is null then
    raise exception 'Connexion requise' using errcode = 'P0004';
  end if;

  v_n := jsonb_array_length(p_legs);
  if v_n is null or v_n < 1 or v_n > 10 then
    raise exception 'De 1 à 10 sélections par bulletin' using errcode = 'P0005';
  end if;

  if p_stake is null or p_stake < 1 or p_stake > 1000 then
    raise exception 'Mise hors limites' using errcode = 'P0006';
  end if;

  -- Deux fois le même match dans le bulletin : refusé ici avec un message
  -- clair, plutôt que par la contrainte d'unicité plus bas.
  if (select count(distinct e->>'match_id') from jsonb_array_elements(p_legs) e) <> v_n then
    raise exception 'Un seul pari par match dans un bulletin' using errcode = 'P0007';
  end if;

  -- Premier passage : on valide tout et on calcule la cote AVANT de débiter.
  for v_leg in select * from jsonb_array_elements(p_legs) loop
    select * into o from public.match_odds where match_id = v_leg->>'match_id';
    if not found then
      raise exception 'Aucune cote pour ce match' using errcode = 'P0001';
    end if;
    if o.kickoff is not null and o.kickoff <= now() then
      raise exception 'Le match a commencé' using errcode = 'P0002';
    end if;

    v_cote := public.cote_du_choix(o, v_leg->>'market', v_leg->>'pick');
    if v_cote is null then
      raise exception 'Choix invalide' using errcode = 'P0008';
    end if;
    v_total := v_total * v_cote;
  end loop;

  v_total := least(v_total, 10000);

  select crampons into v_solde from public.profiles where id = v_user for update;
  if v_solde is null or v_solde < p_stake then
    raise exception 'Crampons insuffisants' using errcode = 'P0003';
  end if;
  update public.profiles set crampons = crampons - p_stake where id = v_user;

  insert into public.bet_slips (user_id, stake, odds)
  values (v_user, p_stake, round(v_total, 2))
  returning id into v_slip;

  -- Second passage : les jambes, avec la cote figée au moment du pari.
  for v_leg in select * from jsonb_array_elements(p_legs) loop
    select * into o from public.match_odds where match_id = v_leg->>'match_id';
    insert into public.bet_legs (slip_id, match_id, market, pick, odds)
    values (
      v_slip,
      v_leg->>'match_id',
      v_leg->>'market',
      v_leg->>'pick',
      public.cote_du_choix(o, v_leg->>'market', v_leg->>'pick')
    );
  end loop;

  return v_slip;
end;
$$;

-- 5. règlement ---------------------------------------------------------------
-- Appelée quand un résultat arrive. Règle les jambes de ce match, puis tous
-- les bulletins que ça achève.
create or replace function public.settle_slips_for_match(p_match text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  s record;
  v_cote numeric(20,6);
  v_gain bigint;
begin
  select * into r from public.match_results where match_id = p_match;
  if not found then return; end if;

  update public.bet_legs l
     set status = case
       when l.market = '1x2' then
         case when l.pick = (case
                when r.home_score > r.away_score then 'home'
                when r.home_score < r.away_score then 'away'
                else 'draw' end)
         then 'won' else 'lost' end
       when l.market = 'exact' then
         case when l.pick = (r.home_score::text || '-' || r.away_score::text)
         then 'won' else 'lost' end
       else 'void'
     end
   where l.match_id = p_match and l.status = 'open';

  -- Un bulletin tombe dès qu'UNE jambe est perdue : inutile d'attendre les
  -- autres matchs, et le joueur le voit tout de suite.
  update public.bet_slips s2
     set status = 'lost', payout = 0, settled_at = now()
   where s2.status = 'open'
     and exists (select 1 from public.bet_legs l
                  where l.slip_id = s2.id and l.status = 'lost');

  -- Gagnés : plus aucune jambe ouverte, et aucune perdue.
  for s in
    select s3.* from public.bet_slips s3
     where s3.status = 'open'
       and not exists (select 1 from public.bet_legs l
                        where l.slip_id = s3.id and l.status = 'open')
  loop
    -- Une jambe annulée (match reporté) ne fait pas perdre le bulletin :
    -- elle sort du produit, exactement comme chez un bookmaker.
    -- Aucune jambe gagnée alors qu'aucune n'est perdue : tout a été annulé.
    -- Le match n'a pas eu lieu, donc on REMBOURSE la mise en crampons —
    -- payer des pressings pour un match reporté serait de l'argent gratuit.
    if not exists (select 1 from public.bet_legs l
                    where l.slip_id = s.id and l.status = 'won') then
      update public.bet_slips
         set status = 'void', payout = 0, settled_at = now()
       where id = s.id;
      update public.profiles
         set crampons = crampons + s.stake
       where id = s.user_id;
      continue;
    end if;

    select coalesce(exp(sum(ln(l.odds))), 1) into v_cote
      from public.bet_legs l
     where l.slip_id = s.id and l.status = 'won';

    v_gain := round(s.stake * least(v_cote, 10000))::bigint;

    update public.bet_slips
       set status = 'won', payout = v_gain, settled_at = now()
     where id = s.id;

    update public.profiles
       set pressings = pressings + v_gain
     where id = s.user_id;
  end loop;
end;
$$;

-- Branchement sur l'arrivée d'un résultat. Le déclencheur hérité de 004
-- (settle_bets_on_result) reste en place pour les trois paris de `bets`.
create or replace function public.settle_slips_on_result()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.settle_slips_for_match(new.match_id);
  return new;
end;
$$;

drop trigger if exists trg_settle_slips on public.match_results;
create trigger trg_settle_slips
  after insert or update on public.match_results
  for each row execute function public.settle_slips_on_result();

grant execute on function public.place_slip(jsonb, integer) to authenticated;
