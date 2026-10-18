import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePageHead } from '../../lib/head'
import { SectionHeader } from '../Groups'
import { localeOf, useLang, useT } from '../../lib/i18n'
import {
  dureeLisible, estLong, parJournee, videosDuJour, videosRecentes, vignetteDe,
  type VideoMatch,
} from '../../lib/videos'

/**
 * LES BUTS et LES RÉSUMÉS, rangés par journée.
 *
 * Une seule page pour les deux : elles ne diffèrent que par ce qu'elles
 * filtrent et par leur titre. En faire deux fichiers aurait garanti qu'ils
 * divergent à la première retouche.
 *
 * ── CHAQUE JOURNÉE EST UNE PLAYLIST, AVEC SON ADRESSE ─────────────────────
 * Mehdi, 18/10/2026 : « les résumés dans le site doivent être classés par
 * dates et chaque date agit comme une playlist qui a un lien propre, et
 * c'est ce lien qu'on va publier en commentaire ». Facebook pénalise les
 * liens en description : ils partent désormais en premier commentaire, et
 * un commentaire a besoin d'une adresse qui désigne une journée PRÉCISE —
 * `/resumes` aura changé demain, `/resumes/2026-10-18` jamais.
 *
 * Même composant pour les deux usages : sans `:jour` c'est l'index, qui
 * empile les journées récentes ; avec `:jour` c'est la playlist seule.
 *
 * ── ON N'HÉBERGE RIEN, ET ON NE SORT PLUS DU SITE ─────────────────────────
 * La vignette et le lecteur viennent de la source, mais cliquer mène à
 * /v/<id> — notre page — où le lecteur de l'ayant droit est embarqué. Il
 * garde ses vues, c'est ce qui rend l'opération légitime ; nous gardons le
 * visiteur.
 *
 * ── TROIS ÉTATS, PAS DEUX ─────────────────────────────────────────────────
 * `null` = on ne sait pas encore ; liste vide = il n'y a vraiment rien.
 * Afficher « aucun but aujourd'hui » parce que le réseau a toussé serait un
 * mensonge (règle posée le 12/10).
 */
export default function Videos({ kind }: { kind: 'but' | 'resume' }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { jour } = useParams<{ jour?: string }>()
  const [liste, setListe] = useState<VideoMatch[] | null>(null)
  const [echec, setEchec] = useState(false)

  const buts = kind === 'but'
  const base = buts ? '/buts' : '/resumes'
  /* Une date mal formée dans l'adresse ne doit pas partir en requête. */
  const journee = jour && /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : null
  const adresseInvalide = Boolean(jour) && journee === null

  const libelleJour = (j: string) =>
    new Date(`${j}T12:00:00Z`).toLocaleDateString(localeOf(lang), {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    })

  usePageHead({
    titre: journee
      ? `${buts ? 'Goals' : 'Highlights'} — ${journee}`
      : buts ? 'Goals in video' : 'Match highlights',
    description: journee
      ? buts
        ? `Every goal in video published on ${journee} — the big five leagues, the cups and the Champions League.`
        : `All the match highlights of ${journee} — the big five leagues, the cups and the Champions League.`
      : buts
        ? 'Every goal of the day in video — the big five leagues, the cups and the Champions League, with the scorer and the minute.'
        : 'Match highlights day by day — the big five leagues, the cups and the Champions League.',
    chemin: journee ? `${base}/${journee}` : base,
  })

  useEffect(() => {
    if (adresseInvalide) { setListe([]); setEchec(false); return }
    let vivant = true
    setListe(null); setEchec(false)
    const requete = journee
      ? videosDuJour(journee, buts ? 'but' : null)
      : videosRecentes(buts ? 'but' : null, 60)
    void requete.then((l) => {
      if (!vivant) return
      if (l === null) { setEchec(true); return }
      setListe(buts ? l : l.filter((v) => v.kind !== 'but'))
    })
    return () => { vivant = false }
  }, [buts, journee, adresseInvalide])

  const journees = useMemo(() => (liste ? parJournee(liste) : []), [liste])

  const quand = (iso: string) =>
    new Date(iso).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="container max-w-5xl mx-auto px-6 pt-10 pb-16">
      <SectionHeader
        niveau={1}
        eyebrow={journee ? libelleJour(journee) : t('football today')}
        title={buts ? t('Goals in video') : t('Match highlights')}
      />

      {/* ── LE SÉLECTEUR ─────────────────────────────────────────────
          La barre du bas n'a qu'UNE place pour les vidéos : « Goals /
          highlights » ne tient pas en 8 px dans une colonne de 47. Elle
          mène donc aux buts, et c'est ce sélecteur qui ouvre l'autre
          moitié — un appui, sans repasser par l'accueil. */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-slate-700/60 p-1 gap-1">
          {([['/buts', t('Goals'), buts], ['/resumes', t('Highlights'), !buts]] as const).map(
            ([vers, libelle, actif]) => (
              <Link
                key={vers}
                to={vers}
                className={
                  'px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ' +
                  (actif ? 'bg-accent-gold text-ink-900' : 'text-slate-400 hover:text-cream')
                }
              >
                {libelle}
              </Link>
            ),
          )}
        </div>
        {journee && (
          <Link to={base} className="text-sm font-semibold text-accent-gold hover:underline">
            {t('All days')}
          </Link>
        )}
      </div>

      {echec ? (
        <p className="mt-10 text-center text-sm text-slate-500">{t('Could not load. Try again in a moment.')}</p>
      ) : liste === null ? (
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="aspect-video rounded-2xl glass animate-pulse" />)}
        </div>
      ) : liste.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-500">
          {journee
            ? t('Nothing was published on that day.')
            : buts ? t('No goal published yet today.') : t('No highlights published yet today.')}
        </p>
      ) : (
        journees.map(({ jour: j, videos }) => (
          <section key={j} className="mt-10 first:mt-8">
            {/* L'EN-TÊTE DE JOURNÉE EST LE LIEN DE LA PLAYLIST.
                Sur la page d'une journée il n'y a rien à ouvrir : le
                titre est déjà en haut, et un lien vers soi-même est une
                impasse. */}
            {journee ? (
              <h2 className="font-display text-xl text-cream flex items-baseline gap-3">
                <span className="capitalize">{libelleJour(j)}</span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {videos.length}
                </span>
              </h2>
            ) : (
              <Link
                to={`${base}/${j}`}
                className="group flex items-baseline gap-3 w-fit"
              >
                <h2 className="font-display text-xl text-cream capitalize group-hover:text-accent-gold transition-colors">
                  {libelleJour(j)}
                </h2>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">{videos.length}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-accent-gold opacity-0 group-hover:opacity-100 transition-opacity">
                  {t('Open the playlist')}
                </span>
              </Link>
            )}

            {/* ── DEUX SECTIONS, PAS UNE LISTE ─────────────────────
                Mehdi, 18/10/2026 : « crée deux sections distinctes ». Un
                match a souvent ses deux versions, et mélangées elles se
                lisaient comme des doublons. Le court d'abord — c'est ce
                qu'on vient chercher ; l'extended ensuite, pour qui a le
                temps. Une section qui n'a rien ne s'affiche pas : un
                titre suivi du vide ne dit rien à personne. */}
            {([
              [t('Highlights'), videos.filter((v) => !estLong(v))],
              [t('Extended highlights'), videos.filter(estLong)],
            ] as const).map(([titreSection, lot]) => lot.length === 0 ? null : (
              <section key={titreSection} className="mt-5">
                {/* Le titre ne sort que si l'autre section existe aussi :
                    sur une journée qui n'a que des courts, il n'oppose
                    rien et ne ferait qu'ajouter du bruit. */}
                {videos.some(estLong) && videos.some((v) => !estLong(v)) && (
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    {titreSection}
                    <span className="ms-2 tabular-nums text-slate-600">{lot.length}</span>
                  </h3>
                )}
                <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {lot.map((v) => <CarteVideo key={v.video_id} v={v} quand={quand} />)}
                </div>
              </section>
            ))}
          </section>
        ))
      )}
    </div>
  )
}

