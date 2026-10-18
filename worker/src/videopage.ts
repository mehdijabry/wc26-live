/**
 * LA PAGE D'UNE VIDÉO — /v/<id>, et l'image de partage qui va avec.
 *
 * ── POURQUOI CETTE PAGE EXISTE ────────────────────────────────────────────
 * Jusqu'au 17/10/2026 un résumé partait sur Facebook en POST PHOTO : notre
 * carte, et le lien du site en commentaire. Mehdi : « vu que c'est juste une
 * image ça ne sert à rien, nous on veut convertir en trafic ». Un post photo
 * ouvre l'image en grand, il ne va nulle part.
 *
 * On publie donc un POST DE LIEN vers cette page. Facebook y lit les balises
 * Open Graph et affiche l'image qu'elles désignent — notre gabarit, avec la
 * vignette de la vidéo dans une fenêtre et un bouton de lecture par-dessus.
 * Le visuel promet une vidéo, le clic atterrit sur le site, et la vidéo y
 * joue vraiment : la promesse est tenue, ce qui est la condition pour que
 * le trafic revienne.
 *
 * ── CE QU'ON N'HÉBERGE TOUJOURS PAS ───────────────────────────────────────
 * Rien. La page porte le LECTEUR de l'ayant droit dans un cadre embarqué ;
 * les vues lui restent. C'est ce qui rend l'opération légitime, et la règle
 * ne change pas d'un pouce par rapport à /buts et /resumes.
 *
 * ── CE QUI EST VOLATIL, ET POURQUOI C'EST ACCEPTÉ ─────────────────────────
 * L'image rendue vit dans le dépôt média, que `cleanupMedia` vide au bout de
 * sept jours. Facebook, lui, fait sa copie de l'aperçu dans les secondes qui
 * suivent la publication et la garde : le post reste illustré. Au-delà d'une
 * semaine, une page rouverte redemande simplement un rendu au studio — le
 * cache KV porte l'adresse trente jours, et le studio refait l'image après.
 */
import type { Env } from './index'
import type { AutoMatch } from './automation'
import { leagueAr, renderImage, sbHeaders } from './automation'

const SITE = 'https://pressing90.live'

export type LigneVideo = {
  video_id: string
  source: string
  kind: string
  titre: string
  /** Rangée en base quand elle ne se déduit pas de l'identifiant (X). */
  vignette?: string | null
  description?: string | null
  publie_at?: string | null
  match_id?: string | null
  competition?: string | null
  equipe_dom?: string | null
  equipe_ext?: string | null
  score_dom?: number | null
  score_ext?: number | null
  buteur?: string | null
  minute?: string | null
}

/** L'adresse à partager. C'est elle qui porte les balises Open Graph. */
export const lienPartage = (id: string): string => `${SITE}/v/${encodeURIComponent(id)}`

const estX = (source: string): boolean => source === 'x' || source.startsWith('x-')

/**
 * LES DEUX VIGNETTES DE YOUTUBE, ET POURQUOI IL EN FAUT DEUX.
 *
 * `maxresdefault` est la seule en pleine définition, mais elle N'EXISTE PAS
 * pour toutes les vidéos — YouTube répond alors 404. `hqdefault` existe
 * toujours ; elle arrive en 480×360, c'est-à-dire en 4:3 avec deux bandes
 * noires cuites autour de l'image. Le gabarit les rogne (voir `sansBandes`
 * dans le studio), donc la fenêtre garde le bon format dans les deux cas.
 */
function vignettes(v: LigneVideo): { principale: string | null; repli: string | null } {
  // Celle qui est RANGÉE gagne : pour X elle est la seule qu'on ait, et
  // pour un but saisi à la main Mehdi peut en imposer une autre.
  if (v.vignette) return { principale: v.vignette, repli: null }
  if (estX(v.source)) return { principale: null, repli: null }
  return {
    principale: `https://i.ytimg.com/vi/${v.video_id}/maxresdefault.jpg`,
    repli: `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`,
  }
}

const estBut = (kind: string): boolean => kind === 'but'

