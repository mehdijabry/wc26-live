-- 036 — UNE DEMANDE D'AMI RÉPONDUE DOIT DISPARAÎTRE DE LA CLOCHE
--
-- Mehdi, 17/10/2026 : « j'ai déjà accepté Saad, mais la notif reste comme
-- ça, figée, même si je ferme l'app complètement puis que je recharge. »
--
-- ─── POURQUOI ELLE REVENAIT ───────────────────────────────────────────────
-- `repondre_ami` (migration 027) ne touche QUE la table `amities` : elle
-- passe l'amitié à « acceptee », et c'est tout. La notification de type
-- `ami_demande`, elle, reste en base. L'interface la retirait de la liste
-- affichée après la réponse — ce qui donnait l'illusion que c'était réglé
-- — mais le rechargement la relisait depuis la base, intacte.
--
-- C'est pire qu'un simple reliquat : ces notifications sont délibérément
-- exclues de « tout marquer lu » (migration 030), parce qu'une demande
-- sans réponse doit rester visible. Une fois répondue, plus rien ne
-- pouvait donc la faire disparaître. Elle était là pour toujours.
--
-- ─── OÙ ON CORRIGE, ET POURQUOI PAS AILLEURS ──────────────────────────────
-- Dans le DÉCLENCHEUR, pas dans `repondre_ami`. Une amitié peut changer
-- d'état par d'autres chemins — une acceptation posée à la main en SQL, un
-- correctif, une fonction future — et c'est la table qui fait foi. Le
-- déclencheur voit tous les chemins ; la fonction n'en voit qu'un.
--
-- Il gagne aussi une branche DELETE : refuser une demande efface la ligne
-- d'`amities` (027), et sa notification devait partir avec elle.

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

  elsif tg_op = 'UPDATE' and new.etat = 'acceptee' and old.etat <> 'acceptee' then
    -- LA DEMANDE EST RÉPONDUE : elle quitte la cloche de celui qui vient
    -- de répondre. Le `donnees->>'id'` porte l'identifiant du demandeur,
    -- posé à l'insertion ci-dessus.
    delete from public.notifications
     where user_id = new.destinataire
       and kind = 'ami_demande'
       and donnees->>'id' = new.demandeur::text;

    -- Et c'est le DEMANDEUR qu'on prévient de l'acceptation.
    select alias, avatar_url into v_alias, v_avatar from public.profiles where id = new.destinataire;
    perform public.notifier(
      new.demandeur, 'ami_acceptee',
      jsonb_build_object('alias', v_alias, 'avatar', v_avatar, 'id', new.destinataire),
      '/u/' || coalesce(v_alias, '')
    );

  elsif tg_op = 'DELETE' then
    -- Refus (ou retrait de la demande par son auteur) : la notification
    -- n'a plus d'objet. Pas de notification de refus — on ne prévient
    -- personne qu'il a été éconduit.
    delete from public.notifications
     where user_id = old.destinataire
       and kind = 'ami_demande'
       and donnees->>'id' = old.demandeur::text;
  end if;
  return null;
end $$;

drop trigger if exists amities_notif on public.amities;
create trigger amities_notif
  after insert or update or delete on public.amities
  for each row execute function public.notif_amitie();

-- ─── LES RELIQUATS DÉJÀ EN BASE ───────────────────────────────────────────
-- Celui de Saad, et tous ceux de la même espèce : une notification de
-- demande dont l'amitié n'est PLUS en attente — acceptée depuis, ou
-- disparue. Sans ce nettoyage, le correctif ne vaudrait que pour l'avenir
-- et la cloche de Mehdi resterait figée.
delete from public.notifications n
 where n.kind = 'ami_demande'
   and not exists (
     select 1 from public.amities a
      where a.destinataire = n.user_id
        and a.demandeur::text = n.donnees->>'id'
        and a.etat = 'en_attente'
   );
