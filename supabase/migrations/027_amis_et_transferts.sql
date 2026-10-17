-- 027 — les amis, et l'envoi de crampons entre joueurs
--
-- CE QU'ON AJOUTE (Mehdi, 17/10/2026). Le profil public n'existait pas : la
-- page /u/<slug> affichait le TABLEAU DE LA COUPE DU MONDE 2026, et son
-- identifiant venait de la table `brackets`. Rien n'y parlait du jeu.
--
-- Deux notions manquaient en base :
--   1. l'AMITIÉ entre deux joueurs. Jusqu'ici « ami » voulait dire « membre
--      du même groupe », et un joueur n'a droit qu'à un seul groupe (014).
--      Une relation directe permet d'envoyer des jetons à quelqu'un qui n'est
--      pas dans le sien.
--   2. le TRANSFERT de crampons.
--
-- ─── POURQUOI LE TRANSFERT EST UNE FONCTION, ET JAMAIS UNE ÉCRITURE ───────
-- Déplacer des jetons, c'est déplacer de la valeur. Le 12/10 un joueur
-- pouvait s'écrire des pressings parce que la policy autorisait sa ligne et
-- le GRANT toutes ses colonnes. On ne refait pas cette erreur : aucune
-- policy n'autorise d'écrire `crampons`, et le transfert passe par une
-- fonction `security definer` qui vérifie tout et journalise.

-- ─── LES AMITIÉS ──────────────────────────────────────────────────────────
-- Une seule ligne par paire, dans le sens de la demande. Les deux sens se
-- lisent par l'index ci-dessous.
create table if not exists public.amities (
  demandeur     uuid not null references public.profiles(id) on delete cascade,
  destinataire  uuid not null references public.profiles(id) on delete cascade,
  etat          text not null default 'en_attente'
                check (etat in ('en_attente', 'acceptee')),
  created_at    timestamptz not null default now(),
  repondu_at    timestamptz,
  primary key (demandeur, destinataire),
  -- On ne se demande pas soi-même en ami.
  constraint amities_pas_soi_meme check (demandeur <> destinataire)
);
create index if not exists amities_destinataire_idx on public.amities (destinataire);

alter table public.amities enable row level security;

-- Chacun ne voit que les liens qui le concernent.
drop policy if exists amities_lecture on public.amities;
create policy amities_lecture on public.amities
  for select using (auth.uid() = demandeur or auth.uid() = destinataire);

-- On ne peut demander qu'EN SON NOM. L'acceptation et le retrait passent par
-- les fonctions ci-dessous : aucune policy d'écriture directe.
drop policy if exists amities_demande on public.amities;
create policy amities_demande on public.amities
  for insert with check (auth.uid() = demandeur and etat = 'en_attente');

drop policy if exists amities_retrait on public.amities;
create policy amities_retrait on public.amities
  for delete using (auth.uid() = demandeur or auth.uid() = destinataire);

-- ─── LE JOURNAL DES TRANSFERTS ────────────────────────────────────────────
-- Il ne sert pas qu'à l'historique : c'est lui qui porte le plafond
-- quotidien, et il rend tout abus relisible après coup.
create table if not exists public.transferts_crampons (
  id            bigserial primary key,
  expediteur    uuid not null references public.profiles(id) on delete cascade,
  destinataire  uuid not null references public.profiles(id) on delete cascade,
  montant       integer not null check (montant > 0),
  created_at    timestamptz not null default now()
);
create index if not exists transferts_expediteur_idx
  on public.transferts_crampons (expediteur, created_at desc);
create index if not exists transferts_destinataire_idx
  on public.transferts_crampons (destinataire, created_at desc);

alter table public.transferts_crampons enable row level security;

drop policy if exists transferts_lecture on public.transferts_crampons;
create policy transferts_lecture on public.transferts_crampons
  for select using (auth.uid() = expediteur or auth.uid() = destinataire);
