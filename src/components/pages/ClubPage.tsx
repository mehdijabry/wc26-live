import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  championnatParSlug,
  clubAvecEffectif,
  clubsDuChampionnat,
  type ClubDetail,
} from '../../lib/clubs'
import { usePageHead, useJsonLd } from '../../lib/head'

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
  const { league, club } = useParams<{ league: string; club: string }>()
  const ch = league ? championnatParSlug(league) : null
  const [detail, setDetail] = useState<ClubDetail | null>(null)
  const [introuvable, setIntrouvable] = useState(false)

  usePageHead(
    detail
      ? {
          titre: `${detail.nom} squad, players and numbers`,
          description: `The current ${detail.nom} squad: ${detail.effectif.length} players with shirt numbers, positions and ages${detail.stade ? `. Home ground: ${detail.stade}` : ''}.`,
          chemin: `/club/${league ?? ''}/${club ?? ''}`,
        }
      : null,
  )

  // SportsTeam : le schéma que Google comprend pour un club, avec l'effectif
  // en `athlete`. C'est la seule chose de cette page qu'il ne trouve pas déjà
  // formatée ailleurs, donc c'est elle qui lui donne une raison de l'indexer.
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
                  name: ch.slug.replace(/-/g, ' '),
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
        const { clubs } = await clubsDuChampionnat(cleLigue)
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
        <h1 className="text-2xl font-bold">Club not found</h1>
        <Link to="/clubs" className="mt-4 inline-block underline">
          Back to every league
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

  return (
    <div className="container max-w-4xl mx-auto px-6 py-10">
      <Link to={`/clubs/${ch.slug}`} className="text-sm text-muted-foreground hover:underline">
        ← {ch.slug.replace(/-/g, ' ')}
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
            Squad — {effectif.length} players
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Player</th>
                  <th className="py-2 pr-3 font-medium">Position</th>
                  <th className="py-2 pr-3 font-medium">Age</th>
                  <th className="py-2 font-medium">Nationality</th>
                </tr>
              </thead>
              <tbody>
                {effectif.map((j) => (
                  <tr key={j.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">{j.numero ?? '—'}</td>
                    <td className="py-2 pr-3 font-medium">{j.nom}</td>
                    <td className="py-2 pr-3">{j.poste ?? '—'}</td>
                    <td className="py-2 pr-3 tabular-nums">{j.age ?? '—'}</td>
                    <td className="py-2">{j.nationalite ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-10 text-sm text-muted-foreground">
        Squad data comes from ESPN's public soccer API and changes when they update it. Numbers and
        positions are theirs, not ours — nothing on this page is typed by hand.
      </p>
    </div>
  )
}
