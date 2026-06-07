import { motion } from 'framer-motion'
import { stadiums } from '../data/stadiums'
import { SectionHeader } from './Groups'

const COUNTRY_FLAGS: Record<string, string> = { USA: '🇺🇸', MEX: '🇲🇽', CAN: '🇨🇦' }

export function Stadiums() {
  // Group by country
  const byCountry: Record<string, typeof stadiums> = { USA: [], MEX: [], CAN: [] }
  stadiums.forEach((s) => byCountry[s.country].push(s))

  return (
    <section id="stadiums" className="py-20 sm:py-28 border-t border-slate-200/70">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="16 host cities"
          title="The Venues"
          sub="From Estadio Azteca (1970, 1986, 2026 — a three-peat) to MetLife in New Jersey hosting the final. 16 stadiums across three nations."
        />

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {(['USA', 'MEX', 'CAN'] as const).map((country, idx) => (
            <motion.div
              key={country}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="glass rounded-2xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="font-display font-bold text-xl flex items-center gap-2">
                  <span className="text-2xl">{COUNTRY_FLAGS[country]}</span>
                  {country === 'USA' ? 'United States' : country === 'MEX' ? 'Mexico' : 'Canada'}
                </div>
                <span className="text-xs font-mono text-slate-500">
                  {byCountry[country].length} venues
                </span>
              </div>
              <ul className="space-y-2">
                {byCountry[country].map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg bg-slate-50 hover:bg-white/[0.06] transition-colors px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{s.name}</div>
                        <div className="text-xs text-slate-500 truncate">📍 {s.city}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono text-accent-gold">
                          {s.capacity.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {s.matches} matches
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Totals strip */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-8 glass rounded-2xl p-5 flex flex-wrap items-center justify-around gap-4 text-center"
        >
          <Stat label="Total capacity" value={stadiums.reduce((a, s) => a + s.capacity, 0).toLocaleString()} suffix="seats" />
          <Stat label="Total matches" value={stadiums.reduce((a, s) => a + s.matches, 0).toString()} suffix="games" />
          <Stat label="Largest" value="MetLife" suffix="82,500" />
          <Stat label="Historic" value="Azteca" suffix="3rd WC" />
        </motion.div>
      </div>
    </section>
  )
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="px-4">
      <div className="text-xs uppercase tracking-widest text-slate-500 font-mono">{label}</div>
      <div className="font-display font-bold text-2xl text-slate-900 mt-1">{value}</div>
      {suffix && <div className="text-xs text-slate-500 font-mono mt-0.5">{suffix}</div>}
    </div>
  )
}
