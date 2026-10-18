/**
 * LES RÉSUMÉS DE MATCH — détection, rattachement, publication.
 *
 * ── UN SEUL POST PAR JOUR (18/10/2026) ────────────────────────────────────
 * Mehdi : « pour les posts automatisés highlight on ne publie plus chaque
 * match seul, on publie un post une fois qu'on a les highlights du jour au
 * complet ; on publie l'image avec la description correspondante sans
 * liens, et le lien qu'on va publier c'est le lien de la section highlight ».
 *
 * La détection, elle, n'a pas changé de rythme : chaque résumé arrive sur
 * le SITE dès qu'il est vu, une passe toutes les cinq minutes. Seule la
 * publication Facebook attend la fin de la journée. Les deux règles du
 * 17/10 — le court tout de suite, l'extended du meilleur match le soir —
 * n'ont plus d'objet : il n'y a plus de post par match à arbitrer, et tout
 * ce qui est détecté entre dans la playlist du jour.
 *
 * ── POURQUOI CE CHANGEMENT N'EST PAS COSMÉTIQUE ───────────────────────────
 * Un soir de Ligue des champions, l'ancien fonctionnement sortait dix posts
 * en rafale, chacun avec un lien dans sa description. Facebook pénalise ce
 * qui fait quitter son fil, et la sanction ne reste pas sur le post fautif :
 * « ces posts ont bloqué l'avancement d'autres posts qui avançaient bien ».
 *
 * ── POURQUOI LA PLAYLIST QUAND IL Y EN A UNE ──────────────────────────────
 * beIN déborde largement du football — padel, futsal, MMA, Libertadores.
 * Trier sur le titre marcherait mal. Mehdi a trouvé mieux : la chaîne range
 * sa Ligue 1 dans une playlist, et lire la playlist filtre la compétition
 * À LA SOURCE, pour le même coût d'une unité de quota.
 *
 * ── CE QU'ON NE FAIT JAMAIS ───────────────────────────────────────────────
 * Héberger la vidéo. On garde l'identifiant, on affiche le lecteur de
 * l'ayant droit, et sur Facebook on publie NOTRE carte avec le lien. Le
 * Rights Manager de Meta attrape un but reversé en quelques minutes, et
 * c'est la page qui prend l'avertissement.
 */
import type { Env } from './index'
import type { AutoMatch } from './automation'
import { bigMatchesToday, fbPost, labelAr, leagueAr, log, renderImage, sbHeaders } from './automation'
import { logoCompetition } from './competitions'
import { clesDAppariement, clipsDePlaylist, derniersClips, type Clip } from './youtube'
import { captionJourneeResumes } from './accroches'


export type Source = {
  cle: string
  nom: string
  /** La compétition telle qu'on l'affichera. */
  competition: string
  /** Le slug ESPN, pour ne rattacher qu'aux matchs de cette compétition. */
  slug: string
  /**
   * L'AYANT DROIT INTERDIT LA LECTURE HORS DE YOUTUBE.
   *
   * Mesuré À LA MAIN, dans un vrai navigateur, sur notre propre page —
   * parce que l'API ment sur ce point. `status.embeddable` rend `true`
   * pour les trois résumés LaLiga en base (relevé le 18/10/2026) alors
   * que le lecteur affiche « Cette vidéo inclut du contenu de LaLiga,
   * qui a bloqué sa diffusion sur ce site Web ». Le champ de l'API
   * reflète le réglage de la CHAÎNE ; le blocage, lui, vient du
   * propriétaire du contenu et ne s'y voit pas.
   *
   * Il n'existe pas de signal automatique fiable : le scrapage de
   * /embed/<id> rend ERROR pour tout le monde faute de référent, et
   * l'erreur du lecteur par postMessage s'est contredite (onReady sur la
   * vidéo bloquée, erreur 150 sur une qui marche). On relève donc par
   * source, une fois, et on corrige le jour où un diffuseur change.
   */
  embedBloque?: boolean
  type: 'chaine' | 'playlist' | 'playlist-journee'
  id: string
  /**
   * Pour `playlist-journee` : la chaîne où chercher, et le motif du titre
   * de la playlist de la journée en cours. LaLiga range ses résumés par
   * journée — « RESÚMENES J9 » — et la playlist change chaque semaine
   * (Mehdi, 17/10/2026). On prend celle dont le numéro est le plus haut,
   * une fois par demi-journée : une unité de quota, et plus rien à
   * maintenir à la main.
   */
  channelId?: string
  motifPlaylist?: RegExp
  /**
   * Le mot qui prouve que le clip appartient bien à cette compétition.
   * Inutile sur une playlist dédiée — elle est déjà filtrée — indispensable
   * sur une chaîne de diffuseur qui couvre dix sports.
   */
  motCle?: RegExp
  /** La Ligue des champions publie TOUS ses extendeds, pas seulement un. */
  extendedPourTous?: boolean
}

