import { useEffect } from 'react'
import { useLang } from '../../lib/i18n'

/**
 * Conditions d'utilisation — /terms.
 *
 * ── TRILINGUE DEPUIS LE 13/10/2026 ───────────────────────────────────────
 * Comme /privacy, elles étaient en anglais seulement sur un site FR/EN/AR.
 * Des conditions qu'on ne peut pas lire n'engagent personne.
 *
 * Trois corrections de fond passées au même moment :
 *
 *  1. Le §2 décrivait « un projet de supporters couvrant la Coupe du monde
 *     2026 » : le site est généraliste depuis le 06/08/2026 et le Mondial y
 *     est une archive.
 *  2. Le §5 revendiquait l'identité de marque « WC26 Live » — nom abandonné
 *     au rebrand. (Mon premier passage l'avait manqué : le grep cherchait
 *     « WC26 Live » alors que la chaîne était coupée sur deux lignes.)
 *  3. Le §6 ne parlait que du tableau du Mondial, alors que le jeu réel est
 *     celui des pronostics à cotes. Il dit maintenant ce qu'il faut dire :
 *     crédits gratuits, aucune valeur monétaire, aucun pari accepté.
 *
 * Le paragraphe sur les liens d'affiliation a été retiré le 12/10/2026 avec
 * le reste des traces d'affiliation ; voir /responsible-gambling.
 */

const COURRIEL = 'info@pressing90.live'

