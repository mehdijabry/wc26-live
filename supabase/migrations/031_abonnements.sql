-- 031 — SUIVRE quelqu'un, qui n'est pas DEVENIR SON AMI
--
-- Mehdi, 17/10/2026 : « ce bouton est différent du bouton ajouter : pour
-- ajouter il faut que l'autre accepte la demande ; pour le follow pas besoin
-- d'autorisation, l'autre reçoit juste une notif que x l'a follow ».
--
-- Les deux liens ne servent pas la même chose et ne doivent pas se mélanger :
--
--   · L'AMITIÉ est RÉCIPROQUE et demande un accord (migration 027). Elle
--     ouvre un droit réel — envoyer des crampons n'est possible qu'entre
--     amis — donc elle se demande et s'accepte.
--   · L'ABONNEMENT est À SENS UNIQUE et immédiat. Il n'ouvre aucun droit :
--     il dit « je veux voir ce que fait ce joueur ». La seule conséquence
--     pour l'autre est une notification, et le compteur d'abonnés qui monte.
--
-- Ne jamais donner à l'abonnement le moindre pouvoir sur le compte suivi :
-- c'est précisément parce qu'il n'en donne aucun qu'il peut se passer
-- d'autorisation.

create table if not exists public.abonnements (
  abonne     uuid not null references public.profiles(id) on delete cascade,
  suivi      uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (abonne, suivi),
  constraint abonnements_pas_soi_meme check (abonne <> suivi)
);
create index if not exists abonnements_suivi_idx on public.abonnements (suivi);

alter table public.abonnements enable row level security;

-- Chacun voit les liens qui le concernent : savoir si JE suis abonné, et qui
-- me suit. Le COMPTE d'abonnés d'un tiers, lui, passe par `profil_public`
-- qui est `security definer` — un compteur public n'oblige pas à ouvrir la
-- liste en lecture à tout le monde.
drop policy if exists abonnements_lecture on public.abonnements;
create policy abonnements_lecture on public.abonnements
  for select using (auth.uid() = abonne or auth.uid() = suivi);

-- On ne s'abonne qu'EN SON NOM. Rien d'autre à vérifier : il n'y a pas
-- d'accord à attendre.
drop policy if exists abonnements_suivre on public.abonnements;
create policy abonnements_suivre on public.abonnements
  for insert with check (auth.uid() = abonne);

-- Se désabonner soi-même ; et retirer un abonné de chez soi, ce qui est la
-- seule défense possible contre un suiveur indésirable.
drop policy if exists abonnements_retrait on public.abonnements;
create policy abonnements_retrait on public.abonnements
  for delete using (auth.uid() = abonne or auth.uid() = suivi);

revoke all on public.abonnements from anon, authenticated;
grant select, insert, delete on public.abonnements to authenticated;

-- ─── LA NOTIFICATION ──────────────────────────────────────────────────────
-- « x vous suit ». Elle part du déclencheur et non du client, pour la même
-- raison que les autres (030) : le client pourrait ne pas l'envoyer.
create or replace function public.notif_abonnement() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_alias text; v_avatar text;
begin
  select alias, avatar_url into v_alias, v_avatar from public.profiles where id = new.abonne;
  perform public.notifier(
    new.suivi, 'nouvel_abonne',
    jsonb_build_object('alias', v_alias, 'avatar', v_avatar, 'id', new.abonne),
    '/u/' || coalesce(v_alias, ''));
  return null;
end $$;

drop trigger if exists abonnements_notif on public.abonnements;
create trigger abonnements_notif
  after insert on public.abonnements
  for each row execute function public.notif_abonnement();

-- ─── LE PROFIL PUBLIC APPREND À COMPTER SES ABONNÉS ───────────────────────
-- `create or replace` refuse de changer le type de retour (42P13) : on
-- supprime d'abord, comme en 029.
drop function if exists public.profil_public(text);

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
  membre_depuis timestamptz,
  copieurs      integer,
  abonnes       integer,
  abonnements   integer,
  je_suis_abonne boolean
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
         m.created_at,
         (select count(distinct c.copieur)
            from public.copies_paris c where c.auteur = m.id)::integer as copieurs,
         (select count(*) from public.abonnements a where a.suivi = m.id)::integer as abonnes,
         (select count(*) from public.abonnements a where a.abonne = m.id)::integer as abonnements,
         -- Lu ici plutôt que par une seconde requête du client : la fonction
         -- connaît déjà `auth.uid()`, et le bouton doit afficher le bon état
         -- dès le premier rendu.
         exists (select 1 from public.abonnements a
                  where a.abonne = auth.uid() and a.suivi = m.id) as je_suis_abonne
    from moi m
$$;

revoke all on function public.profil_public(text) from public;
grant execute on function public.profil_public(text) to anon, authenticated;

-- ─── S'ABONNER, SE DÉSABONNER ─────────────────────────────────────────────
-- Les policies suffiraient, mais une fonction rend le compteur à jour dans
-- la même aller-retour : le bouton n'a pas à deviner.
create or replace function public.suivre(p_cible uuid, p_suivre boolean)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_moi uuid := auth.uid(); v_n integer;
begin
  if v_moi is null then raise exception 'connexion requise'; end if;
  if p_cible is null or p_cible = v_moi then
    raise exception 'on ne se suit pas soi-meme';
  end if;

  if p_suivre then
    insert into public.abonnements (abonne, suivi) values (v_moi, p_cible)
    on conflict do nothing;
  else
    delete from public.abonnements where abonne = v_moi and suivi = p_cible;
  end if;

  select count(*)::integer into v_n from public.abonnements where suivi = p_cible;
  return v_n;
end $$;

revoke all on function public.suivre(uuid, boolean) from public;
grant execute on function public.suivre(uuid, boolean) to authenticated;

-- ─── MES ABONNEMENTS ──────────────────────────────────────────────────────
-- Qui je suis, et qui me suit — deux listes dans une, `sens` tranche.
create or replace function public.mes_abonnements()
returns table (id uuid, alias text, avatar_url text, tier text, sens text)
language sql stable security definer set search_path = public as $$
  select p.id, p.alias, p.avatar_url, p.tier, 'suivi'::text
    from public.abonnements a join public.profiles p on p.id = a.suivi
   where a.abonne = auth.uid()
  union all
  select p.id, p.alias, p.avatar_url, p.tier, 'abonne'::text
    from public.abonnements a join public.profiles p on p.id = a.abonne
   where a.suivi = auth.uid()
$$;

revoke all on function public.mes_abonnements() from public;
grant execute on function public.mes_abonnements() to authenticated;