/** L'adresse publique du site — elle ne sert qu'aux liens de COMMENTAIRE. */
const SITE_PUBLIC = 'https://pressing90.live'

export const SOURCES: Source[] = [
  { cle: 'ligue1', nom: 'beIN SPORTS', competition: 'Ligue 1', slug: 'fra.1',
    type: 'playlist', id: 'PLTh8XJqdpxU4' },
  { cle: 'epl', nom: 'Fubo', competition: 'Premier League', slug: 'eng.1',
    type: 'chaine', id: 'UCD2lJITnvzflNhOqQckMpQg', motCle: /premier league/i },
  // Le libellé est celui de LEAGUE_AR : c'est lui qui donne le nom arabe.
  { cle: 'ucl', nom: 'DAZN', competition: 'UEFA Champions League', slug: 'uefa.champions',
    type: 'playlist', id: 'PLRnudrgaT-tc', motCle: /champions league/i, extendedPourTous: true },
  { cle: 'seriea', nom: 'Serie A', competition: 'Serie A', slug: 'ita.1',
    type: 'chaine', id: 'UCBJeMCIeLQos7wacox4hmLQ', motCle: /serie a/i },
  // LaLiga bloque l'intégration de ses propres résumés : voir `embedBloque`.
  { cle: 'laliga', nom: 'LaLiga', competition: 'LaLiga', slug: 'esp.1', embedBloque: true,
    type: 'playlist-journee', id: '', channelId: 'UCTv-XvfzLX3i4IGWAm4sbmA',
    motifPlaylist: /res[úu]menes\s*j\s*(\d+)/i, motCle: /resumen|laliga/i },
  { cle: 'bundesliga', nom: 'Bundesliga', competition: 'Bundesliga', slug: 'ger.1',
    type: 'chaine', id: 'UC6UL29enLNe4mqwTfAyeNuw', motCle: /bundesliga/i },
]

/**
 * LE MOT FAIT FOI. Mehdi, 17/10/2026 : « dans la playlist il y a aussi des
 * reels, vérifie toujours qu'il y a le mot highlights dans le titre ».
 *
 * Mesuré sur la playlist de la Ligue des champions : sur seize vidéos,
 * HUIT sont des reels, des interviews ou des clips de but — « RÜDIGER
 * ADMITS… », « VITINHA WITH AN ABSOLUTE GOLAZO! » — et seulement sept sont
 * de vrais résumés. Sans ce garde, une interview d'après-match partirait
 * sur la page comme résumé de la rencontre.
 *
 * Il n'y a donc PAS de classe « but » ici : un but se publie à la main
 * depuis l'admin, parce qu'un titre ne dit pas toujours s'il s'agit d'un
 * but, d'un arrêt ou d'un reel. Tout ce qui ne porte pas le mot est écarté.
 *
 * L'ordre des tests compte : « EXTENDED HIGHLIGHTS » contient « HIGHLIGHTS ».
 */
const MOT_RESUME = /highlights|resumen|r[ée]sum[ée]|sintesi|zusammenfassung/i

export function classer(titre: string): 'resume_court' | 'resume_long' | 'resume' | 'autre' {
  const t = String(titre || '')
  if (!MOT_RESUME.test(t)) return 'autre'
  if (/quick highlights/i.test(t)) return 'resume_court'
  if (/extended highlights|resumen extendido/i.test(t)) return 'resume_long'
  return 'resume'
}

/**
 * Normalisation d'un nom de club, des deux côtés de l'appariement.
 * « Brentford FC » chez Fubo contre « Brentford » chez nous : on retire les
 * affixes de club avant de comparer, sinon rien ne tombe jamais juste.
 */
/**
 * Les lettres que `NFD` ne décompose pas : ø, æ, ß, đ, ł ne sont pas des
 * voyelles accentuées mais des lettres à part entière. « Bødo / Glimt »
 * contre « Bodo/Glimt » ne tombait pas juste sans cette table.
 */
const LETTRES = [['ø', 'o'], ['æ', 'ae'], ['œ', 'oe'], ['ß', 'ss'], ['đ', 'd'], ['ð', 'd'], ['ł', 'l'], ['þ', 'th']] as const
const translit = (x: string) => LETTRES.reduce((t, [a, b]) => t.split(a).join(b), x)