const COPY = {
  en: {
    eyebrow: 'Terms of Service',
    titre1: 'The ',
    titreOr: 'house rules',
    titre2: ', in plain language.',
    dates: 'Effective: June 9, 2026 · Last updated: October 13, 2026',
    intro: 'By using pressing90.live (“the Service”, “the Site”) you agree to these terms. If you do not agree, please do not use the Site. We may update them — if we do, we update the “Last updated” date, and continued use means you accept the new version.',
    h1: '1. Who runs this',
    s1: 'The Site is operated by the mehdijabry.dev studio, a freelance web studio based in Canada. Contact: {mail}.',
    h2: '2. What the Site is, and what it is not',
    s2a: 'The Site is an independent football project: live scores, news, match analysis and a free prediction game, across some forty competitions. The 2026 World Cup is kept here as an archive. We are not affiliated with FIFA, any federation, UEFA, CONMEBOL, ESPN, TheSportsDB, or any broadcaster.',
    s2b: 'We provide scores, analysis and broadcast information for general interest and editorial purposes. We do not provide professional analysis or financial advice.',
    s2ch: 'Odds are information, not an invitation.',
    s2c: ' The Site displays odds next to upcoming matches so you can see how a result is priced. They are shown for information only — they may be outdated or differ from what any operator offers, and they are not betting advice. We are not a bookmaker: we do not accept, place, broker, or pay out bets, we take no payment, and we have no commercial link with any betting operator.',
    h3: '3. Accounts',
    s3: 'You can browse most of the Site without an account. To save your predictions or to appear on the leaderboard, you need one. You agree:',
    s3list: [
      'To give us a real email address that you control.',
      'To keep your sign-in credentials secret.',
      'That you are at least 13 years old.',
      'That you are responsible for what happens from your account.',
    ],
    s3fin: 'We can suspend or delete accounts we reasonably believe to be fraudulent, abusive, impersonating someone else, scraping at scale, or trying to break the Site.',
    h4: '4. Acceptable use',
    s4: 'You agree NOT to:',
    s4list: [
      'Scrape the Site at scale, attempt a denial of service, or otherwise interfere with its availability.',
      'Reverse-engineer or decompile it, or try to extract its code (the Site is a public web app, but the codebase belongs to its authors).',
      'Use the Site to harass other players, post unlawful content as a display name, or impersonate anyone.',
      'Use automated tools to create fake accounts or inflate predictions.',
      'Frame, mirror, or republish the Site without permission.',
    ],
    h5: '5. Intellectual property',
    s5ah: 'Our content',
    s5a: ' — the design, the Pressing 90’ brand identity, the copy, the layouts, the illustrations and the original editorial — belongs to the mehdijabry.dev studio. You may not republish it commercially without written permission. Linking to it and quoting it with attribution, for non-commercial use, is fine.',
    s5bh: 'Third-party content',
    s5b: ' — scores, fixtures, club badges, player photographs and broadcaster trademarks belong to their respective owners (federations, broadcasters, ESPN and others). We use this material for editorial purposes under fair dealing. If you hold the rights and believe a specific use is not covered, see §10.',
    s5ch: 'Your content',
    s5c: ' — the predictions you make remain yours, but you grant us a non-exclusive, worldwide, royalty-free licence to display them on the Site, aggregate them into leaderboards and statistics, and share any image you generate from them.',
    h6: '6. The prediction game',
    s6: 'The game is free and exists for entertainment. It is not gambling: you stake crampons — credits the Site gives you — and you win pressings. Neither can be bought, sold, cashed out, or exchanged for money or anything of value, we accept no wager of any kind, and there is no monetary prize. Leaderboard rankings carry no real-world standing, and we may recalculate, freeze or reset them — to correct a data error, or to remove cheating.',
    h7: '7. Advertising',
    s7: 'We run third-party display ads. We do not endorse the advertisers and we are not responsible for what they sell. If you see an ad that is invasive, misleading, deceptive or unlawful, report it to {mail} and we will block the creative.',
    h8: '8. No warranty',
    s8: 'The Site is provided “as is” and “as available”, with no warranty of any kind. Scores can be wrong, late or missing. Data can be lost if a database fails. Broadcast listings can be out of date. We will do our best, but we do not guarantee uptime, accuracy, or fitness for any particular purpose.',
    h9: '9. Liability cap',
    s9a: 'To the maximum extent the law allows, our total liability to you for any claim arising from your use of the Site is capped at the greater of CAD $10 or whatever you paid us in the twelve months before the claim — which, the Site being free, is zero.',
    s9b: 'We are not liable for indirect, incidental, special, consequential or punitive damages, including any loss on a competition you ran with your friends.',
    h10: '10. Copyright takedowns',
    s10: 'If you hold rights and believe we have used your material beyond fair dealing, write to {mail} with:',
    s10list: [
      'Your contact details and proof that you represent the rights holder.',
      'The exact address or addresses on our Site where the content appears.',
      'A description of the original work.',
      'A signed statement that you believe in good faith the use is unauthorised.',
    ],
    s10fin: 'We aim to action every legitimate request within five business days.',
    h11: '11. Termination',
    s11: 'You can stop using the Site whenever you like, and delete your account from the account menu or by writing to us. We can suspend or terminate access for anyone who breaks these terms.',
    h12: '12. Governing law',
    s12: 'These terms are governed by the laws of the Province of Quebec, Canada, without regard to conflict-of-law principles. Any dispute will be heard in the courts of Montreal, Quebec, except where consumer-protection law in your own jurisdiction guarantees you a different forum.',
    h13: '13. Contact',
    s13: 'Questions about these terms: {mail}.',
  },
  fr: {
    eyebrow: 'Conditions d’utilisation',
    titre1: 'Les ',
    titreOr: 'règles de la maison',
    titre2: ', en clair.',
    dates: 'En vigueur depuis le 9 juin 2026 · Dernière mise à jour : 13 octobre 2026',
    intro: 'En utilisant pressing90.live (« le Service », « le Site »), vous acceptez ces conditions. Si vous ne les acceptez pas, n’utilisez pas le Site. Nous pouvons les modifier — dans ce cas nous mettons à jour la date de « dernière mise à jour », et continuer à utiliser le Site vaut acceptation de la nouvelle version.',
    h1: '1. Qui tient ce site',
    s1: 'Le Site est exploité par le studio mehdijabry.dev, un studio web indépendant établi au Canada. Contact : {mail}.',
    h2: '2. Ce que le Site est, et ce qu’il n’est pas',
    s2a: 'Le Site est un projet de football indépendant : scores en direct, actualités, analyse de match et un jeu de pronostics gratuit, sur une quarantaine de compétitions. La Coupe du monde 2026 y est conservée comme archive. Nous ne sommes affiliés ni à la FIFA, ni à une fédération, ni à l’UEFA, ni à la CONMEBOL, ni à ESPN, ni à TheSportsDB, ni à aucun diffuseur.',
    s2b: 'Nous fournissons des scores, des analyses et des informations de diffusion à titre d’information générale et éditoriale. Nous ne fournissons ni analyse professionnelle, ni conseil financier.',
    s2ch: 'Les cotes sont une information, pas une invitation.',
    s2c: ' Le Site affiche des cotes à côté des matchs à venir pour montrer comment un résultat est évalué. Elles sont là à titre d’information seulement — elles peuvent être périmées ou différer de ce qu’un opérateur propose, et ne constituent pas un conseil de pari. Nous ne sommes pas un bookmaker : nous n’acceptons, ne plaçons, ne courtons et ne payons aucun pari, nous n’encaissons rien, et nous n’avons aucun lien commercial avec un opérateur de paris.',
    h3: '3. Les comptes',
    s3: 'La majeure partie du Site se consulte sans compte. Pour enregistrer vos pronostics ou figurer au classement, il en faut un. Vous vous engagez :',
    s3list: [
      'À nous donner une adresse courriel réelle, dont vous avez le contrôle.',
      'À garder vos identifiants secrets.',
      'À avoir au moins 13 ans.',
      'À répondre de ce qui se fait depuis votre compte.',
    ],
    s3fin: 'Nous pouvons suspendre ou supprimer les comptes que nous estimons raisonnablement frauduleux, abusifs, usurpant l’identité d’autrui, aspirant le Site à grande échelle ou cherchant à le casser.',
    h4: '4. Usage acceptable',
    s4: 'Vous vous engagez à NE PAS :',
    s4list: [
      'Aspirer le Site à grande échelle, tenter un déni de service, ou nuire autrement à sa disponibilité.',
      'Le rétroconcevoir, le décompiler, ou tenter d’en extraire le code (le Site est une application web publique, mais son code appartient à ses auteurs).',
      'Vous en servir pour harceler d’autres joueurs, publier un contenu illicite comme pseudonyme, ou usurper une identité.',
      'Employer des outils automatisés pour créer de faux comptes ou gonfler des pronostics.',
      'Encadrer, copier ou republier le Site sans autorisation.',
    ],
    h5: '5. Propriété intellectuelle',
    s5ah: 'Notre contenu',
    s5a: ' — le design, l’identité de marque Pressing 90’, les textes, les mises en page, les illustrations et l’éditorial original — appartient au studio mehdijabry.dev. Vous ne pouvez pas le republier commercialement sans autorisation écrite. Y faire un lien et le citer avec attribution, pour un usage non commercial, ne pose aucun problème.',
    s5bh: 'Le contenu de tiers',
    s5b: ' — scores, calendriers, écussons de clubs, photographies de joueurs et marques de diffuseurs — appartient à leurs propriétaires respectifs (fédérations, diffuseurs, ESPN et autres). Nous l’utilisons à des fins éditoriales, dans les limites de l’usage loyal. Si vous détenez ces droits et estimez qu’un usage précis n’est pas couvert, voyez le §10.',
    s5ch: 'Votre contenu',
    s5c: ' — les pronostics que vous faites restent les vôtres, mais vous nous accordez une licence non exclusive, mondiale et gratuite pour les afficher sur le Site, les agréger en classements et statistiques, et partager toute image que vous en tirez.',
    h6: '6. Le jeu de pronostics',
    s6: 'Le jeu est gratuit et existe pour le plaisir. Ce n’est pas un jeu d’argent : on mise des crampons — des crédits que le Site vous donne — et on gagne des pressings. Ni les uns ni les autres ne peuvent être achetés, vendus, retirés ou échangés contre de l’argent ou quoi que ce soit de valeur, nous n’acceptons aucune mise d’aucune sorte, et il n’y a aucun prix en argent. Les classements n’ont aucune portée hors du Site, et nous pouvons les recalculer, les geler ou les remettre à zéro — pour corriger une erreur de données ou écarter une tricherie.',
    h7: '7. Publicité',
    s7: 'Nous diffusons des annonces de tiers. Nous ne cautionnons pas les annonceurs et ne répondons pas de ce qu’ils vendent. Si vous voyez une annonce intrusive, trompeuse, mensongère ou illicite, signalez-la à {mail} et nous bloquerons le visuel.',
    h8: '8. Aucune garantie',
    s8: 'Le Site est fourni « tel quel » et « tel que disponible », sans garantie d’aucune sorte. Un score peut être faux, en retard ou manquant. Des données peuvent être perdues en cas de panne de la base. Les grilles de diffusion peuvent être périmées. Nous ferons de notre mieux, mais nous ne garantissons ni la disponibilité, ni l’exactitude, ni l’adéquation à un usage particulier.',
    h9: '9. Plafond de responsabilité',
    s9a: 'Dans toute la mesure permise par la loi, notre responsabilité totale envers vous, pour toute réclamation née de votre usage du Site, est plafonnée au plus élevé des deux montants suivants : 10 $ CA, ou ce que vous nous avez versé dans les douze mois précédant la réclamation — soit zéro, le Site étant gratuit.',
    s9b: 'Nous ne répondons pas des dommages indirects, accessoires, spéciaux, consécutifs ou punitifs, y compris d’une perte liée à une compétition que vous auriez organisée entre amis.',
    h10: '10. Retrait pour atteinte au droit d’auteur',
    s10: 'Si vous détenez des droits et estimez que nous avons utilisé votre matériel au-delà de l’usage loyal, écrivez à {mail} en indiquant :',
    s10list: [
      'Vos coordonnées et la preuve que vous représentez le titulaire des droits.',
      'La ou les adresses exactes, sur notre Site, où le contenu apparaît.',
      'Une description de l’œuvre d’origine.',
      'Une déclaration signée attestant que vous croyez de bonne foi que l’usage n’est pas autorisé.',
    ],
    s10fin: 'Nous visons à traiter toute demande légitime sous cinq jours ouvrables.',
    h11: '11. Résiliation',
    s11: 'Vous pouvez cesser d’utiliser le Site quand vous voulez, et supprimer votre compte depuis le menu du compte ou en nous écrivant. Nous pouvons suspendre ou résilier l’accès de quiconque enfreint ces conditions.',
    h12: '12. Droit applicable',
    s12: 'Ces conditions sont régies par les lois de la province de Québec, Canada, sans égard aux règles de conflit de lois. Tout litige sera porté devant les tribunaux de Montréal (Québec), sauf là où une loi de protection du consommateur de votre propre ressort vous garantit un autre forum.',
    h13: '13. Nous écrire',
    s13: 'Questions sur ces conditions : {mail}.',
  },
  ar: {
    eyebrow: 'شروط الاستخدام',
    titre1: '',
    titreOr: 'قواعد البيت',
    titre2: '، بوضوح.',
    dates: 'سارية منذ 9 يونيو 2026 · آخر تحديث: 13 أكتوبر 2026',
    intro: 'باستخدامك pressing90.live («الخدمة»، «الموقع») فأنت توافق على هذه الشروط. وإن لم توافق فلا تستخدم الموقع. وقد نعدّلها — وعندها نحدّث تاريخ «آخر تحديث»، ومواصلة الاستخدام تعني قبول النسخة الجديدة.',
    h1: '1. من يدير هذا الموقع',
    s1: 'يدير الموقع استوديو mehdijabry.dev، وهو استوديو ويب مستقل مقرّه كندا. للتواصل: {mail}.',
    h2: '2. ما هو الموقع، وما ليس هو',
    s2a: 'الموقع مشروع كرة قدم مستقل: نتائج مباشرة وأخبار وتحليل للمباريات ولعبة توقّعات مجانية، عبر نحو أربعين مسابقة. وكأس العالم 2026 محفوظة هنا كأرشيف. لسنا تابعين للفيفا ولا لأي اتحاد ولا لليويفا ولا للكونميبول ولا لـESPN ولا لـTheSportsDB ولا لأي ناقل.',
    s2b: 'نقدّم النتائج والتحليلات ومعلومات البثّ لغرض الاطّلاع العام والتحرير. ولا نقدّم تحليلًا مهنيًا ولا نصيحة مالية.',
    s2ch: 'الكوتات معلومة، وليست دعوة.',
    s2c: ' يعرض الموقع كوتات بجانب المباريات القادمة لتبيّن كيف تُقيَّم نتيجة ما. وهي للعلم فقط — قد تكون قديمة أو مختلفة عمّا يعرضه أي مشغّل، وليست نصيحة للمراهنة. لسنا شركة مراهنات: لا نقبل ولا نضع ولا نتوسّط ولا ندفع أي رهان، ولا نحصّل أي مبلغ، وليست لنا أي علاقة تجارية مع أي مشغّل مراهنات.',
    h3: '3. الحسابات',
    s3: 'يمكن تصفّح معظم الموقع بلا حساب. ولحفظ توقّعاتك أو الظهور في الترتيب تحتاج إلى حساب. وأنت تتعهّد:',
    s3list: [
      'بأن تعطينا بريدًا إلكترونيًا حقيقيًا تملك التحكّم فيه.',
      'بأن تحافظ على سرّية بيانات دخولك.',
      'بأن يكون عمرك 13 سنة على الأقل.',
      'بأن تتحمّل مسؤولية ما يجري من حسابك.',
    ],
    s3fin: 'يمكننا تعليق أو حذف الحسابات التي نرى بشكل معقول أنها احتيالية أو مسيئة أو منتحلة لشخصية غيرها أو تسحب بيانات الموقع على نطاق واسع أو تحاول تعطيله.',
    h4: '4. الاستخدام المقبول',
    s4: 'أنت تتعهّد بألّا:',
    s4list: [
      'تسحب بيانات الموقع على نطاق واسع، أو تحاول تعطيله، أو تضرّ بتوفّره بأي شكل.',
      'تعكس هندسته أو تفكّ ترجمته أو تحاول استخراج شفرته (الموقع تطبيق ويب عام، لكن شفرته ملك مؤلّفيها).',
      'تستخدمه للتحرّش بلاعبين آخرين، أو لنشر محتوى غير قانوني كاسم معروض، أو لانتحال هوية أحد.',
      'تستعمل أدوات آلية لإنشاء حسابات وهمية أو لتضخيم التوقّعات.',
      'تؤطّر الموقع أو تنسخه أو تعيد نشره دون إذن.',
    ],
    h5: '5. الملكية الفكرية',
    s5ah: 'محتوانا',
    s5a: ' — التصميم وهوية علامة Pressing 90’ والنصوص والتخطيطات والرسوم والمواد التحريرية الأصلية — ملك لاستوديو mehdijabry.dev. لا يجوز إعادة نشره تجاريًا دون إذن مكتوب. أما الربط إليه والاقتباس منه مع الإسناد، لاستخدام غير تجاري، فلا إشكال فيه.',
    s5bh: 'محتوى الأطراف الأخرى',
    s5b: ' — النتائج والجداول وشعارات الأندية وصور اللاعبين وعلامات النواقل — ملك لأصحابها (الاتحادات والنواقل وESPN وغيرهم). ونستخدمه لأغراض تحريرية في حدود الاستخدام العادل. فإن كنت صاحب الحق وترى أن استخدامًا بعينه غير مشمول، فانظر §10.',
    s5ch: 'محتواك أنت',
    s5c: ' — التوقّعات التي تضعها تبقى لك، لكنك تمنحنا رخصة غير حصرية وعالمية ومجانية لعرضها على الموقع، وتجميعها في الترتيبات والإحصاءات، ومشاركة أي صورة تولّدها منها.',
    h6: '6. لعبة التوقّعات',
    s6: 'اللعبة مجانية وغايتها التسلية. وهي ليست مقامرة: تراهن بالكرامبون — وهي أرصدة يمنحها لك الموقع — وتربح البريسينغ. لا يمكن شراء أي منهما ولا بيعه ولا سحبه ولا استبداله بمال أو بأي شيء ذي قيمة، ولا نقبل أي رهان من أي نوع، ولا توجد أي جائزة مالية. والترتيبات لا وزن لها خارج الموقع، ويجوز لنا إعادة حسابها أو تجميدها أو تصفيرها — لتصحيح خطأ في البيانات أو لاستبعاد غشّ.',
    h7: '7. الإعلانات',
    s7: 'نعرض إعلانات من أطراف خارجية. ولا نزكّي المعلنين ولا نتحمّل مسؤولية ما يبيعونه. فإن رأيت إعلانًا مزعجًا أو مضلّلًا أو خادعًا أو مخالفًا للقانون، فأبلغنا على {mail} وسنحجب التصميم.',
    h8: '8. لا ضمان',
    s8: 'يُقدَّم الموقع «كما هو» و«حسب توفّره»، دون أي ضمان. فقد تكون نتيجة ما خاطئة أو متأخّرة أو غائبة. وقد تُفقد بيانات عند عطل في قاعدة البيانات. وقد تكون جداول البثّ قديمة. سنبذل وسعنا، لكننا لا نضمن التوفّر ولا الدقّة ولا الملاءمة لغرض بعينه.',
    h9: '9. سقف المسؤولية',
    s9a: 'إلى أقصى ما يسمح به القانون، تبلغ مسؤوليتنا الكلّية تجاهك عن أي مطالبة ناشئة عن استخدامك للموقع حدًّا أقصى هو الأكبر بين 10 دولارات كندية وما دفعته لنا في الاثني عشر شهرًا السابقة للمطالبة — وهو صفر، لأن الموقع مجاني.',
    s9b: 'ولا نتحمّل الأضرار غير المباشرة أو العرضية أو الخاصة أو التبعية أو العقابية، بما فيها أي خسارة في مسابقة نظّمتها بين أصدقائك.',
    h10: '10. طلبات الإزالة لحقوق النشر',
    s10: 'إن كنت صاحب حقوق وترى أننا استخدمنا مادّتك بما يتجاوز الاستخدام العادل، فاكتب إلى {mail} مرفقًا:',
    s10list: [
      'بيانات التواصل بك وما يثبت أنك تمثّل صاحب الحق.',
      'العنوان أو العناوين الدقيقة على موقعنا حيث يظهر المحتوى.',
      'وصفًا للعمل الأصلي.',
      'إفادة موقّعة بأنك تعتقد بحسن نيّة أن الاستخدام غير مرخّص.',
    ],
    s10fin: 'نسعى لمعالجة كل طلب مشروع خلال خمسة أيام عمل.',
    h11: '11. إنهاء الخدمة',
    s11: 'يمكنك التوقّف عن استخدام الموقع متى شئت، وحذف حسابك من قائمة الحساب أو بمراسلتنا. ويمكننا تعليق أو إنهاء وصول من يخالف هذه الشروط.',
    h12: '12. القانون الواجب التطبيق',
    s12: 'تخضع هذه الشروط لقوانين مقاطعة كيبيك بكندا، دون اعتبار لقواعد تنازع القوانين. وتُنظر أي منازعة أمام محاكم مونتريال بكيبيك، إلا حيث يضمن لك قانون حماية المستهلك في بلدك محكمة أخرى.',
    h13: '13. تواصل معنا',
    s13: 'أسئلة حول هذه الشروط: {mail}.',
  },
} as const

