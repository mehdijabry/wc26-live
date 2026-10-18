import { useEffect, useState } from 'react'
import { useLang } from '../lib/i18n'
import { SectionFiche } from './SectionFiche'

/**
 * LE STADE D'UN MATCH : une photo, deux phrases, et le temps qu'il y faisait.
 *
 * Mehdi, 17/10/2026 : « dans les fiches de match je vois les terrains où
 * seront joués les matchs, mais je voudrais aussi une petite image du
 * terrain, des infos sur la météo du jour et une toute petite description ».
 *
 * ── DEUX SOURCES, AUCUNE CLÉ, AUCUN QUOTA ─────────────────────────────────
 * · WIKIPÉDIA, en un seul appel : `generator=search` trouve la page à partir
 *   du nom que donne ESPN — qui ne correspond jamais exactement à un titre
 *   d'article (« Hill Dickinson Stadium » a changé deux fois de nom) — et
 *   `prop=pageimages|extracts|coordinates` rend du même coup la photo, les
 *   deux premières phrases ET les coordonnées. Ces coordonnées évitent un
 *   géocodage par le nom de ville, qui se trompe de continent pour tout ce
 *   qui s'appelle Springfield.
 * · OPEN-METEO pour le temps, gratuit et sans inscription.
 *
 * ── LA MÉTÉO EST CELLE DU COUP D'ENVOI, PAS DE MAINTENANT ────────────────
 * « La météo du jour » sur un match joué ce matin à 7 h 30 n'a aucun sens
 * si elle affiche le temps qu'il fait au moment où on lit la fiche.
 * `past_days=2` couvre les matchs récents, la prévision couvre les
 * prochains, et on prend l'heure la plus proche du coup d'envoi. Hors de
 * cette fenêtre — un match de la saison dernière, un match dans trois
 * semaines — la ligne ne s'affiche pas du tout.
 *
 * ── CE BLOC EST DÉCORATIF, DONC IL SE TAIT QUAND IL NE SAIT PAS ──────────
 * Contrairement aux données de match, personne n'est venu pour lui : en cas
 * d'échec il ne rend RIEN. Afficher « impossible de charger le stade » dans
 * une fiche de match serait du bruit (la règle des trois états vaut pour ce
 * qu'on est venu lire, pas pour l'habillage).
 */

type Stade = {
  nom: string
  extrait: string
  image: string | null
  lat: number | null
  lon: number | null
}

type Meteo = { temp: number; vent: number; pluie: number; code: number }

const cache = new Map<string, Stade | null>()
const cacheMeteo = new Map<string, Meteo | null>()

/** Les familles de temps de l'OMM, réduites à ce qu'on sait dessiner. */
function famille(code: number): 'soleil' | 'eclaircies' | 'nuages' | 'brouillard' | 'pluie' | 'neige' | 'orage' {
  if (code === 0) return 'soleil'
  if (code === 1 || code === 2) return 'eclaircies'
  if (code === 3) return 'nuages'
  if (code === 45 || code === 48) return 'brouillard'
  if (code >= 71 && code <= 77) return 'neige'
  if (code === 85 || code === 86) return 'neige'
  if (code >= 95) return 'orage'
  return 'pluie'
}

/**
 * Les libellés vivent ICI et non dans `lib/i18n`.
 *
 * Sept mots d'un vocabulaire qui n'est utilisé nulle part ailleurs : les
 * ranger dans le dictionnaire du site ferait trois entrées à tenir à jour
 * pour chacun, dans un fichier déjà long de mille lignes, sans qu'aucune
 * autre page ne s'en serve jamais.
 */
const MOTS: Record<string, Record<string, string>> = {
  soleil: { fr: 'Dégagé', en: 'Clear', ar: 'صحو' },
  eclaircies: { fr: 'Éclaircies', en: 'Partly cloudy', ar: 'غائم جزئيا' },
  nuages: { fr: 'Couvert', en: 'Overcast', ar: 'غائم' },
  brouillard: { fr: 'Brouillard', en: 'Fog', ar: 'ضباب' },
  pluie: { fr: 'Pluie', en: 'Rain', ar: 'مطر' },
  neige: { fr: 'Neige', en: 'Snow', ar: 'ثلج' },
  orage: { fr: 'Orage', en: 'Thunderstorm', ar: 'عاصفة رعدية' },
}