export function cleClub(nom: string): string {
  return translit(String(nom || '').toLowerCase())
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(fc|cf|afc|rc|rcd|sv|ac|as|us|sc|ss|ssc|ogc|losc|sco|fk|bk|cd|ud|club|calcio|de|the)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Les INITIALES d'un nom composé : « Paris Saint-Germain » → « psg ».
 *
 * Sans elles, les quinze clips de Ligue 1 du 17/10 sont restés orphelins :
 * beIN écrit le nom en entier, ESPN écrit l'abréviation, et aucun des deux
 * ne contient l'autre. Les affixes de club sont retirés d'abord, sinon
 * « RC Strasbourg » donnerait « rs ».
 */
export function initiales(nom: string): string {
  const mots = translit(String(nom || '').toLowerCase())
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !/^(fc|cf|afc|rc|rcd|sv|ac|as|us|sc|ss|ssc|ogc|losc|sco|fk|bk|cd|ud|club|calcio|de|the|united|city)$/.test(w))
  return mots.length >= 2 ? mots.map((w) => w[0]).join('') : ''
}

/** Le match du jour qui correspond à cette paire, ou rien. */
export function trouverMatch(pool: AutoMatch[], paire: [string, string], slug: string): AutoMatch | null {
  const [a, b] = paire.map(cleClub)
  if (!a || !b) return null
  const ini = paire.map(initiales)
  const proche = (x: string, y: string, iy: string, ix: string) =>
    !!x && !!y && (x === y || x.includes(y) || y.includes(x)
      // L'abréviation d'un côté contre le nom complet de l'autre.
      || (!!iy && iy.length >= 2 && iy === x) || (!!ix && ix.length >= 2 && ix === y))
  // Le slug d'abord : deux clubs homonymes dans deux pays existent, et un
  // clip de Ligue 1 n'a rien à faire sur un match de Premier League.
  const candidats = pool.filter((m) => m.slug === slug)
  const va = (m: AutoMatch, x: string, ix: string) =>
    proche(cleClub(m.home), x, ix, initiales(m.home))
  const vb = (m: AutoMatch, x: string, ix: string) =>
    proche(cleClub(m.away), x, ix, initiales(m.away))
  return candidats.find((m) => va(m, a, ini[0]) && vb(m, b, ini[1]))
      ?? candidats.find((m) => va(m, b, ini[1]) && vb(m, a, ini[0]))
      ?? null
}

type Ligne = {
  video_id: string; source: string; kind: string; titre: string; description: string | null
  publie_at: string; match_id: string | null; competition: string | null
  equipe_dom: string | null; equipe_ext: string | null
  score_dom: number | null; score_ext: number | null
  publie_site: boolean; publie_fb?: boolean; fb_post_id?: string | null
  /** null tant qu'on n'a pas mesuré : « inconnu » n'est pas « ça marche ». */
  embarquable?: boolean | null
  /** Secondes. null pour une vidéo X, que YouTube ne mesure pas. */
  duree_s?: number | null
}

async function ecrire(env: Env, lignes: Ligne[]): Promise<void> {
  if (!lignes.length) return
  const envoyer = (corps: unknown) => fetch(`${env.SUPABASE_URL}/rest/v1/videos_matchs?on_conflict=video_id`, {
    method: 'POST',
    headers: sbHeaders(env, { 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify(corps),
  })
  const r = await envoyer(lignes)
  // L'ORDRE DES DÉPLOIEMENTS NE DOIT RIEN CASSER. `embarquable` arrive
  // avec la migration 037 et `duree_s` avec la 039, toutes deux appliquées
  // à la main : un worker déployé avant elles refuserait toute écriture, et
  // c'est une soirée entière de résumés qui manquerait au site. On retente
  // donc une fois sans les deux colonnes — le rattrapage de la passe
  // suivante les remplira quand la migration sera passée.
  if (!r.ok) {
    const t = await r.text()
    if (/embarquable|duree_s/i.test(t)) {
      await envoyer(lignes.map(({ embarquable: _o, duree_s: _d, ...reste }) => reste))
    }
  }
}

/**
 * EST-CE QUE CETTE VIDÉO ACCEPTERA D'ÊTRE EMBARQUÉE ?
 *
 * LaLiga interdit la lecture de ses résumés hors de YouTube, et notre page
 * affichait son message d'erreur à la place du lecteur (Mehdi,
 * 18/10/2026). On ne peut pas contourner la décision d'un ayant droit —
 * on peut seulement cesser de promettre une lecture qui n'aura pas lieu.
 *
 * `status.embeddable` le dit, et `videos.list` accepte cinquante
 * identifiants pour UNE unité de quota : négligeable à côté des 1 728
 * unités que consomme déjà la détection quotidienne.
 */
/**
 * LA DURÉE, EN SECONDES, À PARTIR DE L'ISO 8601 DE YOUTUBE.
 *
 * « PT9M48S » → 588. YouTube peut rendre des heures sur un match entier,
 * et omettre une unité quand elle vaut zéro (« PT2M » ou « PT45S ») : les
 * trois groupes sont donc facultatifs. Ce qui ne s'analyse pas rend `null`
 * — on n'écrit pas zéro, qui se lirait « 0:00 » sur la carte.
 */
export function dureeEnSecondes(iso: string | undefined): number | null {
  const m = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso ?? ''))
  if (!m) return null
  const n = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return n > 0 ? n : null
}

