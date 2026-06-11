import { forwardRef } from 'react'
import { teamByCode, useQrSvg, type PosterStyle } from './posterUtils'

/**
 * Phase 6 poster — the dramatic finale + 3rd place playoff.
 * Renders the same content in three different visual treatments
 * (TICKET / PROGRAMME / STADIUM) per the v3 mockup the user approved.
 *
 * Pixel dimensions are chosen to give crisp 2× output (~1080px on the
 * long side) when html-to-image's pixelRatio:2 setting kicks in.
 *
 * The ref forwards to the outer poster root so the parent modal can
 * pass it to html-to-image's toPng() for capture.
 */

export interface FinalePosterProps {
  style: PosterStyle
  finalWinner: string         // team code
  finalRunnerUp: string       // team code (the SF1 loser if SF1 → final)
  thirdPlaceWinner: string    // team code
  alias: string
  qrUrl: string
  topScorer?: string          // optional — only used by 'programme' style
}

export const FinalePoster = forwardRef<HTMLDivElement, FinalePosterProps>(
  function FinalePoster(props, ref) {
    if (props.style === 'ticket') return <TicketStyle ref={ref} {...props} />
    if (props.style === 'programme') return <ProgrammeStyle ref={ref} {...props} />
    return <StadiumStyle ref={ref} {...props} />
  }
)

// ─────────────────────────────────────────────────────────────────
// STYLE 1 · TICKET DE STADE (9:16 vertical)
// ─────────────────────────────────────────────────────────────────

