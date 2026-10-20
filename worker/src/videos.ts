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
import { WORKER_PUBLIC, bigMatchesToday, fbPost, labelAr, leagueAr, log, renderImage, sbHeaders, studio, toDraw } from './automation'
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
/**
 * Les matchs d'une journée qui ONT déjà un résumé en base — publiés ou non.
 *
 * Sert à répondre « la journée est-elle complète ? ». Le faire sur la seule
 * file d'attente rendait la réponse toujours NON dès qu'une ligne avait été
 * publiée par ailleurs, ce qui était le cas de tout l'arriéré du 18/10.
 */
type LigneJour = {
  video_id: string; kind: string; source: string; publie_at: string
  /** null quand l'appariement ESPN n'a pas abouti — la rencontre existe quand même. */
  match_id: string | null
  fb_post_id: string | null
  competition: string | null
  equipe_dom: string | null; equipe_ext: string | null
  score_dom: number | null; score_ext: number | null
}

/**
 * TOUS les résumés d'une journée — publiés ou non.
 *
 * C'est la seule liste honnête pour un post qui prétend résumer la journée.
 * Bâtir la carte et la légende sur la seule FILE D'ATTENTE donnait un post
 * amputé : le 18/10, quatre matchs et deux écussons là où la journée en
 * comptait dix-huit et cinq, parce que tout le reste avait déjà été marqué
 * publié par l'ancien régime. Elle sert aussi à répondre « la journée
 * est-elle complète ? » — question à laquelle la file répondait toujours
 * non dès qu'une ligne avait été publiée ailleurs.
 */
/**
 * LA CLÉ D'UNE RENCONTRE — la PAIRE D'ÉQUIPES d'abord, pas l'identifiant.
 *
 * Contre-intuitif, et c'est pourtant le seul choix juste. Un même match
 * sort souvent en deux ou trois vidéos — QUICK, HIGHLIGHTS, EXTENDED — et
 * l'appariement ESPN ne réussit pas forcément sur toutes : l'une repart
 * avec un `match_id`, l'autre avec `null`. Les classer par identifiant
 * donnait donc DEUX rencontres pour un seul match, et le post du 18/10 a
 * annoncé dix-neuf matchs là où la page en montre onze.
 *
 * Les noms d'équipes, eux, sont présents sur toutes les versions. Ils sont
 * normalisés par `cleClub` — « Paris Saint-Germain » et « PSG » tombent
 * sur la même clé, c'est précisément son métier. L'identifiant ne sert
 * plus que de secours, quand les équipes manquent.
 */
const cleRencontre = (x: { match_id: string | null; equipe_dom: string | null; equipe_ext: string | null; video_id: string }): string =>
  (x.equipe_dom && x.equipe_ext)
    ? `${cleClub(x.equipe_dom)}|${cleClub(x.equipe_ext)}`
    : (x.match_id ?? x.video_id)

