-- 030 — les notifications
--
-- CE QUI MANQUAIT (Mehdi, 17/10/2026) : « j'ai envoyé une invitation, où
-- va-t-il la recevoir ?? ». Nulle part. Une demande d'ami n'existait que
-- dans `amities`, et il fallait tomber par hasard sur le profil du
-- demandeur pour la découvrir. Pareil pour un pari gagné ou des crampons
-- reçus : le jeu se passait sans jamais prévenir personne.
--
-- ─── POURQUOI ON NE STOCKE PAS DE PHRASE ──────────────────────────────────
-- Le site se lit en trois langues. Écrire « Karim veut être votre ami » en
-- base condamnerait un lecteur arabe à lire du français. On stocke donc le
-- TYPE et ses DONNÉES (`kind` + `donnees`), et l'interface compose la
-- phrase avec son dictionnaire. Le même enregistrement se lit dans les
-- trois langues, et une traduction corrigée corrige l'historique.
--
-- ─── POURQUOI DES DÉCLENCHEURS, ET PAS DU CODE CLIENT ─────────────────────
-- Une demande d'ami s'insère directement par le client (policy de la 027).
-- Si c'était au client de créer la notification, il lui suffirait de ne pas
-- la créer — ou d'en créer pour autrui. Les déclencheurs ci-dessous sont la
-- seule porte d'écriture : AUCUNE policy d'insertion n'existe sur la table.

create table if not exists public.notifications (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- 'ami_demande' | 'ami_acceptee' | 'crampons_recus' | 'pari_pose'
  -- | 'pari_gagne' | 'pari_perdu' | 'pari_annule' | 'pari_copie' | 'club'
  kind        text not null,
  donnees     jsonb not null default '{}'::jsonb,
  -- Route interne à ouvrir au clic, ex. '/u/Elpadrejale'. Jamais une URL
  -- externe : ce champ finit dans un <Link>.
  lien        text,
  lu          boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
-- L'index partiel sert la pastille du compteur, lue à chaque page.
create index if not exists notifications_non_lues_idx
  on public.notifications (user_id) where not lu;

alter table public.notifications enable row level security;

drop policy if exists notifications_lecture on public.notifications;
create policy notifications_lecture on public.notifications
  for select using (auth.uid() = user_id);

-- On peut marquer les SIENNES comme lues, et rien d'autre. Le `with check`
-- empêche de se les réattribuer en passant.
drop policy if exists notifications_marquer on public.notifications;
create policy notifications_marquer on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists notifications_effacer on public.notifications;
create policy notifications_effacer on public.notifications
  for delete using (auth.uid() = user_id);

-- Aucune policy d'INSERT : seules les fonctions ci-dessous écrivent.
-- Supabase accorde par défaut TOUS les droits de table à `anon` et
-- `authenticated` — sans ce revoke, le GRANT d'insertion existerait et il ne
-- manquerait qu'une policy pour écrire chez autrui. On reprend tout, puis on
-- rend exactement ce qu'il faut (voir la leçon de la 12/10 sur les colonnes).
revoke all on public.notifications from anon, authenticated;
-- L'UPDATE est accorde COLONNE PAR COLONNE. Une policy autorise la LIGNE,
-- jamais la colonne : avec un `grant update` complet, un joueur pouvait
-- reecrire le type et les donnees de sa propre notification. La lecon du
-- 12/10 (un joueur s'ecrivait des pressings) s'applique ici aussi.
grant select, delete on public.notifications to authenticated;
grant update (lu) on public.notifications to authenticated;

-- ─── LA PORTE D'ÉCRITURE ──────────────────────────────────────────────────
create or replace function public.notifier(
  p_user uuid, p_kind text, p_donnees jsonb default '{}'::jsonb, p_lien text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, kind, donnees, lien)
  values (p_user, p_kind, coalesce(p_donnees, '{}'::jsonb), p_lien);
end $$;

revoke all on function public.notifier(uuid, text, jsonb, text) from public, anon, authenticated;

-- ─── LECTURE ──────────────────────────────────────────────────────────────
drop function if exists public.mes_notifications(integer);
create or replace function public.mes_notifications(p_limite integer default 40)
returns table (
  id bigint, kind text, donnees jsonb, lien text, lu boolean, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select n.id, n.kind, n.donnees, n.lien, n.lu, n.created_at
    from public.notifications n
   where n.user_id = auth.uid()
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limite, 40), 100))
$$;

revoke all on function public.mes_notifications(integer) from public;
grant execute on function public.mes_notifications(integer) to authenticated;

drop function if exists public.notifs_non_lues();
create or replace function public.notifs_non_lues()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.notifications
   where user_id = auth.uid() and not lu
$$;

