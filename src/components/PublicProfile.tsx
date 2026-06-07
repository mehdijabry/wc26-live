import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { teamByCode } from '../data/teams'
import { koMatchIds } from '../store/bracket'
import { cn } from '../lib/utils'

type PublicBracket = {
  id: number
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

  function tx(code: string | null | undefined) {
    if (!code) return { flag: '⚪️', name: 'TBD' }
    const t = teamByCode(code)
    return t ? { flag: t.flag, name: t.name } : { flag: '⚪️', name: code }
  }

  if (loading) {
    return <div className="min-h-svh flex items-center justify-center text-slate-500">Loading bracket…</div>
  }
  if (notFound) {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center text-center px-6">
        <div className="text-5xl mb-3">🤷</div>
        <div className="font-display text-2xl mb-2">No bracket here</div>
        <div className="text-sm text-slate-500">
          The user <code className="text-accent-gold">{slug}</code> hasn't published their bracket yet.
        </div>
        <a href="/" className="mt-6 px-5 py-2 rounded-full bg-accent-gold text-ink-900 text-sm font-semibold">← Back to WC26 Hub</a>
      </div>
    )
  }
  if (!data) return null

  const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'] as const

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-svh pb-12"
    >
      <header className="border-b border-white/5 py-6">
        <div className="container max-w-6xl mx-auto px-6 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <img src="/wc26-emblem.svg" alt="" className="w-8 h-8" />
            <span className="font-display font-bold tracking-tight">WC<span className="text-accent-gold">26</span> Hub</span>
          </a>
          <a href="/" className="text-sm text-slate-400 hover:text-white">← Hub</a>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-6 py-12">
        <div className="text-xs uppercase tracking-widest text-accent-gold font-mono">A bracket by</div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl mt-1">
          {data.alias}
          {data.country && <span className="text-slate-500 text-2xl ml-3">· {data.country}</span>}
        </h1>
        <div className="mt-2 text-xs font-mono text-slate-500 flex items-center gap-3">
          <span className="text-accent-gold">{data.tier} tier</span>
          <span>·</span>
          <span>{data.total_points ?? 0} pts</span>
          <span>·</span>
          <span>updated {new Date(data.updated_at).toLocaleDateString()}</span>
        </div>

        {/* Final winner */}
        <div className="mt-8 grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-accent-gold/25 to-yellow-700/10 rounded-2xl p-5 text-center ring-1 ring-accent-gold/30">
            <div className="text-[10px] uppercase tracking-widest text-accent-gold font-mono">Their champion</div>
            <div className="font-display font-bold text-3xl mt-2">
              {tx(data.final_winner).flag} {tx(data.final_winner).name}
            </div>
          </div>
          <div className="bg-gradient-to-br from-orange-700/25 to-orange-900/10 rounded-2xl p-5 text-center">
            <div className="text-[10px] uppercase tracking-widest text-orange-300 font-mono">3rd place</div>
            <div className="font-display font-bold text-2xl mt-2">
              {tx(data.third_place_winner).flag} {tx(data.third_place_winner).name}
            </div>
          </div>
        </div>

        {/* Group standings */}
        <h2 className="mt-12 mb-4 font-display font-bold text-2xl">Group standings</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {GROUPS.map((g) => {
            const s = (data.group_standings[g] ?? []) as string[]
            return (
              <div key={g} className="glass rounded-2xl p-4">
                <div className="font-display font-bold text-lg mb-2">Group <span className="text-accent-gold">{g}</span></div>
                {s.slice(0, 4).map((code, i) => {
                  const t = tx(code)
                  const adv = i < 2 || (i === 2 && (data.third_place_advancing as string[]).includes(code))
                  return (
                    <div key={code + i} className={cn('flex items-center gap-2 px-2 py-1 text-sm', adv ? '' : 'opacity-40')}>
                      <span className="text-xs text-slate-500 w-4">{i + 1}</span>
                      <span>{t.flag}</span>
                      <span className="truncate flex-1">{t.name}</span>
                      {adv && i === 2 && <span className="text-accent-green text-xs">★</span>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Knockouts */}
        <h2 className="mt-12 mb-4 font-display font-bold text-2xl">Knockout bracket</h2>
        <div className="overflow-x-auto">
          <div className="grid grid-cols-5 gap-3 min-w-[800px]">
            {[
              { label: 'R32', ids: koMatchIds('R32') },
              { label: 'R16', ids: koMatchIds('R16') },
              { label: 'QF',  ids: koMatchIds('QF') },
              { label: 'SF',  ids: koMatchIds('SF') },
              { label: 'Final', ids: ['FINAL-1'] },
            ].map((col) => (
              <div key={col.label}>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">{col.label}</div>
                <div className="space-y-1.5">
                  {col.ids.map((id) => {
                    const code = data.ko_winners[id]
                    const t = tx(code)
                    return (
                      <div key={id} className="glass rounded px-2 py-1.5 text-xs flex items-center gap-1.5">
                        <span>{t.flag}</span>
                        <span className="truncate">{t.name}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 text-center text-xs font-mono text-slate-500">
          <a href="/" className="text-accent-gold hover:underline">→ Make your own prediction at wc26.mehdijabry.dev</a>
        </div>
      </main>
    </motion.div>
  )
}