-- Aucune policy d'écriture : seule la fonction écrit ici.

-- ─── RÉPONDRE À UNE DEMANDE ───────────────────────────────────────────────
-- Seul le DESTINATAIRE accepte, et seulement une demande qui lui est
-- adressée. Une policy d'update aurait suffi, mais une fonction dit en un
-- seul endroit ce qui est permis, et pose `repondu_at` sans que le client
-- puisse mentir dessus.
create or replace function public.repondre_ami(p_demandeur uuid, p_accepter boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'connexion requise';
  end if;

  if p_accepter then
    update public.amities
       set etat = 'acceptee', repondu_at = now()
     where demandeur = p_demandeur
       and destinataire = auth.uid()
       and etat = 'en_attente';
    if not found then
      raise exception 'aucune demande en attente de ce joueur';
    end if;
  else
    delete from public.amities
     where demandeur = p_demandeur and destinataire = auth.uid();
  end if;
end $$;

revoke all on function public.repondre_ami(uuid, boolean) from public;
grant execute on function public.repondre_ami(uuid, boolean) to authenticated;

-- ─── MES AMIS, ET LES DEMANDES EN COURS ───────────────────────────────────
-- Rend les deux sens d'un coup : `sens` dit si la demande vient de moi ou
-- de l'autre, ce qui permet d'afficher « en attente » ou « à accepter » sans
-- deuxième requête.
create or replace function public.mes_amis()
returns table (
  id          uuid,
  alias       text,
  avatar_url  text,
  tier        text,
  points      bigint,
  etat        text,
  sens        text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.alias, p.avatar_url, p.tier,
         coalesce(p.ranking_points, 0) as points,
         a.etat,
         case when a.demandeur = auth.uid() then 'envoyee' else 'recue' end as sens
    from public.amities a
    join public.profiles p
      on p.id = case when a.demandeur = auth.uid() then a.destinataire else a.demandeur end
   where auth.uid() in (a.demandeur, a.destinataire)
   order by (a.etat = 'en_attente') desc, p.alias
$$;

revoke all on function public.mes_amis() from public;
grant execute on function public.mes_amis() to authenticated;

-- ─── ENVOYER DES CRAMPONS ─────────────────────────────────────────────────
-- Les garde-fous (Mehdi, 17/10/2026 : « prudent »). Ils ne visent pas le
-- joueur honnête mais la ferme à faux comptes : créer dix comptes, ramasser
-- dix bonus de bienvenue et tout verser sur un seul.
--
--   · AMI ACCEPTÉ obligatoire — on n'envoie pas à un inconnu ;
--   · COMPTE DE 7 JOURS côté expéditeur — un compte créé à l'instant ne peut
--     rien transférer, ce qui coupe la ferme à sa racine ;
--   · 10 CRAMPONS MINIMUM — évite le bruit d'un transfert par clic ;
--   · 500 PAR ENVOI et 1000 PAR JOUR — le bonus de bienvenue étant de 100,
--     ces bornes laissent un vrai cadeau possible sans permettre un siphon ;
--   · SOLDE VÉRIFIÉ SOUS VERROU — `for update` empêche deux envois simultanés
--     de passer tous les deux sur le même solde.
create or replace function public.envoyer_crampons(p_destinataire uuid, p_montant integer)
returns table (solde integer)
language plpgsql security definer set search_path = public as $$
declare
  v_moi        uuid := auth.uid();
  v_solde      integer;
  v_cree       timestamptz;
  v_jour       integer;
begin
  if v_moi is null then
    raise exception 'connexion requise';
  end if;
  if p_destinataire = v_moi then
    raise exception 'on ne s''envoie pas de crampons a soi-meme';
  end if;
  if p_montant is null or p_montant < 10 then
    raise exception 'minimum 10 crampons';
  end if;
  if p_montant > 500 then
    raise exception 'maximum 500 crampons par envoi';
  end if;

  -- Ami accepte, dans un sens ou dans l'autre.
  if not exists (
    select 1 from public.amities a
     where a.etat = 'acceptee'
       and ((a.demandeur = v_moi and a.destinataire = p_destinataire)
         or (a.demandeur = p_destinataire and a.destinataire = v_moi))
  ) then
    raise exception 'ce joueur n''est pas dans vos amis';
  end if;

  -- Age du compte : la ferme a faux comptes meurt ici.
  select created_at into v_cree from public.profiles where id = v_moi;
  if v_cree is null or v_cree > now() - interval '7 days' then
    raise exception 'votre compte doit avoir 7 jours pour envoyer des crampons';
  end if;

  -- Plafond du jour, lu dans le journal.
  select coalesce(sum(t.montant), 0) into v_jour
    from public.transferts_crampons t
   where t.expediteur = v_moi
     and t.created_at >= date_trunc('day', now());
  if v_jour + p_montant > 1000 then
    raise exception 'plafond de 1000 crampons par jour atteint';
  end if;

  -- Le solde, sous verrou.
  select p.crampons into v_solde from public.profiles p where p.id = v_moi for update;
  if v_solde is null or v_solde < p_montant then
    raise exception 'solde insuffisant';
  end if;

  update public.profiles set crampons = crampons - p_montant where id = v_moi;
  update public.profiles set crampons = crampons + p_montant where id = p_destinataire;
  insert into public.transferts_crampons (expediteur, destinataire, montant)
       values (v_moi, p_destinataire, p_montant);

  return query select (v_solde - p_montant)::integer;
end $$;

revoke all on function public.envoyer_crampons(uuid, integer) from public;
grant execute on function public.envoyer_crampons(uuid, integer) to authenticated;

-- ─── LE PROFIL PUBLIC ─────────────────────────────────────────────────────
-- Par ALIAS, qui est deja unique, et non par le slug du tableau de la Coupe
-- du monde : celui-ci venait d'une autre epoque et ne designait pas le joueur.
-- Les anciens liens restent servis par la page, qui essaie l'alias d'abord.
--
-- Ne rend que du PUBLIC : ni courriel, ni solde. Le solde d'un joueur ne
-- regarde que lui.
create or replace function public.profil_public(p_alias text)
returns table (
  id            uuid,
  alias         text,
  avatar_url    text,
  tier          text,
  points        bigint,
  rang          integer,
  joueurs       integer,
  paris_total   integer,
  gagnes        integer,
  serie         integer,
  meilleure_serie integer,
  groupe        text,
  membre_depuis timestamptz
)
language sql stable security definer set search_path = public as $$
  with moi as (
    select p.* from public.profiles p where lower(p.alias) = lower(p_alias) limit 1
  )
  select m.id, m.alias, m.avatar_url, m.tier,
         coalesce(m.ranking_points, 0) as points,
         (1 + (select count(*) from public.profiles q
                where coalesce(q.ranking_points, 0) > coalesce(m.ranking_points, 0)))::integer as rang,
         (select count(*) from public.profiles q
           where coalesce(q.ranking_points, 0) > 0)::integer as joueurs,
         (coalesce((select count(*) from public.bet_slips s where s.user_id = m.id), 0)
        + coalesce((select count(*) from public.bets b where b.user_id = m.id), 0))::integer as paris_total,
         (coalesce((select count(*) from public.bet_slips s
                     where s.user_id = m.id and s.status = 'won'), 0)
        + coalesce((select count(*) from public.bets b
                     where b.user_id = m.id and b.status = 'won'), 0))::integer as gagnes,
         m.current_streak, m.best_streak,
         (select l.name from public.league_members lm
            join public.leagues l on l.id = lm.league_id
           where lm.user_id = m.id limit 1) as groupe,
         m.created_at
    from moi m
$$;

revoke all on function public.profil_public(text) from public;
grant execute on function public.profil_public(text) to anon, authenticated;
