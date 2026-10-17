/**
 * CHERCHER UN JOUEUR, POUR L'AJOUTER EN AMI.
 *
 * Vit dans le menu de gestion de profil : c'est la qu'on gere ses relations,
 * pas dans le classement ou l'on regarde des scores (Mehdi, 17/10/2026).
 *
 * Interroge `chercher_joueurs`, qui cherche par ALIAS et par prefixe — jamais
 * par courriel : personne ne doit pouvoir verifier si une adresse est
 * inscrite (migration 028).
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import Avatar from './Avatar'

type Trouve = { alias: string; avatar_url: string | null; tier: string; points: number }

export function RechercheJoueurs({ onNaviguer }: { onNaviguer?: () => void } = {}) {
  const t = useT()
  const [q, setQ] = useState('')
  const [res, setRes] = useState<Trouve[]>([])

  useEffect(() => {
    const terme = q.trim()
    if (!supabase || terme.length < 2) { setRes([]); return }
    // Un délai court : on ne part pas en base à chaque touche.
    const id = window.setTimeout(async () => {
      const { data } = await supabase!.rpc('chercher_joueurs', { p_q: terme })
      setRes((data ?? []) as Trouve[])
    }, 250)
    return () => window.clearTimeout(id)
  }, [q])

  return (
    <div className="mb-5">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('Search a player')}
        className="w-full px-4 py-2.5 rounded-2xl glass border border-slate-300/30 bg-transparent text-sm"
      />
      {res.length > 0 && (
        <div className="mt-2 space-y-1">
          {res.map((j) => (
            <Link key={j.alias} to={`/u/${j.alias}`} onClick={onNaviguer}
              className="flex items-center gap-3 px-3 py-2 rounded-xl glass glass-hover">
              <Avatar alias={j.alias} url={j.avatar_url} graine={j.alias} taille={28} />
              <span className="flex-1 truncate text-sm font-semibold">{j.alias}</span>
              <span className="font-mono text-xs tabular-nums text-slate-500">{j.points}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

