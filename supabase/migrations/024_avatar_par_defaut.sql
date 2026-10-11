-- 024 — Tout le monde a une figure. Plus d'initiale.
--
-- « Enlève la vignette profil avec les initiales complètement, et par défaut
-- les nouveaux inscrits auront un des avatars aléatoirement » (Mehdi,
-- 2026-10-10).
--
-- ── POURQUOI EN BASE ET PAS DANS L'INTERFACE ──────────────────────────────
-- Tirer l'avatar au rendu donnerait une figure différente à chaque
-- rechargement, et une autre encore chez le voisin qui regarde le même
-- classement. Le tirage se fait UNE FOIS, à la création du compte, et il est
-- écrit — c'est l'avatar du joueur tant qu'il n'en choisit pas un autre.

create or replace function public.avatar_au_hasard()
returns text
language sql volatile set search_path = public as $$
  select '/media/avatars/' || a.cle || '.png'
    from public.avatars a
   order by random()
   limit 1;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, alias, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'alias',
      'fan_' || substr(new.id::text, 1, 6)
    ),
    public.avatar_au_hasard()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Les comptes déjà créés n'en avaient pas : ils seraient restés sans figure
-- maintenant que l'initiale disparaît.
update public.profiles
   set avatar_url = public.avatar_au_hasard()
 where avatar_url is null or trim(avatar_url) = '';