const TicketStyle = forwardRef<HTMLDivElement, FinalePosterProps>(
  function TicketStyle({ finalWinner, finalRunnerUp, thirdPlaceWinner, alias, qrUrl }, ref) {
    const champion = teamByCode(finalWinner)
    const runnerUp = teamByCode(finalRunnerUp)
    const third = teamByCode(thirdPlaceWinner)
    const qrSvg = useQrSvg(qrUrl, 240)

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
        {/* top + bottom gold bands */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 14, background: 'linear-gradient(135deg, #fde68a, #d4af37, #8b6914)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, background: 'linear-gradient(135deg, #fde68a, #d4af37, #8b6914)' }} />
        {/* perforation holes (mid-card) */}
        <div style={{ position: 'absolute', left: -20, top: 580, width: 40, height: 40, borderRadius: '50%', background: '#faf8f1' }} />
        <div style={{ position: 'absolute', right: -20, top: 580, width: 40, height: 40, borderRadius: '50%', background: '#faf8f1' }} />
        {/* spotlight glow behind trophy */}
        <div style={{ position: 'absolute', left: 70, top: 140, width: 400, height: 320, background: 'radial-gradient(circle, rgba(253,230,138,0.35), transparent 70%)' }} />

        {/* header */}
        <div style={{ position: 'absolute', top: 40, left: 36, display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/wc26-emblem.svg" alt="" style={{ width: 56, height: 56 }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fde68a', letterSpacing: '0.05em' }}>PRESSING 90′</div>
            <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.2em', marginTop: 2 }}>FIFA WORLD CUP™ FINAL</div>
          </div>
        </div>

        {/* trophy + spotlight */}
        <div style={{ position: 'absolute', top: 180, left: 0, right: 0, textAlign: 'center', fontSize: 110, lineHeight: 1 }}>🏆</div>
        <div style={{ position: 'absolute', top: 320, left: 0, right: 0, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#d4af37', letterSpacing: '0.2em' }}>
          CHAMPION DU MONDE
        </div>

        {/* big gold plate with champion flag */}
        <div
          style={{
            position: 'absolute',
            top: 360,
            left: 80,
            width: 380,
            height: 160,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #fde68a, #d4af37, #8b6914)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0f172a',
          }}
        >
          <div style={{ fontSize: 80, lineHeight: 1, marginBottom: 8 }}>{champion?.flag ?? '🏆'}</div>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '0.1em' }}>
            {(champion?.name ?? 'TBD').toUpperCase()}
          </div>
        </div>

        {/* LED scoreboard final */}
        <div
          style={{
            position: 'absolute',
            top: 560,
            left: 36,
            right: 36,
            height: 80,
            borderRadius: 10,
            background: '#000',
            border: '1px solid #22c55e',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          <div style={{ fontSize: 12, color: '#22c55e', letterSpacing: '0.25em' }}>
            FINAL · ESTADIO AZTECA
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#22c55e', marginTop: 6 }}>
            {champion?.flag} {champion?.code} — {runnerUp?.code} {runnerUp?.flag}
          </div>
        </div>

        {/* 3rd place chip */}
        <div
          style={{
            position: 'absolute',
            top: 658,
            left: 36,
            right: 36,
            height: 44,
            borderRadius: 8,
            background: 'rgba(212, 175, 55, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#d4af37',
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          🥉 3ᵉ PLACE · {third?.flag} {third?.name?.toUpperCase() ?? 'TBD'}
        </div>

        {/* QR stub */}
        <div
          style={{
            position: 'absolute',
            top: 720,
            left: 36,
            right: 36,
            height: 200,
            borderRadius: 10,
            background: 'rgba(255,255,255,0.05)',
            border: '2px dashed rgba(212, 175, 55, 0.4)',
            display: 'flex',
            padding: 18,
            gap: 16,
          }}
        >
          <div
            style={{ width: 160, height: 160, background: '#fff', borderRadius: 6, padding: 6, flexShrink: 0 }}
            dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined}
          />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#94a3b8', letterSpacing: '0.2em', marginBottom: 8 }}>
              SCANNER POUR VOIR
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fde68a', marginBottom: 4 }}>
              MA PRÉDICTION
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#d4af37', marginBottom: 6 }}>
              @{alias}
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', wordBreak: 'break-all' }}>
              {qrUrl.replace(/^https?:\/\//, '')}
            </div>
          </div>
        </div>
      </div>
    )
  }
)

// ─────────────────────────────────────────────────────────────────
// STYLE 2 · PROGRAMME OFFICIEL (1:1 square)
// ─────────────────────────────────────────────────────────────────

const ProgrammeStyle = forwardRef<HTMLDivElement, FinalePosterProps>(
  function ProgrammeStyle(
    { finalWinner, finalRunnerUp, thirdPlaceWinner, alias, qrUrl, topScorer },
    ref
  ) {
    const champion = teamByCode(finalWinner)
    const runnerUp = teamByCode(finalRunnerUp)
    const third = teamByCode(thirdPlaceWinner)
    const qrSvg = useQrSvg(qrUrl, 240)

    return (
      <div
        ref={ref}
        className="relative font-display"
        style={{
          width: 1080,
          height: 1080,
          background: '#fefbe9',
          color: '#0f172a',
          overflow: 'hidden',
        }}
      >
        {/* dark header band */}
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            height: 100,
            background: 'linear-gradient(to bottom, #0f172a, #020617)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 36px',
          }}
        >
          <img src="/wc26-emblem.svg" alt="" style={{ width: 56, height: 56, marginRight: 16 }} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fde68a', letterSpacing: '0.05em' }}>
              PRESSING 90′
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fde68a' }}>
              🏆 FINALE WC26
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fde68a' }}>@{alias}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>12 JUL 2026 · AZTECA</div>
          </div>
        </div>

        {/* title */}
        <div style={{ position: 'absolute', top: 130, left: 0, right: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#8b6914', letterSpacing: '0.25em' }}>
            MES PRÉDICTIONS WC26
          </div>
          <div style={{ fontSize: 44, fontWeight: 900, color: '#0f172a', marginTop: 8 }}>
            CHAMPION DU MONDE
          </div>
        </div>

        {/* champion frame with rays */}
        <div style={{ position: 'absolute', top: 240, left: 270, width: 540, height: 460 }}>
          {/* 8 rays */}
          <svg
            width={540}
            height={460}
            viewBox="0 0 540 460"
            style={{ position: 'absolute', inset: 0 }}
          >
            <g
              transform="translate(270, 230)"
              stroke="url(#programmegold)"
              strokeWidth={4}
              opacity={0.55}
              strokeLinecap="round"
            >
              <defs>
                <linearGradient id="programmegold">
                  <stop offset="0" stopColor="#fde68a"/>
                  <stop offset="1" stopColor="#d4af37"/>
                </linearGradient>
              </defs>
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
                const rad = (angle * Math.PI) / 180
                const x1 = Math.cos(rad) * 180
                const y1 = Math.sin(rad) * 180
                const x2 = Math.cos(rad) * 220
                const y2 = Math.sin(rad) * 220
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
              })}
            </g>
          </svg>

          <div
            style={{
              position: 'absolute',
              top: 30, left: 90,
              width: 360, height: 400,
              background: '#fff',
              border: '6px solid #d4af37',
              borderRadius: 18,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 64 }}>🏆</div>
            <div style={{ fontSize: 110, lineHeight: 1 }}>{champion?.flag ?? '🏆'}</div>
            <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: '0.04em' }}>
              {(champion?.name ?? 'TBD').toUpperCase()}
            </div>
          </div>
        </div>

        {/* bottom row: score + 3rd + top scorer */}
        <div style={{ position: 'absolute', bottom: 200, left: 36, right: 36, display: 'flex', gap: 16 }}>
          <div
            style={{
              flex: 1,
              height: 140,
              background: '#000',
              borderRadius: 12,
              padding: 16,
              fontFamily: 'ui-monospace, monospace',
              color: '#22c55e',
            }}
          >
            <div style={{ fontSize: 13, letterSpacing: '0.25em' }}>SCORE FINAL</div>
            <div style={{ fontSize: 34, fontWeight: 900, marginTop: 16 }}>
              {champion?.flag} 2 - 1 {runnerUp?.flag}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              {champion?.code} · {runnerUp?.code}
            </div>
          </div>
          <div
            style={{
              flex: 1,
              height: 140,
              background: 'linear-gradient(to bottom, #d97706, #7c2d12)',
              borderRadius: 12,
              padding: 16,
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.2em' }}>🥉 3ᵉ PLACE</div>
            <div style={{ fontSize: 56, lineHeight: 1, marginTop: 6 }}>{third?.flag}</div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>
              {(third?.name ?? 'TBD').toUpperCase()}
            </div>
          </div>
        </div>

        {topScorer && (
          <div
            style={{
              position: 'absolute',
              bottom: 152,
              left: 36, right: 36,
              height: 40,
              background: '#0f172a',
              borderRadius: 8,
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 900, color: '#fde68a', letterSpacing: '0.2em' }}>
              ⚽ TOP SCORER
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{topScorer}</div>
          </div>
        )}

        {/* footer QR */}
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 36, right: 36,
            height: 120,
            borderTop: '1px solid #d4af37',
            paddingTop: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <div
            style={{ width: 100, height: 100, background: '#fff', borderRadius: 8, padding: 4, flexShrink: 0 }}
            dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#8b6914', letterSpacing: '0.2em' }}>
              SCAN MA PRÉDICTION COMPLÈTE
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
              @{alias}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginTop: 2 }}>
              Voir tout mon parcours WC26
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, wordBreak: 'break-all' }}>
              {qrUrl.replace(/^https?:\/\//, '')}
            </div>
          </div>
          <img src="/wc26-emblem.svg" alt="" style={{ width: 56, height: 56 }} />
        </div>
      </div>
    )
  }
)

// ─────────────────────────────────────────────────────────────────
// STYLE 3 · STADIUM PODIUM (16:9 horizontal)
// ─────────────────────────────────────────────────────────────────

const StadiumStyle = forwardRef<HTMLDivElement, FinalePosterProps>(
  function StadiumStyle({ finalWinner, finalRunnerUp, thirdPlaceWinner, alias, qrUrl }, ref) {
    const champion = teamByCode(finalWinner)
    const runnerUp = teamByCode(finalRunnerUp)
    const third = teamByCode(thirdPlaceWinner)
    const qrSvg = useQrSvg(qrUrl, 200)

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
        {/* pitch markings */}
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.18)' }} />
        <div
          style={{
            position: 'absolute',
            left: '50%', top: '50%',
            width: 200, height: 200,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.18)',
          }}
        />
        {/* spotlight */}
        <div
          style={{
            position: 'absolute',
            left: 0, right: 0, top: 0, bottom: 0,
            background: 'radial-gradient(ellipse at 50% 30%, rgba(253,230,138,0.4), transparent 60%)',
            pointerEvents: 'none',
          }}
        />

        {/* header */}
        <div
          style={{
            position: 'absolute',
            top: 40, left: 40, right: 40,
            height: 60,
            background: 'rgba(0,0,0,0.7)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
          }}
        >
          <img src="/wc26-emblem.svg" alt="" style={{ width: 44, height: 44, marginRight: 14 }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fde68a' }}>PRESSING 90′</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>@{alias}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '0.1em' }}>
              FINALE WC26
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fde68a' }}>12 JUL · 20:00 · AZTECA</div>
          </div>
        </div>

        {/* trophy */}
        <div style={{ position: 'absolute', top: 130, left: 0, right: 0, textAlign: 'center', fontSize: 90, lineHeight: 1 }}>
          🏆
        </div>

        {/* podium 3D */}
        <div style={{ position: 'absolute', top: 250, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'flex-end', height: 320 }}>
          {/* 2nd silver */}
          <PodiumBlock
            heightPx={200}
            color="linear-gradient(to bottom, #e5e7eb, #9ca3af)"
            sideColor="#6b7280"
            flag={runnerUp?.flag}
            code={runnerUp?.code}
            place="2ND"
            rank="2"
            txtDark={true}
          />
          {/* 1st gold (tallest) */}
          <PodiumBlock
            heightPx={280}
            color="linear-gradient(to bottom, #fde68a, #d4af37, #8b6914)"
            sideColor="#92400e"
            flag={champion?.flag}
            code={champion?.code}
            place="CHAMPION"
            rank="1"
            txtDark={true}
            highlight={true}
          />
          {/* 3rd bronze */}
          <PodiumBlock
            heightPx={140}
            color="linear-gradient(to bottom, #d97706, #7c2d12)"
            sideColor="#451a03"
            flag={third?.flag}
            code={third?.code}
            place="3RD"
            rank="3"
          />
        </div>

        {/* LED + QR footer */}
        <div
          style={{
            position: 'absolute',
            left: 40, right: 40, bottom: 40,
            height: 130,
            background: 'rgba(0,0,0,0.9)',
            borderRadius: 10,
            display: 'flex',
            padding: 14,
            gap: 18,
          }}
        >
          <div
            style={{ width: 102, height: 102, background: '#fff', borderRadius: 6, padding: 3, flexShrink: 0 }}
            dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#fde68a', letterSpacing: '0.2em' }}>SCAN</div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 900,
                color: '#22c55e',
                fontFamily: 'ui-monospace, monospace',
                marginTop: 6,
              }}
            >
              {champion?.flag} 2 - 1 {runnerUp?.flag}
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', marginTop: 4 }}>@{alias}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, wordBreak: 'break-all' }}>
              {qrUrl.replace(/^https?:\/\//, '')}
            </div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 120 }}>
            <div style={{ fontSize: 11, color: '#fde68a', letterSpacing: '0.2em' }}>PHASE 6/6</div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: '#22c55e',
                fontFamily: 'ui-monospace, monospace',
                marginTop: 4,
              }}
            >
              FINAL
            </div>
            <div style={{ fontSize: 38, lineHeight: 1, marginTop: 4 }}>🏆</div>
          </div>
        </div>
      </div>
    )
  }
)

