import { useT } from '../lib/i18n'
import { lignesDeLaFormation, type EquipeComposition } from '../lib/pronostic'

/**
 * Les deux onze probables, posés sur un vrai terrain.
 *
 * ── POURQUOI PAS DES RANGÉES DE NOMS ──────────────────────────────────────
 * La première version empilait les noms par ligne de formation. C'était
 * exact, et illisible : rien ne disait qu'on regardait un terrain, et les
 * deux équipes dans deux boîtes côte à côte ne se faisaient pas face
 * (Mehdi, 2026-10-10 : « ça n'est pas clair, j'irais plus sur un vrai
 * terrain bien clair et visible »).
 *
 * UN SEUL TERRAIN, DEUX MOITIÉS. C'est la convention de toutes les appli de
 * football, et elle porte une information que deux boîtes ne peuvent pas
 * donner : qui attaque vers où. Le domicile part du bas, l'extérieur du
 * haut, et les deux lignes d'attaque se rejoignent au milieu — exactement
 * comme sur la pelouse.
 *
 * ── LES COULEURS ──────────────────────────────────────────────────────────
 * Le vert est ici STRUCTUREL, pas sémantique : c'est le terrain, il n'entre
 * pas en concurrence avec « une couleur = un sens ». Les deux camps se
 * distinguent par le doré (domicile) et la craie (extérieur) ; le mauve
 * reste réservé aux pressings et le rouge au direct.
 *
 * ── LA TAILLE DES NOMS ────────────────────────────────────────────────────
 * Calculée par nom, pas fixe. « D. Raya » et « M. Lewis-Skelly » n'occupent
 * pas la même place, et une taille unique obligeait à tronquer le second —
 * or un nom tronqué dans une composition ne sert à rien.
 */

/** Le terrain, en unités du viewBox. 2:3, comme un vrai vu du dessus. */
const L = 100
const H = 150

type Place = { x: number; y: number; num: number | null; nom: string; case: number }

/**
 * Les onze d'un camp, placés.
 *
 * `bas` : le gardien est en bas et l'équipe attaque vers le haut. Sinon
 * l'inverse. Les lignes se répartissent entre la ligne de but et le rond
 * central, jamais au-delà — sans quoi les deux attaques se chevaucheraient.
 */
function placer(equipe: EquipeComposition, bas: boolean): Place[] {
  const lignes = lignesDeLaFormation(equipe.formation, equipe.players)
  if (!lignes.length) return []

  const yBut = bas ? H - 9 : 9
  const yPointe = bas ? H / 2 + 9 : H / 2 - 9
  const n = lignes.length

  return lignes.flatMap((ligne, i) => {
    const y = n === 1 ? yBut : yBut + ((yPointe - yBut) * i) / (n - 1)
    const k = ligne.length
    // Réparti sur 76 unités centrées : 12 de marge de chaque côté, ce qui
    // laisse les ailiers dans le terrain et non sur la ligne de touche.
    return ligne.map((j, idx) => ({
      x: 12 + ((idx + 0.5) * 76) / k,
      y,
      num: j.jersey_number,
      nom: j.short_name || j.name,
      // La largeur disponible voyage AVEC le joueur : la déduire après coup
      // obligeait à retrouver sa ligne par son nom, ce qui casse dès que
      // deux joueurs s'appellent pareil.
      case: 76 / k,
    }))
  })
}

/**
 * La taille d'un nom pour qu'il tienne dans son emplacement.
 *
 * LE COEFFICIENT EST 0,62, PAS 0,52. La première valeur était une estimation
 * et elle était fausse : dans une fonte à chasse fixe, un caractère avance
 * d'environ 0,6 fois la taille de la police. Résultat mesuré sur la ligne de
 * quatre défenseurs d'Arsenal — « R. Calafiori », « G. Magalhães » et
 * « C. Mosquera » se chevauchaient (Mehdi, 2026-10-10).
 *
 * Deux unités de marge, et non une : deux noms voisins qui se touchent
 * exactement sont illisibles même sans se recouvrir.
 */
