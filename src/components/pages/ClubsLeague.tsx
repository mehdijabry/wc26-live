import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { championnatParSlug, clubsDuChampionnat, type ClubResume } from '../../lib/clubs'
import { usePageHead, useJsonLd } from '../../lib/head'

/**
 * /clubs/:league — les clubs d'un championnat.
 *
 * Le titre et la description se composent à partir du nom que RENVOIE ESPN,
 * pas d'une chaîne écrite ici : si la ligue est rebaptisée, la page suit.
 */
export function ClubsLeague() {
  const { league } = useParams<{ league: string }>()
  const ch = league ? championnatParSlug(league) : null
  const [nomLigue, setNomLigue] = useState<string | null>(null)
  const [clubs, setClubs] = useState<ClubResume[]>([])

  usePageHead(
    nomLigue && clubs.length
      ? {
          titre: `${nomLigue} clubs and squads`,
          description: `Every club in the ${nomLigue} — all ${clubs.length} of them, each with its current squad: names, shirt numbers and positions.`,
          chemin: `/clubs/${league ?? ''}`,
        }
      : null,
  )

  // La liste des clubs en ItemList : Google découvre les 20 adresses sans
  // dépendre du plan du site ni de son exploration des liens.
  useJsonLd(
    'league',
    nomLigue && clubs.length
      ? {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `${nomLigue} clubs`,
          url: `https://pressing90.live/clubs/${ch?.slug ?? ''}`,
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: clubs.length,
            itemListElement: clubs.map((c, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: c.nom,
              url: `https://pressing90.live/club/${ch?.slug ?? ''}/${c.slug}`,
            })),
          },
        }
      : null,
  )

  // Même raison que dans ClubPage : `ch` est un objet neuf à chaque rendu.
  const cleLigue = ch?.espn ?? null
  useEffect(() => {
    if (!cleLigue) return
    let vivant = true
    clubsDuChampionnat(cleLigue)
      .then((r) => {
        if (!vivant) return
        setNomLigue(r.nomLigue)
        setClubs(r.clubs)
      })
      .catch(() => {})
    return () => {
      vivant = false
    }
  }, [cleLigue])

  if (!ch) {
    return (
      <div className="container max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold">League not found</h1>
        <Link to="/clubs" className="mt-4 inline-block underline">
          Back to every league
        </Link>
      </div>
    )
  }

  return (
    <div className="container max-w-5xl mx-auto px-6 py-10">
      <Link to="/clubs" className="text-sm text-muted-foreground hover:underline">
        ← All leagues
      </Link>
      <h1 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
        {nomLigue ?? 'Loading…'}
      </h1>
      {clubs.length > 0 && (
        <p className="mt-3 text-muted-foreground">
          {clubs.length} clubs. Open one for its full squad.
        </p>
      )}

      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clubs.map((c) => (
          <li key={c.id}>
            <Link
              to={`/club/${ch.slug}/${c.slug}`}
              className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              {c.logo && (
                <img src={c.logo} alt="" width={28} height={28} loading="lazy" className="shrink-0" />
              )}
              <span className="font-medium leading-tight">{c.nom}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
