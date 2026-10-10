-- 022 — Un joueur ne peut plus s'écrire des pressings, et choisit son avatar.
--
-- ══ 1. LA FAILLE ═════════════════════════════════════════════════════════
-- `profiles_write_own` autorise un joueur à modifier SA ligne :
--     for update using (auth.uid() = id)
-- Une policy RLS ne restreint pas les COLONNES — seuls les GRANTs le font,
-- et `anon` comme `authenticated` avaient le droit d'écrire sur les 19
-- colonnes. Dont `crampons`, `pressings`, `ranking_points`, `claim_streak`
-- et `analyses_offertes`.
--
-- Autrement dit : avec la clé publique du site, qui est dans le paquet
-- JavaScript, n'importe quel compte gratuit pouvait se poser un million de
-- pressings depuis la console du navigateur et prendre la tête du
-- classement. Vérifié le 10/10/2026 par une écriture non destructive sous
-- le rôle `authenticated` : acceptée, une ligne modifiée.
--
-- Le correctif ne touche pas la policy — elle est juste — mais les droits :
-- une seule colonne reste écrivable depuis le navigateur, `alias`, la seule
-- que l'application écrive en direct (`updateAlias`). Tout le reste passe
-- déjà par des fonctions SECURITY DEFINER, qui s'exécutent avec les droits
-- du propriétaire et ne sont donc pas affectées.
revoke update on public.profiles from anon, authenticated;
grant update (alias) on public.profiles to authenticated;

-- `with check` en plus du `using` : sans lui, rien n'empêcherait d'écrire
-- une ligne dont l'`id` n'est plus le sien.
drop policy if exists "profiles_write_own" on public.profiles;
create policy "profiles_write_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ══ 2. LES AVATARS ═══════════════════════════════════════════════════════
-- Sept rendus 3D déposés par Mehdi dans `public/media/icones/profile/`.
-- Ils remplacent la pastille à l'initiale du pseudo, et c'est le joueur qui
-- choisit le sien.
--
-- UNE TABLE PLUTÔT QU'UNE LISTE EN DUR. La liste doit exister à deux
-- endroits : le sélecteur l'affiche, et la base valide le choix. Deux
-- copies finiraient par diverger — en ajouter un deviendrait un
-- déploiement. Ici, une ligne insérée suffit.
create table if not exists public.avatars (
  cle   text primary key,
  ordre integer not null default 0
);

alter table public.avatars enable row level security;
drop policy if exists "avatars_read" on public.avatars;
create policy "avatars_read" on public.avatars for select using (true);
grant select on public.avatars to anon, authenticated;

insert into public.avatars (cle, ordre) values
  ('boy-with-vr', 1),
  ('afro-man-with-vr', 2),
  ('man-with-hat', 3),
  ('man-with-t-shirt', 4),
  ('short-hair-man-with-bucket-hat', 5),
  ('short-hair-man-with-sweater', 6),
  ('thief-with-black-hoodie', 7)
on conflict (cle) do nothing;

-- LE CHOIX PASSE PAR UNE FONCTION, PAS PAR UNE ÉCRITURE DIRECTE.
-- `avatar_url` s'affiche sur la vignette d'un joueur dans le classement,
-- donc chez TOUT LE MONDE. Laisser le navigateur y écrire une chaîne libre,
-- ce serait laisser n'importe qui faire charger l'image de son choix — ou
-- un pixel de traçage — par tous les visiteurs du classement. La fonction
-- n'accepte qu'une clé de la table, et compose l'adresse elle-même.
create or replace function public.choisir_avatar(p_cle text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_url text;
begin
  if v_user is null then
    raise exception 'Connexion requise' using errcode = 'P0004';
  end if;

  if p_cle is null or trim(p_cle) = '' then
    -- Revenir à l'initiale du pseudo est un choix comme un autre.
    update public.profiles pr set avatar_url = null where pr.id = v_user;
    return null;
  end if;

  if not exists (select 1 from public.avatars a where a.cle = trim(p_cle)) then
    raise exception 'Avatar inconnu' using errcode = 'P0020';
  end if;

  v_url := '/media/icones/profile/' || trim(p_cle) || '.png';
  update public.profiles pr set avatar_url = v_url where pr.id = v_user;
  return v_url;
end;
$$;

grant execute on function public.choisir_avatar(text) to authenticated;

-- Les adresses déjà posées à la main dans la colonne ne sont pas effacées :
-- aucune ne l'a été jusqu'ici (vérifié), et un effacement aveugle casserait
-- un avatar légitime si l'hypothèse était fausse.
