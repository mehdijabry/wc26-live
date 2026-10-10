-- 016 — le podium du jour d'un groupe
--
-- POURQUOI UNE FONCTION DE PLUS. `league_table()` classe sur les points
-- gagnés DEPUIS L'ADHÉSION de chacun — c'est ce qui rend une ligue jouable
-- quand on la rejoint tard. Les médailles, elles, sont quotidiennes : « il
-- faut être encore premier demain pour la garder ». Les deux classements ne
-- peuvent donc pas être le même, et dériver l'un de l'autre côté navigateur
-- serait faux.
--
-- Elle ne rend que le podium, pas tout le groupe : trois lignes suffisent à
-- poser trois médailles, et demander le classement complet du jour pour en
-- afficher trois serait du gaspillage sur une page qui se recharge souvent.
create or replace function public.podium_du_jour(p_slug text)
returns table (user_id uuid, rang integer, points bigint)
language sql stable security definer set search_path = public as $$
  with bornes as (
    select (current_date)::timestamptz as jour0, (current_date + 1)::timestamptz as jour1
  ),
  pts as (
    select mb.user_id,
           coalesce((select sum(e.points) from public.ranking_events e
                      where e.user_id = mb.user_id
                        and e.created_at >= b.jour0 and e.created_at < b.jour1), 0)::bigint as p
      from public.leagues l
      join public.league_members mb on mb.league_id = l.id
     cross join bornes b
     where l.slug = p_slug
  )
  select x.user_id,
         (select count(*) + 1 from pts y where y.p > x.p)::integer,
         x.p
    from pts x
   -- Zéro point n'est pas un podium : sans ce filtre, un groupe où personne
   -- n'a encore joué distribuerait trois médailles à des joueurs à zéro.
   where x.p > 0
   order by x.p desc
   limit 3;
$$;

grant execute on function public.podium_du_jour(text) to anon, authenticated;