revoke all on function public.notifs_non_lues() from public;
grant execute on function public.notifs_non_lues() to authenticated;

-- Tout marquer lu. Passer par une fonction évite un UPDATE de masse envoyé
-- par le client avec un filtre qu'il choisit lui-même.
create or replace function public.marquer_notifs_lues()
returns void
language sql security definer set search_path = public as $$
  update public.notifications set lu = true
   where user_id = auth.uid() and not lu
$$;

revoke all on function public.marquer_notifs_lues() from public;
grant execute on function public.marquer_notifs_lues() to authenticated;

-- ─── LES DÉCLENCHEURS ─────────────────────────────────────────────────────

-- 1. UNE DEMANDE D'AMI ARRIVE. C'est la raison d'être de cette migration.
create or replace function public.notif_amitie() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_alias text; v_avatar text;
begin
  if tg_op = 'INSERT' then
    select alias, avatar_url into v_alias, v_avatar from public.profiles where id = new.demandeur;
    perform public.notifier(
      new.destinataire, 'ami_demande',
      jsonb_build_object('alias', v_alias, 'avatar', v_avatar, 'id', new.demandeur),
      '/u/' || coalesce(v_alias, '')
    );
  -- 2. ELLE EST ACCEPTÉE : c'est le DEMANDEUR qu'on prévient.
  elsif tg_op = 'UPDATE' and new.etat = 'acceptee' and old.etat <> 'acceptee' then
    select alias, avatar_url into v_alias, v_avatar from public.profiles where id = new.destinataire;
    perform public.notifier(
      new.demandeur, 'ami_acceptee',
      jsonb_build_object('alias', v_alias, 'avatar', v_avatar, 'id', new.destinataire),
      '/u/' || coalesce(v_alias, '')
    );
  end if;
  return null;
end $$;

drop trigger if exists amities_notif on public.amities;
create trigger amities_notif
  after insert or update on public.amities
  for each row execute function public.notif_amitie();

-- 3. DES CRAMPONS ARRIVENT.
create or replace function public.notif_transfert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_alias text;
begin
  select alias into v_alias from public.profiles where id = new.expediteur;
  perform public.notifier(
    new.destinataire, 'crampons_recus',
    jsonb_build_object('alias', v_alias, 'montant', new.montant),
    '/u/' || coalesce(v_alias, '')
  );
  return null;
end $$;

drop trigger if exists transferts_notif on public.transferts_crampons;
create trigger transferts_notif
  after insert on public.transferts_crampons
  for each row execute function public.notif_transfert();

-- 4. UN BULLETIN EST POSÉ, PUIS RÉGLÉ.
--
-- Le pari posé se notifie aussi (Mehdi : « leurs paris joué gagné ou perdu »).
-- Il fait office d'accusé de réception : le joueur retrouve dans la même
-- liste ce qu'il a engagé et ce que ça a donné.
create or replace function public.notif_bulletin() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_jambes integer;
begin
  if tg_op = 'INSERT' then
    perform public.notifier(
      new.user_id, 'pari_pose',
      jsonb_build_object('slip', new.id, 'mise', new.stake, 'cote', new.odds),
      '/my-bets'
    );
    return null;
  end if;

  if new.status = old.status or old.status <> 'open' then
    return null;
  end if;

  select count(*)::integer into v_jambes from public.bet_legs where slip_id = new.id;

  if new.status = 'won' then
    perform public.notifier(
      new.user_id, 'pari_gagne',
      jsonb_build_object('slip', new.id, 'mise', new.stake, 'cote', new.odds,
                         'gain', coalesce(new.payout, 0), 'jambes', v_jambes),
      '/my-bets');
  elsif new.status = 'lost' then
    perform public.notifier(
      new.user_id, 'pari_perdu',
      jsonb_build_object('slip', new.id, 'mise', new.stake, 'cote', new.odds, 'jambes', v_jambes),
      '/my-bets');
  elsif new.status = 'void' then
    perform public.notifier(
      new.user_id, 'pari_annule',
      jsonb_build_object('slip', new.id, 'mise', new.stake, 'jambes', v_jambes),
      '/my-bets');
  end if;
  return null;
end $$;

drop trigger if exists bet_slips_notif on public.bet_slips;
create trigger bet_slips_notif
  after insert or update of status on public.bet_slips
  for each row execute function public.notif_bulletin();

-- 5. QUELQU'UN COPIE MON PARI. C'est la popularité qui se construit : la
-- voir arriver vaut mieux qu'un compteur qu'on découvre un jour.
create or replace function public.notif_copie() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_alias text;
begin
  select alias into v_alias from public.profiles where id = new.copieur;
  perform public.notifier(
    new.auteur, 'pari_copie',
    jsonb_build_object('alias', v_alias, 'slip', new.slip_id),
    '/u/' || coalesce(v_alias, ''));
  return null;
