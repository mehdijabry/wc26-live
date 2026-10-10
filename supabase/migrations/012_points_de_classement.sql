-- 012 — les points de classement, et la réparation des classements
--
-- CE QUI ÉTAIT CASSÉ. Depuis le 8 octobre, les paris se posent en BULLETINS
-- (`bet_slips`, combinés compris) et plus en paris simples (`bets`). Or les
-- deux classements n'ont jamais suivi :
--
--   · `league_table()` sommait `bets.payout` — donc zéro pour tout joueur
--     arrivé après le 8 octobre, et un classement figé pour les autres ;
--   · la vue `leaderboard` triait sur `profiles.pressings`, c'est-à-dire un
--     SOLDE. Il monte, il descend avec les pénalités de palier, et quelqu'un
--     qui réclame chaque jour sans jamais parier finit devant un parieur.
--
-- CE QU'ON POSE (Mehdi, 2026-10-10). Un point de classement se gagne en
-- GAGNANT un pari, et il ne se perd jamais :
--
--     points = mise × 10 × min(cote, 5)
--
-- Un jeton vaut dix points à cote 1,00 — la règle de Mehdi — et un pari
-- risqué qui rentre vaut jusqu'à cinq fois plus. Sans la pondération, la
-- stratégie optimale était « mise tout, tous les jours, sur la cote la plus
-- basse » : avec 5 à 11 crampons par jour, tout le monde plafonnait à 110
-- points quotidiens et le classement mesurait l'assiduité, pas la lecture du
-- football. Le plafond à 5 empêche un combiné à cote 400 d'écraser une saison.
--
-- UN REGISTRE, PAS UN COMPTEUR. Chaque gain écrit SA LIGNE. Un simple total
-- sur `profiles` ne permettrait ni « depuis que tu as rejoint le groupe », ni
-- « cette semaine » — or les deux sont indispensables aux ligues et aux prix
-- hebdomadaires à venir. Le total dénormalisé existe quand même, pour que le
-- classement général n'ait pas à agréger un million de lignes à chaque page.

-- ── Le registre ────────────────────────────────────────────────────────────
create table if not exists public.ranking_events (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- L'un OU l'autre : un bulletin du nouveau moteur, ou un pari simple de
  -- l'ancien. Jamais les deux, jamais aucun.
  slip_id     bigint references public.bet_slips(id) on delete cascade,
  bet_id      bigint references public.bets(id) on delete cascade,
  points      integer not null check (points > 0),
  created_at  timestamptz not null default now(),
  constraint ranking_events_source check (
    (slip_id is not null and bet_id is null) or (slip_id is null and bet_id is not null)
  )
);

-- Un gain ne compte qu'une fois, même si le règlement repasse sur le match.
create unique index if not exists ranking_events_slip_uniq on public.ranking_events (slip_id) where slip_id is not null;
create unique index if not exists ranking_events_bet_uniq  on public.ranking_events (bet_id)  where bet_id is not null;
-- L'index qui porte les deux usages : « depuis l'adhésion » et « cette semaine ».
create index if not exists ranking_events_user_date_idx on public.ranking_events (user_id, created_at desc);

alter table public.ranking_events enable row level security;
-- Lecture publique : un classement n'est un classement que s'il se lit.
-- L'écriture passe uniquement par le règlement, qui est security definer.
drop policy if exists "ranking_events_read" on public.ranking_events;
create policy "ranking_events_read" on public.ranking_events for select using (true);

-- Le cumul, dénormalisé pour le classement général.
alter table public.profiles add column if not exists ranking_points bigint not null default 0;

-- ── La formule, en un seul endroit ────────────────────────────────────────
create or replace function public.points_du_pari(p_mise integer, p_cote numeric)
returns integer
language sql immutable set search_path = public as $$
  select greatest(1, round(p_mise * 10 * least(coalesce(p_cote, 1), 5)))::integer;
$$;

