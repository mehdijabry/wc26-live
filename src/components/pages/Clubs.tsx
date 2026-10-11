import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CHAMPIONNATS, CONTINENTS, clubsDuChampionnat, logoChampionnat, monogrammeChampionnat, type Continent } from '../../lib/clubs'
import { usePageHead, useJsonLd } from '../../lib/head'
import { trLeague, useLang, useT } from '../../lib/i18n'

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
  const t = useT()
  const lang = useLang((s) => s.lang)
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
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t('Leagues')}</h1>
      <p className="mt-3 text-slate-500 max-w-2xl">
        {t('{n} leagues across {c} continents. Open one for its live table — points, goal difference, games played — and for every club in it, squad included. All of it pulled live, never typed by hand.')
          .replace('{n}', String(nombreDeLigues))
          .replace('{c}', String(CONTINENTS.length))}
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
            {/* Le continent est une DONNÉE (la clé du tableau des
                championnats), pas un libellé : il passe quand même par le
                dictionnaire, sinon « Americas » reste en anglais au milieu
                d'une page française. */}
            {/* Un bandeau de section plutôt qu'un titre nu : filet doré,
                intitulé en capitales espacées, compte à droite. C'est la
                grammaire du reste du site, que cette page n'avait pas. */}
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-gold">{t(continent)}</h2>
              <div className="h-px flex-1 bg-slate-200" />
              <span className="font-mono text-[11px] tabular-nums text-slate-500">{ligues.length}</span>
            </div>
            <ul className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-3">
              {ligues.map((ch) => {
                const info = etat[ch.slug]
                // ESPN colle un qualificatif de pays que personne n'emploie —
                // « English Premier League ». `trLeague` ne traduit pas le
                // nom, il le normalise.
                const nom = trLeague(info?.nom ?? joliSlug(ch.slug), lang)
                const ecusson = logoChampionnat(ch)
                return (
                  <li key={ch.slug}>
                    <Link
                      to={`/clubs/${ch.slug}`}
                      className="group h-full flex items-center gap-3.5 rounded-xl glass glass-hover px-3.5 py-3.5"
                    >
                      <span className="shrink-0 w-11 h-11 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden">
                        {ecusson ? (
                          // Dimensions explicites et chargement différé :
                          // vingt-et-une images sur une page d'index, autant
                          // qu'elles n'entrent pas toutes dans le premier
                          // rendu et ne fassent pas sauter la mise en page.
                          <img
                            src={ecusson}
                            alt=""
                            width={32}
                            height={32}
                            loading="lazy"
                            decoding="async"
                            className="w-8 h-8 object-contain"
                          />
                        ) : (
                          <span className="font-display text-[13px] font-bold tracking-tight text-accent-gold">
                            {monogrammeChampionnat(nom)}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-[15px] leading-tight text-slate-900 group-hover:text-accent-gold transition-colors">
                          {nom}
                        </span>
                        <span className="mt-1 block font-mono text-[10px] uppercase tracking-wider text-slate-500 tabular-nums truncate">
                          {ch.pays || t('continental')}
                          {info && ` · ${t('{n} clubs').replace('{n}', String(info.clubs))}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <p className="mt-12 text-sm text-slate-500">
        {t('Squads and club details come from ESPN’s public soccer API and refresh on their schedule, not ours. Morocco has no league of its own here — that source carries no Botola at all — so Moroccan sides appear only through the two African cups above.')}
      </p>
    </div>
  )
}
