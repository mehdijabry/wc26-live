import { forwardRef } from 'react'
import { teamByCode, useQrSvg, type PosterStyle } from './posterUtils'
import { teams } from '../../data/teams'

/**
 * Phase 1 poster — group stage standings + 8 best 3rd-placed teams.
 *
 * Three visual treatments (TICKET / PROGRAMME / STADIUM) sharing the
 * same data and layout vocabulary as FinalePoster so the user can
 * post a consistent series of stories across all phases.
 */

export interface GroupsPosterProps {
  style: PosterStyle
  // Per-group ordered standings (1st, 2nd, 3rd, 4th by team code).
  standings: Record<string, [string, string, string, string]>
  // The 8 best 3rd-placed team codes the user picked.
  bestThirds: string[]
  alias: string
  qrUrl: string
}

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const

export const GroupsPoster = forwardRef<HTMLDivElement, GroupsPosterProps>(
  function GroupsPoster(props, ref) {
    if (props.style === 'ticket') return <TicketStyle ref={ref} {...props} />
    if (props.style === 'programme') return <ProgrammeStyle ref={ref} {...props} />
    return <StadiumStyle ref={ref} {...props} />
  }
)

// ─────────────────────────────────────────────────────────────────
// STYLE 1 · TICKET (9:16 vertical)
// ─────────────────────────────────────────────────────────────────