type MesureVideo = { embarquable: boolean; dureeS: number | null }

/**
 * CE QUE YOUTUBE SAIT D'UN LOT DE VIDÉOS, EN UN SEUL APPEL.
 *
 * `status` dit si l'ayant droit autorise la lecture hors de YouTube ;
 * `contentDetails` donne la durée. Les demander ENSEMBLE ne coûte pas plus
 * cher : le quota se compte par appel (une unité par cinquante vidéos), pas
 * par partie demandée. Les séparer aurait doublé la facture pour rien.
 */
async function mesurerVideos(cle: string, ids: string[]): Promise<Map<string, MesureVideo>> {
  const sortie = new Map<string, MesureVideo>()
  for (let i = 0; i < ids.length; i += 50) {
    const lot = ids.slice(i, i + 50)
    try {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails&id=${lot.join(',')}&key=${cle}`,
        { signal: AbortSignal.timeout(20_000) },
      )
      const j = await r.json().catch(() => ({})) as {
        items?: Array<{ id?: string; status?: { embeddable?: boolean }; contentDetails?: { duration?: string } }>
      }
      for (const it of j.items ?? []) {
        if (!it.id) continue
        sortie.set(it.id, {
          embarquable: it.status?.embeddable !== false,
          dureeS: dureeEnSecondes(it.contentDetails?.duration),
        })
      }
    } catch { /* on laisse inconnu : mieux que de déclarer à tort */ }
  }
  return sortie
}

/**
 * LA PASSE DE DÉTECTION. Une unité de quota par source, soit six par tour.
 * À cinq minutes d'intervalle : 1 728 unités par jour sur les 10 000.
 */
export async function scanResumes(env: Env, date: string): Promise<string> {
  if (!(env as unknown as { YOUTUBE_API_KEY?: string }).YOUTUBE_API_KEY) return 'pas de clé YouTube'
  const pool = await bigMatchesToday(env).catch(() => [] as AutoMatch[])
  const notes: string[] = []

  for (const s of SOURCES) {
    let clips: Clip[] = []
    try {
      const ytEnv = env as unknown as { YOUTUBE_API_KEY?: string }
      if (s.type === 'playlist-journee') {
        const pl = await playlistDeLaJournee(env, s)
        clips = pl ? await clipsDePlaylist(ytEnv, pl, 20) : []
      } else if (s.type === 'playlist') {
        clips = await clipsDePlaylist(ytEnv, s.id, 20)
      } else {
        clips = await derniersClips(ytEnv, s.id, 20)
      }
    } catch (e) {
      notes.push(`${s.cle}: ÉCHEC ${String(e).slice(0, 80)}`); continue
    }

    const nouvelles: Ligne[] = []
    for (const c of clips) {
      const vu = `vid:${c.videoId}`
      if (await env.CACHE.get(vu)) continue
      // Le témoin est posé AVANT toute décision : un clip qu'on a regardé
      // et écarté ne doit pas être réexaminé à chaque tour.
      await env.CACHE.put(vu, '1', { expirationTtl: 5 * 86400 })

      // Le MOT d'abord — un reel ou une interview n'ira jamais plus loin —
      // puis la compétition. Le titre seul pour le mot : une description
      // porte souvent « Highlights » dans son pied de chaîne.
      const kind = classer(c.titre)
      if (kind === 'autre') continue
      if (s.motCle && !s.motCle.test(`${c.titre} ${c.description}`)) continue
      // Un résumé sans paire d'équipes reconnue n'est pas un résumé de
      // match : c'est une compilation de journée (« EVERY Weekend Goal »).
      // On ne l'écarte pas, mais il ne sera jamais posté — faute de match.

      const k = clesDAppariement(c)
      const m = k.paire ? trouverMatch(pool, k.paire, s.slug) : null

      nouvelles.push({
        video_id: c.videoId, source: s.cle, kind,
        titre: c.titre, description: (c.description || '').slice(0, 2000),
        publie_at: c.publie || new Date().toISOString(),
        match_id: m?.id ?? null,
        competition: s.competition,
        equipe_dom: m?.home ?? k.paire?.[0] ?? null,
        equipe_ext: m?.away ?? k.paire?.[1] ?? null,
        score_dom: k.score ? k.score[0] : (m ? Number(m.homeScore) : null),
        score_ext: k.score ? k.score[1] : (m ? Number(m.awayScore) : null),
        publie_site: true,
        // Remplis juste après, en un appel pour tout le lot.
        embarquable: null as boolean | null,
        duree_s: null as number | null,
      })
    }

    if (nouvelles.length) {
      const mesures = await mesurerVideos(
        (env as unknown as { YOUTUBE_API_KEY: string }).YOUTUBE_API_KEY,
        nouvelles.map((n) => n.video_id),
      )
      for (const n of nouvelles) {
        const v = mesures.get(n.video_id)
        if (v) n.duree_s = v.dureeS
        // Une source bloquée l'emporte sur l'API, qui ne voit pas la
        // restriction du propriétaire du contenu. La durée, elle, reste
        // juste : ce n'est pas elle qui est bloquée.
        if (s.embedBloque) { n.embarquable = false; continue }
        if (v) n.embarquable = v.embarquable
      }
    }
    await ecrire(env, nouvelles)
    if (nouvelles.length) notes.push(`${s.cle}: ${nouvelles.length} nouvelles`)
  }

  // ── ON RATTRAPE CE QUI N'A JAMAIS ÉTÉ MESURÉ ──────────────────────────
  // Les lignes d'avant la 037 ont `embarquable` à null, et une page qui
  // ne sait pas affiche le lecteur — donc, pour LaLiga, le message
  // d'erreur de YouTube. Cinquante par passe, une unité de quota.
  try {
    // Les sources bloquées, d'abord et sans condition : la passe
    // précédente les avait mises à `true` sur la foi de l'API.
    for (const s of SOURCES.filter((o) => o.embedBloque)) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/videos_matchs?source=eq.${s.cle}`, {
        method: 'PATCH',
        headers: sbHeaders(env, { 'content-type': 'application/json', prefer: 'return=minimal' }),
        body: JSON.stringify({ embarquable: false }),
      })
    }
    const bloquees = new Set(SOURCES.filter((o) => o.embedBloque).map((o) => o.cle))
    const cleYt = (env as unknown as { YOUTUBE_API_KEY: string }).YOUTUBE_API_KEY
    // UNE LIGNE À RATTRAPER, C'EST : pas d'autorisation connue, OU pas de
    // durée connue. La durée arrive avec la 039 et manque donc sur tout
    // l'historique — sans ce `or`, les anciennes lignes resteraient sans
    // durée pour toujours, et la playlist d'hier n'aurait pas ses deux
    // sections lisibles.
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/videos_matchs?or=(embarquable.is.null,duree_s.is.null)&source=not.like.x*`
      + '&select=video_id,source&order=publie_at.desc&limit=50',
      { headers: sbHeaders(env) },
    )
    if (r.ok) {
      const manquants = (await r.json().catch(() => [])) as Array<{ video_id: string; source: string }>
      if (manquants.length) {
        const mesures = await mesurerVideos(cleYt, manquants.map((x) => x.video_id))
        for (const [id, v] of mesures) {
          const bloquee = bloquees.has(manquants.find((x) => x.video_id === id)?.source ?? '')
          await marquer(env, id, {
            // La source bloquée garde son `false` : l'API ne voit pas la
            // restriction de l'ayant droit et dirait `true`.
            embarquable: bloquee ? false : v.embarquable,
            duree_s: v.dureeS,
          })
        }
        notes.push(`${mesures.size} mesurées`)
      }
    }
  } catch { /* le rattrapage n'est pas critique */ }

  // ── PUIS ON REGARDE SI UNE JOURNÉE EST BOUCLÉE ────────────────────────
  // Rien ne part par match : la passe cherche une journée complète, et ne
  // publie qu'elle. Sans forcer — c'est la passe de 23 h 50 qui tranche
  // quand la journée ne s'est jamais bouclée d'elle-même.
  const poste = await publierJourneeResumes(env, date, false).catch((e) => `journée: ÉCHEC ${String(e).slice(0, 80)}`)
  if (poste) notes.push(poste)

  const note = notes.join(' | ') || 'rien de neuf'
  await log(env, date, 'yt-scan', true, note.slice(0, 700))
  return note
}

/**
 * LE POST UNIQUE DE LA JOURNÉE.
 *
 * Mehdi, 18/10/2026 : « on publie un post une fois qu'on a les highlights
 * du jour au complet ».
 *
 * ── QUAND UNE JOURNÉE EST-ELLE « AU COMPLET » ? ───────────────────────────
 * Ce n'est pas une question de montre, c'est une question d'état : la
 * journée est bouclée quand plus aucune rencontre de nos six sources n'est
 * en cours, et que chacune de celles qui sont terminées a son résumé. On le
 * mesure sur la liste ESPN du jour, pas sur une heure fixe — un soir de
 * Ligue des champions, le dernier résumé peut tomber à 23 h 40, et un
 * dimanche à 17 h.
 *
 * `force` est le filet : à 23 h 50 locales, la journée est finie qu'elle
 * soit complète ou non, et un résumé qui n'est jamais venu ne doit pas
 * retenir le post. La note dit toujours laquelle des deux raisons a
 * déclenché la publication, parce que « complet » et « on n'attend plus »
 * ne veulent pas dire la même chose quand on relit le journal.
 *
 * ── UNE JOURNÉE = UNE DATE UTC ────────────────────────────────────────────
 * Le même découpage que la base (migration 038) et que la page
 * `/resumes/<date>` : c'est cette date qui fait le lien publié en
 * commentaire, et il doit désigner la journée que le post montre.
 *
 * ── LE VERROU EST PAR DATE, PAS PAR PASSE ─────────────────────────────────
 * Un seul post par journée, même si le worker redémarre, même si Mehdi
 * appuie sur le bouton après coup. Il est posé AVANT la publication : une
 * publication qui échoue ne doit pas pouvoir être retentée en boucle toutes
 * les cinq minutes avec un commentaire à chaque fois.
 */
export async function publierJourneeResumes(env: Env, date: string, force: boolean): Promise<string | null> {
  type Attente = {
    video_id: string; kind: string; source: string; titre: string; match_id: string
    publie_at: string; competition: string | null
    equipe_dom: string | null; equipe_ext: string | null
    score_dom: number | null; score_ext: number | null
  }
  // On regarde large : trente heures couvrent la journée en cours et la
  // précédente, de sorte qu'une journée jamais publiée (worker tombé, studio
  // en panne) ne reste pas orpheline.
  const depuis = new Date(Date.now() - 30 * 3600_000).toISOString()
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/videos_matchs?publie_fb=eq.false&match_id=not.is.null`
    + `&kind=in.(resume,resume_court,resume_long)&publie_at=gte.${encodeURIComponent(depuis)}`
    + `&select=video_id,kind,source,titre,match_id,publie_at,competition,equipe_dom,equipe_ext,score_dom,score_ext`
    + `&order=publie_at.asc&limit=200`,
    { headers: sbHeaders(env) },
  )
  const attente = (await r.json().catch(() => [])) as Attente[]
  if (!attente.length) return null

  // ── ON GROUPE PAR JOURNÉE UTC, ET ON TRAITE LA PLUS ANCIENNE ──────────
  const parJour = new Map<string, Attente[]>()
  for (const x of attente) {
    const j = String(x.publie_at ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j)) continue
    const l = parJour.get(j); if (l) l.push(x); else parJour.set(j, [x])
  }
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const notesPerimees: string[] = []

  for (const jour of [...parJour.keys()].sort()) {
    const verrou = `fb:journee-resumes:${jour}`
    if (await env.CACHE.get(verrou)) continue
    const lignes = parJour.get(jour)!

    // ── UNE JOURNÉE PÉRIMÉE NE SE PUBLIE PLUS ─────────────────────────
    // La file est triée du plus ancien au plus récent, et elle contenait
    // au passage à ce fonctionnement tout l'arriéré de l'ancien régime —
    // qui ne sortait qu'un résumé par passe et laissait donc des dizaines
    // de lignes à `publie_fb = false`. Sans ce garde, la toute première
    // passe publiait le récap de LA VEILLE avant celui du jour : un post
    // périmé, en tête de page, à minuit.
    //
    // La limite : six heures après le filet de 23 h 50 de cette
    // journée-là, soit ~05 h 50 le lendemain. Assez large pour rattraper
    // un worker tombé une nuit, assez serré pour qu'aucun récap de
    // l'avant-veille ne ressorte. Au-delà, les lignes sont marquées sans
    // rien publier — sinon elles bloqueraient la file pour toujours.
    const limite = Date.parse(`${jour}T22:50:00Z`) + 6 * 3600_000
    if (Date.now() > limite) {
      for (const x of lignes) await marquer(env, x.video_id, { publie_fb: true })
      notesPerimees.push(`${jour} périmée (${lignes.length} classées sans post)`)
      continue
    }

    // ── UN SEUL RÉSUMÉ PAR MATCH DANS LA LÉGENDE ──────────────────────
    // La playlist du site montre tout — court, long, les deux. La légende,
    // elle, liste des RENCONTRES : « Barcelona 2-1 Girona » deux fois de
    // suite ferait croire à une erreur.
    const parMatch = new Map<string, Attente>()
    for (const x of lignes) {
      const vu = parMatch.get(x.match_id)
      // Le court l'emporte sur l'extended : c'est lui qui porte le score
      // relevé dans le titre, et il est sorti pour tout le monde.
      if (!vu || (vu.kind === 'resume_long' && x.kind !== 'resume_long')) parMatch.set(x.match_id, x)
    }
    const matchs = [...parMatch.values()]

    // ── LA JOURNÉE EST-ELLE BOUCLÉE ? ─────────────────────────────────
    let raison = force ? 'journée close' : ''
    if (!raison) {
      if (jour < aujourdhui) {
        // Une journée passée est finie par construction : on ne l'attend
        // plus, quoi qu'il manque.
        raison = 'journée écoulée'
      } else {
        const pool = await bigMatchesToday(env, jour.replace(/-/g, '')).catch(() => [] as AutoMatch[])
        const nos = new Set(SOURCES.map((o) => o.slug))
        const suivis = pool.filter((m) => nos.has(m.slug))
        const enCours = suivis.filter((m) => !m.completed)
        const couverts = new Set(matchs.map((m) => m.match_id))
        const manquants = suivis.filter((m) => m.completed && !couverts.has(m.id))
        // `suivis.length === 0` : ESPN n'a rien rendu (proxy en panne) ou
        // aucun de nos championnats ne jouait. Dans les deux cas on ne sait
        // PAS que la journée est complète — on attend la passe de 23 h 50
        // plutôt que de l'affirmer. C'est la même règle que « donnée
        // absente n'est pas échec de chargement ».
        if (suivis.length && !enCours.length && !manquants.length) raison = 'journée complète'
        else continue
      }
    }

    await env.CACHE.put(verrou, '1', { expirationTtl: 4 * 86400 })

    // ── L'IMAGE : LA DATE ET LES ÉCUSSONS DES CHAMPIONNATS DU JOUR ─────
    // Mehdi : « l'image qu'on publiera pour highlights sera une image
    // unique, la seule chose qui change dessus d'un post à l'autre c'est
    // la date et les logos de championnats qui ont joué ce jour ».
    const vues = new Set<string>()
    const competitions: Array<{ logo: string; label: string }> = []
    for (const m of matchs) {
      const nom = m.competition ?? SOURCES.find((o) => o.cle === m.source)?.competition ?? ''
      if (!nom || vues.has(nom)) continue
      vues.add(nom)
      const logo = logoCompetition(nom)
      // PAS D'ÉCUSSON PAR DÉFAUT : une compétition sans logo connu ne
      // figure pas sur l'image. Trois reels sont déjà sortis estampillés
      // Champions League à cause d'un repli.
      if (logo) competitions.push({ logo, label: leagueAr(nom) })
    }

    let image = ''
    try {
      image = await renderImage(env, 'resumes-du-jour', {
        lang: 'ar',
        titre: 'ملخصات اليوم',
        date: labelAr(jour),
        competitions,
        accroche: 'كل ملخصات المباريات في مكان واحد',
      })
    } catch (e) {
      await log(env, date, 'yt-journee', false, `rendu échoué (${jour}): ${String(e).slice(0, 180)}`)
      return `journée ${jour}: rendu échoué`
    }

    // ── LE LIEN DE LA JOURNÉE PART EN COMMENTAIRE, PAS EN DESCRIPTION ──
    const lien = `${SITE_PUBLIC}/resumes/${jour}`
    const p = await fbPost(env, {
      message: captionJourneeResumes({
        dateAr: labelAr(jour),
        matchs: matchs.map((m) => ({
          dom: m.equipe_dom ?? '', ext: m.equipe_ext ?? '',
          scoreDom: m.score_dom, scoreExt: m.score_ext,
          competitionAr: leagueAr(m.competition ?? SOURCES.find((o) => o.cle === m.source)?.competition ?? ''),
        })),
      }),
      // Make ne lit `link` que pour son propre module ; rien n'en arrive
      // dans la description.
      link: lien,
      image_url: image,
      title: `ملخصات اليوم — ${jour}`,
      comment: `🎬 ${lien}`,
    })

    // Tout ce que la journée contenait est marqué, y compris les extendeds
    // qui n'apparaissent pas dans la légende : ils sont dans la playlist,
    // et ils ne doivent pas déclencher un second post demain.
    for (const x of lignes) await marquer(env, x.video_id, { publie_fb: p.ok, fb_post_id: p.id ?? null })

    const note = [...notesPerimees,
      `journée ${jour} (${raison}) : ${p.ok ? 'postée' : 'échec'} — ${matchs.length} matchs, ${competitions.length} écussons${p.note ? ` · ${p.note}` : ''}`,
    ].join(' | ')
    await log(env, date, 'yt-journee', p.ok, note.slice(0, 600))
    return note
  }
  // Rien n'a été publié, mais du ménage a pu être fait : il doit se lire
  // dans le journal, sinon « aucune journée en attente » mentirait.
  if (notesPerimees.length) {
    const note = notesPerimees.join(' | ')
    await log(env, date, 'yt-journee', true, note.slice(0, 600))
    return note
  }
  return null
}