end $$;

drop trigger if exists copies_notif on public.copies_paris;
create trigger copies_notif
  after insert on public.copies_paris
  for each row execute function public.notif_copie();

-- ─── LES CLUBS SUIVIS ─────────────────────────────────────────────────────
-- Les favoris vivaient dans le `localStorage` du navigateur, et ne
-- concernaient que des championnats. Une notification doit pouvoir partir
-- sans que le joueur soit devant son écran : elle a besoin d'une colonne.
alter table public.profiles add column if not exists clubs_suivis text[] not null default '{}';

-- Le joueur écrit SA liste, et rien d'autre : la fonction borne la taille
-- et nettoie les entrées. Vingt clubs suffisent largement.
create or replace function public.suivre_clubs(p_clubs text[])
returns text[]
language plpgsql security definer set search_path = public as $$
declare v_propre text[];
begin
  if auth.uid() is null then raise exception 'connexion requise'; end if;
  select array_agg(distinct x) into v_propre
    from unnest(coalesce(p_clubs, '{}')) as x
   where x is not null and length(btrim(x)) between 1 and 80;
  v_propre := coalesce(v_propre, '{}');
  if array_length(v_propre, 1) > 20 then
    v_propre := v_propre[1:20];
  end if;
  update public.profiles set clubs_suivis = v_propre where id = auth.uid();
  return v_propre;
end $$;

revoke all on function public.suivre_clubs(text[]) from public;
grant execute on function public.suivre_clubs(text[]) to authenticated;

-- Le worker appelle celle-ci avec la clé de service : une notification de
-- club part vers TOUS ceux qui le suivent, en une écriture.
create or replace function public.notifier_club(
  p_club text, p_donnees jsonb, p_lien text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  insert into public.notifications (user_id, kind, donnees, lien)
  select p.id, 'club', coalesce(p_donnees, '{}'::jsonb) || jsonb_build_object('club', p_club), p_lien
    from public.profiles p
   where p.clubs_suivis @> array[p_club]
     -- Jamais deux fois le même évènement pour le même club.
     and not exists (
       select 1 from public.notifications n
        where n.user_id = p.id and n.kind = 'club'
          and n.donnees->>'club' = p_club
          and n.donnees->>'cle' is not distinct from p_donnees->>'cle'
     );
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Le worker appelle avec la cle de SERVICE : il lui faut le droit nomme.
-- `revoke ... from public` ne laisse rien a service_role par heritage.
revoke all on function public.notifier_club(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.notifier_club(text, jsonb, text) to service_role;

-- Les clubs reellement suivis par au moins un joueur. Le worker ne balaie
-- que ceux-la : interroger ESPN pour trois cent soixante clubs quand douze
-- sont suivis serait du gaspillage a chaque tick du cron.
create or replace function public.clubs_a_surveiller()
returns table (club text, suiveurs integer)
language sql stable security definer set search_path = public as $$
  select c as club, count(*)::integer as suiveurs
    from public.profiles p, unnest(p.clubs_suivis) as c
   group by c
   order by count(*) desc
   limit 200
$$;

revoke all on function public.clubs_a_surveiller() from public, anon, authenticated;
grant execute on function public.clubs_a_surveiller() to service_role;

-- ─── MÉNAGE ───────────────────────────────────────────────────────────────
-- Une boîte qui ne se vide jamais finit par ne plus se lire. Trente jours,
-- et seulement ce qui est lu : une demande d'ami jamais vue ne disparaît pas.
create or replace function public.purger_notifications()
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from public.notifications
   where lu and created_at < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.purger_notifications() from public, anon, authenticated;
grant execute on function public.purger_notifications() to service_role;

-- ─── RATTRAPAGE ───────────────────────────────────────────────────────────
-- Les demandes d'ami déjà en attente sont arrivées AVANT ce déclencheur :
-- elles n'ont donc notifié personne, et c'est exactement le cas qui a motivé
-- cette migration (« j'ai envoyé une invitation, où va-t-il la recevoir ? »).
-- On les pose une fois, maintenant. Idempotent : relancer ce fichier ne
-- créera pas de doublon grâce au `not exists`.
insert into public.notifications (user_id, kind, donnees, lien)
select a.destinataire, 'ami_demande',
       jsonb_build_object('alias', p.alias, 'avatar', p.avatar_url, 'id', a.demandeur),
       '/u/' || coalesce(p.alias, '')
  from public.amities a
  join public.profiles p on p.id = a.demandeur
 where a.etat = 'en_attente'
   and not exists (
     select 1 from public.notifications n
      where n.user_id = a.destinataire and n.kind = 'ami_demande'
        and n.donnees->>'id' = a.demandeur::text
   );
