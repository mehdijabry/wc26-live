/**
 * LES ACCROCHES — ce qui donne envie de cliquer, sans jamais raconter.
 *
 * ── LA RÈGLE QUI TIENT TOUT ───────────────────────────────────────────────
 * On PROMET, on ne RÉSUME pas. Une accroche qui raconte le but retire la
 * seule raison de le regarder. Et elle n'affirme que ce que les données
 * disent : le score, l'écart, la minute, le buteur. Pas « le plus beau but
 * de la saison », pas « tout le monde en parle ».
 *
 * ── LES NOMBRES S'ÉCRIVENT EN LETTRES ─────────────────────────────────────
 * « سبعة أهداف » et non « 7 أهداف ». Un chiffre coincé entre un mot arabe
 * et un signe se fait expédier à l'autre bout de la ligne par l'algorithme
 * bidirectionnel — c'est le piège qui a déjà coûté deux rendus (voir la
 * carte de période et le ticket gagnant). Seule la ligne de score garde ses
 * chiffres, dans le format `A 2-5 B` qui s'affiche correctement sur la page
 * depuis des semaines.
 */

const CHIFFRES_AR = ['', 'هدف واحد', 'هدفان', 'ثلاثة أهداف', 'أربعة أهداف', 'خمسة أهداف',
  'ستة أهداف', 'سبعة أهداف', 'ثمانية أهداف', 'تسعة أهداف', 'عشرة أهداف']
const enLettres = (n: number) => CHIFFRES_AR[n] ?? `${n}`

/**
 * L'accroche d'un résumé, choisie sur le SCORE et rien d'autre.
 * Cinq cas, validés par Mehdi le 17/10/2026.
 */
export function accrocheResume(dom: number | null, ext: number | null): string {
  if (dom === null || ext === null || !Number.isFinite(dom) || !Number.isFinite(ext)) {
    return 'الملخص كاملا'
  }
  const total = dom + ext
  const ecart = Math.abs(dom - ext)
  if (ecart >= 3) return 'فوز عريض... والملخص يستحق المشاهدة'
  if (total >= 5) return `${enLettres(total)} في مباراة واحدة`
  if (total === 0) return 'تعادل سلبي... إليك أبرز اللقطات'
  if (dom === ext) return 'تعادل لم يحسم شيئا'
  if (ecart === 1) return 'فاز بفارق هدف واحد... شاهد كيف حُسمت'
  return 'الملخص كاملا'
}

/** Un hashtag propre à partir d'un nom : pas d'espace, pas de ponctuation. */
const tag = (s: string) => '#' + String(s || '').trim().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '')

/**
 * Le post complet d'un résumé. Trois à cinq hashtags : c'est ce que le
 * playbook attend, et il nous l'a reproché dans le journal sur les premiers
 * posts (« no hashtag (3-5 expected) »).
 */
export function captionResume(o: {
  dom: string; ext: string; scoreDom: number | null; scoreExt: number | null
  competitionAr: string; lien: string
}): string {
  const score = `⚽ ${o.dom} ${o.scoreDom ?? ''}-${o.scoreExt ?? ''} ${o.ext}`
  const tags = [tag(o.competitionAr), '#ملخص', '#كرة_القدم', '#Pressing90'].join(' ')
  return [
    `🎬 ${accrocheResume(o.scoreDom, o.scoreExt)}`,
    '',
    score,
    `🏆 ${o.competitionAr}`,
    '',
    'أي هدف كان الأجمل؟ 👇',
    `👉 الملخص كاملا على ${o.lien}`,
    '',
    tags,
  ].join('\n')
}

/**
 * LES CINQ TITRES DE BUT, plus deux exceptions.
 *
 * La ROTATION existe pour que la page ne sorte pas trois fois « هل رأيت
 * هدف… » dans la même soirée. L'appelant fournit l'index et le fait
 * tourner ; on ne garde pas d'état ici.
 *
 * `changeLeVainqueur` n'est passé que si on le SAIT. La variante qui
 * affirme que le but a changé le match est la seule à affirmer quoi que ce
 * soit : sans la preuve, elle sort de la rotation.
 */
