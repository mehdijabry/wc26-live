-- 033 — LE PLAFOND DE MISE SUIT LE PALIER
--
-- Mehdi, 17/10/2026 : « remplace le bouton ALL par MAX (1000) pour les
-- paliers de 0 à 3, et 3 → MAX (3000), 4 → (4000), 5 → (5000) ».
--
-- ─── CE QUE ÇA CORRIGE EN PASSANT ─────────────────────────────────────────
-- Le bouton « all » misait TOUT LE SOLDE. Sur le compte de Mehdi il
-- proposait 993 439 crampons alors que la base refuse au-delà de 1 000
-- (`stake <= 1000` depuis la 004) : le joueur tapait un nombre que la
-- fonction rejetait, sans que rien ne lui dise pourquoi. Un bouton ne doit
-- jamais proposer ce que la base refuse.
--
-- ─── POURQUOI LE PLAFOND MONTE AVEC LE PALIER ─────────────────────────────
-- Les paliers 1 et 2 sont ceux où un bulletin perdu ne coûte aucun pressing
-- (migration 009) : on y apprend le jeu. Leur laisser miser 5 000 crampons
-- n'aurait aucun sens — rien ne les retient. Le droit de miser gros
-- s'achète donc en montant, exactement comme le risque de perdre des
-- pressings s'impose en montant.
--
-- ─── OÙ LA RÈGLE S'APPLIQUE ───────────────────────────────────────────────
-- EN BASE, et nulle part ailleurs. L'écran n'en est que le miroir : il
-- affiche « MAX (3000) » parce que la fonction refuserait 3 001.

create or replace function public.mise_max_du_palier(p_pressings bigint)
returns integer
language sql immutable set search_path = public as $$
  select case public.palier_de(coalesce(p_pressings, 0))
    when 5 then 5000
    when 4 then 4000
    when 3 then 3000
    else 1000
  end;
$$;

grant execute on function public.mise_max_du_palier(bigint) to anon, authenticated;

-- ── Les contraintes de table s'ouvrent jusqu'au plafond le plus haut ──────
-- Elles ne peuvent pas porter la règle du palier (elles ne voient pas le
-- profil) : elles gardent le garde-fou absolu, et la fonction tranche.
alter table public.bet_slips drop constraint if exists bet_slips_stake_check;
alter table public.bet_slips
  add constraint bet_slips_stake_check check (stake >= 1 and stake <= 5000);

alter table public.bets drop constraint if exists bets_stake_check;
alter table public.bets
  add constraint bets_stake_check check (stake >= 1 and stake <= 5000);

-- ── place_slip : le plafond du joueur, lu sur SON solde de pressings ──────
-- COPIE EXACTE de la 025, au controle de mise pres. Le reste — fermeture,
-- gel des cotes, marche buteur, plafond en direct, et surtout le TYPE DE
-- RETOUR (`bigint`, que le client lit tel quel) — ne bouge pas d'une ligne.
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
  v_press bigint;
  v_max   integer;
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

  -- LE PLAFOND DU JOUEUR, et non plus un 1 000 ecrit en dur. Il se lit sur
  -- SON solde de pressings : c'est le palier qui ouvre le droit de miser
  -- gros, comme c'est lui qui impose le risque de perdre des pressings.
  select pressings into v_press from public.profiles where id = v_user;
  v_max := public.mise_max_du_palier(coalesce(v_press, 0));
  if p_stake is null or p_stake < 1 or p_stake > v_max then
    raise exception 'Mise hors limites (maximum % au palier %)',
      v_max, public.palier_de(coalesce(v_press, 0)) using errcode = 'P0006';
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