async function lignesDuJour(env: Env, jour: string): Promise<LigneJour[]> {
  const debut = `${jour}T00:00:00Z`, fin = `${jour}T23:59:59.999Z`
  // UN RÉSUMÉ NON APPARIÉ RESTE UN RÉSUMÉ. Exiger `match_id` écartait tout
  // ce que l'appariement ESPN n'avait pas reconnu — onze rencontres au lieu
  // de quinze dans le post du 18/10, alors que la page du site les montre
  // toutes. On demande donc : rattaché à un match OU portant une équipe. Ce
  // qui n'a ni l'un ni l'autre est une compilation de journée (« EVERY
  // Weekend Goal »), et n'a rien à faire dans la liste.
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/videos_matchs?or=(match_id.not.is.null,equipe_dom.not.is.null)`
    + `&kind=in.(resume,resume_court,resume_long)`
    + `&publie_at=gte.${encodeURIComponent(debut)}&publie_at=lte.${encodeURIComponent(fin)}`
    + `&select=video_id,kind,source,match_id,publie_at,fb_post_id,competition,equipe_dom,equipe_ext,score_dom,score_ext`
    + `&order=publie_at.asc&limit=300`,
    { headers: sbHeaders(env) },
  )
  return (await r.json().catch(() => [])) as LigneJour[]
}

/**
 * Rend la journée à la passe suivante — sauf au troisième échec, où on
 * renonce pour de bon plutôt que de recommencer indéfiniment.
 *
 * Une chaîne de publication qui s'arrête doit se VOIR : le journal KV n'est
 * lu par personne (règle posée après la file de rendus gelée du 13/10).
 */
async function relacher(env: Env, verrou: string, essais: number): Promise<void> {
  if (essais >= 3) {
    await env.CACHE.put(verrou, 'abandon', { expirationTtl: 4 * 86400 })
    return
  }
  await env.CACHE.delete(verrou)
}

/**
 * FABRIQUE LA CARTE DE LA JOURNÉE ET LA PUBLIE.
 *
 * Partagée par la publication automatique et par la republication à la
 * main : les deux doivent sortir EXACTEMENT la même carte, sinon la
 * seconde deviendrait un deuxième format à maintenir.
 */
/**
 * LA JOURNÉE DE RÉSUMÉS, EN REEL (Mehdi, 20/10/2026).
 *
 * « Tout passe en reel ou lien direct — même les résumés, on prépare un
 * reel spécial. » Le post photo qu'il remplace est conservé juste en
 * dessous : il sert encore de repli quand le studio est indisponible, et
 * c'est lui qui porte le rendu de l'image à écussons.
 *
 * ── NEUF SECONDES, TROIS CARTES ──────────────────────────────────────
 * Ce n'est pas un réglage au jugé, c'est la mesure de Mehdi : le même
 * contenu a fait 1 036 vues en 9 s et 3 cartes, contre 217 en 30 s. Ce
 * qui décide est la PART DU CLIP REGARDÉE, pas le nombre de matchs
 * montrés. Le reel ne porte donc que les trois premières rencontres ;
 * la liste complète vit dans la légende, qui n'a pas de durée, et le
 * lien vers la page du jour vit dans le commentaire.
 *
 * ── POURQUOI ON REPASSE PAR ESPN ─────────────────────────────────────
 * Les lignes de la table `videos` portent les noms d'équipes et le score,
 * mais PAS les écussons. Une carte sans blason est une carte vide, et le
 * gabarit refuse par principe d'en inventer un. On réapparie donc chaque
 * rencontre à son match ESPN — par `match_id` quand l'appariement avait
 * abouti, par la paire de clubs sinon — et une rencontre qu'on ne
 * retrouve pas ne prend simplement pas de carte. Elle reste dans la
 * légende.
 *
 * ── CE QUI REND CETTE SORTIE ASYNCHRONE ──────────────────────────────
 * Elle ne publie rien. Elle met un travail en file au studio et rend
 * `ok` dès que le rendu est accepté ; la publication, l'identifiant du
 * post et le commentaire arrivent dans `/studio/callback`, qui sait
 * refermer `fb:journee-post:<jour>` et relâcher le verrou si le rendu
 * échoue. L'appelant ne voit donc jamais d'identifiant ici — c'est voulu,
 * et c'est la raison pour laquelle la clé de journée est devenue la
 * seule source de vérité pour la suppression.
 */
/**
 * Plafond de reels de resume par journee, et l'ecart entre deux.
 *
 * Mehdi veut TOUS les matchs annonces. Douze est la limite haute observee
 * d'une journee reelle (dix-neuf une fois, mais avec les doublons court /
 * extended que `cleRencontre` fusionne). A douze minutes d'ecart, une
 * journee pleine s'etale sur deux heures vingt — assez pour ne pas
 * saturer le fil, assez court pour que tout sorte dans la matinee.
 */
const RESUMES_MAX_REELS = 12
const RESUMES_ECART_MIN = 12
const AR_TAGS_RESUMES = '#كرة_القدم #اهداف #Pressing90'

async function sortirLaJourneeEnReel(env: Env, jour: string, matchs: LigneJour[], apercu = false): Promise<{
  p: { ok: boolean; id?: string; note?: string }
  competitions: Array<{ logo: string; label: string }>
}> {
  const competitions: Array<{ logo: string; label: string }> = []
  const vues = new Set<string>()
  for (const m of matchs) {
    const nom = m.competition ?? SOURCES.find((o) => o.cle === m.source)?.competition ?? ''
    if (!nom || vues.has(nom)) continue
    vues.add(nom)
    const logo = logoCompetition(nom)
    if (logo) competitions.push({ logo, label: leagueAr(nom) })
  }

  // Réappariement ESPN : seul moyen d'obtenir les écussons des clubs.
  const pool = await bigMatchesToday(env, jour.replace(/-/g, '')).catch(() => [] as AutoMatch[])
  const parId = new Map(pool.map((m) => [String(m.id), m]))
  const parPaire = new Map(pool.map((m) => [`${cleClub(m.home)}|${cleClub(m.away)}`, m]))
  type Carte = ReturnType<typeof toDraw> & {
    score?: string; time: string; live: false; leagueLogo?: string
    cover?: unknown; lienCommentaire?: boolean
  }
  const rencontres: Array<{ carte: Carte; ligne: LigneJour }> = []
  for (const x of matchs) {
    if (rencontres.length >= RESUMES_MAX_REELS) break
    const e = (x.match_id ? parId.get(String(x.match_id)) : undefined)
      ?? (x.equipe_dom && x.equipe_ext ? parPaire.get(`${cleClub(x.equipe_dom)}|${cleClub(x.equipe_ext)}`) : undefined)
    if (!e) continue
    const logo = logoCompetition(x.competition ?? e.league ?? '')
    rencontres.push({
      ligne: x,
      carte: {
        ...toDraw(e),
        live: false,
        score: `${x.score_dom ?? e.homeScore}–${x.score_ext ?? e.awayScore}`,
        time: 'FT',
        ...(logo ? { leagueLogo: logo } : {}),
        // Le bandeau clignotant : sur cinq secondes, personne ne devine
        // tout seul que l'adresse est sous la vidéo.
        lienCommentaire: true,
      },
    })
  }
  // Aucune carte : le studio n'a rien à dessiner. On laisse l'appelant
  // retomber sur le post photo plutôt que de publier un reel vide.
  if (!rencontres.length) return { p: { ok: false, note: 'aucune rencontre appariée à ESPN — pas de carte à dessiner' }, competitions }

  const lien = `${SITE_PUBLIC}/resumes/${jour}`
  const n = rencontres.length
  const base = `resumes-${jour}-${Math.random().toString(36).slice(2, 7)}`
  const ids: string[] = []

  for (let i = 0; i < n; i++) {
    const { carte, ligne } = rencontres[i]
    const jobId = `${base}-${i + 1}`
    ids.push(jobId)
    // L'accroche de vignette, sur la carte unique de ce reel.
    carte.cover = { text: 'شاهد الملخص كاملاً', tone: 'results' }
    const ligueAr = leagueAr(ligne.competition ?? SOURCES.find((o) => o.cle === ligne.source)?.competition ?? '')
    const titre = `${ligne.equipe_dom ?? ''} ${ligne.score_dom ?? ''}–${ligne.score_ext ?? ''} ${ligne.equipe_ext ?? ''}`.trim()
    // La légende parle de CE match, pas de la journée : un post par match
    // qui réciterait les onze autres serait illisible, et le lecteur ne
    // saurait pas lequel il regarde. La journée entière est au bout du
    // lien, et c'est à ça que sert le commentaire.
    const description = [
      `🎬 ${ligueAr}`, '', titre, '',
      'الملخص الكامل — الرابط في التعليقات 👇', '',
      `#ملخصات ${AR_TAGS_RESUMES}`,
    ].join('\n')
    await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify(apercu
      ? { kind: 'preview', label: 'preview-resumes', date: jour }
      : {
          kind: 'reel', label: 'resumes-reel', date: jour, journee: jour,
          title: titre.slice(0, 100),
          description,
          comment: `🎬 ${lien}`,
          // Douze minutes entre deux matchs : une journée à dix résumés
          // s'étale sur deux heures au lieu de dix posts d'affilée.
          delaiMin: i * RESUMES_ECART_MIN,
        }), { expirationTtl: 12 * 3600 })
    await studio(env, '/render/reel', {
      type: 'matchday',
      // UN SEUL MATCH PAR REEL, cinq secondes. Mehdi, 20/10/2026 : « les
      // résumés, fais des reels de 5 sec chacun, pour tous les matchs ».
      // Le calcul derrière : `renderAnimatedReel` répartit la durée entre
      // les cartes, donc une carte seule prend les cinq secondes entières
      // — contre trois secondes dans un reel de neuf à trois cartes. Et
      // une vidéo de cinq secondes se regarde presque toujours à plus de
      // la moitié, ce qui est la part du clip vue que Facebook récompense.
      data: {
        matches: [carte],
        heading: ligueAr || 'ملخصات اليوم',
        lang: 'ar',
        // LE GABARIT EST UNE VIDEO (Mehdi, 20/10/2026) : un stade de nuit
        // sous les projecteurs, posé en boucle SOUS les calques. Le studio
        // remplace alors sa plaque opaque par un voile — le logo, le QR et
        // les textes restent dessinés par-dessus, seule la carte du match
        // change d'un reel à l'autre.
        fondVideo: 'stade',
      },
      seconds: 5,
      jobId,
      callbackUrl: `${WORKER_PUBLIC}/studio/callback`,
    })
    if (apercu) break   // un seul suffit à juger le rendu
  }
  const combien = apercu ? 1 : n
  return {
    p: { ok: true, note: `${combien} reel(s) de 5 s en rendu, un par match (jobs ${ids.slice(0, combien).join(', ')})${apercu ? ' — APERÇU, rien ne sera publié' : `, un toutes les ${RESUMES_ECART_MIN} min`}` },
    competitions,
  }
}

