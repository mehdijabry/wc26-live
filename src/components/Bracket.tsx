import { motion } from 'framer-motion'
import { SectionHeader } from './Groups'

type Slot = { label: string; team?: string; flag?: string }
type Round = { name: string; slots: Slot[] }

const rounds: Round[] = [
  {
    name: 'Round of 32',
    slots: Array.from({ length: 16 }, (_, i) => ({
      label: `R32 · M${i + 1}`,
      team: i < 4 ? ['MEX', 'ESP', 'BEL', 'USA'][i] : undefined,
      flag: i < 4 ? ['🇲🇽', '🇪🇸', '🇧🇪', '🇺🇸'][i] : undefined,
    })),
  },
  {
    name: 'Round of 16',
    slots: Array.from({ length: 8 }, (_, i) => ({ label: `R16 · M${i + 1}` })),
  },
  { name: 'Quarter-finals', slots: Array.from({ length: 4 }, (_, i) => ({ label: `QF · M${i + 1}` })) },
  { name: 'Semi-finals', slots: Array.from({ length: 2 }, (_, i) => ({ label: `SF · M${i + 1}` })) },
  { name: 'Final', slots: [{ label: '🏆 FINAL' }] },
]

export function Bracket() {
  return (
    <section id="bracket" className="py-20 sm:py-28 border-t border-slate-200/70">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="knockout"
          title="The Bracket"
          sub="First WC with a Round of 32: top 2 + 8 best 3rd-placed teams advance. The bracket is rendered live — as group standings update, slots fill in automatically."
        />

        <div className="mt-10 overflow-x-auto pb-4">
          <div className="grid grid-flow-col gap-6 min-w-[1200px] items-center">
            {rounds.map((round, idx) => (
              <div key={round.name} className="flex flex-col gap-3">
                <div className="text-xs uppercase tracking-widest text-accent-gold font-mono mb-2">
                  {round.name}
                </div>
                <div
                  className="flex flex-col"
                  style={{ gap: `${(idx + 1) * 12}px` }}
                >
                  {round.slots.map((slot, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: i * 0.04 }}
                      className={`glass glass-hover rounded-lg px-3 py-2 text-xs min-w-[140px] flex items-center gap-2 ${
                        slot.team ? 'ring-glow' : ''
                      }`}
                    >
                      {slot.flag && <span className="text-base">{slot.flag}</span>}
                      <span className="text-slate-500 font-mono">
                        {slot.team ?? slot.label}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 text-xs text-slate-500 font-mono">
          🇲🇽 Estadio Azteca · 🏆 MetLife Stadium · 35 days · 104 matches
        </div>
      </div>
    </section>
  )
}