/**
 * LA CARTE D'UNE VIDÉO.
 *
 * Sortie du corps de page le 18/10 : les deux sections d'une journée —
 * les courts, puis les extendeds — la rendent deux fois, et la dupliquer
 * aurait garanti qu'elles divergent à la première retouche.
 */
function CarteVideo({ v, quand }: { v: VideoMatch; quand: (iso: string) => string }) {
  const vign = vignetteDe(v)
  const duree = dureeLisible(v.duree_s)
  return (
    <Link to={`/v/${v.video_id}`} className="group glass rounded-2xl overflow-hidden block">
      <div className="relative aspect-video bg-ink-900">
        {vign && <img src={vign} alt="" loading="lazy" className="w-full h-full object-cover" />}
        {/* Le bouton de lecture : dessiné, centré sur le CADRE et non sur
            l'image, dont les proportions varient. */}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-14 h-14 rounded-full bg-ink-900/80 ring-2 ring-accent-gold flex items-center justify-center
                           group-hover:scale-105 transition-transform">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-accent-gold ms-0.5">
              <path d="M8 5.5v13l11-6.5-11-6.5Z" />
            </svg>
          </span>
        </span>
        {/* LA DURÉE, LÀ OÙ TOUT LE MONDE LA CHERCHE — en bas à droite de
            la vignette, comme sur n'importe quel lecteur. C'est elle qui
            sépare le résumé court de l'extended (Mehdi, 18/10/2026) ;
            elle est donc posée à gauche quand la minute d'un but occupe
            déjà le coin. `ltr` la force dans le bon sens en arabe : une
            durée inversée donnerait « 41:2 ». */}
        {duree && (
          <span dir="ltr" className="absolute bottom-2 start-2 px-1.5 py-0.5 rounded bg-ink-900/85
                                     font-mono text-[11px] tabular-nums text-cream">
            {duree}
          </span>
        )}
        {v.minute && (
          <span className="absolute bottom-2 end-2 font-display text-lg text-cream drop-shadow">{v.minute}</span>
        )}
      </div>
      <div className="p-3.5">
        <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-2">
          {v.competition && <span className="text-accent-gold truncate">{v.competition}</span>}
          <span className="ms-auto tabular-nums shrink-0">{quand(v.publie_at)}</span>
        </div>
        <div className="mt-1 text-sm font-semibold truncate">
          {v.buteur ?? (v.equipe_dom && v.equipe_ext ? `${v.equipe_dom} — ${v.equipe_ext}` : v.titre)}
        </div>
        {v.buteur && v.equipe_dom && (
          <div className="text-[12px] text-slate-500 truncate">
            {v.equipe_dom}{v.equipe_ext ? ` — ${v.equipe_ext}` : ''}
          </div>
        )}
      </div>
    </Link>
  )
}
