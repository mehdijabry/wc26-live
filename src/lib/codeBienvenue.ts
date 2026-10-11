import { supabase } from './supabase'

/**
 * Le code du lien d'inscription, mis de côté le temps que la session arrive.
 *
 * ── POURQUOI CE DÉTOUR ────────────────────────────────────────────────────
 * Le 11/10/2026 Mehdi s'inscrit par https://pressing90.live/bienvenue/RFNBJGQN
 * et ne reçoit que les 5 crampons de départ. La page /bienvenue réclamait
 * pourtant bien le code — mais seulement tant qu'elle était à l'écran.
 *
 * Or Supabase exige une confirmation par courriel : à la création du compte
 * `data.session` est nul, l'utilisateur part lire sa boîte, et le lien de
 * confirmation le ramène SUR L'ACCUEIL. La page /bienvenue n'est jamais
 * remontée, la réclamation n'a jamais lieu, et la promesse de la publicité
 * tombe à l'eau au pire moment : juste après l'inscription.
 *
 * On corrige des deux côtés. Le retour de courriel pointe désormais sur la
 * page en cours (voir `emailRedirectTo` dans store/auth.ts), et le code est
 * en plus mémorisé ici : d'où que la session finisse par arriver — courriel,
 * Google, lien magique, ou simple retour sur le site — elle déclenche la
 * réclamation. Une ceinture et une bretelle, parce qu'un bonus promis en
 * publicité et jamais versé coûte bien plus cher que ces vingt lignes.
 */
const CLE = 'p90.codeBienvenue'

export function memoriserCode(code: string): void {
  if (!code) return
  try { localStorage.setItem(CLE, code) } catch { /* navigation privée */ }
}

export function oublierCode(): void {
  try { localStorage.removeItem(CLE) } catch { /* navigation privée */ }
}

export function codeEnAttente(): string | null {
  try { return localStorage.getItem(CLE) } catch { return null }
}

/**
 * Réclame le code mis de côté. Rend `true` seulement si quelque chose a
 * réellement été crédité — c'est ce qui décide s'il faut relire le profil.
 *
 * Accepté ou refusé, le code est oublié : un compte ne peut réclamer qu'un
 * seul lien dans sa vie, donc le garder relancerait l'appel à chaque
 * ouverture de l'app pour rien.
 */
export async function reclamerCodeEnAttente(): Promise<boolean> {
  const code = codeEnAttente()
  if (!code || !supabase) return false
  try {
    const { data, error } = await supabase.rpc('reclamer_code_inscription', { p_code: code })
    oublierCode()
    if (error) return false
    const r = (Array.isArray(data) ? data[0] : data) as { crampons?: number; analyses?: number } | null
    return !!r && (Number(r.crampons ?? 0) > 0 || Number(r.analyses ?? 0) > 0)
  } catch {
    // Réseau coupé en pleine réclamation : on GARDE le code pour réessayer
    // à la prochaine session, au lieu de le perdre en silence.
    return false
  }
}
