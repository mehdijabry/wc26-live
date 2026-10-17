/**
 * LA FICHE D'UN MATCH, À PARTIR DE SON SEUL IDENTIFIANT.
 *
 * `bet_legs` ne garde que l'identifiant du match : pour afficher « Lyon —
 * Crystal Palace » il faut aller la chercher. Ce code vivait dans la page
 * « Mes paris » ; le profil public affiche les memes selections et en a
 * besoin a l'identique (Mehdi, 17/10/2026). Deux copies auraient diverge.
 */
import { api } from './api'

export type Fiche = { titre: string; dom: string; ext: string; date?: string; score?: string; fini: boolean }

const cacheMatch = new Map<string, Fiche | null>()

/**
 * Attention au préfixe : en base un match s'appelle « e401877883 », alors que
 * l'API ESPN veut « 401877883 » et répond `invalid event id` sinon. Sans ce
 * retrait, chaque jambe s'afficherait avec son identifiant brut.
 */
const idEspn = (matchId: string) => matchId.replace(/^e/, '')

export async function ficheDuMatch(id: string): Promise<Fiche | null> {
  if (cacheMatch.has(id)) return cacheMatch.get(id) ?? null
  try {
    const j = (await api.match(idEspn(id))) as {
      header?: {
        competitions?: Array<{
          date?: string
          status?: { type?: { completed?: boolean } }
          competitors?: Array<{ homeAway?: string; score?: string; team?: { displayName?: string; shortDisplayName?: string } }>
        }>
      }
    }
    const c = j.header?.competitions?.[0]
    const eq = c?.competitors ?? []
    const dom = eq.find((x) => x.homeAway === 'home')
    const ext = eq.find((x) => x.homeAway === 'away')
    const nom = (x?: typeof dom) => x?.team?.shortDisplayName || x?.team?.displayName || ''
    if (!dom && !ext) {
      cacheMatch.set(id, null)
      return null
    }
    const fini = c?.status?.type?.completed === true
    const f: Fiche = {
      titre: `${nom(dom)} — ${nom(ext)}`,
      dom: nom(dom),
      ext: nom(ext),
      date: c?.date,
      score: fini && dom?.score != null && ext?.score != null ? `${dom.score} – ${ext.score}` : undefined,
      fini,
    }
    cacheMatch.set(id, f)
    return f
  } catch {
    cacheMatch.set(id, null)
    return null
  }
}
