-- 023 — Les avatars déménagent : `/media/avatars/`, plus `/media/icones/profile/`.
--
-- Cloudflare Pages servait `index.html` pour chacune des sept images, avec
-- un code 200 et un type `text/html` — pas une erreur, le repli SPA. Cause :
-- il existe déjà un FICHIER `media/icones/profile.svg` à côté du DOSSIER
-- `media/icones/profile/`. Les deux occupent le même chemin dans l'index des
-- ressources, et le dossier perd. Les fichiers étaient bien téléversés (599
-- sur 599), ils n'étaient simplement pas atteignables.
--
-- Rien à corriger dans les profils : personne n'avait encore choisi d'avatar
-- quand l'adresse était fausse. Le `update` ci-dessous est là pour le cas où
-- cette migration serait rejouée après coup.
update public.profiles
   set avatar_url = replace(avatar_url, '/media/icones/profile/', '/media/avatars/')
 where avatar_url like '/media/icones/profile/%';

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
    update public.profiles pr set avatar_url = null where pr.id = v_user;
    return null;
  end if;

  if not exists (select 1 from public.avatars a where a.cle = trim(p_cle)) then
    raise exception 'Avatar inconnu' using errcode = 'P0020';
  end if;

  v_url := '/media/avatars/' || trim(p_cle) || '.png';
  update public.profiles pr set avatar_url = v_url where pr.id = v_user;
  return v_url;
end;
$$;

grant execute on function public.choisir_avatar(text) to authenticated;
