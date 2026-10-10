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

/** Le repli quand l'API n'a pas répondu : « saudi-pro-league » → « Saudi Pro League ». */
function joliSlug(slug: string): string {
  return slug
    .split('-')
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
    .join(' ')
}

export function Clubs() {
  const [etat, setEtat] = useState<Etat>({})

  usePageHead(
    Object.keys(etat).length
      ? {
          titre: 'Football league tables, clubs and squads',
          description: `The live table of ${CONTINENTS.flatMap((c) => CHAMPIONNATS[c]).length} leagues across ${CONTINENTS.length} continents — points, goal difference, form — and every club's current squad. Premier League, LALIGA, Serie A, Brasileirão, MLS and more.`,
          chemin: '/clubs',
        }
      : null,
  )

  const pret = Object.keys(etat).length
  const nombreDeLigues = CONTINENTS.flatMap((c) => CHAMPIONNATS[c]).length
  useJsonLd(
    'clubs-index',
    pret
      ? {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Football league tables, clubs and squads',
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
        // Deux tentatives : l'échec observé le 8 octobre 2026 sur la J-League
        // était un hoquet isolé — six appels de contrôle ont tous répondu 200
        // dans la foulée. Le lien du championnat est rendu quoi qu'il arrive
        // (voir plus bas) ; cette reprise sert à ne pas perdre son nom réel
        // ni son nombre de clubs pour une seule requête malchanceuse.
        for (let essai = 0; essai < 2; essai++) {
          try {
            const { nomLigue, clubs } = await clubsDuChampionnat(ch.espn)
            if (!vivant) return
            setEtat((e) => ({ ...e, [ch.slug]: { nom: nomLigue, clubs: clubs.length } }))
            break
          } catch {
            if (!vivant) return
            if (essai === 0) await new Promise((r) => setTimeout(r, 600))
            // Au second échec on abandonne ce championnat : son lien reste
            // affiché, sans son nom complet ni son compte. On n'invente rien.
          }
        }
      }
    })()
    return () => {
      vivant = false
    }
  }, [])

  return (
    <div className="container max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Leagues</h1>
      <p className="mt-3 text-muted-foreground max-w-2xl">
        {nombreDeLigues} leagues across {CONTINENTS.length} continents. Open one for its live
        table — points, goal difference, games played — and for every club in it, squad
        included. All of it pulled live, never typed by hand.
      </p>

      {CONTINENTS.map((continent: Continent) => {
        // On rend TOUS les championnats du tableau, pas seulement ceux dont
        // l'appel a abouti. Sinon un hoquet d'ESPN pendant le prérendu fait
        // disparaître un championnat entier de l'index — et ses vingt fiches
        // avec lui, puisque c'est d'ici qu'on y accède. C'est arrivé à la
        // J-League le 8 octobre 2026. Le nom et le compte restent, eux,
        // conditionnés à la réponse : on n'invente rien.
        const ligues = CHAMPIONNATS[continent]
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
                    <span className="font-medium">{etat[ch.slug]?.nom ?? joliSlug(ch.slug)}</span>
                    {etat[ch.slug] && (
                      <span className="text-sm text-muted-foreground shrink-0">
                        {etat[ch.slug]!.clubs} clubs
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <p className="mt-12 text-sm text-muted-foreground">
        Squads and club details come from ESPN's public soccer API and refresh on their schedule,
        not ours. Morocco has no league of its own here — that source carries no Botola at all —
        so Moroccan sides appear only through the two African cups above.
      </p>
    </div>
  )
}