async function marquer(env: Env, videoId: string, champs: Record<string, unknown>): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/videos_matchs?video_id=eq.${encodeURIComponent(videoId)}`, {
    method: 'PATCH',
    headers: sbHeaders(env, { 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify(champs),
  })
}

/**
 * Réessaie l'appariement des clips restés sans match.
 *
 * Deux cas le justifient : un résumé sorti avant que la liste du jour ne
 * soit à jour, et une correction de normalisation qu'il faut pouvoir
 * appliquer à ce qui est déjà en base — c'est exactement ce qui est arrivé
 * le 17/10 avec « Paris Saint-Germain » contre « PSG ».
 */
export async function rattacherOrphelins(env: Env, date: string): Promise<string> {
  const pool = await bigMatchesToday(env).catch(() => [] as AutoMatch[])
  if (!pool.length) return 'aucun match du jour en mémoire'
  const depuis = new Date(Date.now() - 30 * 3600_000).toISOString()
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/videos_matchs?match_id=is.null&publie_at=gte.${encodeURIComponent(depuis)}`
    + `&select=video_id,source,titre&limit=100`,
    { headers: sbHeaders(env) },
  )
  const rows = (await r.json().catch(() => [])) as Array<{ video_id: string; source: string; titre: string }>
  let n = 0
  const noms: string[] = []
  for (const x of rows) {
    const s = SOURCES.find((o) => o.cle === x.source)
    if (!s) continue
    const k = clesDAppariement({ videoId: x.video_id, titre: x.titre, description: '', publie: '', chaine: '' })
    const m = k.paire ? trouverMatch(pool, k.paire, s.slug) : null
    if (!m) continue
    await marquer(env, x.video_id, {
      match_id: m.id, equipe_dom: m.home, equipe_ext: m.away,
      score_dom: Number(m.homeScore), score_ext: Number(m.awayScore),
    })
    n++; if (noms.length < 6) noms.push(`${m.home}-${m.away}`)
  }
  const note = n ? `${n} rattachés : ${noms.join(', ')}` : `aucun rattachement (${rows.length} orphelins examinés)`
  await log(env, date, 'yt-rattacher', true, note.slice(0, 400))
  return note
}