/** Rend le reel d'une journée SANS rien publier : l'adresse arrive dans le journal. */
export async function apercuJourneeResumes(env: Env, jour: string): Promise<string> {
  const toutes = await lignesDuJour(env, jour)
  if (!toutes.length) return `aucun résumé enregistré pour ${jour}`
  const parMatch = new Map<string, LigneJour>()
  for (const x of toutes) {
    const cle = cleRencontre(x)
    const vu = parMatch.get(cle)
    if (!vu || (vu.kind === 'resume_long' && x.kind !== 'resume_long')) parMatch.set(cle, x)
  }
  const r = await sortirLaJourneeEnReel(env, jour, [...parMatch.values()], true)
  return r.p.note ?? (r.p.ok ? 'en rendu' : 'échec')
}

async function sortirLaJournee(env: Env, jour: string, matchs: LigneJour[]): Promise<{
  p: Awaited<ReturnType<typeof fbPost>>
  competitions: Array<{ logo: string; label: string }>
}> {
  const vues = new Set<string>()
  const competitions: Array<{ logo: string; label: string }> = []
  for (const m of matchs) {
    const nom = m.competition ?? SOURCES.find((o) => o.cle === m.source)?.competition ?? ''
    if (!nom || vues.has(nom)) continue
    vues.add(nom)
    const logo = logoCompetition(nom)
    // PAS D'ÉCUSSON PAR DÉFAUT : une compétition sans logo connu ne figure
    // pas sur l'image. Trois reels sont déjà sortis estampillés Champions
    // League à cause d'un repli.
    if (logo) competitions.push({ logo, label: leagueAr(nom) })
  }

  const image = await renderImage(env, 'resumes-du-jour', {
    lang: 'ar',
    titre: 'ملخصات اليوم',
    date: labelAr(jour),
    competitions,
    accroche: 'كل ملخصات المباريات في مكان واحد',
  })

  // ── LE LIEN DE LA JOURNÉE PART EN COMMENTAIRE, PAS EN DESCRIPTION ────
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
  // ── ON RETIENT L'IDENTIFIANT DU POST DE JOURNÉE, À PART ───────────
  // Pas sur les lignes : elles portent AUSSI les identifiants des anciens
  // posts par match, et s'y fier a fait supprimer une publication qui
  // n'avait rien demandé (19/10/2026). Une clé par journée, et elle ne
  // désigne qu'une chose.
  if (p.ok && p.id) await (await import('./automation')).ajouterJourneePost(env, jour, p.id)
  return { p, competitions }
}

