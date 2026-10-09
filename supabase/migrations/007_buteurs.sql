-- 007 — le marché BUTEUR
--
-- Troisième marché, après '1x2' et 'exact'. Il demande deux choses que les
-- deux premiers n'avaient pas : la liste des joueurs de chaque match, et un
-- prix par joueur. Aucune des deux ne vient du fournisseur de cotes.
--
-- LA LISTE vient des effectifs ESPN, ceux-là mêmes qui alimentent les 334
-- pages de clubs. LE PRIX est calculé par le worker (`cotesButeurs`), à
-- partir de trois facteurs :
--
--   1. L'ESPÉRANCE DE BUTS DE L'ÉQUIPE, déjà dérivée des cotes 1X2 pour le
--      marché du score exact. Un attaquant d'une équipe qui marque deux buts
--      par match n'a pas les mêmes chances que celui d'une équipe qui en
--      marque un. C'est ce qui rend le marché vivant plutôt que tabulaire.
--   2. LE POSTE. ESPN n'en donne que quatre (gardien, défenseur, milieu,
--      attaquant) — pas la finesse ailier / 10 / 6 demandée. Les ancrages
--      voulus sont respectés pour un joueur moyen de son poste, équipe
--      moyenne : attaquant 3,51 · milieu 6,00 · défenseur 10,00.
--   3. LES STATISTIQUES DU JOUEUR — buts, matchs joués — qui font le tri
--      fin que le poste ne peut pas faire : un ailier qui marque sort
--      au-dessus d'un attaquant qui ne marque pas, ce qui est l'intention.
--
-- POURQUOI UNE TABLE À PART, ET PAS UNE COLONNE DE match_odds. La page des
-- pronostics charge TOUTES les lignes de match_odds d'un coup : y ajouter
-- quatorze joueurs par match ferait passer ce chargement de quelques
-- centaines de kilo-octets à plusieurs méga-octets. La liste des buteurs se
-- charge donc à la demande, match par match, quand le joueur ouvre le
-- panneau.

create table if not exists public.match_scorers (
  match_id   text primary key,
  -- [{ id, nom, poste, equipe, cote }] — une ligne par match.
  players    jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.match_scorers enable row level security;
drop policy if exists "scorers_read" on public.match_scorers;
create policy "scorers_read" on public.match_scorers for select using (true);

-- 1. le marché 'scorer' devient légal -----------------------------------------
alter table public.bet_legs drop constraint if exists bet_legs_market_check;
alter table public.bet_legs
  add constraint bet_legs_market_check check (market in ('1x2', 'exact', 'scorer'));

-- 2. la cote d'un choix, qui doit maintenant regarder deux tables -------------
-- L'ancienne version recevait la ligne match_odds et était `immutable`. Elle
-- lit désormais aussi match_scorers, donc elle prend l'identifiant du match
-- et devient `stable`.
drop function if exists public.cote_du_choix(public.match_odds, text, text);

create or replace function public.cote_du_choix(p_match text, p_market text, p_pick text)
returns numeric
language plpgsql stable set search_path = public as $$
declare
  o public.match_odds%rowtype;
  v numeric;
begin
  select * into o from public.match_odds where match_id = p_match;
  if not found then return null; end if;

  if p_market = '1x2' then
    v := case p_pick when 'home' then o.home when 'draw' then o.draw when 'away' then o.away else null end;
  elsif p_market = 'exact' then
    v := nullif(o.exact ->> p_pick, '')::numeric;
  elsif p_market = 'scorer' then
    -- p_pick est l'identifiant ESPN du joueur. On le cherche dans la liste
    -- publiée pour CE match : un joueur absent de la liste n'est pas pariable,
    -- et la cote est celle du serveur, jamais celle du client.
    select (j ->> 'cote')::numeric into v
      from public.match_scorers s, jsonb_array_elements(s.players) j
     where s.match_id = p_match and j ->> 'id' = p_pick
     limit 1;
  else
    v := null;
  end if;

  if v is null or v < 1.01 or v > 1000 then return null; end if;
  return v;
end;
$$;

-- 3. place_slip() suit le changement de signature -----------------------------
create or replace function public.place_slip(p_legs jsonb, p_stake integer)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := auth.uid();
  v_n     integer;
  v_leg   jsonb;
  v_cote  numeric(7,2);
  v_total numeric(20,6) := 1;
  v_solde integer;
  v_slip  bigint;
  o       public.match_odds%rowtype;
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

  if (select count(distinct e->>'match_id') from jsonb_array_elements(p_legs) e) <> v_n then
    raise exception 'Un seul pari par match dans un bulletin' using errcode = 'P0007';
  end if;

  for v_leg in select * from jsonb_array_elements(p_legs) loop
    select * into o from public.match_odds where match_id = v_leg->>'match_id';
    if not found then
      raise exception 'Aucune cote pour ce match' using errcode = 'P0001';
    end if;
    if o.kickoff is not null and o.kickoff <= now() then
      raise exception 'Le match a commencé' using errcode = 'P0002';
    end if;

    v_cote := public.cote_du_choix(v_leg->>'match_id', v_leg->>'market', v_leg->>'pick');
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

  for v_leg in select * from jsonb_array_elements(p_legs) loop
    insert into public.bet_legs (slip_id, match_id, market, pick, odds)
    values (
      v_slip,
      v_leg->>'match_id',
      v_leg->>'market',
      v_leg->>'pick',
      public.cote_du_choix(v_leg->>'match_id', v_leg->>'market', v_leg->>'pick')
    );
  end loop;

  return v_slip;
end;
$$;

-- 4. le règlement sait lire les buteurs ---------------------------------------
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
       when l.market = 'scorer' then
         -- scorer_ids porte les identifiants ESPN des buteurs du match, posés
         -- par le worker. Tant qu'il est VIDE alors que des buts ont été
         -- marqués, on ne peut pas trancher : on annule la jambe au lieu de
         -- la déclarer perdue. Déclarer perdant faute de données serait voler
         -- le joueur.
         case
           when r.scorer_ids is null or array_length(r.scorer_ids, 1) is null then
             case when r.home_score + r.away_score = 0 then 'lost' else 'void' end
           when l.pick = any (r.scorer_ids) then 'won'
           else 'lost'
         end
       else 'void'
     end
   where l.match_id = p_match and l.status = 'open';

  update public.bet_slips s2
     set status = 'lost', payout = 0, settled_at = now()
   where s2.status = 'open'
     and exists (select 1 from public.bet_legs l
                  where l.slip_id = s2.id and l.status = 'lost');

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
       set pressings = pressings + v_gain
     where id = s.user_id;
  end loop;
end;
$$;

grant execute on function public.place_slip(jsonb, integer) to authenticated;
