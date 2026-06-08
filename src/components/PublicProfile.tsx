import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BracketPoster, type BracketPosterData } from './BracketPoster'
import { Ad } from './AdSlot'
import type { GroupLetter } from '../store/bracket'

type PublicBracket = {
  user_id: string
  alias: string
  country: string | null
  tier: string
  share_slug: string
  group_standings: Record<string, string[]>
  third_place_advancing: string[]
  ko_winners: Record<string, string>
  third_place_winner: string | null
  final_winner: string | null
  total_points: number | null
  updated_at: string
}

/**
 * Public page for a published bracket. Renders the same FootMercato-style
 * poster as the PNG export so anyone landing on /u/{slug} sees exactly
 * what the owner downloaded / shared. Was an ad-hoc layout before that
 * looked nothing like the export — user complaint:
 *   « c'est bon mais ca affiche l'ancien affichage pas comme l'image
 *     téléchargée ».
 */
export function PublicProfile({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicBracket | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      const { data, error } = await supabase
        .from('public_brackets')
        .select('*')
        .eq('share_slug', slug)
        .maybeSingle()
      setLoading(false)
      if (error || !data) {
        setNotFound(true)
        return
      }
      setData(data as PublicBracket)
    })()
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center text-slate-500">
        Loading bracket…
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center text-center px-6">
        <div className="text-5xl mb-3">🤷</div>
        <div className="font-display text-2xl mb-2">No bracket here</div>
        <div className="text-sm text-slate-500">
          The user <code className="text-accent-gold">{slug}</code> hasn&apos;t published their bracket yet.
        </div>
        <Link to="/" className="mt-6 px-5 py-2 rounded-full bg-accent-gold text-ink-900 text-sm font-semibold">
          ← Back to WC26 Live
        </Link>
      </div>
    )
  }

  if (!data) return null

  const posterData: BracketPosterData = {
    alias: data.alias,
    groupStandings: data.group_standings as Partial<Record<GroupLetter, string[]>>,
    thirdPlaceAdvancing: data.third_place_advancing,
    koWinners: data.ko_winners,
    thirdPlaceWinner: data.third_place_winner,
    finalWinner: data.final_winner,
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-svh pb-12">
      {/* Top bar with hub link + share copy */}
      <header className="border-b border-slate-200/70 py-4">
        <div className="container max-w-6xl mx-auto px-6 flex items-center justify-between flex-wrap gap-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/wc26-emblem.svg" alt="" className="w-7 h-7" />
            <span className="font-display font-bold tracking-tight">
              WC<span className="text-accent-gold">26</span> Live
            </span>
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <span className="font-mono text-slate-500">
              {data.tier} · {data.total_points ?? 0} pts · updated {new Date(data.updated_at).toLocaleDateString()}
            </span>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href)
              }}
              className="px-3 py-1.5 rounded-full bg-accent-gold/15 hover:bg-accent-gold/25 text-accent-gold font-semibold transition-colors"
              title="Copy this bracket URL"
            >
              🔗 Copy link
            </button>
            <Link to="/bracket" className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">
              Make your own →
            </Link>
          </div>
        </div>
      </header>

      {/* The poster itself — identical to the PNG download */}
      <div className="container mx-auto px-4 py-8">
        <div className="overflow-x-auto">
          <div className="min-w-[1400px] lg:min-w-[1800px] bg-[#0b0d12] rounded-2xl overflow-hidden shadow-2xl">
            <BracketPoster data={posterData} />
          </div>
        </div>
        <div className="mt-8 text-center text-[11px] font-mono text-slate-500">
          Scroll horizontally to see the full bracket. Want yours on this board?{' '}
          <Link to="/bracket" className="text-accent-gold hover:underline">
            → make a prediction
          </Link>
        </div>
        <Ad slot="profile-footer" className="mt-6" />
      </div>
    </motion.div>
  )
}
