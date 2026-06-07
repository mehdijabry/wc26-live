import { motion } from 'framer-motion'
import { groups, teamByCode, teams } from '../data/teams'

const GROUP_LETTERS = 'ABCDEFGHIJKL'.split('')

export function Groups() {
  return (
    <section id="groups" className="py-20 sm:py-28">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="48 nations"
          title="The 12 Groups"
          sub="First World Cup with twelve groups of four. Top two from each group plus the eight best third-placed teams advance to the Round of 32."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
          {GROUP_LETTERS.map((letter, idx) => (
            <motion.div
              key={letter}
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: idx * 0.03 }}
              className="glass glass-hover rounded-2xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="font-display text-2xl font-bold">
                  Group <span className="text-accent-gold">{letter}</span>
                </div>
                <span className="text-xs font-mono text-slate-500">4 teams</span>
              </div>
              <ul className="space-y-2">
                {(groups[letter] || []).map((code, i) => {
                  const t = teamByCode(code)
                  if (!t) return null
                  return (
                    <li
                      key={code}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] transition-colors group"
                    >
                      <span className="w-5 text-xs font-mono text-slate-600 group-hover:text-slate-400">
                        #{i + 1}
                      </span>
                      <span className="text-xl">{t.flag}</span>
                      <span className="text-sm flex-1 truncate">{t.name}</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {t.fifaRank ? `R${t.fifaRank}` : 'TBD'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Confederation breakdown */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-12 grid grid-cols-2 sm:grid-cols-6 gap-3"
        >
          {[
            { key: 'UEFA', label: '🇪🇺 UEFA', n: countConfed('UEFA') },
            { key: 'CONMEBOL', label: '🌎 CONMEBOL', n: countConfed('CONMEBOL') },
            { key: 'AFC', label: '🌏 AFC', n: countConfed('AFC') },
            { key: 'CAF', label: '🌍 CAF', n: countConfed('CAF') },
            { key: 'CONCACAF', label: '🌐 CONCACAF', n: countConfed('CONCACAF') },
            { key: 'OFC', label: '🌊 OFC', n: countConfed('OFC') },
          ].map((c) => (
            <div key={c.key} className="glass rounded-xl p-3 text-center">
              <div className="text-2xl font-display font-bold text-white">{c.n}</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">
                {c.label}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

function countConfed(c: string) {
  return teams.filter((t) => t.confed === c).length
}

export function SectionHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string
  title: string
  sub?: string
}) {
  return (
    <div className="max-w-3xl">
      <div className="text-xs uppercase tracking-widest text-accent-gold font-mono mb-3">
        {eyebrow}
      </div>
      <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-3">
        {title}
      </h2>
      {sub && <p className="text-slate-400 text-lg leading-relaxed">{sub}</p>}
    </div>
  )
}