/**
 * SUPPRIME LE POST D'UNE JOURNÉE ET LE REFAIT, COMPLET.
 *
 * Mehdi, 19/10/2026 : le premier post du 18 est sorti amputé — quatre
 * matchs et deux écussons là où la journée en comptait dix-huit et cinq,
 * parce que la carte était bâtie sur la file d'attente et non sur la
 * journée. « Supprime-le et relance une version complète. »
 *
 * Ne s'appelle QUE depuis l'admin. Il ignore le verrou du jour et l'état
 * `publie_fb` — c'est tout son objet — et il supprime d'abord l'ancienne
 * publication, dont l'identifiant a été enregistré sur les lignes de la
 * journée au moment de publier. Sans date, il reprend la journée la plus
 * récente qui ait des résumés.
 */
export async function republierJournee(env: Env, date: string, jourDemande?: string): Promise<string> {
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(jourDemande ?? '')
    ? jourDemande!
    : new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10)

  const matchsDuJour = await lignesDuJour(env, jour)
  if (!matchsDuJour.length) {
    const note = `republication ${jour} : aucun résumé ce jour-là`
    await log(env, date, 'yt-rejouer', false, note)
    return note
  }

  // Un seul résumé par match dans la légende : la playlist du site montre
  // tout, la légende liste des RENCONTRES.
  const parMatch = new Map<string, LigneJour>()
  for (const x of matchsDuJour) {
    const cle = cleRencontre(x)
    const vu = parMatch.get(cle)
    if (!vu || (vu.kind === 'resume_long' && x.kind !== 'resume_long')) parMatch.set(cle, x)
  }
  const matchs = [...parMatch.values()]

  // ── D'ABORD ON EFFACE L'ANCIEN — ET LUI SEUL ──────────────────────
  // UNE SEULE SOURCE, ET ELLE NE DÉSIGNE QU'UNE CHOSE. La première
  // version lisait `fb_post_id` sur les lignes de la journée : elles en
  // portent plusieurs, hérités de l'époque où chaque match avait son
  // propre post, et la republication du 18/10 a effacé une publication
  // qui n'avait rien à voir. On ne suit plus que la clé posée au moment
  // de publier la journée. Absente, on ne supprime RIEN et on le dit —
  // mieux vaut deux posts qu'un effacement au jugé.
  const auto = await import('./automation')
  const cleAncien = `fb:journee-post:${jour}`
  // Une journée fait désormais PLUSIEURS posts — un reel de cinq secondes
  // par match. N'en supprimer qu'un laisserait les autres sur la page à
  // côté de leurs remplaçants.
  const anciens = await auto.lireJourneePosts(env, jour)

  // ── LE REPLI, POUR LES JOURNÉES D'AVANT LA CLÉ ────────────────────
  // Elle n'existe que depuis le 19/10 au soir : sans repli, une journée
  // publiée avant resterait indélogeable. On le déduit alors d'un fait de
  // structure plutôt que d'une devinette — un post de JOURNÉE est écrit
  // sur TOUTES les lignes du jour, un ancien post par match sur une
  // seule. On ne retient donc que l'identifiant porté par la majorité
  // absolue des lignes ; en cas d'égalité ou de doute, on ne supprime
  // rien. C'est ce qui manquait quand la première republication a effacé
  // un post de résumé qui n'avait rien demandé.
  if (!anciens.length) {
    const compte = new Map<string, number>()
    for (const x of matchsDuJour) if (x.fb_post_id) compte.set(x.fb_post_id, (compte.get(x.fb_post_id) ?? 0) + 1)
    const [tete, n] = [...compte.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
    if (tete && n > matchsDuJour.length / 2) anciens.push(tete)
  }

  let effacement = 'aucun post de journée identifié — rien supprimé'
  if (anciens.length) {
    const faits: string[] = []
    for (const id of anciens) {
      const r = await auto.fbSupprimer(env, id)
      faits.push(r.ok ? `supprimé ${id}` : r.note)
    }
    // La liste repart à zéro : les posts qu'on s'apprête à refaire
    // s'inscriront dedans au fur et à mesure qu'ils sortiront.
    await env.CACHE.delete(cleAncien)
    effacement = faits.join(' · ')
  }

  // Reel d'abord, post photo en repli : voir `sortirLaJourneeEnReel`.
  let { p, competitions } = await sortirLaJourneeEnReel(env, jour, matchs).catch(
    (e) => ({ p: { ok: false, note: `reel échoué: ${String(e).slice(0, 120)}` }, competitions: [] as Array<{ logo: string; label: string }> }),
  )
  if (!p.ok) {
    const repli = await sortirLaJournee(env, jour, matchs)
    p = { ...repli.p, note: `${p.note} → repli post photo${repli.p.note ? ` (${repli.p.note})` : ''}` }
    competitions = repli.competitions
  }
  for (const x of matchsDuJour) await marquer(env, x.video_id, { publie_fb: p.ok, fb_post_id: p.id ?? null })
  // Le verrou repart dans son état « publié » pour que la passe
  // automatique ne reparte pas dessus cinq minutes plus tard.
  await env.CACHE.put(`fb:journee-resumes:${jour}`, p.ok ? '1' : 'abandon', { expirationTtl: 4 * 86400 })

  const note = `republication ${jour} : ${p.ok ? 'postée' : 'échec'} — ${matchs.length} matchs, ${competitions.length} écussons`
    + ` · ${effacement}`
    + (p.note ? ` · ${p.note}` : '')
  await log(env, date, 'yt-rejouer', p.ok, note.slice(0, 700))
  return note
}

