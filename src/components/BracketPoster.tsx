import { cn } from '../lib/utils'
import { R32_TEMPLATE, R16_TEMPLATE, QF_TEMPLATE, SF_TEMPLATE } from '../lib/fifaBracket'
import { useLiveBracketData, type LiveTeam } from '../lib/liveBracket'
import type { GroupLetter } from '../store/bracket'

/**
 * BracketPoster — the FootMercato-style export poster.
 * Used both by:
 *   - BracketWizard (StepExport) for the live edit/PNG-download view
 *   - PublicProfile (/u/:slug) so a published bracket renders identically
 *     to the PNG someone might already be sharing.
 *
 * Takes ALL data via the `data` prop so the same render works for both
 * the live owner (data pulled from useBracket store) and a public viewer
 * (data fetched from public_brackets view in Supabase).
 */

const GROUPS: GroupLetter[] = ['A','B','C','D','E','F','G','H','I','J','K','L']

export type BracketPosterData = {
  alias: string
  groupStandings: Partial<Record<GroupLetter, string[]>>
  thirdPlaceAdvancing: string[]
  koWinners: Record<string, string>
  thirdPlaceWinner: string | null
  finalWinner: string | null
}

function Flag({ team, size = 'md' }: { team: Pick<LiveTeam, 'logo' | 'code'> | null | undefined; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const cls = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : size === 'xl' ? 'w-9 h-9' : 'w-5 h-5'
  if (!team) return <span className={cls + ' inline-block rounded-full bg-slate-200'} />
  if (!team.logo) return <span className={cls + ' inline-flex items-center justify-center text-base'}>🏳️</span>
  return (
    <img
      src={team.logo}
      alt=""
      loading="lazy"
      className={cls + ' object-contain shrink-0'}
      onError={(e) => (e.currentTarget.style.display = 'none')}
    />
  )
}

function fifaMatchNumberFor(id: string): number | undefined {
  if (id.startsWith('R32-')) return R32_TEMPLATE.find((m) => m.id === id)?.fifaMatch
  if (id.startsWith('R16-')) return R16_TEMPLATE.find((m) => m.id === id)?.fifaMatch
  if (id.startsWith('QF-'))  return QF_TEMPLATE.find((m) => m.id === id)?.fifaMatch
  if (id.startsWith('SF-'))  return SF_TEMPLATE.find((m) => m.id === id)?.fifaMatch
  if (id === 'FINAL-1') return 104
  if (id === 'TP-1') return 103
  return undefined
}

export function BracketPoster({ data }: { data: BracketPosterData }) {
  const { lookup } = useLiveBracketData()
  const { alias, groupStandings, thirdPlaceAdvancing, koWinners, thirdPlaceWinner, finalWinner } = data

  function tx(code: string | undefined): { logo?: string; name: string; code?: string } {
    if (!code) return { name: 'TBD' }
    const t = lookup(code)
    return t ? { logo: t.logo, name: t.name, code: t.code } : { name: code }
  }

  const leftR32  = ['R32-2','R32-5','R32-1','R32-3','R32-11','R32-12','R32-9','R32-10']
  const rightR32 = ['R32-4','R32-6','R32-7','R32-8','R32-14','R32-16','R32-13','R32-15']
  const leftR16  = ['R16-1','R16-2','R16-5','R16-6']
  const rightR16 = ['R16-3','R16-4','R16-7','R16-8']
  const leftQF   = ['QF-1','QF-2']
  const rightQF  = ['QF-3','QF-4']

  const champion = tx(finalWinner ?? undefined)
  const bronze   = tx(thirdPlaceWinner ?? undefined)

  return (
    <div className="bg-[#0b0d12] text-white">
      <div className="px-10 pt-8 pb-6 flex flex-col items-center gap-3 border-b border-white/10">
        <img src="/wc26-emblem.svg" alt="" className="w-20 h-20" />
        <div className="text-center">
          <div className="font-display font-bold text-2xl leading-none tracking-tight">
            WC<span className="text-accent-gold">26</span> Live
          </div>
          <div className="text-[10px] tracking-[0.22em] uppercase font-mono text-white/60 mt-1.5">
            Pressing <span className="text-accent-red font-semibold">90&apos;</span>
          </div>
        </div>
        <div className="mt-1 text-[11px] tracking-[0.22em] uppercase text-accent-gold font-mono">
          {alias}&apos;s prediction
        </div>
      </div>

      <div className="px-6 pt-6 pb-8 border-b border-white/10">
        <div className="grid grid-cols-12 gap-2">
          {GROUPS.map((g) => {
            const s = groupStandings[g] ?? []
            return (
              <div key={g} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5">
                <div className="font-display font-bold text-[13px] text-accent-gold mb-2 tracking-wide">
                  GROUPE <span className="text-white">{g}</span>
                </div>
                <div className="space-y-1">
                  {s.slice(0, 4).map((code, i) => {
                    const t = lookup(code)
                    if (!t) return null
                    const adv = i < 2 || (i === 2 && thirdPlaceAdvancing.includes(code))
                    const isThirdAdv = i === 2 && thirdPlaceAdvancing.includes(code)
                    return (
                      <div
                        key={code}
                        className={cn(
                          'flex items-center gap-1.5 text-[10px] rounded px-1.5 py-1',
                          adv ? 'bg-white/[0.06] text-white' : 'text-white/40',
                          i === 0 && 'ring-1 ring-accent-gold/40',
                          isThirdAdv && 'ring-1 ring-accent-green/40',
                        )}
                      >
                        <span className="font-mono w-3 text-white/50 shrink-0">{i + 1}</span>
                        <Flag team={t} size="sm" />
                        <span className="font-semibold uppercase tracking-wide text-[11px]">
                          {t.code}
                        </span>
                        {isThirdAdv && <span className="text-accent-green text-[9px] ml-auto">★</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="relative px-6 py-10">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06]">
          <img src="/wc26-emblem.svg" alt="" className="w-[360px] h-[360px]" />
        </div>

        <div className="relative grid grid-cols-9 gap-2 items-center">
          <BracketColumn label="1/16" matches={leftR32}  koWinners={koWinners} tx={tx} compact />
          <BracketColumn label="1/8"  matches={leftR16}  koWinners={koWinners} tx={tx} />
          <BracketColumn label="1/4"  matches={leftQF}   koWinners={koWinners} tx={tx} />
          <BracketColumn label="1/2"  matches={['SF-1']} koWinners={koWinners} tx={tx} hero />

          <div className="px-2">
            <div className="text-[10px] tracking-[0.22em] uppercase text-center text-accent-gold mb-3 font-mono">
              Finale
            </div>
            <div className="bg-gradient-to-br from-accent-gold/30 via-yellow-900/15 to-accent-gold/30 border border-accent-gold/40 rounded-xl p-4 text-center">
              <div className="text-[9px] tracking-[0.22em] uppercase text-accent-gold font-mono">Champion</div>
              {finalWinner ? (
                <div className="flex items-center justify-center gap-2 mt-2.5">
                  {champion.logo && <img src={champion.logo} alt="" className="w-10 h-10 object-contain" />}
                  <span className="font-display font-bold text-xl">{champion.name}</span>
                </div>
              ) : (
                <div className="text-white/40 text-sm mt-3">—</div>
              )}
              <div className="mt-3 pt-3 border-t border-accent-gold/20">
                <div className="text-[9px] tracking-[0.22em] uppercase text-orange-300 font-mono">3rd Place</div>
                {thirdPlaceWinner ? (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    {bronze.logo && <img src={bronze.logo} alt="" className="w-7 h-7 object-contain" />}
                    <span className="font-display font-bold text-base">{bronze.name}</span>
                  </div>
                ) : (
                  <div className="text-white/40 text-sm mt-2">—</div>
                )}
              </div>
            </div>
          </div>

          <BracketColumn label="1/2"  matches={['SF-2']}  koWinners={koWinners} tx={tx} hero />
          <BracketColumn label="1/4"  matches={rightQF}   koWinners={koWinners} tx={tx} />
          <BracketColumn label="1/8"  matches={rightR16}  koWinners={koWinners} tx={tx} />
          <BracketColumn label="1/16" matches={rightR32}  koWinners={koWinners} tx={tx} compact />
        </div>
      </div>

      <div className="border-t border-white/10 px-10 py-4 flex items-center justify-between text-[10px] font-mono text-white/40">
        <span>wc26.mehdijabry.dev</span>
        <span className="text-center flex-1">
          <span className="mx-1">🇨🇦</span><span className="mx-1">🇲🇽</span><span className="mx-1">🇺🇸</span>
          <span className="mx-2">·</span>48 nations · 16 cities · 104 matches
          <span className="mx-2">·</span>June 11 → July 19, 2026
        </span>
        <span>powered by ESPN live</span>
      </div>
    </div>
  )
}

function BracketColumn({
  label, matches, koWinners, tx, compact, hero,
}: {
  label: string
  matches: string[]
  koWinners: Record<string, string>
  tx: (code: string | undefined) => { logo?: string; name: string; code?: string }
  compact?: boolean
  hero?: boolean
}) {
  return (
    <div className="flex flex-col">
      <div className="text-[10px] tracking-[0.22em] uppercase text-white/50 font-mono mb-3 text-center">
        {label}
      </div>
      <div className={cn('flex flex-col', compact ? 'gap-1.5' : hero ? 'gap-3' : 'gap-2.5')}>
        {matches.map((id) => {
          const winnerCode = koWinners[id]
          const t = tx(winnerCode)
          const isHero = hero
          return (
            <div
              key={id}
              className={cn(
                'bg-white/[0.04] border border-white/10 rounded',
                isHero
                  ? 'px-3 py-3.5 ring-1 ring-accent-gold/30 bg-white/[0.08]'
                  : compact ? 'px-2.5 py-2' : 'px-2.5 py-2.5',
              )}
            >
              <div className={cn(
                'text-white/40 font-mono tracking-wider mb-1.5',
                isHero ? 'text-[10px]' : 'text-[9px]'
              )}>
                M{fifaMatchNumberFor(id) ?? '—'}
              </div>
              <div className={cn(
                'flex items-center gap-2',
                isHero ? 'text-[13px]' : compact ? 'text-[11px]' : 'text-[12px]'
              )}>
                {t.logo
                  ? <img src={t.logo} alt="" className={cn('object-contain shrink-0', isHero ? 'w-6 h-6' : 'w-5 h-5')} />
                  : <span className={cn('inline-block rounded-full bg-white/10 shrink-0', isHero ? 'w-6 h-6' : 'w-5 h-5')} />}
                <span className={cn(
                  'uppercase font-semibold tracking-wider',
                  winnerCode ? 'text-white' : 'text-white/40'
                )}>
                  {winnerCode ? (t.code ?? t.name) : 'TBD'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