/**
 * La playlist de la JOURNÉE en cours d'un championnat qui range ses
 * résumés ainsi. On garde le numéro le plus haut — la journée 10 remplace
 * la 9 dès qu'elle apparaît — et on met en cache douze heures : la liste
 * ne change qu'une fois par semaine, inutile d'y revenir toutes les cinq
 * minutes.
 */
async function playlistDeLaJournee(env: Env, s: Source): Promise<string | null> {
  if (!s.channelId || !s.motifPlaylist) return null
  const cle = `yt:journee:${s.cle}`
  const connu = await env.CACHE.get(cle)
  if (connu) return connu
  const k = (env as unknown as { YOUTUBE_API_KEY?: string }).YOUTUBE_API_KEY
  if (!k) return null
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/playlists?part=snippet&channelId=${s.channelId}&maxResults=50&key=${k}`,
    { signal: AbortSignal.timeout(20_000) },
  )
  const j = await r.json().catch(() => ({})) as { items?: Array<{ id?: string; snippet?: { title?: string } }> }
  let meilleur: { id: string; n: number } | null = null
  for (const it of j.items ?? []) {
    const m = String(it.snippet?.title ?? '').match(s.motifPlaylist)
    if (!m || !it.id) continue
    const n = Number(m[1] ?? 0)
    if (!meilleur || n > meilleur.n) meilleur = { id: it.id, n }
  }
  if (!meilleur) return null
  await env.CACHE.put(cle, meilleur.id, { expirationTtl: 12 * 3600 })
  return meilleur.id
}

/**
 * FORCE LE POST DE LA JOURNÉE, sans attendre qu'elle se boucle.
 *
 * Sert deux cas : la passe de 23 h 50, quand un résumé n'est jamais venu
 * et retiendrait le post indéfiniment ; et le bouton de l'admin, quand
 * Mehdi veut sortir la journée tout de suite. Le verrou par date tient
 * dans les deux cas — appuyer deux fois ne republie rien.
 */
export async function publierEnAttente(env: Env, date: string): Promise<string> {
  const note = (await publierJourneeResumes(env, date, true)) ?? 'aucune journée en attente'
  await log(env, date, 'yt-publier', true, note.slice(0, 600))
  return note
}
