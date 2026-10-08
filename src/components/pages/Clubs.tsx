import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CHAMPIONNATS, CONTINENTS, clubsDuChampionnat, type Continent } from '../../lib/clubs'
import { usePageHead, useJsonLd } from '../../lib/head'

/**
 * /clubs — l'arborescence continent → pays → championnat.
 *
 * Les noms de championnats et le nombre de clubs ne sont pas écrits dans le
 * code : ils sont demandés à ESPN au montage, et le prérendu photographie la
 * page une fois les réponses arrivées. Ajouter un championnat dans
 * `lib/clubs.ts` le fait apparaître ici sans toucher à ce fichier.
 */
type Etat = Record<string, { nom: string; clubs: number }>

export function Clubs() {
  const [etat, setEtat] = useState<Etat>({})

  usePageHead(
    Object.keys(etat).length
      ? {
          titre: 'Football clubs by league, country and continent',
          description:
            'Every club in sixteen leagues across four continents, with the current squad on each club page. Premier League, LALIGA, Serie A, Brasileirão, MLS and more.',
          chemin: '/clubs',
        }
      : null,
  )

  const pret = Object.keys(etat).length
  useJsonLd(
    'clubs-index',
    pret
      ? {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Football clubs by league, country and continent',
          url: 'https://pressing90.live/clubs',
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: pret,
            itemListElement: CONTINENTS.flatMap((c) => CHAMPIONNATS[c])
              .filter((ch) => etat[ch.slug])
              .map((ch, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                name: etat[ch.slug]!.nom,
                url: `https://pressing90.live/clubs/${ch.slug}`,
              })),
          },
        }
      : null,
  )

  useEffect(() => {
    let vivant = true
    const tous = CONTINENTS.flatMap((c) => CHAMPIONNATS[c])
    // En série plutôt qu'en parallèle : seize requêtes simultanées vers ESPN
    // se font jeter, et le prérendu a tout son temps.
    ;(async () => {
      for (const ch of tous) {
        try {
          const { nomLigue, clubs } = await clubsDuChampionnat(ch.espn)
          if (!vivant) return
          setEtat((e) => ({ ...e, [ch.slug]: { nom: nomLigue, clubs: clubs.length } }))
        } catch {
          // Un championnat injoignable ne doit pas vider la page : il
          // disparaît simplement de la liste, les quinze autres restent.
        }
      }
    })()
    return () => {
      vivant = false
    }
  }, [])

  return (
    <div className="container max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Clubs by league</h1>
      <p className="mt-3 text-muted-foreground max-w-2xl">
        Sixteen leagues across four continents. Open a league for its clubs, open a club for its
        full squad — every name, number and position pulled live, never typed by hand.
      </p>

      {CONTINENTS.map((continent: Continent) => {
        const ligues = CHAMPIONNATS[continent].filter((ch) => etat[ch.slug])
        if (!ligues.length) return null
        return (
          <section key={continent} className="mt-10">
            <h2 className="text-xl font-semibold">{continent}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {ligues.map((ch) => (
                <li key={ch.slug}>
                  <Link
                    to={`/clubs/${ch.slug}`}
                    className="flex items-baseline justify-between gap-3 rounded-lg border px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <span className="font-medium">{etat[ch.slug]!.nom}</span>
                    <span className="text-sm text-muted-foreground shrink-0">
                      {etat[ch.slug]!.clubs} clubs
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <p className="mt-12 text-sm text-muted-foreground">
        Squads and club details come from ESPN's public soccer API and refresh on their schedule,
        not ours. Moroccan clubs are missing because that source carries neither the Botola nor any
        Moroccan side in its African Champions League list.
      </p>
    </div>
  )
}