export async function publierJourneeResumes(env: Env, date: string, force: boolean): Promise<string | null> {
  type Attente = {
    video_id: string; kind: string; source: string; titre: string; match_id: string
    publie_at: string; fb_post_id: string | null; competition: string | null
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
    + `&select=video_id,kind,source,titre,match_id,publie_at,fb_post_id,competition,equipe_dom,equipe_ext,score_dom,score_ext`
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
    // La journée entière, pas seulement ce qui reste à publier.
    const toutes = await lignesDuJour(env, jour)
    const parMatch = new Map<string, LigneJour>()
    // `lignes` en secours : si la lecture de la journée échoue, mieux vaut
    // un post amputé qu'aucun post. `Attente` porte tous les champs de
    // `LigneJour`, plus le titre.
    for (const x of (toutes.length ? toutes : lignes)) {
      const cle = cleRencontre(x)
      const vu = parMatch.get(cle)
      // Le court l'emporte sur l'extended : c'est lui qui porte le score
      // relevé dans le titre, et il est sorti pour tout le monde.
      if (!vu || (vu.kind === 'resume_long' && x.kind !== 'resume_long')) parMatch.set(cle, x)
    }
    const matchs = [...parMatch.values()]

    // ── LA JOURNÉE EST-ELLE BOUCLÉE ? ─────────────────────────────────
    // L'HEURE LIMITE EST UNE CONDITION, PAS UN CRÉNEAU. Le filet vivait
    // dans le planificateur, sous la forme `hour === 23 && minute >= 50` :
    // dix minutes par jour, et si les ticks du worker étaient occupés
    // pendant ces dix minutes-là — un soir de reels de but, par exemple —
    // la journée était perdue sans aucun rattrapage. C'est exactement ce
    // qui s'est passé le 18/10 : le verrou du filet n'a jamais été posé.
    // La question « a-t-on dépassé 23 h 50 pour CETTE journée ? » se pose
    // maintenant à chaque passe de cinq minutes, et la réponse ne dépend
    // plus de l'instant où on la pose.
    const apres2350 = Date.now() > Date.parse(`${jour}T22:50:00Z`)
    let raison = force ? 'journée close' : apres2350 ? 'heure limite atteinte' : ''
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
        // CE QUI EST COUVERT SE LIT SUR TOUTE LA JOURNÉE, pas sur la file
        // d'attente. Les lignes déjà marquées `publie_fb` — tout l'arriéré
        // de l'ancien régime, qui publiait match par match — ne sont pas
        // dans `matchs`, et les compter comme manquantes rendait
        // « complète » INATTEIGNABLE : la journée n'était jamais bouclée,
        // et seul le filet pouvait encore la sortir.
        // Ici, et seulement ici, on reste sur l'identifiant ESPN : on le
        // compare à la liste des matchs d'ESPN, pas à des noms d'équipes.
        const couverts = new Set(toutes.map((x) => x.match_id).filter(Boolean) as string[])
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

    // LE VERROU EST D'ABORD UNE RÉSERVATION COURTE. Il empêche deux
    // passes de publier la même journée en même temps, mais il ne doit
    // PAS condamner la journée quand la publication échoue : le studio
    // peut dormir, Facebook peut refuser. Posé à dix minutes, il est
    // prolongé à quatre jours une fois le post sorti, et effacé si la
    // tentative rate — trois essais, puis on renonce en le disant.
    const cleEssais = `fb:journee-essais:${jour}`
    const essais = Number((await env.CACHE.get(cleEssais)) ?? '0') + 1
    await env.CACHE.put(verrou, 'en cours', { expirationTtl: 600 })
    await env.CACHE.put(cleEssais, String(essais), { expirationTtl: 4 * 86400 })

    // ── L'IMAGE : LA DATE ET LES ÉCUSSONS DES CHAMPIONNATS DU JOUR ─────
    // Mehdi : « l'image qu'on publiera pour highlights sera une image
    // unique, la seule chose qui change dessus d'un post à l'autre c'est
    // la date et les logos de championnats qui ont joué ce jour ».
    let sortie
    try {
      sortie = await sortirLaJourneeEnReel(env, jour, matchs)
      // Le reel n'a pas pu être mis en file (studio éteint, aucune
      // rencontre appariée) : on publie quand même, en photo. Une journée
      // non publiée est pire qu'une journée publiée dans l'ancien format.
      if (!sortie.p.ok) {
        const repli = await sortirLaJournee(env, jour, matchs)
        sortie = { p: { ...repli.p, note: `${sortie.p.note} → repli post photo${repli.p.note ? ` (${repli.p.note})` : ''}` }, competitions: repli.competitions }
      }
    } catch (e) {
      await relacher(env, verrou, essais)
      await log(env, date, 'yt-journee', false, `rendu échoué (${jour}), essai ${essais}/3 : ${String(e).slice(0, 160)}`)
      return `journée ${jour}: rendu échoué (essai ${essais}/3)`
    }
    const { p, competitions } = sortie

    if (p.ok) {
      // Publié : le verrou devient définitif.
      await env.CACHE.put(verrou, '1', { expirationTtl: 4 * 86400 })
    } else {
      await relacher(env, verrou, essais)
    }

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
 * LA SAISON D'ABORD, LA JOURNÉE ENSUITE.
 *
 * Une chaîne garde ses playlists d'archive : celle de LaLiga porte
 * « RESÚMENES J38 | LALIGA EA SPORTS 2025/26 » à côté de « J7 | …
 * 2026/27 ». La règle d'origine — « on garde le numéro le plus haut, la
 * journée 10 remplace la 9 » — était juste À L'INTÉRIEUR d'une saison et
 * fausse entre deux : J38 de l'an dernier battait J7 de cette année, et
 * l'a battue tous les jours depuis la reprise. Résultat, aucun résumé de
 * LaLiga détecté de toute la saison, jusqu'à ce que Mehdi remarque
 * l'absence du Real Madrid du dimanche 18 octobre.
 *
 * On lit donc la saison dans le titre et on écarte ce qui n'est pas celle
 * en cours. Un titre sans saison reste éligible — toutes les chaînes n'en
 * mettent pas — mais il passe APRÈS, pour qu'une archive datée ne reprenne
 * jamais la main sur une playlist de l'année.
 */
const SAISON = /(20\d{2})\s*\/\s*(\d{2})/

/** « 2026/27 » pour octobre 2026 : une saison bascule en juillet. */
function saisonEnCours(d = new Date()): string {
  const y = d.getUTCFullYear()
  const debut = d.getUTCMonth() + 1 >= 7 ? y : y - 1
  return `${debut}/${String(debut + 1).slice(2)}`
}

async function playlistDeLaJournee(env: Env, s: Source): Promise<string | null> {
  if (!s.channelId || !s.motifPlaylist) return null
  const cle = `yt:journee:${s.cle}`
  const connu = await env.CACHE.get(cle)
  if (connu) return connu
  const k = (env as unknown as { YOUTUBE_API_KEY?: string }).YOUTUBE_API_KEY
  if (!k) return null

  // DEUX PAGES, PAS UNE. Trente-huit journées d'archive plus celles de
  // l'année en cours dépassent les cinquante d'une page : la playlist
  // qu'on cherche peut tomber sur la seconde. Une unité de quota de plus.
  const titres: Array<{ id: string; titre: string }> = []
  let page = ''
  for (let i = 0; i < 2; i++) {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&channelId=${s.channelId}&maxResults=50`
      + `${page ? `&pageToken=${page}` : ''}&key=${k}`,
      { signal: AbortSignal.timeout(20_000) },
    )
    const j = await r.json().catch(() => ({})) as {
      items?: Array<{ id?: string; snippet?: { title?: string } }>; nextPageToken?: string
    }
    for (const it of j.items ?? []) if (it.id) titres.push({ id: it.id, titre: String(it.snippet?.title ?? '') })
    if (!j.nextPageToken) break
    page = j.nextPageToken
  }

  const voulue = saisonEnCours()
  // Rang : d'abord la saison en cours, puis le titre sans saison, et
  // jamais une autre saison. À rang égal, le numéro le plus haut.
  let meilleur: { id: string; rang: number; n: number } | null = null
  for (const { id, titre } of titres) {
    const m = titre.match(s.motifPlaylist)
    if (!m) continue
    const sa = titre.match(SAISON)
    const saison = sa ? `${sa[1]}/${sa[2]}` : null
    if (saison && saison !== voulue) continue
    const rang = saison === voulue ? 2 : 1
    const n = Number(m[1] ?? 0)
    if (!meilleur || rang > meilleur.rang || (rang === meilleur.rang && n > meilleur.n)) {
      meilleur = { id, rang, n }
    }
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