/**
 * L'ADRESSE DU LECTEUR — celui de l'ayant droit, dans notre page.
 *
 * Mehdi, 17/10/2026 : « la vidéo publiée sur le site ne se joue pas dans
 * le site, elle redirige vers X ». Les cartes pointaient vers la source ;
 * elles pointent maintenant vers /v/<id>, et c'est ICI que le lecteur est
 * embarqué. On n'héberge toujours rien : l'iframe est la leur, les vues
 * leur reviennent.
 *
 * L'embed de X rend la carte du post AVEC son lecteur, et il joue en
 * place — vérifié le 17/10 sur le but de Fermín. Il ne demande ni script
 * ni jeton.
 */
export function lecteurDe(v: LigneVideo): string {
  return estX(v.source)
    ? `https://platform.twitter.com/embed/Tweet.html?id=${encodeURIComponent(v.video_id)}&theme=dark&dnt=true`
    : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.video_id)}?rel=0&modestbranding=1`
}

/** Le format du lecteur : la carte de X est haute, YouTube est en 16:9. */
export const lecteurEstCarte = (v: LigneVideo): boolean => estX(v.source)

/** Ce que l'étiquette annonce, dans la langue de la page. */
function etiquetteDe(kind: string, lang: string): string {
  if (estBut(kind)) return lang === 'fr' ? 'Le but' : lang === 'en' ? 'The goal' : 'الهدف'
  if (kind === 'resume_long') {
    return lang === 'fr' ? 'Résumé long' : lang === 'en' ? 'Extended highlights' : 'ملخص موسّع'
  }
  return lang === 'fr' ? 'Résumé du match' : lang === 'en' ? 'Match highlights' : 'ملخص المباراة'
}

/**
 * L'IMAGE DE PARTAGE, rendue une fois puis gardée en cache.
 *
 * `m` n'est fourni qu'au moment de la publication, quand la liste des matchs
 * du jour est en main : c'est de là que viennent les écussons. Une page
 * rouverte trois jours plus tard n'a plus cette liste — l'image est alors
 * déjà en cache, et si elle ne l'est plus, elle se refait sans écussons
 * plutôt que de ne pas se faire.
 */
export async function ogDeVideo(
  env: Env,
  v: LigneVideo,
  m: AutoMatch | null = null,
  lang = 'ar',
): Promise<string | null> {
  // LE NUMÉRO DE VERSION DANS LA CLÉ. Le cache tient trente jours : une
  // image rendue avec un défaut y resterait un mois, et rien dans
  // l'interface ne permet de la jeter. L'incrémenter abandonne d'un coup
  // tout ce qui a été rendu avant — c'est le seul bouton d'effacement
  // qu'on ait, et il a servi dès le premier jour (fenêtre vide, 17/10).
  const cle = `og:vid:2:${v.video_id}:${lang}`
  // ── LE CACHE SE LIT, SAUF AU MOMENT DE PUBLIER ──────────────────────
  // `m` n'est fourni que par la chaîne de publication, et c'est la seule
  // fois où les écussons sont disponibles. Sans cette exception, une page
  // ouverte AVANT la publication — un robot, un lien deviné — y déposait
  // une image sans écussons pour trente jours, et le post la reprenait
  // telle quelle. La version riche écrase donc la pauvre, jamais l'inverse.
  if (!m) {
    const cache = await env.CACHE.get(cle)
    if (cache) return cache
  }

  const { principale, repli } = vignettes(v)
  const dom = v.equipe_dom ?? m?.home ?? ''
  const ext = v.equipe_ext ?? m?.away ?? ''
  const sd = v.score_dom ?? (m && m.homeScore !== undefined ? Number(m.homeScore) : null)
  const se = v.score_ext ?? (m && m.awayScore !== undefined ? Number(m.awayScore) : null)
  const comp = v.competition ?? m?.league ?? ''
  try {
    const url = await renderImage(env, 'og-video', {
      lang,
      etiquette: etiquetteDe(v.kind, lang),
      // La compétition s'écrit en arabe quand la page l'est : le reste de la
      // ligne l'est, et un libellé latin au milieu casse la lecture.
      competition: lang === 'ar' ? leagueAr(comp) : comp,
      home: dom, away: ext,
      homeLogo: m?.homeLogo ?? '', awayLogo: m?.awayLogo ?? '',
      homeScore: sd, awayScore: se,
      titre: estBut(v.kind) ? (v.buteur || [dom, ext].filter(Boolean).join(' — ')) : [dom, ext].filter(Boolean).join(' — '),
      sousTitre: estBut(v.kind) && v.minute ? v.minute : '',
      minute: estBut(v.kind) ? (v.minute ?? '') : '',
      vignette: principale, vignetteRepli: repli,
      barca: true,
    })
    // Trente jours : bien au-delà de la vie utile d'un post, et bien en deçà
    // de ce que coûterait un rendu à chaque ouverture de la page.
    await env.CACHE.put(cle, url, { expirationTtl: 30 * 86400 })
    return url
  } catch {
    return null
  }
}

/** Lit une ligne de `videos_matchs`. */
export async function lireVideo(env: Env, id: string): Promise<LigneVideo | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/videos_matchs?video_id=eq.${encodeURIComponent(id)}`
    // `vignette` EN FAIT PARTIE. Oubliée dans cette liste le 17/10, elle
    // rendait la fenêtre du gabarit noire pour toute vidéo X : la colonne
    // existait, elle était remplie, et personne ne la lisait. Une
    // sélection explicite ne pardonne pas l'ajout d'une colonne.
    + '&select=video_id,source,kind,titre,description,publie_at,match_id,competition'
    + ',equipe_dom,equipe_ext,score_dom,score_ext,buteur,minute,vignette&limit=1',
    { headers: sbHeaders(env) },
  )
  if (!r.ok) return null
  const l = (await r.json().catch(() => [])) as LigneVideo[]
  return Array.isArray(l) && l[0] ? l[0] : null
}

