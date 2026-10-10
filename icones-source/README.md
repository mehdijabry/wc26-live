# Les SVG d'origine des icônes de football

Téléchargés par Mehdi le 10/10/2026 depuis le pack IconScout
`free-football-icon-pack_36710` (IconScout Store, style « Colored Outline »,
512×512). **Aucune attribution n'est exigée** : vérifié item par item via
l'API, les 32 icônes du pack sont en `attribution_required: false`.

## Pourquoi ce dossier n'est PAS dans `public/`

Tout ce qui est sous `public/` est publié tel quel. Les originaux s'y
retrouvaient livrés en double — 90 Ko pour rien — et c'est la même erreur qui
avait mis les sources d'une maquette en ligne en octobre. Les sources vivent
donc dans un dossier frère.

## Ce qu'on en fait

Les versions servies sont dans `public/media/icones/`, obtenues en retirant
l'attribut `id` (collision si on les inline un jour) et les blancs inutiles.
Les couleurs ne sont PAS touchées : elles sont celles du sujet — vert du
terrain, jaune et rouge des cartons — et elles tiennent sur notre fond
noir-vert, vérifié à 24, 40 et 56 px.

Pour en ajouter : déposer le SVG ici, puis le recopier nettoyé à côté.
