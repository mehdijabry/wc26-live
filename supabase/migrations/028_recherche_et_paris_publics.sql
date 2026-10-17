-- 028 — chercher un joueur, et lire ses paris
--
-- CE QU'ON AJOUTE (Mehdi, 17/10/2026) : pouvoir chercher un utilisateur,
-- ouvrir son profil, y voir ses paris en cours et son historique, et copier
-- un pari en cours.
--
-- ─── CE QUE ÇA CHANGE POUR LE JEU, ET QU'IL FAUT ASSUMER ─────────────────
-- Rendre les paris EN COURS visibles, c'est rendre une stratégie copiable.
-- C'est voulu — la copie est la fonctionnalité demandée — mais ce n'est pas
-- neutre : celui qui trouve une bonne cote ne la garde plus pour lui. Si un
-- jour il faut un réglage « profil privé », c'est ici qu'il se posera, par
-- une colonne sur `profiles` lue par les deux fonctions ci-dessous.
--
-- Rien n'est écrit par ces fonctions : elles LISENT. La copie, elle, passe
-- par `place_slip()` qui existe déjà et qui débite le copieur normalement.

-- ─── CHERCHER UN JOUEUR ───────────────────────────────────────────────────
-- Par alias seulement. Jamais par courriel : personne ne doit pouvoir
-- vérifier si une adresse est inscrite.
create or replace function public.chercher_joueurs(p_q text)
returns table (
  alias       text,
  avatar_url  text,
  tier        text,
  points      bigint
)
language sql stable security definer set search_path = public as $$
  select p.alias, p.avatar_url, p.tier, coalesce(p.ranking_points, 0)
    from public.profiles p
   where p.alias is not null
     and char_length(coalesce(p_q, '')) >= 2
     -- `ilike` sur un préfixe reste indexable et évite de rendre la base
     -- entière sur une recherche d'une lettre.
     and p.alias ilike p_q || '%'
   order by coalesce(p.ranking_points, 0) desc, p.alias
   limit 20
$$;

revoke all on function public.chercher_joueurs(text) from public;
grant execute on function public.chercher_joueurs(text) to anon, authenticated;

-- ─── LES PARIS D'UN JOUEUR ────────────────────────────────────────────────
-- Un bulletin par ligne, ses sélections dans un tableau JSON : une seule
-- requête au lieu de deux, et le client reçoit de quoi afficher ET copier.
--
-- `p_statut` vaut 'open' pour les paris en cours, ou null pour tout
-- l'historique, le plus récent d'abord.
create or replace function public.paris_publics(p_alias text, p_statut text default null)
returns table (
  id          bigint,
  stake       integer,
  odds        numeric,
  status      text,
  payout      bigint,
  created_at  timestamptz,
  legs        jsonb
)
language sql stable security definer set search_path = public as $$
  select s.id, s.stake, s.odds, s.status, s.payout, s.created_at,
         coalesce(
           (select jsonb_agg(jsonb_build_object(
                     'match_id', l.match_id,
                     'market',   l.market,
                     'pick',     l.pick,
                     'odds',     l.odds,
                     'status',   l.status)
                   order by l.id)
              from public.bet_legs l where l.slip_id = s.id),
           '[]'::jsonb) as legs
    from public.bet_slips s
    join public.profiles p on p.id = s.user_id
   where lower(p.alias) = lower(p_alias)
     and (p_statut is null or s.status = p_statut)
   order by s.created_at desc
   limit 40
$$;

revoke all on function public.paris_publics(text, text) from public;
grant execute on function public.paris_publics(text, text) to anon, authenticated;
