/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── "MATCH NIGHT" palette (2026-08 redesign) ──────────────────
        // The site is dark-first: deep navy ground, gold as floodlight,
        // red strictly = live. The slate scale below is INVERTED so the
        // whole codebase (written light-first with text-slate-900 on
        // bg-white) flips to night without touching every component:
        // slate-900 now means "primary text (cream)", bg-slate-50/100
        // now mean "subtle dark surface". Hover/opacity variants follow
        // automatically because Tailwind derives them from these hexes.
        paper: '#071B30',        // page ground (was white)
        night: '#071B30',
        card: '#0D2C4B',
        cream: '#F3EFE6',
        marine: { 950: '#0A2540' },
        slate: {
          50:  '#0B2745',        // subtle surface
          100: '#10325A',        // chip / hover surface
          200: '#1A4370',        // border
          300: '#23517F',        // border (hover)
          400: '#64809A',        // faint text
          500: '#7E95AB',        // secondary text
          600: '#9FB2C4',
          700: '#C9D4DE',
          800: '#DFE6EC',
          900: '#F3EFE6',        // primary text (cream)
        },
        // Semantic banner tints, re-tuned for the dark ground
        amber:   { 50: '#20304E', 100: '#2A3A58', 200: '#6B5B2E', 300: '#8A7439', 700: '#D9B54A', 900: '#E9CD7E' },
        emerald: { 50: '#0E3328', 100: '#14402F', 200: '#1F5A42', 500: '#10B981', 600: '#0EA371', 700: '#6FDCA0', 800: '#8FE6B4' },
        rose:    { 50: '#3A1620', 100: '#4A1B27', 300: '#7A2E3D', 600: '#E11D48', 700: '#FF8A96', 800: '#FFA3AC' },
        red:     { 50: '#3A1620', 200: '#6B2430', 400: '#FF6B78', 500: '#FF4D5E', 600: '#E11D48', 700: '#C4172F', 900: '#7A0E1E' },
        yellow:  { 300: '#E9CD7E', 700: '#B99433' },
        ink: {
          900: '#0f172a',        // dark text ON gold buttons — unchanged
          800: '#1e293b',
          700: '#334155',
          600: '#475569',
          500: '#64748b',
        },
        accent: {
          gold: '#D9B54A',
          green: '#41C97C',
          red: '#FF4D5E',
          blue: '#5B8DEF',       // brightened for dark ground
        },
      },
      fontFamily: {
        sans: ['"Archivo"', 'system-ui', 'sans-serif'],
        display: ['"Anton"', 'Impact', '"Arial Narrow"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        ar: ['"Tajawal"', '"Geeza Pro"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2s linear infinite',
        float: 'float 6s ease-in-out infinite',
        'gradient-x': 'gradient-x 8s ease infinite',
        marquee: 'marquee 40s linear infinite',
        breathe: 'breathe 2.4s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.15' },
          '50%': { opacity: '0.8' },
        },
      },
    },
  },
  plugins: [],
}
