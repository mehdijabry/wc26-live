-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 025 — PARIER PENDANT LE MATCH                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Jusqu'ici un match devenait impariable à la seconde du coup d'envoi
-- (`o.kickoff <= now()`). On ouvre désormais le marché jusqu'à dix minutes de
-- la fin, avec une cote qui suit le score et l'horloge.
--
-- ── LA GARDE CHANGE DE NATURE, ET C'EST LE CŒUR DE CETTE MIGRATION ────────
-- `kickoff` est une date d'OUVERTURE : tant qu'elle n'est pas atteinte, on
-- parie. Une garde bâtie dessus est sûre par construction, parce qu'une
-- panne du worker laisse la date en place et ferme le marché toute seule.
--
-- En direct, cette propriété disparaît : c'est le worker qui décide, tour
-- après tour, que le match est encore jouable. Si on lui confiait un simple
-- booléen « ouvert », sa panne laisserait le marché ouvert pour toujours, à
-- une cote figée sur un score périmé — le pire cas possible.
--
-- D'où `closes_at` : une date ABSOLUE, toujours dans le futur proche, que le
-- worker repousse à chaque tour. Qu'il s'arrête et elle cesse d'être
-- repoussée : le marché se ferme de lui-même en quelques minutes. **La panne
-- ferme les paris, elle ne les laisse jamais ouverts.**

alter table public.match_odds
  -- Les espérances de buts d'AVANT-MATCH, figées à l'ouverture du marché.
  -- Le calcul en direct part toujours d'elles, jamais de la cote live : on
  -- dériverait un peu plus à chaque tour, et au bout d'une heure le prix ne
  -- décrirait plus le match mais ses propres arrondis.
  add column if not exists lam_home   numeric(6,3),
  add column if not exists lam_away   numeric(6,3),
  add column if not exists live       boolean not null default false,
  add column if not exists minute     smallint,
  add column if not exists home_score smallint,
  add column if not exists away_score smallint,
  -- Posée dès qu'un score change : le temps que la nouvelle cote soit
  -- publiée, personne ne mise sur un match qu'il a vu avant nous.
  add column if not exists suspended_until timestamptz,
  add column if not exists closes_at  timestamptz;

-- Les lignes déjà en base n'ont pas de date de fermeture : on leur donne
-- celle qu'elles avaient implicitement, le coup d'envoi. Sans ce rattrapage
-- un `closes_at` nul rouvrirait tous les matchs passés.
update public.match_odds set closes_at = kickoff where closes_at is null;

comment on column public.match_odds.closes_at is
  'Fermeture des paris. Date absolue repoussée à chaque tour par le worker : '
  'une panne du worker ferme le marché au lieu de le laisser ouvert.';

-- ── La prise de pari ──────────────────────────────────────────────────────
-- Reprise intégrale de la 007, trois changements seulement, tous dans la
-- boucle de vérification des jambes.
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
  v_live  boolean := false;
  o       public.match_odds%rowtype;
  -- ── LE PLAFOND EN DIRECT ────────────────────────────────────────────────
  -- Entre le but et le moment où notre worker l'apprend d'ESPN, il s'écoule
  -- quelques secondes pendant lesquelles notre prix décrit un match qui
  -- n'existe plus. On a réduit cette fenêtre au minimum (relecture toutes
  -- les cinq secondes, sans cache, gel immédiat dès qu'un score bouge) mais
  -- on ne peut pas la supprimer : ESPN ne publie aucun signal AVANT le but,
  -- et son tableau de bord a lui-même du retard sur la télévision.
  --
  -- Une faille qu'on ne sait pas supprimer, on la BORNE. Cent crampons au
  -- lieu de mille : quelqu'un qui exploiterait le décalage gagne dix fois
  -- moins, et un joueur ordinaire ne voit jamais la limite — la mise
  -- quotidienne offerte est de cinq.
  c_mise_max_live constant integer := 100;
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

    -- (1) La fermeture remplace le coup d'envoi. `closes_at` vaut le coup
    --     d'envoi tant que le match n'a pas commencé, puis le worker le
    --     repousse tour après tour jusqu'à dix minutes de la fin.
    if o.closes_at is null or o.closes_at <= now() then
      raise exception 'Les paris sont fermés pour ce match' using errcode = 'P0002';
    end if;

    -- (2) Un score vient de changer : le marché est gelé le temps que la
    --     nouvelle cote soit publiée. Sans ce gel, qui regarde le match à la
    --     télévision mise sur une issue qu'il connaît déjà.
    if o.suspended_until is not null and o.suspended_until > now() then
      raise exception 'Cotes en cours de mise à jour' using errcode = 'P0009';
    end if;

    -- (3) Le marché BUTEUR ne s'ouvre pas en direct. Ses prix sont calculés
    --     avant le match sur les effectifs probables ; une fois le match
    --     lancé ils ne savent ni qui est entré, ni qui est sorti, ni qui a
    --     déjà marqué. Un prix qu'on ne sait plus tenir ne se propose pas.
    if o.live and v_leg->>'market' = 'scorer' then
      raise exception 'Le marché buteur ferme au coup d''envoi' using errcode = 'P0010';
    end if;

    if o.live then v_live := true; end if;

    v_cote := public.cote_du_choix(v_leg->>'match_id', v_leg->>'market', v_leg->>'pick');
    if v_cote is null then
      raise exception 'Choix invalide' using errcode = 'P0008';
    end if;
    v_total := v_total * v_cote;
  end loop;

  v_total := least(v_total, 10000);

  -- (4) Le plafond en direct s'applique au BULLETIN, pas à la jambe : un
  --     combiné qui contient ne serait-ce qu'un match en cours est plafonné.
  --     Sinon il suffirait d'ajouter un match à venir pour contourner.
  if v_live and p_stake > c_mise_max_live then
    raise exception 'Mise plafonnée à % crampons sur un match en direct', c_mise_max_live
      using errcode = 'P0011';
  end if;

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

revoke all on function public.place_slip(jsonb, integer) from public;
grant execute on function public.place_slip(jsonb, integer) to authenticated;
