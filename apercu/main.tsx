import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import CartePronostic from '../src/components/CartePronostic'
import TerrainChargement from '../src/components/TerrainChargement'
import BoutonPronostic from '../src/components/BoutonPronostic'
import BarreDeblocage from '../src/components/BarreDeblocage'
import Distinctions from '../src/components/Distinctions'
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
            0 · les récompenses de groupe
          </h2>
          <BarreDeblocage
            etat={{
              membres: 5, actifs: 4, ontParieJour: 3, tauxJour: 0.75, bonusJour: 2,
              ontCinqSemaine: 2, tauxSemaine: 0.5, recompenses: 3,
              manquantsJour: ['Karim'],
              manquantsSemaine: ['Karim', 'Sofia'],
            }}
            dejaReclame={null}
            occupe={false}
            onReclamer={() => {}}
          />
          <BarreDeblocage
            etat={{
              membres: 5, actifs: 4, ontParieJour: 4, tauxJour: 1, bonusJour: 3,
              ontCinqSemaine: 4, tauxSemaine: 1, recompenses: 3,
              manquantsJour: [], manquantsSemaine: [],
            }}
            dejaReclame={{ groupe: 'Les Collègues', crampons: 3 }}
            occupe={false}
            onReclamer={() => {}}
          />
          <BarreDeblocage
            etat={{
              membres: 2, actifs: 2, ontParieJour: 1, tauxJour: 0.5, bonusJour: 0,
              ontCinqSemaine: 0, tauxSemaine: 0, recompenses: 0,
              manquantsJour: [], manquantsSemaine: [],
            }}
            dejaReclame={null}
            occupe={false}
            onReclamer={() => {}}
          />
        </section>

        <section>
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
            0 bis · les distinctions, cumulées
          </h2>
          <div className="mt-2 glass rounded-2xl p-4 space-y-3">
            {[
              { l: 'GOAT dans 3 groupes', c: { or: 0, argent: 0, bronze: 0, goat: 3 } },
              { l: 'premier dans 2, GOAT dans 1', c: { or: 2, argent: 0, bronze: 0, goat: 1 } },
              { l: 'un or, un argent, un bronze', c: { or: 1, argent: 1, bronze: 1, goat: 0 } },
              { l: 'troisième d’un seul groupe', c: { or: 0, argent: 0, bronze: 1, goat: 0 } },
            ].map((x) => (
              <div key={x.l} className="flex items-center gap-3">
                <span className="font-display text-[15px]">mehdijabry</span>
                <Distinctions compte={x.c} taille={20} />
                <span className="ms-auto font-mono text-[10px] text-slate-500">{x.l}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
            1 bis · le bouton, dans ses trois états
          </h2>
          <div className="mt-2 space-y-2 glass rounded-2xl p-3">
            <div className="font-mono text-[10px] text-slate-500">— à côté des marchés, pour comparer —</div>
            <div className="px-3 py-1.5 rounded-lg font-mono text-[11px] text-slate-500 flex justify-between">
              <span className="uppercase tracking-wider">score exact</span><span>+</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg font-mono text-[11px] text-slate-500 flex justify-between">
              <span className="uppercase tracking-wider">buteur</span><span>+</span>
            </div>
            <div className="pt-2 border-t border-slate-200">
              <BoutonPronostic ouvert={false} dejaDebloque={false} offert onBascule={() => {}} />
            </div>
            <BoutonPronostic ouvert={false} dejaDebloque={false} offert={false} onBascule={() => {}} />
            <BoutonPronostic ouvert dejaDebloque onBascule={() => {}} offert={false} />
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