/**
 * LE RÉCIT D'UNE VIDÉO — le « petit article » de sa page.
 *
 * Mehdi, 17/10/2026 : « je ne veux pas d'article dans le vrai sens du
 * terme, on prend juste la description on enjolive un peu ». Donc deux
 * blocs, et aucun des deux n'invente :
 *
 *   · `recit` — une ou deux phrases composées à partir de ce qu'on SAIT :
 *     qui, contre qui, quelle minute, quelle compétition, qui a fait la
 *     passe. Rien d'autre n'y entre. Pas de « le plus beau but de la
 *     saison » : on n'a pas regardé le but.
 *   · `source` — la description d'origine, nettoyée et plafonnée, créditée
 *     à son auteur. On ne la réécrit pas : c'est son texte.
 *
 * La langue suit la page. Un paragraphe arabe sur un site affiché en
 * anglais ne se lit pas, et l'i18n du site ne sait traduire que des clés
 * connues — une phrase composée n'en est pas une.
 */
export function recitDeVideo(v: LigneVideo, lang: string): { recit: string; source: string } {
  const affiche = [v.equipe_dom, v.equipe_ext].filter(Boolean).join(lang === 'ar' ? ' و' : ' — ')
  const min = String(v.minute || '').replace(/\D/g, '')
  const comp = lang === 'ar' ? leagueAr(v.competition ?? '') : (v.competition ?? '')
  const phrases: string[] = []

  if (estBut(v.kind)) {
    const qui = (v.buteur || '').trim()
    // LA PRÉPOSITION DÉPEND DE CE QU'ON A. Écrite pour suivre la minute
    // (« à la 41e minute DE Betis — Barcelona »), elle produisait
    // « a marqué de Galatasaray — Barcelona » dès que la minute manquait
    // — et elle manque souvent, le champ étant facultatif. Chaque cas a
    // donc sa tournure, au lieu d'un assemblage de morceaux.
    if (lang === 'fr') {
      const ou = affiche ? (min ? ` à la ${min}e minute de ${affiche}` : ` lors de ${affiche}`)
        : (min ? ` à la ${min}e minute` : '')
      phrases.push(`${qui ? `${qui} a marqué` : 'Le but est tombé'}${ou}${comp ? `, en ${comp}` : ''}.`)
      phrases.push('La vidéo est celle de l’ayant droit : elle se joue ici, ses vues lui reviennent.')
    } else if (lang === 'en') {
      const ou = affiche ? (min ? ` in the ${min}th minute of ${affiche}` : ` in ${affiche}`)
        : (min ? ` in the ${min}th minute` : '')
      phrases.push(`${qui ? `${qui} scored` : 'The goal came'}${ou}${comp ? `, in the ${comp}` : ''}.`)
      phrases.push('The clip is the rights holder’s own: it plays here, and the views stay with them.')
    } else {
      // Le nombre est PRÉCÉDÉ d'un mot arabe (« الدقيقة 41 ») : l'algorithme
      // bidirectionnel le laisse alors en place. Seul en tête de phrase, il
      // part à l'autre bout de la ligne.
      const ou = affiche ? (min ? ` في الدقيقة ${min} من مباراة ${affiche}` : ` في مباراة ${affiche}`)
        : (min ? ` في الدقيقة ${min}` : '')
      phrases.push(`${qui ? `سجّل ${qui}` : 'جاء الهدف'}${ou}${comp ? ` ضمن ${comp}` : ''}.`)
      phrases.push('المقطع من مصدره الرسمي، ويُعرض هنا عبر مشغّله — المشاهدات تبقى له.')
    }
  } else {
    const score = v.score_dom !== null && v.score_dom !== undefined
      && v.score_ext !== null && v.score_ext !== undefined
      ? `${v.score_dom} – ${v.score_ext}` : ''
    if (lang === 'fr') {
      phrases.push([
        affiche ? `${affiche}` : 'La rencontre',
        score ? ` s’est terminé ${score}` : ' est résumée ici',
        comp ? `${score ? ', en' : ', en'} ${comp}` : '',
        '.',
      ].join(''))
      phrases.push('Le résumé complet se joue ci-dessus, chez son diffuseur.')
    } else if (lang === 'en') {
      phrases.push([
        affiche ? `${affiche}` : 'The match',
        score ? ` finished ${score}` : ' is summed up here',
        comp ? `, in the ${comp}` : '',
        '.',
      ].join(''))
      phrases.push('The full highlights play above, on the broadcaster’s own player.')
    } else {
      phrases.push([
        affiche ? `${affiche}` : 'المباراة',
        score ? ` انتهت ${score}` : ' ملخصها هنا',
        comp ? ` في ${comp}` : '',
        '.',
      ].join(''))
      phrases.push('الملخص الكامل يُعرض أعلاه عبر مشغّل الناقل الرسمي.')
    }
  }

  // La description d'origine : on retire les adresses et le bruit de pied
  // de chaîne, on plafonne, on ne réécrit rien.
  const source = String(v.description ?? '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b(?:pic\.twitter\.com|pic\.x\.com|t\.co)\/\S+/g, ' ')
    .replace(/#\S+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, 420)

  return { recit: phrases.filter(Boolean).join(' '), source }
}

/** Le titre éditorial d'une vidéo — l'accroche, pas le titre de la source. */
export async function titreEditorial(v: LigneVideo, lang: string): Promise<string> {
  const { titreDeBut, accrocheResume } = await import('./accroches')
  if (estBut(v.kind)) {
    if (lang === 'ar') return titreDeBut({ buteur: v.buteur ?? '', minute: v.minute ?? '' }, 0)
    const qui = (v.buteur || '').trim()
    const adv = [v.equipe_dom, v.equipe_ext].filter(Boolean).join(' — ')
    if (lang === 'fr') return qui ? `Regardez ce qu’a fait ${qui}` : `Le but — ${adv}`
    return qui ? `Watch what ${qui} just did` : `The goal — ${adv}`
  }
  if (lang === 'ar') return accrocheResume(v.score_dom ?? null, v.score_ext ?? null)
  const affiche = [v.equipe_dom, v.equipe_ext].filter(Boolean).join(' — ')
  return affiche || v.titre
}
