import type { ReactNode } from 'react'

/**
 * Une section de la fiche de match : un intitulé doré, puis le contenu.
 *
 * Extraite de MatchSheet le 17/10/2026 pour que `FicheStade` l'utilise
 * aussi. Elle y était locale, et le bloc du stade recevait donc son titre
 * du PARENT — qui ne savait pas si l'enfant allait trouver quelque chose.
 * Résultat vu par Mehdi : un « VENUE » tout seul, sans rien dessous, sur
 * El Sadar. Une section se pose maintenant avec ce qu'elle contient, ou
 * pas du tout.
 */
export function SectionFiche({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="px-5 sm:px-6 py-5 border-b border-slate-100 last:border-0">
      <div className="text-[10px] uppercase tracking-[0.22em] font-mono text-accent-gold mb-3">
        {titre}
      </div>
      {children}
    </div>
  )
}