export function titreDeBut(o: {
  buteur: string; passeur?: string; adversaire?: string; minute?: string
  penalty?: boolean; csc?: boolean; changeLeVainqueur?: boolean
}, index = 0): string {
  const qui = String(o.buteur || '').trim()
  if (!qui) return 'شاهد الهدف'

  // ── Les exceptions passent avant la rotation : elles disent un fait que
  //    les cinq variantes ignoreraient.
  if (o.csc) return `هدف في المرمى الخطأ... شاهد ما حدث`
  if (o.penalty) return `من نقطة الجزاء... ${qui} لا يخطئ`
  const min = Number(String(o.minute || '').replace(/\D/g, ''))
  if (Number.isFinite(min) && min >= 85) return `هدف قاتل في الوقت القاتل`

  const variantes: string[] = [
    o.adversaire ? `شاهد ما فعله ${qui} في مرمى ${o.adversaire}` : `شاهد ما فعله ${qui}`,
    `هل رأيت هدف ${qui}؟`,
    `${qui}... هدف من العيار الثقيل`,
    `${qui} يعيدها من جديد`,
  ]
  // Quand on connaît le PASSEUR, une variante le met en scène : le but se
  // raconte à deux, et c'est souvent la passe qui fait l'action.
  if (o.passeur) variantes.push(`${o.passeur} يصنع... و${qui} ينهي`)
  // La cinquième n'entre en jeu que si elle est vraie.
  if (o.changeLeVainqueur) variantes.push(`هدف ${qui} الذي غيّر وجه المباراة`)
  return variantes[((index % variantes.length) + variantes.length) % variantes.length]
}

/** Le post complet d'un but. */
export function captionBut(o: {
  buteur: string; passeur?: string; adversaire?: string; minute?: string; penalty?: boolean; csc?: boolean
  changeLeVainqueur?: boolean; equipes?: string; competitionAr?: string; lien: string
}, index = 0): string {
  const lignes = [`⚽ ${titreDeBut(o, index)}`, '']
  if (o.equipes) lignes.push(`🆚 ${o.equipes}${o.minute ? ` · ${o.minute}` : ''}`)
  if (o.passeur) lignes.push(`🅰️ صناعة ${o.passeur}`)
  if (o.competitionAr) lignes.push(`🏆 ${o.competitionAr}`)
  lignes.push('', 'هدف اليوم؟ قل رأيك 👇', `👉 شاهده على ${o.lien}`, '')
  lignes.push([o.competitionAr ? tag(o.competitionAr) : '#هدف', '#هدف', '#كرة_القدم', '#Pressing90']
    .filter((v, i, a) => a.indexOf(v) === i).join(' '))
  return lignes.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}

/**
 * LA NOTIFICATION D'UN BUT — et pourquoi elle ne ressemble pas à la légende.
 *
 * Mehdi, 17/10/2026 : elle se génère À PART, et **elle n'a pas à appâter**.
 * C'est l'inverse exact de la règle qui gouverne le reste de ce fichier.
 * Une légende Facebook s'adresse à quelqu'un qui fait défiler son fil et
 * qu'il faut arrêter ; une notification arrive sur un écran verrouillé, sans
 * avoir rien demandé. « Hal ra'ayta hadaf… ? » dans un fil, c'est une
 * accroche ; sur un écran verrouillé, c'est du racolage — et ça se paie en
 * désabonnements, pas en clics.
 *
 * Donc : le fait, et rien d'autre. Qui a marqué, contre qui, à quelle
 * minute. Pas de question rhétorique, pas de superlatif, pas de mot-dièse.
 * La rotation existe quand même, pour que trois buts dans la même soirée ne
 * sortent pas sous une formule identique, mais toutes les variantes disent
 * la même chose : il y a un but, le voici.
 *
 * LES CHIFFRES RESTENT LATINS et la minute s'écrit « الدقيقة 41 » — le
 * nombre est précédé d'un mot arabe, donc l'algorithme bidirectionnel le
 * laisse en place (voir l'en-tête de ce fichier).
 */
export function pushDeBut(o: {
  buteur: string; passeur?: string; equipes?: string; competitionAr?: string
  minute?: string; penalty?: boolean; csc?: boolean
}, index = 0): { titre: string; corps: string } {
  const qui = String(o.buteur || '').trim()
  const min = String(o.minute || '').replace(/\D/g, '')
  const quand = min ? `الدقيقة ${min}` : ''

  // Le titre nomme le fait. Les deux exceptions changent la NATURE du but,
  // pas son emballage : les taire serait inexact.
  const titre = o.csc
    ? `⚽ هدف في المرمى الخطأ${o.equipes ? ` · ${o.equipes}` : ''}`
    : qui
      ? [`⚽ هدف ${qui}`, `⚽ ${qui} يسجل`, `⚽ سجّل ${qui}`][((index % 3) + 3) % 3]
        + (o.penalty ? ' من نقطة الجزاء' : '')
      : `⚽ هدف جديد${o.equipes ? ` · ${o.equipes}` : ''}`

  // Le corps situe : la rencontre, la minute, la compétition, le passeur.
  // Chaque élément n'apparaît que s'il est connu — une notification à
  // trous vaut mieux qu'une notification qui comble.
  const morceaux = [o.equipes, quand, o.competitionAr].filter(Boolean) as string[]
  const corps = [morceaux.join(' · '), o.passeur ? `صناعة ${o.passeur}` : '']
    .filter(Boolean).join(' — ') || 'شاهد الهدف على الموقع'

  return { titre: titre.slice(0, 100), corps: corps.slice(0, 240) }
}
