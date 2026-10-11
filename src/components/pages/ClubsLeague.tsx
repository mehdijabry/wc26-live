import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { championnatParSlug, championnatComplet, type ClubResume, type GroupeClassement } from '../../lib/clubs'
import { usePageHead, useJsonLd } from '../../lib/head'
import { trLeague, useLang, useT } from '../../lib/i18n'
import { cn } from '../../lib/utils'

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
  const [groupes, setGroupes] = useState<GroupeClassement[]>([])
  const t = useT()
  const lang = useLang((s) => s.lang)

  usePageHead(
    nomLigue && clubs.length
      ? {
          titre: `${nomLigue} clubs and squads`,
          description: `Every club in the ${nomLigue} — all ${clubs.length} of them, each with its current squad: names, shirt numbers and positions.`,
          chemin: `/clubs/${league ?? ''}`,
        }
      : null,
  )

  // Fil d'Ariane structuré : fait afficher « pressing90.live > Clubs > LaLiga »
  // dans les resultats Google au lieu de l'adresse brute.
  useJsonLd(
    'fil',
    nomLigue
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Clubs', item: 'https://pressing90.live/clubs' },
            {
              '@type': 'ListItem',
              position: 2,
              name: nomLigue,
              item: `https://pressing90.live/clubs/${ch?.slug ?? ''}`,
            },
          ],
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
    championnatComplet(cleLigue)
      .then((r) => {
        if (!vivant) return
        setNomLigue(r.nomLigue)
        setClubs(r.clubs)
        setGroupes(r.groupes)
      })
      .catch(() => {})
    return () => {
      vivant = false
    }
  }, [cleLigue])

  if (!ch) {
    return (
      <div className="container max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold">{t('League not found')}</h1>
        <Link to="/clubs" className="mt-4 inline-block underline">
          {t('Back to every league')}
        </Link>
      </div>
    )
  }

  return (
    <div className="container max-w-5xl mx-auto px-6 py-10">
      <Link to="/clubs" className="text-sm text-muted-foreground hover:underline">
        ← {t('All leagues')}
      </Link>
      <h1 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
        {nomLigue ? trLeague(nomLigue, lang) : t('Loading…')}
      </h1>
      {clubs.length > 0 && (
        <p className="mt-3 text-muted-foreground">
          {t('{n} clubs. Open one for its full squad.').replace('{n}', String(clubs.length))}
        </p>
      )}

      {/* ── Le classement officiel ────────────────────────────────────────
          Il sortait DÉJÀ de la requête qui sert la liste des clubs : on ne
          lisait que les équipes et on jetait les points (Mehdi, 2026-10-10).
          Zéro aller-retour de plus. */}
      {groupes.map((g) => (
        <Tableau key={g.nom} groupe={g} ligue={ch.slug} multiple={groupes.length > 1} />
      ))}

      {groupes.length > 0 && (
        <h2 className="mt-10 font-mono text-[11px] uppercase tracking-wider text-slate-500">
          {t('All clubs')}
        </h2>
      )}

      <ul className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', groupes.length ? 'mt-3' : 'mt-8')}>
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

/**
 * Un tableau de classement.
 *
 * ── LES EN-TÊTES NE PASSENT PAS PAR LE DICTIONNAIRE ───────────────────────
 * Ce sont des abréviations d'une à trois lettres, et le dictionnaire est
 * indexé sur la chaîne anglaise : « D » voudrait dire Draw ici et pourrait
 * déjà vouloir dire autre chose ailleurs. Une petite table par langue est
 * plus sûre, et elle se lit d'un coup d'œil.
 *
 * ── CE QU'ON MONTRE SUR UN TÉLÉPHONE ──────────────────────────────────────
 * Neuf colonnes ne tiennent pas sur 375 px. Le rang, le club, les matchs
 * joués, la différence et les points suffisent à lire un classement ; le
 * détail V/N/D et les buts n'apparaissent qu'à partir de `sm`.
 */
const ENTETES: Record<string, string[]> = {
  //         J      G    N    P    BP    BC    Diff   Pts
  en: ['Pld', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'],
  fr: ['J', 'G', 'N', 'P', 'BP', 'BC', 'Diff', 'Pts'],
  ar: ['لعب', 'ف', 'ت', 'خ', 'له', 'عليه', 'الفارق', 'نقاط'],
}

function Tableau({ groupe, ligue, multiple }: { groupe: GroupeClassement; ligue: string; multiple: boolean }) {
  const lang = useLang((s) => s.lang)
  const e = ENTETES[lang] ?? ENTETES.en!
  return (
    <section className="mt-8">
      {multiple && (
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500 mb-2">
          {groupe.nom}
        </h2>
      )}
      {/* Le tableau déborde dans SON cadre, jamais la page. */}
      <div className="overflow-x-auto rounded-xl border border-slate-200/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              <th className="py-2 ps-3 pe-1 text-start font-normal w-8">#</th>
              <th className="py-2 pe-2 text-start font-normal">{' '}</th>
              <th className="py-2 px-1.5 text-end font-normal tabular-nums">{e[0]}</th>
              <th className="py-2 px-1.5 text-end font-normal tabular-nums hidden sm:table-cell">{e[1]}</th>
              <th className="py-2 px-1.5 text-end font-normal tabular-nums hidden sm:table-cell">{e[2]}</th>
              <th className="py-2 px-1.5 text-end font-normal tabular-nums hidden sm:table-cell">{e[3]}</th>
              <th className="py-2 px-1.5 text-end font-normal tabular-nums hidden md:table-cell">{e[4]}</th>
              <th className="py-2 px-1.5 text-end font-normal tabular-nums hidden md:table-cell">{e[5]}</th>
              <th className="py-2 px-1.5 text-end font-normal tabular-nums">{e[6]}</th>
              <th className="py-2 ps-1.5 pe-3 text-end font-normal tabular-nums">{e[7]}</th>
            </tr>
          </thead>
          <tbody>
            {groupe.lignes.map((l) => (
              <tr key={l.club.id} className="border-t border-slate-200/70 hover:bg-slate-50/60 transition-colors">
                <td className="py-2 ps-3 pe-1 font-mono text-[11px] tabular-nums text-slate-500">{l.rang}</td>
                <td className="py-2 pe-2 min-w-[9rem]">
                  <Link to={`/club/${ligue}/${l.club.slug}`} className="flex items-center gap-2 hover:text-accent-gold transition-colors">
                    {l.club.logo && (
                      <img src={l.club.logo} alt="" width={20} height={20} loading="lazy" className="shrink-0" />
                    )}
                    <span className="truncate">{l.club.nomCourt}</span>
                  </Link>
                </td>
                <td className="py-2 px-1.5 text-end tabular-nums text-slate-600">{l.joues}</td>
                <td className="py-2 px-1.5 text-end tabular-nums text-slate-600 hidden sm:table-cell">{l.gagnes}</td>
                <td className="py-2 px-1.5 text-end tabular-nums text-slate-600 hidden sm:table-cell">{l.nuls}</td>
                <td className="py-2 px-1.5 text-end tabular-nums text-slate-600 hidden sm:table-cell">{l.perdus}</td>
                <td className="py-2 px-1.5 text-end tabular-nums text-slate-600 hidden md:table-cell">{l.pour}</td>
                <td className="py-2 px-1.5 text-end tabular-nums text-slate-600 hidden md:table-cell">{l.contre}</td>
                <td className="py-2 px-1.5 text-end tabular-nums text-slate-600">{l.difference}</td>
                <td className="py-2 ps-1.5 pe-3 text-end tabular-nums font-semibold text-slate-900">{l.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