export function Terms() {
  const lang = useLang((s) => s.lang)
  const c = COPY[lang]

  useEffect(() => {
    document.title = 'Terms of Service · Pressing 90’'
  }, [])

  const h2 = 'text-2xl font-display font-bold text-slate-900 mt-10 mb-3'
  const lien = 'text-accent-gold underline'

  /** Une phrase dont {mail} devient un lien de courriel. */
  const avecMail = (texte: string) => {
    const [avant, apres] = texte.split('{mail}')
    return (
      <>
        {avant}
        <a href={`mailto:${COURRIEL}`} className={lien}>{COURRIEL}</a>
        {apres}
      </>
    )
  }

  const Puces = ({ items }: { items: readonly string[] }) => (
    <ul className="space-y-1 list-disc list-inside ml-2">
      {items.map((x) => <li key={x}>{x}</li>)}
    </ul>
  )

  return (
    <div className="container max-w-3xl mx-auto px-6 py-16">
      <header className="mb-12">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 mb-3">
          {c.eyebrow}
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-slate-900 tracking-tight">
          {c.titre1}<span className="text-accent-gold">{c.titreOr}</span>{c.titre2}
        </h1>
        <p className="mt-4 font-mono text-xs text-slate-500">{c.dates}</p>
      </header>

      <section className="prose prose-slate prose-lg max-w-none space-y-6 text-slate-700 leading-relaxed">
        <p>{c.intro}</p>

        <h2 className={h2}>{c.h1}</h2>
        <p>{avecMail(c.s1)}</p>

        <h2 className={h2}>{c.h2}</h2>
        <p>{c.s2a}</p>
        <p>{c.s2b}</p>
        <p><strong>{c.s2ch}</strong>{c.s2c}</p>

        <h2 className={h2}>{c.h3}</h2>
        <p>{c.s3}</p>
        <Puces items={c.s3list} />
        <p>{c.s3fin}</p>

        <h2 className={h2}>{c.h4}</h2>
        <p>{c.s4}</p>
        <Puces items={c.s4list} />

        <h2 className={h2}>{c.h5}</h2>
        <p><strong>{c.s5ah}</strong>{c.s5a}</p>
        <p><strong>{c.s5bh}</strong>{c.s5b}</p>
        <p><strong>{c.s5ch}</strong>{c.s5c}</p>

        <h2 className={h2}>{c.h6}</h2>
        <p>{c.s6}</p>

        <h2 className={h2}>{c.h7}</h2>
        <p>{avecMail(c.s7)}</p>

        <h2 className={h2}>{c.h8}</h2>
        <p>{c.s8}</p>

        <h2 className={h2}>{c.h9}</h2>
        <p>{c.s9a}</p>
        <p>{c.s9b}</p>

        <h2 className={h2}>{c.h10}</h2>
        <p>{avecMail(c.s10)}</p>
        <Puces items={c.s10list} />
        <p>{c.s10fin}</p>

        <h2 className={h2}>{c.h11}</h2>
        <p>{c.s11}</p>

        <h2 className={h2}>{c.h12}</h2>
        <p>{c.s12}</p>

        <h2 className={h2}>{c.h13}</h2>
        <p>{avecMail(c.s13)}</p>
      </section>

      <footer className="mt-16 pt-8 border-t border-slate-200 font-mono text-xs text-slate-500">
        Pressing 90’ · pressing90.live
      </footer>
    </div>
  )
}
