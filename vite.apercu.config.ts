import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/** L'aperçu : mêmes composants, données remplacées par un alias. */
export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: [
      {
        // L'alias porte sur le SPÉCIFICATEUR d'import, pas sur le chemin
        // résolu : `CartePronostic` écrit `../lib/pronostic`, et c'est cette
        // chaîne-là qu'il faut viser.
        find: /^\.\.\/lib\/pronostic$/,
        replacement: fileURLToPath(new URL('./apercu/pronostic-fixture.ts', import.meta.url)),
      },
    ],
  },
  build: { outDir: 'dist-apercu', emptyOutDir: true, rollupOptions: { input: 'apercu/index.html' } },
})
