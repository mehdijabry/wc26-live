import { useT } from '../lib/i18n'
import { Icone } from './Icone'
import JaugeCoureur from './JaugeCoureur'
import type { EtatDuGroupe } from '../lib/leagues'

/**
 * L'état de déblocage d'un groupe, et le bouton pour encaisser.
 *
 * ── CE QUE LA BARRE DOIT FAIRE ────────────────────────────────────────────
 * Pas afficher un pourcentage : faire bouger le groupe. Le bonus est petit
 * — trois crampons au mieux — et ce n'est pas lui qui déclenche l'action.
 * Ce qui la déclenche, c'est de voir QUI BLOQUE et de lui écrire. D'où les
 * noms des manquants, qui sont la seule information vraiment utile ici.
 *
 * ── LES DEUX ÉCHELLES ─────────────────────────────────────────────────────
 * Le jour récompense la présence : chacun pose au moins un pari. La semaine
 * récompense l'assiduité : chacun en pose au moins cinq, et c'est ce taux
 * qui multiplie les prix du podium. Les deux se lisent d'un coup d'œil,
 * sinon personne ne saura ce qu'il reste à faire.
 *
 * ── LE DÉNOMINATEUR EST L'EFFECTIF ACTIF ──────────────────────────────────
 * Un membre sans pari depuis sept jours ne compte pas. Sans ça, un ami en
 * vacances plafonnerait tout le groupe et le mécanisme punirait exactement
 * les groupes qui ont réussi à recruter.
 */
export default function BarreDeblocage({
  etat,
  dejaReclame,
  occupe,
  onReclamer,
}: {
  etat: EtatDuGroupe
  /** Le groupe déjà réclamé aujourd'hui, s'il y en a un. */
  dejaReclame: { groupe: string; crampons: number } | null
  occupe: boolean
  onReclamer: () => void
}) {
  const t = useT()
  const tropPetit = etat.membres < 3

  return (
    <section className="mt-6 glass rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Icone nom="ranking" taille={24} />
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
          {t('Group rewards')}
        </h2>
      </div>

      {tropPetit ? (
        <p className="mt-3 text-sm text-slate-600">
          {t('A group starts paying rewards at three members. Share the invite link.')}
        </p>
      ) : (
        <>
          <Jauge
            titre={t('Today')}
            fait={etat.ontParieJour}
            total={etat.actifs}
            taux={etat.tauxJour}
            detail={avecN(t('{n} of 3 crampons'), etat.bonusJour)}
            manquants={etat.manquantsJour}
            legende={t('everyone places at least one bet')}
          />
          <Jauge
            titre={t('This week')}
            fait={etat.ontCinqSemaine}
            total={etat.actifs}
            taux={etat.tauxSemaine}
            detail={avecN(t('podium prizes at {n}%'), Math.round(etat.tauxSemaine * 100))}
            manquants={etat.manquantsSemaine}
            legende={t('everyone places at least five bets')}
          />

          {/* ── Le bouton, et l'avertissement qui va avec ──────────────────
              UN SEUL GROUPE PAR JOUR. Un joueur peut être dans dix groupes ;
              il n'encaisse qu'une fois, et c'est lui qui choisit lequel. Il
              doit le savoir AVANT de cliquer, pas après — sinon il croira
              avoir perdu les autres par erreur. */}
          <div className="mt-4 pt-3 border-t border-slate-200">
            {dejaReclame ? (
              <p className="text-sm text-slate-600">
                {t('Claimed today in {g} — one group per day.').replace('{g}', dejaReclame.groupe || '—')}
              </p>
            ) : (
              <>
                <button
                  type="button"
                  disabled={occupe || etat.bonusJour === 0}
                  onClick={onReclamer}
                  className="px-4 py-2 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm disabled:opacity-40 active:scale-[0.98] transition-transform"
                >
                  {avecN(t('Claim {n} crampons here'), etat.bonusJour)}
                </button>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {t('one group per day — claiming here closes the others until tomorrow')}
                </p>
                {etat.bonusJour === 0 && (
                  <p className="mt-1 text-sm text-slate-600">
                    {t('Nobody in the group has bet today yet.')}
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function Jauge({
  titre,
  fait,
  total,
  taux,
  detail,
  manquants,
  legende,
}: {
  titre: string
  fait: number
  total: number
  taux: number
  detail: string
  manquants: string[]
  legende: string
}) {
  const t = useT()
  return (
    <div className="mt-3">
      <JaugeCoureur
        taux={taux}
        titre={titre}
        fraction={`${fait}/${total}`}
        detail={<span className="text-accent-gold">{detail}</span>}
        legende={legende}
      />
      {manquants.length > 0 && (
        <p className="mt-0.5 text-[11px] text-slate-600">
          <span className="text-slate-500">{t('still missing')} : </span>
          {manquants.join(', ')}
        </p>
      )}
    </div>
  )
}

function avecN(gabarit: string, n: number): string {
  return gabarit.replace('{n}', String(n))
}
