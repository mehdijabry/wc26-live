/**
 * Une icône qui prend la couleur du texte.
 *
 * ── POURQUOI UN MASQUE, ET NON `Icone` ────────────────────────────────────
 * `Icone` sert des `<img>` depuis `/media/icones/` et interdit par
 * construction de les recolorer — c'est voulu pour le décoratif, qui garde
 * les couleurs du sujet. Mais un glyphe monochrome posé sur le fond sombre
 * du site y serait invisible, et certains de ces glyphes PORTENT un sens
 * (l'onglet actif de la barre du bas, le bouton d'analyse) : leur couleur
 * doit suivre l'état.
 *
 * Le masque résout les deux : le fichier reste servi et mis en cache comme
 * les autres — hors du paquet JavaScript — et c'est `currentColor` qui le
 * peint. À réserver aux SVG d'UNE SEULE forme noire ; un fichier déjà
 * colorié perdrait ses couleurs.
 */
export default function IconeMasque({
  nom,
  taille = 24,
  className,
}: {
  nom: string
  taille?: number
  className?: string
}) {
  const u = `url(/media/icones/${nom}.svg)`
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: 'block',
        width: taille,
        height: taille,
        backgroundColor: 'currentColor',
        WebkitMaskImage: u,
        maskImage: u,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  )
}
