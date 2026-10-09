/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── « STOPPAGE TIME » (refonte du 09/10/2026) ─────────────────
        // Le fond quitte le bleu marine pour un NOIR-VERT de pelouse sous
        // projecteurs : le marine est ce que fait tout site de scores, le
        // vert est la couleur du sujet.
        //
        // LA RÈGLE QUI TIENT TOUT : la couleur a un sens, une seule.
        //   rouge  = en direct, maintenant, et rien d'autre
        //   doré   = le jeu (cotes, crampons, marque)
        //   mauve  = les pressings
        // Tout le reste est monochrome. C'est ce qui permet de repérer un
        // match en cours au milieu de quarante lignes sans rien lire.
        //
        // L'échelle slate reste INVERSÉE, comme avant : slate-900 est le
        // texte clair, slate-50/100 des surfaces sombres. Tout le code
        // écrit en clair-d'abord continue de fonctionner.
        paper: '#0B0F0D',        // le sol de la page
        night: '#0B0F0D',
        card: '#121916',         // surface surélevée
        cream: '#ECEFE8',        // blanc de craie, pas blanc pur
        marine: { 950: '#0E1411' },
        slate: {
          50:  '#0E1411',        // surface discrète
          100: '#161E1A',        // pastille / survol
          200: '#212B26',        // filet
          300: '#2B3832',        // filet au survol
          400: '#5A6560',        // texte très effacé
          500: '#7C8A83',        // texte secondaire
          600: '#93A099',
          700: '#AEBAB3',
          800: '#D2D8D1',
          900: '#ECEFE8',        // texte principal (craie)
        },
        // Teintes sémantiques, réaccordées sur le sol noir-vert : sur
        // l'ancienne base bleue elles tiraient toutes au marine.
        amber:   { 50: '#1E2318', 100: '#262C1D', 200: '#5C5126', 300: '#7E6E33', 700: '#D9B54A', 900: '#E9CD7E' },
        emerald: { 50: '#0D2219', 100: '#12301F', 200: '#1C4A33', 500: '#10B981', 600: '#0EA371', 700: '#6FDCA0', 800: '#8FE6B4' },
        rose:    { 50: '#2A1512', 100: '#371A16', 300: '#6B2E26', 600: '#E11D48', 700: '#FF8A96', 800: '#FFA3AC' },
        red:     { 50: '#2A1512', 200: '#5C2821', 400: '#FF6B5C', 500: '#FF4A3D', 600: '#E13B2D', 700: '#B82E22', 900: '#6B1810' },
        yellow:  { 300: '#E9CD7E', 700: '#B99433' },
        ink: {
          900: '#0B0F0D',        // texte sombre SUR le doré — inchangé de rôle
          800: '#141A17',
          700: '#2B3832',
          600: '#47524C',
          500: '#5A6560',
        },
        accent: {
          gold: '#D9B54A',
          green: '#41C97C',
          red: '#FF4A3D',        // LE DIRECT, et seulement lui
          blue: '#5B8DEF',
          violet: '#8B6CF5',     // les pressings
        },
      },
      // Les angles se referment. C'est ce qui fait basculer la page du
      // registre « application » vers celui du journal de résultats.
      // `rounded-full` n'est PAS touché : pastilles rondes, avatars,
      // écussons et points du direct en dépendent.
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '2px',
        md: '3px',
        lg: '3px',
        xl: '4px',
        '2xl': '4px',
        '3xl': '6px',
        full: '9999px',
      },
      fontFamily: {
        sans: ['"Archivo"', 'system-ui', 'sans-serif'],
        // Big Shoulders : condensé de lignée « enseigne de stade ». Anton
        // reste en secours si Google Fonts ne répond pas.
        display: ['"Big Shoulders Display"', '"Anton"', 'Impact', '"Arial Narrow"', 'sans-serif'],
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