grant execute on function public.points_du_pari(integer, numeric) to anon, authenticated;

-- ── Inscrire un gain ──────────────────────────────────────────────────────
-- Idempotente par les index uniques ci-dessus : un `on conflict do nothing`
-- vaut mieux qu'une vérification préalable, qui laisserait une fenêtre entre
-- la lecture et l'écriture si deux règlements se croisaient.
create or replace function public.inscrire_points(
  p_user uuid, p_slip bigint, p_bet bigint, p_mise integer, p_cote numeric
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pts integer := public.points_du_pari(p_mise, p_cote);
  v_pose integer;
begin
  insert into public.ranking_events (user_id, slip_id, bet_id, points)
  values (p_user, p_slip, p_bet, v_pts)
  on conflict do nothing;
  get diagnostics v_pose = row_count;
  if v_pose > 0 then
    update public.profiles pr set ranking_points = pr.ranking_points + v_pts where pr.id = p_user;
  end if;
end;
$$;

-- ── Le règlement des bulletins inscrit désormais les points ───────────────
-- Repris mot pour mot de la 009 : seul le bloc « bulletin gagné » change.
create or replace function public.settle_slips_for_match(p_match text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  s record;
  v_cote numeric(20,6);
  v_gain bigint;
  v_perte integer;
  v_solde bigint;
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
       when l.market = 'scorer' then
         case
           when r.home_score + r.away_score = 0 then 'lost'
           when r.scorer_ids is null or array_length(r.scorer_ids, 1) is null then 'open'
           when l.pick = any (r.scorer_ids) then 'won'
           else 'lost'
         end
       else 'void'
     end
   where l.match_id = p_match and l.status = 'open';

  for s in
    select s2.* from public.bet_slips s2
     where s2.status = 'open'
       and exists (select 1 from public.bet_legs l
                    where l.slip_id = s2.id and l.status = 'lost')
  loop
    select pressings into v_solde from public.profiles where id = s.user_id for update;
    v_perte := least(public.perte_du_palier(coalesce(v_solde, 0)), greatest(coalesce(v_solde, 0), 0))::integer;

    update public.bet_slips
       set status = 'lost', payout = 0, penalty = v_perte, settled_at = now()
     where id = s.id;

    update public.profiles
       set pressings = greatest(pressings - v_perte, 0),
           current_streak = 0
     where id = s.user_id;
  end loop;

  for s in
    select s3.* from public.bet_slips s3
     where s3.status = 'open'
       and not exists (select 1 from public.bet_legs l
                        where l.slip_id = s3.id and l.status = 'open')
  loop
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
       set pressings = pressings + v_gain,
           current_streak = current_streak + 1,
           best_streak = greatest(best_streak, current_streak + 1)
     where id = s.user_id;

    -- LES POINTS. Sur la cote RÉELLEMENT encaissée — celle des jambes
    -- gagnantes — et pas sur la cote posée à la prise du pari : une jambe
    -- annulée fait tomber la cote, et il serait malhonnête de payer des
    -- points sur un risque qui n'a pas été couru.
    perform public.inscrire_points(s.user_id, s.id, null, s.stake, v_cote);
  end loop;
end;
$$;

-- ── Les paris simples de l'ancien moteur comptent pareil ──────────────────
create or replace function public.settle_bets_on_result()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b record;
  gagnant text := case
    when new.home_score > new.away_score then 'home'
    when new.home_score < new.away_score then 'away'
    else 'draw' end;
  gain bigint;
  v_perte integer;
  v_solde bigint;
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
      perform public.inscrire_points(b.user_id, null, b.id, b.stake, b.odds);
    else
      select pressings into v_solde from public.profiles where id = b.user_id for update;
      v_perte := least(public.perte_du_palier(coalesce(v_solde, 0)), greatest(coalesce(v_solde, 0), 0))::integer;
      update public.bets
         set status = 'lost', payout = 0, settled_at = now()
       where id = b.id;
      update public.profiles
         set pressings = greatest(pressings - v_perte, 0),
             current_streak = 0
       where id = b.user_id;
    end if;
  end loop;
  return new;
end;
$$;

-- ── Reprise de l'historique ───────────────────────────────────────────────
-- Sans elle, tout le monde repartirait de zéro et la « réparation » effacerait
-- ce qui a été joué. On rejoue donc les gains déjà réglés, dans l'ordre, avec
-- la date du règlement — pour que « cette semaine » reste vrai.
insert into public.ranking_events (user_id, slip_id, bet_id, points, created_at)
select s.user_id, s.id, null, public.points_du_pari(s.stake, s.odds),
       coalesce(s.settled_at, s.created_at)
  from public.bet_slips s
 where s.status = 'won'
on conflict do nothing;

insert into public.ranking_events (user_id, slip_id, bet_id, points, created_at)
select b.user_id, null, b.id, public.points_du_pari(b.stake, b.odds),
       coalesce(b.settled_at, b.created_at)
  from public.bets b
 where b.status = 'won'
on conflict do nothing;

-- Le cumul est RECALCULÉ depuis le registre, jamais incrémenté à la main :
-- c'est la seule façon qu'il ne puisse pas dériver de sa source.
update public.profiles p
   set ranking_points = coalesce((
         select sum(e.points) from public.ranking_events e where e.user_id = p.id
       ), 0);

-- ── Le classement d'une ligue, réparé ─────────────────────────────────────
-- Il compte maintenant LES POINTS, bulletins et paris simples confondus, et
-- toujours depuis l'adhésion de chacun — sinon rejoindre une ligue où
-- quelqu'un joue depuis un an serait perdu d'avance (raisonnement de la 003).
drop function if exists public.league_table(text);
create or replace function public.league_table(p_slug text)
returns table (
  user_id    uuid,
  alias      text,
  avatar_url text,
  country    text,
  points     bigint,
  paris      integer,
  gagnes     integer,
  joined_at  timestamptz
)
language sql stable security definer set search_path = public as $$
  with membres as (
    select m.user_id, m.joined_at
      from public.leagues l
      join public.league_members m on m.league_id = l.id
     where l.slug = p_slug
  )
  select p.id,
         p.alias,
         p.avatar_url,
         p.country,
         coalesce((select sum(e.points) from public.ranking_events e
                    where e.user_id = p.id and e.created_at >= mb.joined_at), 0)::bigint,
         (coalesce((select count(*) from public.bet_slips s
                     where s.user_id = p.id and s.status in ('won','lost')
                       and s.created_at >= mb.joined_at), 0)
        + coalesce((select count(*) from public.bets b
                     where b.user_id = p.id and b.status in ('won','lost')
                       and b.created_at >= mb.joined_at), 0))::integer,
         (coalesce((select count(*) from public.bet_slips s
                     where s.user_id = p.id and s.status = 'won'
                       and s.created_at >= mb.joined_at), 0)
        + coalesce((select count(*) from public.bets b
                     where b.user_id = p.id and b.status = 'won'
                       and b.created_at >= mb.joined_at), 0))::integer,
         mb.joined_at
    from membres mb
    join public.profiles p on p.id = mb.user_id
   order by 5 desc, mb.joined_at asc;
$$;

revoke all on function public.league_table(text) from public;
grant execute on function public.league_table(text) to anon, authenticated;

-- ── Le classement général, réparé lui aussi ───────────────────────────────
-- Sur les POINTS, pas sur le solde. Un solde n'est pas un mérite.
drop view if exists public.leaderboard;
create or replace view public.leaderboard as
  select id, alias, country, avatar_url,
         ranking_points, total_points, resolved_predictions, accuracy_pct,
         current_streak, best_streak, tier,
         pressings, crampons
    from public.profiles
   where ranking_points > 0
   order by ranking_points desc, best_streak desc
   limit 100;

grant select on public.leaderboard to anon, authenticated;
