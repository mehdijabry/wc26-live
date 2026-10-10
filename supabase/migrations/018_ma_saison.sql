-- 018 — « Ma saison » : la seule ligne du classement qui intéresse le joueur.
--
-- ── POURQUOI UNE FONCTION ET PAS UNE LECTURE DE PROFIL ────────────────────
-- La vue `leaderboard` est plafonnée à 100 lignes. Un joueur hors du top 100
-- ne s'y voyait donc pas du tout, et la page lui laissait croire qu'il
-- n'avait aucun point. Son rang réel se compte en base, pas dans la liste
-- qu'on a réussi à télécharger.
--
-- ── CE QUE LA CARTE DOIT POUVOIR DIRE ─────────────────────────────────────
-- Mon rang, mes points, et où j'en suis des cinq paris qui débloquent les
-- prix du groupe cette semaine. Ces trois chiffres viennent de trois
-- endroits différents : les regrouper ici évite trois allers-retours au
-- chargement de la section.

create or replace function public.ma_saison()
returns table (
  points          bigint,
  rang            integer,
  joueurs         integer,
  paris_semaine   integer,
  paris_total     integer,
  gagnes          integer
)
language sql stable security definer set search_path = public as $$
  with moi as (
    select p.id, coalesce(p.ranking_points, 0) as pts
      from public.profiles p
     where p.id = auth.uid()
  )
  select m.pts,
         -- Le rang est « combien de joueurs me devancent, plus un ». À égalité
         -- de points on partage la place, ce qui est le comportement attendu
         -- d'un classement sportif.
         (1 + (select count(*) from public.profiles q
                where coalesce(q.ranking_points, 0) > m.pts))::integer,
         (select count(*) from public.profiles q
           where coalesce(q.ranking_points, 0) > 0)::integer,
         public.nb_paris(m.id, public.debut_semaine(),
                         public.debut_semaine() + interval '7 days'),
         (coalesce((select count(*) from public.bet_slips s
                     where s.user_id = m.id), 0)
        + coalesce((select count(*) from public.bets b
                     where b.user_id = m.id), 0))::integer,
         (coalesce((select count(*) from public.bet_slips s
                     where s.user_id = m.id and s.status = 'won'), 0)
        + coalesce((select count(*) from public.bets b
                     where b.user_id = m.id and b.status = 'won'), 0))::integer
    from moi m;
$$;

revoke all on function public.ma_saison() from public;
grant execute on function public.ma_saison() to authenticated;

-- `nb_paris` n'avait jamais reçu son grant : la ligne qui suivait sa création
-- dans la migration 013 accordait `a_parie` une seconde fois. Sans
-- conséquence jusqu'ici — ses deux appelants sont des fonctions SECURITY
-- DEFINER — mais autant la réparer.
grant execute on function public.nb_paris(uuid, timestamptz, timestamptz) to anon, authenticated;
