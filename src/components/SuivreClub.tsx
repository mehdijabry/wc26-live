import { useEffect, useState } from 'react'
import { useAuth } from '../store/auth'
import { useT } from '../lib/i18n'
import { clubsSuivis, enregistrerClubsSuivis } from '../lib/notifications'

/**
 * SUIVRE UN CLUB — l'étoile de la page club.
 *
 * Les favoris existaient déjà, mais dans le `localStorage` et seulement pour
 * des CHAMPIONNATS : invisibles du serveur, donc incapables de déclencher
 * quoi que ce soit quand le joueur n'est pas devant son écran. Suivre un
 * club écrit dans `profiles.clubs_suivis`, et le worker y lit la liste des
 * clubs à surveiller (migration 030).
 *
 * Le bouton n'apparaît que pour un joueur connecté : sans compte, il n'y a
 * nulle part où envoyer la notification.
 */
export function SuivreClub({ nom }: { nom: string }) {
  const user = useAuth((s) => s.user)
  const t = useT()
  const [liste, setListe] = useState<string[] | null>(null)
  const [occupe, setOccupe] = useState(false)

  useEffect(() => {
    if (!user) { setListe(null); return }
    let vivant = true
    void clubsSuivis().then((l) => { if (vivant) setListe(l) })
    return () => { vivant = false }
  }, [user])

  if (!user || !nom || liste === null) return null

  const suivi = liste.includes(nom)

  const basculer = async () => {
    setOccupe(true)
    const apres = suivi ? liste.filter((x) => x !== nom) : [...liste, nom]
    const r = await enregistrerClubsSuivis(apres)
    setOccupe(false)
    // La base fait foi : elle dédoublonne et plafonne à vingt.
    if (r) setListe(r)
  }

  return (
    <button
      type="button"
      onClick={() => void basculer()}
      disabled={occupe}
      aria-pressed={suivi}
      title={suivi ? t('Following') : t('Follow this club')}
      className={
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 ' +
        (suivi ? 'bg-accent-gold text-ink-900' : 'glass glass-hover text-slate-600')
      }
    >
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden
           fill={suivi ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
        <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9L12 3.6Z"
              strokeLinejoin="round" />
      </svg>
      {suivi ? t('Following') : t('Follow this club')}
    </button>
  )
}

export default SuivreClub