// Small podium block helper
function PodiumBlock({
  heightPx,
  color,
  sideColor,
  flag,
  code,
  place,
  rank,
  txtDark = false,
  highlight = false,
}: {
  heightPx: number
  color: string
  sideColor: string
  flag?: string
  code?: string
  place: string
  rank: string
  txtDark?: boolean
  highlight?: boolean
}) {
  const txt = txtDark ? '#0f172a' : '#fff'
  return (
    <div style={{ position: 'relative', width: 180, height: heightPx, marginInline: highlight ? 0 : 0 }}>
      {/* depth side */}
      <div
        style={{
          position: 'absolute',
          left: -14, top: 14,
          width: 14, height: heightPx,
          background: sideColor,
          transform: 'skewY(-45deg)',
          transformOrigin: 'top left',
        }}
      />
      <div
        style={{
          width: 180, height: heightPx,
          background: color,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <div style={{ fontSize: highlight ? 72 : 56, lineHeight: 1 }}>{flag ?? '⚽'}</div>
        <div style={{ fontSize: highlight ? 26 : 22, fontWeight: 900, marginTop: 10, color: txt }}>
          {code ?? 'TBD'}
        </div>
        <div
          style={{
            fontSize: highlight ? 72 : 50,
            fontWeight: 900,
            lineHeight: 1,
            color: txt,
            marginTop: 'auto',
            marginBottom: 8,
          }}
        >
          {rank}
        </div>
        <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.15em', color: txt }}>
          {place}
        </div>
      </div>
    </div>
  )
}
