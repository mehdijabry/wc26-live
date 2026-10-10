-- 020 — `claim_streak` ne vaut plus 0 pour dire « sept ».
--
-- ── LE DÉFAUT ─────────────────────────────────────────────────────────────
-- `claim_daily()` écrivait `claim_streak = 0` après le septième jour, pour
-- signifier « la semaine recommence ». La valeur 0 voulait donc dire DEUX
-- choses incompatibles : « jamais réclamé » et « semaine terminée ».
--
-- L'interface devait trancher, et elle le faisait avec un `|| 7` — un zéro
-- devenait sept. Mesuré le 10/10/2026 : le compte de Mehdi affichait une
-- série pleine 7/7 pendant qu'Otmane, au même instant, affichait 1/7 avec
-- un `claim_streak` de 1. La valeur affichée était juste ce jour-là, mais
-- par un raccourci qui ne peut pas rester : n'importe quel chemin futur
-- laissant un 0 ferait afficher une semaine complète à quelqu'un qui vient
-- d'arriver.
--
-- ── LA CORRECTION ─────────────────────────────────────────────────────────
-- On stocke le jour réellement réclamé, 1 à 7. La règle de continuation ne
-- change pas d'un pouce : elle teste déjà `between 1 and 6`, donc un 7 fait
-- repartir à 1 exactement comme le faisait un 0. Le comportement du jeu est
-- identique ; seule l'ambiguïté disparaît.

-- `create or replace` refuse de changer le type de retour, et il faut
-- reprendre EXACTEMENT les noms de colonnes de la 010 : le front lit `solde`
-- et `deja_reclame`, pas `crampons` et `deja`.
drop function if exists public.claim_daily();
create or replace function public.claim_daily()
returns table (solde integer, deja_reclame boolean, jour integer, bonus integer)
language plpgsql security definer set search_path = public as $$
declare
  p record;
  v_jour integer;
  v_gain integer;
  v_bonus integer := 0;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Profil introuvable' using errcode = 'P0004';
  end if;

  if p.last_claim = current_date then
    return query select p.crampons, true, greatest(p.claim_streak, 1), 0;
    return;
  end if;

  -- La série ne tient que si la veille a été réclamée. Sinon on repart à un —
  -- c'est ce qui en fait une série et pas un compteur. Un 7 ne continue pas :
  -- la semaine est finie, on recommence.
  if p.last_claim = current_date - 1 and p.claim_streak between 1 and 6 then
    v_jour := p.claim_streak + 1;
  else
    v_jour := 1;
  end if;

  v_gain := 4 + v_jour;                     -- 5 le premier jour, 11 le septième

  if v_jour = 7 then
    v_bonus := 100;
  end if;

  update public.profiles
     set crampons = p.crampons + v_gain,
         pressings = p.pressings + v_bonus,
         -- ON ÉCRIT LE JOUR, PAS ZÉRO. Voir l'en-tête.
         claim_streak = v_jour,
         last_claim = current_date
   where id = p.id;

  return query select p.crampons + v_gain, false, v_jour, v_bonus;
end;
$$;

grant execute on function public.claim_daily() to authenticated;

-- Les comptes déjà passés par un septième jour portent un 0 qui veut dire
-- sept. On le réécrit. Un compte qui n'a JAMAIS réclamé garde son 0, et
-- c'est maintenant sans ambiguïté : `last_claim` est nul.
update public.profiles
   set claim_streak = 7
 where claim_streak = 0 and last_claim is not null;