function tailleDuNom(nom: string, largeurCase: number): number {
  return Math.max(1.5, Math.min(2.7, (largeurCase - 2) / (nom.length * 0.62)))
}

function Camp({ equipe, bas }: { equipe: EquipeComposition; bas: boolean }) {
  const places = placer(equipe, bas)
  const remplissage = bas ? '#D9B54A' : '#ECEFE8'

  return (
    <g>
      {places.map((p, i) => {
        const taille = tailleDuNom(p.nom, p.case)
        return (
          <g key={`${p.nom}-${i}`}>
            <circle cx={p.x} cy={p.y} r="4" fill={remplissage} />
            {p.num !== null && (
              <text
                x={p.x}
                y={p.y + 1.5}
                textAnchor="middle"
                fontSize="4"
                fontWeight="700"
                fill="#0B0F0D"
                fontFamily="ui-monospace, monospace"
              >
                {p.num}
              </text>
            )}
            <text
              x={p.x}
              y={p.y + 8.5}
              textAnchor="middle"
              fontSize={taille}
              fill="#ECEFE8"
              fontFamily="ui-monospace, monospace"
            >
              {p.nom}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export default function TerrainCompositions({
  domicile,
  exterieur,
}: {
  domicile: EquipeComposition
  exterieur: EquipeComposition
}) {
  const t = useT()
  const trait = '#ECEFE8'

  return (
    <div>
      {/* Les deux bandeaux encadrent le terrain : qui joue en haut, qui en
          bas. Sans eux, rien ne dit laquelle des deux moitiés est laquelle. */}
      <Bandeau equipe={exterieur} couleur="#ECEFE8" />

      <svg viewBox={`0 0 ${L} ${H}`} className="w-full block" role="img" aria-label={t('Probable line-ups')}>
        <rect x="0" y="0" width={L} height={H} fill="#0D2B1D" rx="1" />
        {/* Les bandes de tonte : ce qui fait lire « pelouse » plutôt que
            « rectangle vert ». Très faible contraste, exprès. */}
        {Array.from({ length: 10 }, (_, i) => i).map((i) =>
          i % 2 === 0 ? (
            <rect key={i} x="0" y={(i * H) / 10} width={L} height={H / 10} fill="#0F3323" />
          ) : null,
        )}
        <g fill="none" stroke={trait} strokeWidth="0.4" opacity="0.35">
          <rect x="3" y="3" width={L - 6} height={H - 6} />
          <line x1="3" y1={H / 2} x2={L - 3} y2={H / 2} />
          <circle cx={L / 2} cy={H / 2} r="11" />
          <circle cx={L / 2} cy={H / 2} r="0.8" fill={trait} stroke="none" />
          {/* Surfaces et petites surfaces, en haut et en bas */}
          <rect x="24" y="3" width="52" height="17" />
          <rect x="37" y="3" width="26" height="7" />
          <rect x="24" y={H - 20} width="52" height="17" />
          <rect x="37" y={H - 10} width="26" height="7" />
        </g>

        <Camp equipe={exterieur} bas={false} />
        <Camp equipe={domicile} bas />
      </svg>

      <Bandeau equipe={domicile} couleur="#D9B54A" />
    </div>
  )
}

function Bandeau({ equipe, couleur }: { equipe: EquipeComposition; couleur: string }) {
  const t = useT()
  return (
    <div className="flex items-baseline gap-2 py-1.5">
      <span className="h-2 w-2 rounded-full shrink-0 self-center" style={{ background: couleur }} />
      <span className="font-display text-sm truncate">{equipe.team_name}</span>
      <span className="font-mono text-[11px] text-accent-gold ms-auto shrink-0">{equipe.formation}</span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500 shrink-0">
        {t('confidence')} {Math.round(equipe.confidence * 100)} %
      </span>
    </div>
  )
}
