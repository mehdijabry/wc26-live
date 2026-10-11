import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  championnatParSlug,
  clubAvecEffectif,
  clubsDuChampionnat,
  type ClubDetail,
  type Joueur,
} from '../../lib/clubs'
import { usePageHead, useJsonLd } from '../../lib/head'
import { useT } from '../../lib/i18n'

/**
 * /club/:league/:club — un club et son effectif complet.
 *
 * L'URL porte un slug lisible (« barcelona »), pas l'identifiant numérique
 * d'ESPN : c'est ce qui se partage et ce que Google affiche. La résolution
 * slug → identifiant se fait en demandant la liste du championnat, donc rien
 * n'est stocké en dur.
 *
 * Mesure du 8 octobre 2026 : « barcelona squad » et les requêtes de la même
 * forme pèsent 1 M – 10 M par mois, d'où le titre.
 */
export function ClubPage() {
  const t = useT()
  const { league, club } = useParams<{ league: string; club: string }>()
  const ch = league ? championnatParSlug(league) : null
  const [detail, setDetail] = useState<ClubDetail | null>(null)
  const [introuvable, setIntrouvable] = useState(false)
  // Le vrai nom du championnat (« Spanish LALIGA ») plutôt que son slug
  // d'URL (« laliga ») : il arrive dans la même réponse que la liste.
  const [nomLigue, setNomLigue] = useState('')
  /** Le joueur dont la ligne statistique est dépliée, s'il y en a un. */
  const [ouvert, setOuvert] = useState<string | null>(null)

  usePageHead(
    detail
      ? {
          titre: `${detail.nom} squad, players and numbers`,
          description: `The current ${detail.nom} squad: ${detail.effectif.length} players with shirt numbers, positions, ages and this season's goals, assists and appearances${detail.stade ? `. Home ground: ${detail.stade}` : ''}.`,
          chemin: `/club/${league ?? ''}/${club ?? ''}`,
        }
      : null,
  )

  // SportsTeam : le schéma que Google comprend pour un club, avec l'effectif
  // en `athlete`. C'est la seule chose de cette page qu'il ne trouve pas déjà
  // formatée ailleurs, donc c'est elle qui lui donne une raison de l'indexer.
  // Fil d'Ariane structuré : les trois niveaux apparaissent dans les
  // resultats Google au lieu de l'adresse brute.
  useJsonLd(
    'fil',
    ch && detail
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Clubs', item: 'https://pressing90.live/clubs' },
            {
              '@type': 'ListItem',
              position: 2,
              name: nomLigue || ch.slug.replace(/-/g, ' '),
              item: `https://pressing90.live/clubs/${ch.slug}`,
            },
            {
              '@type': 'ListItem',
              position: 3,
              name: detail.nom,
              item: `https://pressing90.live/club/${ch.slug}/${detail.slug}`,
            },
          ],
        }
      : null,
  )

  useJsonLd(
    'club',
    detail
      ? {
          '@context': 'https://schema.org',
          '@type': 'SportsTeam',
          name: detail.nom,
          sport: 'Association football',
          url: `https://pressing90.live/club/${league}/${club}`,
          ...(detail.logo ? { logo: detail.logo } : {}),
          ...(detail.stade
            ? { location: { '@type': 'Place', name: detail.stade } }
            : {}),
          ...(ch
            ? {
                memberOf: {
                  '@type': 'SportsOrganization',
                  name: nomLigue || ch.slug.replace(/-/g, ' '),
                  url: `https://pressing90.live/clubs/${ch.slug}`,
                },
              }
            : {}),
          numberOfEmployees: detail.effectif.length,
          athlete: detail.effectif.map((j) => ({
            '@type': 'Person',
            name: j.nom,
            ...(j.poste ? { jobTitle: j.poste } : {}),
            ...(j.nationalite ? { nationality: j.nationalite } : {}),
          })),
        }
      : null,
  )

  // Dépendre de `ch.espn`, pas de `ch` : `championnatParSlug` reconstruit son
  // tableau à chaque appel et renvoie donc un objet neuf à chaque rendu, ce qui
  // relançait l'effet en boucle — trois appels ESPN par page, mesurés.
  const cleLigue = ch?.espn ?? null
  useEffect(() => {
    if (!cleLigue || !club) return
    let vivant = true
    ;(async () => {
      try {
        const { clubs, nomLigue: nl } = await clubsDuChampionnat(cleLigue)
        if (vivant) setNomLigue(nl)
        const trouve = clubs.find((c) => c.slug === club)
        if (!trouve) {
          if (vivant) setIntrouvable(true)
          return
        }
        const d = await clubAvecEffectif(cleLigue, trouve.id)
        if (vivant) setDetail(d)
      } catch {
        if (vivant) setIntrouvable(true)
      }
    })()
    return () => {
      vivant = false
    }
  }, [cleLigue, club])

  if (!ch || introuvable) {
    return (
      <div className="container max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold">{t('Club not found')}</h1>
        <Link to="/clubs" className="mt-4 inline-block underline">
          {t('Back to every league')}
        </Link>
      </div>
    )
  }

  // Les gardiens d'abord, puis défense, milieu, attaque — l'ordre d'une feuille
  // de match, pas l'ordre alphabétique qu'ESPN renvoie.
  const ordre = ['G', 'D', 'M', 'F']
  const effectif = [...(detail?.effectif ?? [])].sort((a, b) => {
    const ia = ordre.indexOf(a.poste ?? '')
    const ib = ordre.indexOf(b.poste ?? '')
    if (ia !== ib) return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib)
    return Number(a.numero ?? 99) - Number(b.numero ?? 99)
  })

  // La Botola passe par api-sports, dont la route d'effectif ne donne pas la
  // nationalité. Plutôt qu'une colonne de tirets, on la retire.
  const avecNationalite = effectif.some((j) => j.nationalite)
  // Les statistiques arrivent dans la même réponse que l'effectif, mais tous
  // les championnats ne les renseignent pas. Pas une seule ligne remplie :
  // on retire les colonnes plutôt que d'afficher un mur de tirets.
  const avecStats = effectif.some((j) => j.stats)

  return (
    <div className="container max-w-4xl mx-auto px-6 py-10">
      <Link to={`/clubs/${ch.slug}`} className="text-sm text-muted-foreground hover:underline">
        ← {nomLigue || ch.slug.replace(/-/g, ' ')}
      </Link>

      <header className="mt-3 flex items-center gap-4">
        {detail?.logo && <img src={detail.logo} alt="" width={56} height={56} />}
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            {detail?.nom ?? 'Loading…'}
          </h1>
          {detail?.stade && <p className="text-muted-foreground">{detail.stade}</p>}
        </div>
      </header>

      {effectif.length > 0 && (
        <>
          <h2 className="mt-10 text-xl font-semibold">
            {t('Squad — {n} players').replace('{n}', String(effectif.length))}
          </h2>
          {avecStats && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t('Tap a name for their full season line.')}
            </p>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">{t('Player')}</th>
                  <th className="py-2 pr-3 font-medium">{t('Position')}</th>
                  <th className="py-2 pr-3 font-medium hidden sm:table-cell">{t('Age')}</th>
                  {avecNationalite && (
                    <th className="py-2 pr-3 font-medium hidden md:table-cell">{t('Nationality')}</th>
                  )}
                  {avecStats && (
                    <>
                      <th className="py-2 pr-3 font-medium text-right" title="Appearances">MP</th>
                      <th className="py-2 pr-3 font-medium text-right" title="Goals">G</th>
                      <th className="py-2 font-medium text-right" title="Assists">A</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {effectif.map((j) => (
                  <LigneJoueur
                    key={j.id}
                    joueur={j}
                    avecNationalite={avecNationalite}
                    avecStats={avecStats}
                    ouvert={ouvert === j.id}
                    onBasculer={() => setOuvert((v) => (v === j.id ? null : j.id))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-10 text-sm text-muted-foreground">
        {t('Squad data comes from ESPN’s public soccer API and changes when they update it. Numbers, positions and season statistics are theirs, not ours — nothing on this page is typed by hand, and a blank figure means ESPN publishes none, not zero.')}
      </p>
    </div>
  )
}

/**
 * Une ligne d'effectif, dépliable sur la saison du joueur.
 *
 * POURQUOI UN DÉPLIAGE ET PAS UNE PAGE PAR JOUEUR. Trois cent trente-quatre
 * clubs à une trentaine de joueurs feraient dix mille pages dont le seul
 * contenu serait sept nombres venus d'ESPN — exactement ce que Google
 * appelle du contenu mince, et un prérendu qui passerait de 465 pages à plus
 * de dix mille. Les chiffres utiles sont donc en colonnes, visibles sans un
 * clic, et le détail s'ouvre sur place.
 *
 * Le nom est un vrai bouton : c'est ce qui se voit, se survole et s'atteint
 * au clavier. Un joueur sans statistique n'en est pas un — il n'y a rien à
 * ouvrir, et un bouton qui ne fait rien est pire que pas de bouton.
 */
function LigneJoueur({
  joueur,
  avecNationalite,
  avecStats,
  ouvert,
  onBasculer,
}: {
  joueur: Joueur
  avecNationalite: boolean
  avecStats: boolean
  ouvert: boolean
  onBasculer: () => void
}) {
  const t = useT()
  const s = joueur.stats
  const gardien = joueur.poste === 'G'
  const colonnes = 3 + (avecNationalite ? 1 : 0) + 1 + (avecStats ? 3 : 0)
  const nb = (v: number | null) => (v === null ? '—' : String(v))

  return (
    <>
      <tr className={'border-b last:border-0 ' + (ouvert ? 'bg-muted/40' : '')}>
        <td className="py-2 pr-3 tabular-nums text-muted-foreground">{joueur.numero ?? '—'}</td>
        <td className="py-2 pr-3 font-medium">
          {s ? (
            <button
              type="button"
              onClick={onBasculer}
              aria-expanded={ouvert}
              // Le soulignement pointillé est PERMANENT, pas au survol : sur
              // un téléphone il n'y a pas de survol, et une affordance
              // invisible revient à pas d'affordance. C'est exactement ce
              // qui a été signalé — « les joueurs ne sont pas cliquables ».
              className="text-left underline decoration-dotted decoration-slate-400 underline-offset-4 hover:decoration-solid hover:text-accent-gold hover:decoration-accent-gold transition-colors"
            >
              {joueur.nom}
            </button>
          ) : (
            joueur.nom
          )}
        </td>
        <td className="py-2 pr-3">{joueur.poste ?? '—'}</td>
        <td className="py-2 pr-3 tabular-nums hidden sm:table-cell">{joueur.age ?? '—'}</td>
        {avecNationalite && (
          <td className="py-2 pr-3 hidden md:table-cell">{joueur.nationalite ?? '—'}</td>
        )}
        {avecStats && (
          <>
            <td className="py-2 pr-3 tabular-nums text-right text-muted-foreground">{nb(s?.matchs ?? null)}</td>
            <td className="py-2 pr-3 tabular-nums text-right font-semibold">{nb(s?.buts ?? null)}</td>
            <td className="py-2 tabular-nums text-right">{nb(s?.passes ?? null)}</td>
          </>
        )}
      </tr>

      {ouvert && s && (
        <tr className="border-b last:border-0 bg-muted/40">
          <td colSpan={colonnes} className="py-3 pl-3 pr-3">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Chiffre nom={t('Appearances')} valeur={s.matchs} />
              <Chiffre nom={t('Goals')} valeur={s.buts} />
              <Chiffre nom={t('Assists')} valeur={s.passes} />
              <Chiffre nom={t('Shots')} valeur={s.tirs} />
              <Chiffre nom={t('On target')} valeur={s.tirsCadres} />
              <Chiffre nom={t('Fouls')} valeur={s.fautes} />
              <Chiffre nom={t('Yellow')} valeur={s.jaunes} />
              <Chiffre nom={t('Red')} valeur={s.rouges} />
              {/* Arrêts et buts encaissés existent sur TOUS les joueurs chez
                  ESPN, à zéro pour les joueurs de champ. Les montrer là
                  n'apprendrait rien et laisserait croire à une donnée. */}
              {gardien && <Chiffre nom={t('Saves')} valeur={s.arrets} />}
              {gardien && <Chiffre nom={t('Conceded')} valeur={s.encaisses} />}
            </div>
            {/* Le ratio ne se calcule que s'il veut dire quelque chose. */}
            {s.tirs !== null && s.tirs > 0 && s.buts !== null && (
              <p className="mt-2 text-xs text-muted-foreground">
                {s.buts} goal{s.buts === 1 ? '' : 's'} from {s.tirs} shot
                {s.tirs === 1 ? '' : 's'} — {Math.round((s.buts / s.tirs) * 100)}% conversion
                {s.matchs !== null && s.matchs > 0 && (
                  <> · {(s.buts / s.matchs).toFixed(2)} per appearance</>
                )}
                .
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function Chiffre({ nom, valeur }: { nom: string; valeur: number | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{nom}</div>
      <div className="text-base font-semibold tabular-nums">{valeur === null ? '—' : valeur}</div>
    </div>
  )
}
