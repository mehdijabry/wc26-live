import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import CartePronostic from '../src/components/CartePronostic'
import TerrainChargement from '../src/components/TerrainChargement'
import '../src/index.css'

function Apercu() {
  const [ouvert, setOuvert] = useState(false)
  return (
    <div className="min-h-screen bg-paper text-slate-900 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="font-display text-3xl">Aperçu — pronostics</h1>

        <section>
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
            1 · l’animation seule
          </h2>
          <div className="glass rounded-2xl mt-2">
            <TerrainChargement />
          </div>
        </section>

        <section>
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
            2 · avant déblocage (2e du jour)
          </h2>
          <CartePronostic
            match="e401879268" domicile="Arsenal" exterieur="Leeds United"
            cote={{ home: 1.28, draw: 6.0, away: 10.0 }}
            ouvert={false}
            prix={{ crampons: 1, pressings: 10, rang: 2 }}
            solde={{ crampons: 12, pressings: 340 }}
            onOuvert={() => setOuvert(true)} onFermer={() => {}}
          />
        </section>

        <section>
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
            3 · après déblocage {ouvert ? '' : '(cliquez le bouton ci-dessus)'}
          </h2>
          <CartePronostic
            match="e401879268" domicile="Arsenal" exterieur="Leeds United"
            cote={{ home: 1.28, draw: 6.0, away: 10.0 }}
            ouvert
            prix={null} solde={{ crampons: 11, pressings: 340 }}
            onOuvert={() => {}} onFermer={() => {}}
          />
        </section>
      </div>
    </div>
  )
}

createRoot(document.getElementById('racine')!).render(<Apercu />)