const TicketStyle = forwardRef<HTMLDivElement, GroupsPosterProps>(
  function TicketStyle({ standings, bestThirds, alias, qrUrl }, ref) {
    const qrSvg = useQrSvg(qrUrl, 240)
    // Stack groups in 2 columns of 6 to fit the tall format.
    return (
      <div
        ref={ref}
        className="relative font-display"
        style={{
          width: 540,
          height: 960,
          background: 'linear-gradient(to bottom, #0f172a 0%, #020617 100%)',
          color: '#fff',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 14, background: 'linear-gradient(135deg, #fde68a, #d4af37, #8b6914)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, background: 'linear-gradient(135deg, #fde68a, #d4af37, #8b6914)' }} />
        <div style={{ position: 'absolute', left: -20, top: 730, width: 40, height: 40, borderRadius: '50%', background: '#faf8f1' }} />
        <div style={{ position: 'absolute', right: -20, top: 730, width: 40, height: 40, borderRadius: '50%', background: '#faf8f1' }} />

        {/* header */}
        <div style={{ position: 'absolute', top: 32, left: 32, display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/wc26-emblem.svg" alt="" style={{ width: 50, height: 50 }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fde68a', letterSpacing: '0.05em' }}>PRESSING 90′</div>
            <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.18em', marginTop: 2 }}>WC26 GROUP STAGE</div>
          </div>
        </div>

        <div style={{ position: 'absolute', top: 102, left: 0, right: 0, textAlign: 'center', fontSize: 32, fontWeight: 900, color: '#fff' }}>
          MY GROUPS
        </div>
        <div style={{ position: 'absolute', top: 142, left: 0, right: 0, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#d4af37', letterSpacing: '0.18em' }}>
          12 GROUPS · TOP 2 + 8 BEST THIRDS
        </div>

        {/* 2 columns of 6 mini-standings */}
        <div style={{ position: 'absolute', top: 175, left: 28, width: 484, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {GROUP_LETTERS.map((g) => {
            const s = standings[g]
            if (!s) return <div key={g} />
            const first = teamByCode(s[0])
            const second = teamByCode(s[1])
            return (
              <div key={g} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: '#fde68a', marginBottom: 4 }}>GROUP {g}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, marginBottom: 2 }}>
                  <span style={{ color: '#22c55e', fontWeight: 900, width: 12 }}>1</span>
                  <span>{first?.flag}</span>
                  <span style={{ color: '#fff', fontWeight: 700 }}>{first?.code ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <span style={{ color: '#94a3b8', fontWeight: 900, width: 12 }}>2</span>
                  <span>{second?.flag}</span>
                  <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{second?.code ?? '—'}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* best thirds gold ribbon */}
        <div style={{ position: 'absolute', top: 600, left: 28, right: 28, background: 'linear-gradient(135deg, #fde68a, #d4af37, #8b6914)', borderRadius: 8, padding: 12, color: '#0f172a' }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textAlign: 'center', marginBottom: 8 }}>⭐ 8 BEST 3RD-PLACED</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, fontSize: 22 }}>
            {bestThirds.slice(0, 8).map((c, i) => {
              const t = teamByCode(c)
              return <span key={i}>{t?.flag ?? '?'}</span>
            })}
          </div>
          <div style={{ fontSize: 9, fontWeight: 800, textAlign: 'center', marginTop: 6 }}>
            {bestThirds.slice(0, 8).map((c) => teamByCode(c)?.code).join(' · ')}
          </div>
        </div>

        {/* QR stub */}
        <div style={{ position: 'absolute', top: 760, left: 28, right: 28, background: 'rgba(255,255,255,0.05)', border: '2px dashed rgba(212,175,55,0.4)', borderRadius: 8, padding: 16, display: 'flex', gap: 14 }}>
          <div
            style={{ width: 140, height: 140, background: '#fff', borderRadius: 6, padding: 6, flexShrink: 0 }}
            dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined}
          />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.18em', marginBottom: 6 }}>SCAN TO SEE</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fde68a', marginBottom: 4 }}>MY PREDICTION</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#d4af37', marginBottom: 4 }}>@{alias}</div>
            <div style={{ fontSize: 9, color: '#94a3b8', wordBreak: 'break-all' }}>{qrUrl.replace(/^https?:\/\//, '')}</div>
          </div>
        </div>
      </div>
    )
  }
)

// ─────────────────────────────────────────────────────────────────
// STYLE 2 · PROGRAMME (1:1 square)
// ─────────────────────────────────────────────────────────────────

const ProgrammeStyle = forwardRef<HTMLDivElement, GroupsPosterProps>(
  function ProgrammeStyle({ standings, bestThirds, alias, qrUrl }, ref) {
    const qrSvg = useQrSvg(qrUrl, 200)
    return (
      <div
        ref={ref}
        className="relative font-display"
        style={{ width: 1080, height: 1080, background: '#fefbe9', color: '#0f172a', overflow: 'hidden' }}
      >
        {/* gold header band */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 96, background: 'linear-gradient(135deg, #fde68a, #d4af37, #8b6914)', display: 'flex', alignItems: 'center', padding: '0 36px' }}>
          <img src="/wc26-emblem.svg" alt="" style={{ width: 56, height: 56, marginRight: 16 }} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>PRESSING 90′</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#3f2400' }}>OFFICIAL PROGRAMME · PHASE 1</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>@{alias}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3f2400' }}>⚽ WC26</div>
          </div>
        </div>

        <div style={{ position: 'absolute', top: 116, left: 0, right: 0, textAlign: 'center', fontSize: 36, fontWeight: 900 }}>
          GROUP STAGE STANDINGS
        </div>
        <div style={{ position: 'absolute', top: 162, left: 100, right: 100, height: 2, background: '#d4af37' }} />

        {/* 4×3 grid of group standings */}
        <div style={{ position: 'absolute', top: 188, left: 36, right: 36, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {GROUP_LETTERS.map((g) => {
            const s = standings[g]
            if (!s) return <div key={g} />
            return (
              <div key={g} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ background: '#0f172a', color: '#fde68a', padding: '6px 10px', fontSize: 13, fontWeight: 900, letterSpacing: '0.1em' }}>
                  GROUP {g}
                </div>
                {[0, 1, 2, 3].map((idx) => {
                  const t = teamByCode(s[idx])
                  const isAdvancing = idx <= 1
                  const isThird = idx === 2 && bestThirds.includes(s[2])
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 10px',
                        borderTop: idx === 0 ? 'none' : '1px solid #fef3c7',
                        background: isAdvancing ? 'rgba(212,175,55,0.08)' : isThird ? 'rgba(212,175,55,0.15)' : '#fff',
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 900, color: isAdvancing ? '#d4af37' : isThird ? '#d4af37' : '#94a3b8', width: 14 }}>
                        {idx + 1}
                      </span>
                      <span style={{ fontSize: 14 }}>{t?.flag}</span>
                      <span style={{ fontSize: 12, fontWeight: isAdvancing || isThird ? 800 : 600, color: '#0f172a', flex: 1 }}>{t?.code ?? '—'}</span>
                      {isThird && <span style={{ fontSize: 10, fontWeight: 900, color: '#d4af37' }}>⭐</span>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* best thirds banner */}
        <div style={{ position: 'absolute', bottom: 200, left: 36, right: 36, height: 100, background: '#0f172a', borderRadius: 12, padding: 16, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: 'linear-gradient(135deg, #fde68a, #d4af37, #8b6914)' }} />
          <div style={{ fontSize: 13, fontWeight: 900, color: '#fde68a', letterSpacing: '0.2em', textAlign: 'center', marginTop: 4 }}>
            ⭐ 8 BEST 3RD-PLACED QUALIFIERS
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 12 }}>
            {bestThirds.slice(0, 8).map((c, i) => {
              const t = teamByCode(c)
              return (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24 }}>{t?.flag}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', marginTop: 2 }}>{t?.code}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* footer QR */}
        <div style={{ position: 'absolute', bottom: 24, left: 36, right: 36, height: 140, borderTop: '1px solid #d4af37', paddingTop: 18, display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{ width: 110, height: 110, background: '#fff', borderRadius: 8, padding: 4, flexShrink: 0 }}
            dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#8b6914', letterSpacing: '0.18em' }}>SCAN MY FULL PREDICTION</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>@{alias}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginTop: 2 }}>See my full WC26 journey</div>
            <div style={{ fontSize: 10, color: '#94a3b8', wordBreak: 'break-all' }}>{qrUrl.replace(/^https?:\/\//, '')}</div>
          </div>
          <img src="/wc26-emblem.svg" alt="" style={{ width: 56, height: 56 }} />
        </div>
      </div>
    )
  }
)

// ─────────────────────────────────────────────────────────────────
// STYLE 3 · STADIUM (16:9 horizontal)
// ─────────────────────────────────────────────────────────────────

const StadiumStyle = forwardRef<HTMLDivElement, GroupsPosterProps>(
  function StadiumStyle({ standings, bestThirds, alias, qrUrl }, ref) {
    const qrSvg = useQrSvg(qrUrl, 180)
    return (
      <div
        ref={ref}
        className="relative font-display"
        style={{
          width: 1280,
          height: 720,
          background: 'repeating-linear-gradient(0deg, #15803d 0px, #15803d 20px, #166534 20px, #166534 40px)',
          color: '#fff',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.18)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, background: 'radial-gradient(ellipse at 50% 30%, rgba(253,230,138,0.3), transparent 60%)' }} />

        {/* header */}
        <div style={{ position: 'absolute', top: 32, left: 32, right: 32, height: 60, background: 'rgba(0,0,0,0.7)', borderRadius: 10, display: 'flex', alignItems: 'center', padding: '0 24px' }}>
          <img src="/wc26-emblem.svg" alt="" style={{ width: 44, height: 44, marginRight: 14 }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fde68a' }}>PRESSING 90′</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>@{alias}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '0.1em' }}>WC26 · GROUP STAGE</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fde68a' }}>12 GROUPS · TOP 2 + 8 THIRDS</div>
          </div>
        </div>

        {/* 4×3 grid of group cards */}
        <div style={{ position: 'absolute', top: 110, left: 32, right: 32, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {GROUP_LETTERS.map((g) => {
            const s = standings[g]
            if (!s) return <div key={g} />
            return (
              <div key={g} style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 8, overflow: 'hidden', color: '#0f172a' }}>
                <div style={{ background: '#0f172a', color: '#fde68a', padding: '4px 10px', fontSize: 12, fontWeight: 900, letterSpacing: '0.1em' }}>
                  GROUP {g}
                </div>
                {[0, 1, 2, 3].map((idx) => {
                  const t = teamByCode(s[idx])
                  const isAdvancing = idx <= 1
                  const isThird = idx === 2 && bestThirds.includes(s[2])
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9', background: isAdvancing ? 'rgba(212,175,55,0.12)' : isThird ? 'rgba(212,175,55,0.18)' : '#fff' }}>
                      <span style={{ fontSize: 10, fontWeight: 900, color: isAdvancing || isThird ? '#d4af37' : '#94a3b8', width: 12 }}>
                        {idx + 1}
                      </span>
                      <span style={{ fontSize: 14 }}>{t?.flag}</span>
                      <span style={{ fontSize: 11, fontWeight: isAdvancing || isThird ? 800 : 500, flex: 1 }}>{t?.code ?? '—'}</span>
                      {isThird && <span style={{ fontSize: 10 }}>⭐</span>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* best thirds banner */}
        <div style={{ position: 'absolute', bottom: 140, left: 32, right: 32, height: 50, background: 'linear-gradient(135deg, #fde68a, #d4af37, #8b6914)', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 18px', color: '#0f172a' }}>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.18em' }}>⭐ 8 BEST THIRDS</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 22 }}>
            {bestThirds.slice(0, 8).map((c, i) => {
              const t = teamByCode(c)
              return <span key={i}>{t?.flag ?? '?'}</span>
            })}
          </div>
        </div>

        {/* footer QR */}
        <div style={{ position: 'absolute', bottom: 32, left: 32, right: 32, height: 92, background: 'rgba(0,0,0,0.9)', borderRadius: 8, display: 'flex', alignItems: 'center', padding: 12, gap: 16 }}>
          <div
            style={{ width: 68, height: 68, background: '#fff', borderRadius: 4, padding: 2, flexShrink: 0 }}
            dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#fde68a', letterSpacing: '0.2em' }}>SCAN</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', marginTop: 2 }}>@{alias}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, wordBreak: 'break-all' }}>{qrUrl.replace(/^https?:\/\//, '')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#fde68a' }}>PHASE 1/6</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#22c55e', fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>GROUPS</div>
          </div>
        </div>
      </div>
    )
  }
)

// Helper exported for the picker — default standings by FIFA rank.
export function defaultGroupStandings(): Record<string, [string, string, string, string]> {
  const out: Record<string, [string, string, string, string]> = {}
  for (const g of GROUP_LETTERS) {
    const inGroup = teams
      .filter((t) => t.group === g)
      .sort((a, b) => (a.fifaRank ?? 999) - (b.fifaRank ?? 999))
      .map((t) => t.code)
    if (inGroup.length === 4) out[g] = inGroup as [string, string, string, string]
  }
  return out
}

// Helper: default best-thirds — pick the 8 third-placed teams with the
// strongest FIFA rank.
export function defaultBestThirds(standings: Record<string, [string, string, string, string]>): string[] {
  const thirds = Object.values(standings).map((s) => s[2])
  return thirds
    .map((code) => ({ code, rank: teamByCode(code)?.fifaRank ?? 999 }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 8)
    .map((x) => x.code)
}
