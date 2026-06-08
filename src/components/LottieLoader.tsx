import { DotLottieReact } from '@lottiefiles/dotlottie-react'

/**
 * LottieLoader — drop-in football-themed animation for loading skeletons.
 *
 * Files live in /public/lottie/ — see LOTTIE_ANIMATIONS.md at the project
 * root for the curated list of free LottieFiles + the filename conventions.
 *
 * Usage:
 *   <LottieLoader name="whistle" caption="Loading matches…" />
 *   <LottieLoader name="ball-spin" size={72} loop />
 *
 * Falls back to a subtle skeleton if the file isn't there yet, so the UI
 * never breaks while you're still downloading the .lottie packs.
 */

export type LottieName =
  | 'whistle'        // referee blowing whistle — fixtures / schedule loading
  | 'ball-spin'      // ball spinning on the spot — generic small loaders
  | 'ball-kick'      // boot kicking a ball — predictions / bracket loading
  | 'trophy'         // trophy lifting / glowing — bracket export / final reveal
  | 'goal-net'       // net rippling — score updates / live ticker
  | 'stadium-crowd'  // crowd waving — team page / live match loading
  | 'jersey-swap'    // 2 jerseys swapping — squad / player loading
  | 'card-yellow'    // referee showing yellow card — errors / warnings

export function LottieLoader({
  name,
  size = 96,
  loop = true,
  caption,
  className = '',
}: {
  name: LottieName
  size?: number
  loop?: boolean
  caption?: string
  className?: string
}) {
  // Vite resolves /public assets at root URL
  const src = `/lottie/${name}.lottie`

  return (
    <div className={'flex flex-col items-center justify-center gap-2 ' + className}>
      <div style={{ width: size, height: size }} className="relative">
        <DotLottieReact
          src={src}
          loop={loop}
          autoplay
          className="w-full h-full"
          // dotlottie-react silently 404s; we add a CSS fallback under it
        />
        {/* CSS-only fallback ring — hidden if Lottie renders OK */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full border-2 border-slate-200 border-t-accent-gold animate-spin opacity-40"
          style={{ animationDuration: '1.4s' }}
        />
      </div>
      {caption && (
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">
          {caption}
        </div>
      )}
    </div>
  )
}