function Pictogramme({ f }: { f: ReturnType<typeof famille> }) {
  const c = 'currentColor'
  const nuage = <path d="M7 18h9a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7 12.3 3 3 0 0 0 7 18Z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" fill="none" />
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      {f === 'soleil' && (
        <>
          <circle cx="12" cy="12" r="4.2" stroke={c} strokeWidth="1.6" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {f === 'eclaircies' && (
        <>
          <circle cx="8.5" cy="8.5" r="3" stroke={c} strokeWidth="1.5" />
          <path d="M8.5 2.6v1.6M2.6 8.5h1.6M4.3 4.3l1.1 1.1" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
          {nuage}
        </>
      )}
      {f === 'nuages' && nuage}
      {f === 'brouillard' && (
        <>
          {nuage}
          <path d="M5 21h14M7 23h10" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
      {f === 'pluie' && (
        <>
          {nuage}
          <path d="M9 20.5 8 23M13 20.5 12 23M17 20.5 16 23" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {f === 'neige' && (
        <>
          {nuage}
          <path d="M9 21.5h.01M13 22.5h.01M17 21.5h.01" stroke={c} strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
      {f === 'orage' && (
        <>
          {nuage}
          <path d="M13 19.5 10 23h3l-1 2.5" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}

/** L'alphabet de Wikipédia : son propre domaine par langue, l'anglais en repli. */
const wikiDe = (lang: string) => (lang === 'fr' ? 'fr' : lang === 'ar' ? 'ar' : 'en')
/** Le mot « stade » dans la langue du wiki interrogé. */
const MOT_STADE: Record<string, string> = { fr: 'stade', en: 'stadium', ar: 'ملعب' }

/**
 * UNE IMAGE DE LOGO N'EST PAS UNE PHOTO DE STADE.
 *
 * `pageimages` rend l'image de tête de l'article, et pour le Bernabéu la
 * Wikipédia française met son LOGO 2025 — un SVG. On la refuse et on va
 * chercher la photo sur la Wikipédia anglaise, mieux illustrée.
 */
const estLogo = (url: string) => /\.svg|logo|crest|badge|escudo|wappen|\u0634\u0639\u0627\u0631/i.test(url)

type PageWiki = {
  index?: number
  title?: string
  extract?: string
  thumbnail?: { source?: string }
  coordinates?: Array<{ lat?: number; lon?: number }>
}

/**
 * LE PREMIER RÉSULTAT N'EST PAS LE BON, ET DEUX FILTRES SONT NÉCESSAIRES.
 *
 * Mehdi, 17/10/2026 : « plusieurs photos de stade sont comme ça » — la
 * fiche du Real Madrid affichait le portrait en noir et blanc de Santiago
 * Bernabéu, l'HOMME. Mesuré ce jour-là sur fr.wikipedia :
 *
 *   · « Santiago Bernabéu Madrid » → 1. l'homme · 2. la station de métro
 *     · 3. le stade. Ajouter la ville AGGRAVE le cas : elle fait remonter
 *     la station de métro, qui porte le même nom.
 *   · « stade Santiago Bernabéu » → 1. l'homme · 2. le stade.
 *
 * D'où la règle : on préfixe le mot « stade » dans la langue du wiki, on
 * retire la ville, et on retient le premier résultat QUI PORTE DES
 * COORDONNÉES. Une biographie n'en a pas ; un stade en a toujours. Ces
 * mêmes coordonnées servent ensuite à la météo, donc le filtre qui
 * garantit le bon article garantit aussi la bonne météo.
 */
/** Les mots qui désignent un lieu de match, dans les langues qu'on sert. */
const TITRE_DE_LIEU = /stadi|stade|estadio|arena|\bpark\b|\bfield\b|ground|\u0645\u0644\u0639\u0628/i
/** Une page de saison ou une liste n'est jamais le stade qu'on cherche. */
const PAS_UN_LIEU = /\b(?:19|20)\d{2}[–\-/]\d{2}\b|\bseason\b|saison|list of|liste de|\u0642\u0627\u0626\u0645\u0629/i

async function interrogerWiki(dom: string, nom: string): Promise<PageWiki | null> {
  const mot = MOT_STADE[dom] ?? MOT_STADE.en
  const url = `https://${dom}.wikipedia.org/w/api.php?action=query&generator=search`
    + `&gsrsearch=${encodeURIComponent(`${mot} ${nom}`)}&gsrlimit=5`
    + '&prop=pageimages%7Cextracts%7Ccoordinates&exintro=1&explaintext=1&exsentences=2'
    + '&piprop=thumbnail&pithumbsize=640&format=json&origin=*'
  const r = await fetch(url, { signal: AbortSignal.timeout(9000) })
  if (!r.ok) return null
  const j = await r.json() as { query?: { pages?: Record<string, PageWiki> } }
  const pages = Object.values(j.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
    .filter((p) => p.title && !PAS_UN_LIEU.test(p.title))

  // LES COORDONNÉES SONT UN INDICE, PAS UNE CONDITION. Première version :
  // on exigeait des coordonnées, parce qu'une biographie n'en a pas. Mais
  // « El Sadar Stadium » n'en publie pas non plus sur la Wikipédia
  // ANGLAISE — son infobox n'alimente pas l'index géographique — et la
  // fiche d'Osasuna - Racing est sortie avec un intitulé « VENUE » et rien
  // dessous (Mehdi, 17/10/2026 : « c'est inacceptable »).
  //
  // Donc : d'abord celui qui porte des coordonnées, sinon le premier dont
  // le TITRE nomme un lieu de match. Santiago Bernabéu l'homme n'a ni
  // l'un ni l'autre et reste écarté ; le stade passe par l'une ou l'autre
  // porte selon le wiki.
  return pages.find((p) => p.coordinates?.length)
    ?? pages.find((p) => TITRE_DE_LIEU.test(p.title as string))
    ?? null
}

/**
 * NETTOIE LA NOTICE DE SES MARQUEURS D'ÉDITION.
 *
 * L'extrait en texte brut garde les appels de modèle des contributeurs :
 * « Le stade El Sadar ([Quoi ?]anciennement connu sous le nom… » — vu sur
 * El Sadar le 17/10/2026. On retire les crochets ([Quoi ?], [réf.
 * nécessaire], [1], [citation needed]) puis on rééquilibre les
 * parenthèses : une parenthèse ouverte jamais fermée, parce que son
 * contenu vient d'être retiré ou que la coupe à deux phrases est tombée
 * au milieu, donne une phrase qui semble inachevée. On supprime alors la
 * parenthèse orpheline elle-même, pas le texte autour.
 */
function nettoyerNotice(t: string): string {
  let x = t.replace(/\[[^\]]{0,40}\]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,;.])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // Parenthèses orphelines, retirées de la fin vers le début.
  for (let garde = 0; garde < 4; garde++) {
    const o = (x.match(/\(/g) ?? []).length
    const f = (x.match(/\)/g) ?? []).length
    if (o === f) break
    const i = o > f ? x.lastIndexOf('(') : x.indexOf(')')
    if (i < 0) break
    x = (x.slice(0, i) + x.slice(i + 1)).replace(/\s{2,}/g, ' ').trim()
  }
  return x
}

async function chercherStade(nom: string, lang: string): Promise<Stade | null> {
  const dom = wikiDe(lang)
  const p = await interrogerWiki(dom, nom)
  // Rien dans la langue du site : la Wikipédia anglaise couvre des stades
  // que les autres ignorent, et mieux vaut une notice en anglais que pas
  // de stade du tout.
  const page = p ?? (dom === 'en' ? null : await interrogerWiki('en', nom).catch(() => null))
  if (!page?.title) return null

  let image = page.thumbnail?.source ?? null
  // Pas de photo, ou un logo à la place : on ne garde que la PHOTO de la
  // version anglaise, le texte reste dans la langue du lecteur.
  if (dom !== 'en' && (!image || estLogo(image))) {
    const en = await interrogerWiki('en', nom).catch(() => null)
    const autre = en?.thumbnail?.source
    if (autre && !estLogo(autre)) image = autre
  }
  if (image && estLogo(image)) image = null

  const co = page.coordinates?.[0]
  return {
    nom: page.title,
    extrait: nettoyerNotice(page.extract ?? ''),
    image,
    lat: typeof co?.lat === 'number' ? co.lat : null,
    lon: typeof co?.lon === 'number' ? co.lon : null,
  }
}

async function chercherMeteo(lat: number, lon: number, coupDEnvoi: Date): Promise<Meteo | null> {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`
    + '&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code'
    + '&past_days=2&forecast_days=7&timezone=UTC'
  const r = await fetch(url, { signal: AbortSignal.timeout(9000) })
  if (!r.ok) return null
  const j = await r.json() as {
    hourly?: {
      time?: string[]; temperature_2m?: number[]
      precipitation_probability?: number[]; wind_speed_10m?: number[]; weather_code?: number[]
    }
  }
  const h = j.hourly
  if (!h?.time?.length) return null
  // L'heure la plus proche du coup d'envoi. Les horodatages d'Open-Meteo
  // sont en UTC sans suffixe : on l'ajoute, sinon le navigateur les lit
  // comme locaux et le décalage fait choisir la mauvaise heure.
  const cible = coupDEnvoi.getTime()
  let k = -1, meilleur = Infinity
  for (let i = 0; i < h.time.length; i++) {
    const d = Math.abs(new Date(`${h.time[i]}Z`).getTime() - cible)
    if (d < meilleur) { meilleur = d; k = i }
  }
  // Plus de 90 minutes d'écart : le coup d'envoi est hors de la fenêtre
  // couverte, et donner le temps d'un autre jour serait faux.
  if (k < 0 || meilleur > 90 * 60_000) return null
  return {
    temp: Math.round(h.temperature_2m?.[k] ?? 0),
    vent: Math.round(h.wind_speed_10m?.[k] ?? 0),
    pluie: Math.round(h.precipitation_probability?.[k] ?? 0),
    code: h.weather_code?.[k] ?? 0,
  }
}

export default function FicheStade({ titre, venue, ville, coupDEnvoi }: {
  /** L'intitulé de la section. Il part avec le bloc : voir SectionFiche. */
  titre: string
  venue?: string | null
  ville?: string | null
  coupDEnvoi?: Date | null
}) {
  const lang = useLang((s) => s.lang)
  const [stade, setStade] = useState<Stade | null | undefined>(undefined)
  const [meteo, setMeteo] = useState<Meteo | null>(null)

  // LA VILLE NE VA PAS DANS LA RECHERCHE. « Santiago Bernabéu Madrid »
  // fait remonter la station de métro du même nom (mesuré le 17/10) ;
  // le nom du stade seul, préfixé du mot « stade », tombe juste. Elle
  // reste affichée sous le nom, elle vient d'ESPN.
  const requete = venue ?? ''

  useEffect(() => {
    if (!requete) { setStade(null); return }
    const cle = `${lang}:${requete}`
    if (cache.has(cle)) { setStade(cache.get(cle) ?? null); return }
    let vivant = true
    setStade(undefined)
    void chercherStade(requete, lang)
      .catch(() => null)
      .then((s) => {
        if (!vivant) return
        cache.set(cle, s)
        setStade(s)
      })
    return () => { vivant = false }
  }, [requete, lang])

  useEffect(() => {
    setMeteo(null)
    if (!stade?.lat || !stade?.lon || !coupDEnvoi) return
    const cle = `${stade.lat},${stade.lon},${coupDEnvoi.toISOString().slice(0, 13)}`
    if (cacheMeteo.has(cle)) { setMeteo(cacheMeteo.get(cle) ?? null); return }
    let vivant = true
    void chercherMeteo(stade.lat, stade.lon, coupDEnvoi)
      .catch(() => null)
      .then((m) => {
        if (!vivant) return
        cacheMeteo.set(cle, m)
        setMeteo(m)
      })
    return () => { vivant = false }
  }, [stade?.lat, stade?.lon, coupDEnvoi])

  if (stade === undefined) {
    return (
      <SectionFiche titre={titre}>
      <div className="flex gap-4">
        <div className="w-28 h-20 sm:w-40 sm:h-28 rounded-xl bg-slate-100 animate-pulse shrink-0" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-3.5 w-2/5 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-full rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-4/5 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
      </SectionFiche>
    )
  }
  // Rien trouvé : pas de section du tout, pas même son intitulé.
  if (!stade) return null

  const f = meteo ? famille(meteo.code) : null
  const au = lang === 'fr' ? 'Au coup d’envoi' : lang === 'ar' ? 'عند انطلاق المباراة' : 'At kickoff'

  return (
    <SectionFiche titre={titre}>
      <div className="flex gap-4">
        {stade.image && (
          <img
            src={stade.image}
            alt={stade.nom}
            loading="lazy"
            className="w-28 h-20 sm:w-40 sm:h-28 rounded-xl object-cover shrink-0 bg-slate-100"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug">{stade.nom}</div>
          {ville && <div className="text-[12px] text-slate-500">{ville}</div>}
          {stade.extrait && (
            <p className="mt-1.5 text-[12.5px] leading-snug text-slate-500 line-clamp-3">
              {stade.extrait}
            </p>
          )}
        </div>
      </div>

      {meteo && f && (
        <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-3 sm:gap-5 text-[13px]">
          <span className="flex items-center gap-2 text-accent-gold">
            <Pictogramme f={f} />
            <span className="font-semibold tabular-nums">{meteo.temp}°</span>
          </span>
          <span className="text-slate-500">{MOTS[f][lang] ?? MOTS[f].en}</span>
          <span className="text-slate-500 tabular-nums">💨 {meteo.vent} km/h</span>
          {meteo.pluie > 0 && <span className="text-slate-500 tabular-nums">💧 {meteo.pluie} %</span>}
          <span className="ms-auto font-mono text-[9.5px] uppercase tracking-wider text-slate-400 shrink-0 hidden sm:block">
            {au}
          </span>
        </div>
      )}
    </SectionFiche>
  )
}
