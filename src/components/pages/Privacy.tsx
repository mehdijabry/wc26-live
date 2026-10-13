import { useEffect } from 'react'
import { useLang } from '../../lib/i18n'

/**
 * Politique de confidentialité — /privacy.
 *
 * ── TRILINGUE DEPUIS LE 12/10/2026 ───────────────────────────────────────
 * Elle était en ANGLAIS SEULEMENT, sur un site dont l'interface est FR/EN/AR
 * et dont l'audience est largement francophone et arabophone. Le RGPD exige
 * une information « concise, transparente, compréhensible » — une politique
 * que le visiteur ne lit pas n'informe personne.
 *
 * Et c'est devenu concret : le message de consentement AdSense pointe vers
 * cette page. Un bandeau en français qui renvoie sur un texte anglais, c'est
 * un consentement qu'on ne peut pas qualifier d'éclairé.
 *
 * ── CE QU'ELLE DÉCLARE DOIT ÊTRE VRAI, DANS LES DEUX SENS ────────────────
 * Le 12/10/2026 elle annonçait Google Analytics 4 — jamais installé — et
 * désignait Adsterra comme régie actuelle alors que le site charge Google
 * AdSense. Sur-déclarer n'est qu'une imprécision ; OMETTRE un prestataire
 * qui tourne vraiment est la faute qui compte, et Google exige d'un éditeur
 * AdSense qu'il déclare son usage des cookies. Corrigé dans les deux sens.
 *
 * Une seule URL pour les trois langues : le site n'a pas d'adresses par
 * langue, la langue est un réglage d'interface.
 */

/** Les prestataires, et ce que chacun voit. Noms et URLs non traduits. */
const PARTENAIRES = [
  { nom: 'Cloudflare', url: 'https://www.cloudflare.com/privacypolicy/' },
  { nom: 'Supabase', url: 'https://supabase.com/privacy' },
  { nom: 'Google', url: 'https://policies.google.com/privacy' },
  { nom: 'Google AdSense', url: 'https://policies.google.com/technologies/partner-sites' },
  { nom: 'Adsterra', url: 'https://adsterra.com/privacy-policy/' },
  { nom: 'ESPN, TheSportsDB', url: null },
  { nom: 'Resend', url: 'https://resend.com/legal/privacy-policy' },
] as const

const COURRIEL = 'info@pressing90.live'

const COPY = {
  en: {
    eyebrow: 'Privacy Policy',
    titre1: 'Your data, in ',
    titreOr: 'plain English',
    titre2: '.',
    dates: 'Effective: June 9, 2026 · Last updated: October 12, 2026',
    intro: 'Pressing 90’ (operated by the mehdijabry.dev studio — “we”, “us”, “our”) respects your privacy. This page explains what we collect, why, who we share it with, and what rights you have. If anything here is unclear, write to {mail} and we will fix the wording.',
    h1: '1. What we collect',
    aTitre: 'A. When you just browse the site (no account)',
    aListe: [
      'Standard server logs (IP address, user-agent, pages visited, timestamp), kept about 30 days for security and analytics.',
      'Anonymous, aggregate analytics via Cloudflare Web Analytics — no cookies, no fingerprinting.',
      'Our own page-view counter: the page URL, the country sent by Cloudflare, the referring site and your language. No cookie, no identifier, nothing that follows you between sessions — the numbers are only ever read as totals.',
      'Local storage on your device for what you do on the site (your bracket picks, your preferred date). It stays on your machine unless you sign in.',
    ],
    bTitre: 'B. When you create an account',
    bListe: [
      'Your email address and the display name you choose.',
      'Your picks and prediction history, so they follow you from one device to another.',
      'If you sign in with Google, we receive your name, email and profile picture from Google — nothing else.',
      'A session token, managed by OAuth and stored in a cookie.',
    ],
    cTitre: 'C. What we never collect',
    cListe: [
      'Payment information — there are no payments on this site.',
      'Phone numbers.',
      'Your location, beyond what an IP address coarsely implies.',
      'Microphone, camera, or any device sensor.',
    ],
    h2: '2. Why we collect it',
    pourquoi: [
      'To serve the site at all — you cannot visit without an IP address.',
      'To remember your picks so you can come back to them.',
      'To improve the site: which features get used, which ones break.',
      'To prevent abuse — automated scraping, brute-force sign-in attempts.',
      'To run ads (see §4) so the site stays free.',
    ],
    h3: '3. Who we share it with',
    partageIntro: 'We use third-party services to run the site. Each one gets only what it needs:',
    roles: {
      'Cloudflare': 'DNS, CDN and edge security — sees every request to the site at the network layer.',
      'Supabase': 'database and authentication — stores your account and your picks if you create an account.',
      'Google': 'sign-in with Google — only if you choose that way of signing in.',
      'Google AdSense': 'advertising — serves the ads on this site and may set cookies and use device and IP signals. See §4.',
      'Adsterra': 'advertising network, currently switched off — would set its own cookie and may use device and IP signals. See §4.',
      'ESPN, TheSportsDB': 'data sources — we call their public APIs from our edge worker, so they see our server’s IP address, never yours.',
      'Resend': 'transactional email — sends sign-in and recovery emails if you create an account.',
    } as Record<string, string>,
    lienPolitique: 'Their privacy policy',
    pasDeVente: 'We do not sell your personal data. We do not share it with anyone who is not listed above, except where the law compels us.',
    h4: '4. Advertising',
    pub1: 'We run third-party display ads to keep the site free. Our current ad partner is Google AdSense. Google and its partners may set cookies and use your IP address and device information to serve and measure ads; you can review what Google does with your data at {gpartners} and turn off personalised advertising at {gads}.',
    pub2: 'Adsterra (turbulentrefreshments.com loader) is a second network wired into the site but switched off at the moment. If it is turned back on it may set its own cookies and use your IP and device information the same way, and this page will say so.',
    pub3: 'We do not allow popunder, push-notification, social-bar or in-page-redirect ad formats — only contained iframe banners and native cards. If you ever see something invasive, that is a bug: please report it.',
    pub4: 'If you are in the EU, the UK or the EEA: under the GDPR, ad targeting requires your consent. When our consent banner appears, the choices you make there take precedence over anything written on this page.',
    h5: '5. Cookies',
    cookiesIntro: 'We use the smallest set of cookies that actually does something:',
    cookies: [
      ['Session cookies', 'keep you signed in.'],
      ['Preference cookies', 'remember interface choices such as your language.'],
      ['Analytics cookies', 'none. Our page-view counter and Cloudflare Web Analytics both work without one.'],
      ['Advertising cookies', 'set by the ad network when ads are being served. Block them in your browser if you prefer.'],
    ],
    cookiesFin: 'Most modern browsers let you block, limit or delete cookies. If you do, parts of the site — signing in, saved picks — may stop working.',
    h6: '6. Your rights (GDPR, CCPA, PIPEDA)',
    droitsIntro: 'Depending on where you live, you have the right to:',
    droits: [
      'Ask what data we hold about you.',
      'Ask us to correct it or delete it.',
      'Ask us to port it to another service.',
      'Withdraw your consent at any time.',
      'Lodge a complaint with your data protection authority.',
    ],
    droitsFin: 'To exercise any of these, write to {mail} from the address tied to your account. We answer within 30 days.',
    h7: '7. Children',
    enfants: 'Pressing 90’ is not directed at children under 13, and we do not knowingly collect their data. If you believe a child has created an account, write to us and we will delete it.',
    h8: '8. Security',
    securite: 'All traffic is HTTPS-only. Accounts live on Supabase (managed Postgres, encrypted at rest). We never store passwords — only the Argon2 hashes Supabase manages. Dependencies are patched on a rolling basis. If you find a security problem, write to {mail}: we answer quickly and will credit you in the fix if you want.',
    h9: '9. Changes to this policy',
    changements: 'If we change how we handle data, we update the “Last updated” date at the top of this page and, for material changes, post a notice on the home page for at least 30 days.',
    h10: '10. Contact',
    contact: 'Privacy questions, requests, complaints: {mail}.',
  },
  fr: {
    eyebrow: 'Politique de confidentialité',
    titre1: 'Vos données, ',
    titreOr: 'en clair',
    titre2: '.',
    dates: 'En vigueur depuis le 9 juin 2026 · Dernière mise à jour : 12 octobre 2026',
    intro: 'Pressing 90’ (exploité par le studio mehdijabry.dev — « nous ») respecte votre vie privée. Cette page explique ce que nous recueillons, pourquoi, avec qui nous le partageons, et quels sont vos droits. Si quelque chose ici n’est pas clair, écrivez à {mail} et nous corrigerons la formulation.',
    h1: '1. Ce que nous recueillons',
    aTitre: 'A. Quand vous naviguez simplement sur le site (sans compte)',
    aListe: [
      'Les journaux serveur habituels (adresse IP, navigateur, pages visitées, horodatage), conservés une trentaine de jours pour la sécurité et la mesure d’audience.',
      'Une mesure d’audience anonyme et agrégée par Cloudflare Web Analytics — sans cookie et sans empreinte numérique.',
      'Notre propre compteur de pages vues : l’adresse de la page, le pays transmis par Cloudflare, le site d’où vous venez et votre langue. Aucun cookie, aucun identifiant, rien qui vous suive d’une session à l’autre — ces chiffres ne sont jamais lus autrement qu’en totaux.',
      'Un stockage local sur votre appareil pour ce que vous faites sur le site (vos pronostics, votre jour préféré). Il reste sur votre machine tant que vous ne vous connectez pas.',
    ],
    bTitre: 'B. Quand vous créez un compte',
    bListe: [
      'Votre adresse courriel et le pseudonyme que vous choisissez.',
      'Vos pronostics et leur historique, pour qu’ils vous suivent d’un appareil à l’autre.',
      'Si vous vous connectez avec Google, nous recevons de Google votre nom, votre courriel et votre photo de profil — rien d’autre.',
      'Un jeton de session, géré par OAuth et conservé dans un cookie.',
    ],
    cTitre: 'C. Ce que nous ne recueillons jamais',
    cListe: [
      'Vos informations de paiement — il n’y a aucun paiement sur ce site.',
      'Votre numéro de téléphone.',
      'Votre position, au-delà de ce qu’une adresse IP indique grossièrement.',
      'Le micro, la caméra, ni aucun capteur de votre appareil.',
    ],
    h2: '2. Pourquoi nous le recueillons',
    pourquoi: [
      'Pour servir le site tout court — on ne peut pas le visiter sans adresse IP.',
      'Pour retenir vos pronostics et que vous puissiez y revenir.',
      'Pour améliorer le site : savoir ce qui sert et ce qui casse.',
      'Pour empêcher les abus — aspiration automatisée, tentatives de connexion en force.',
      'Pour diffuser de la publicité (voir §4) et que le site reste gratuit.',
    ],
    h3: '3. Avec qui nous le partageons',
    partageIntro: 'Nous utilisons des services tiers pour faire tourner le site. Chacun ne reçoit que ce dont il a besoin :',
    roles: {
      'Cloudflare': 'DNS, CDN et sécurité en bordure — voit chaque requête vers le site au niveau réseau.',
      'Supabase': 'base de données et authentification — conserve votre compte et vos pronostics si vous créez un compte.',
      'Google': 'connexion avec Google — uniquement si vous choisissez ce mode de connexion.',
      'Google AdSense': 'publicité — diffuse les annonces de ce site et peut poser des cookies et utiliser des signaux d’appareil et d’IP. Voir §4.',
      'Adsterra': 'régie publicitaire, actuellement éteinte — poserait son propre cookie et pourrait utiliser des signaux d’appareil et d’IP. Voir §4.',
      'ESPN, TheSportsDB': 'sources de données — nous appelons leurs API publiques depuis notre worker, ils voient donc l’adresse IP de notre serveur, jamais la vôtre.',
      'Resend': 'courriels transactionnels — envoie les courriels de connexion et de récupération si vous créez un compte.',
    } as Record<string, string>,
    lienPolitique: 'Leur politique de confidentialité',
    pasDeVente: 'Nous ne vendons pas vos données personnelles. Nous ne les partageons avec personne qui ne figure pas ci-dessus, sauf lorsque la loi nous y oblige.',
    h4: '4. Publicité',
    pub1: 'Nous diffusons des annonces de tiers pour que le site reste gratuit. Notre régie actuelle est Google AdSense. Google et ses partenaires peuvent poser des cookies et utiliser votre adresse IP et des informations sur votre appareil pour diffuser et mesurer les annonces ; vous pouvez consulter ce que Google fait de vos données sur {gpartners} et désactiver la publicité personnalisée sur {gads}.',
    pub2: 'Adsterra (chargeur turbulentrefreshments.com) est une seconde régie câblée au site mais éteinte pour le moment. Si elle est rallumée, elle pourra poser ses propres cookies et utiliser votre IP et votre appareil de la même façon, et cette page le dira.',
    pub3: 'Nous n’autorisons ni les popunders, ni les notifications poussées, ni les barres sociales, ni les redirections en pleine page — seulement des bannières contenues dans un cadre et des encarts intégrés. Si vous voyez quelque chose d’intrusif, c’est un bogue : signalez-le.',
    pub4: 'Si vous êtes dans l’Union européenne, au Royaume-Uni ou dans l’EEE : le RGPD impose votre consentement pour le ciblage publicitaire. Quand notre bandeau de consentement apparaît, les choix que vous y faites priment sur tout ce qui est écrit sur cette page.',
    h5: '5. Cookies',
    cookiesIntro: 'Nous utilisons le plus petit jeu de cookies qui serve réellement à quelque chose :',
    cookies: [
      ['Cookies de session', 'vous gardent connecté.'],
      ['Cookies de préférence', 'retiennent vos choix d’interface, comme votre langue.'],
      ['Cookies de mesure d’audience', 'aucun. Notre compteur de pages vues et Cloudflare Web Analytics fonctionnent tous les deux sans.'],
      ['Cookies publicitaires', 'posés par la régie quand des annonces sont diffusées. Bloquez-les dans votre navigateur si vous préférez.'],
    ],
    cookiesFin: 'La plupart des navigateurs permettent de bloquer, limiter ou supprimer les cookies. Si vous le faites, certaines parties du site — la connexion, les pronostics enregistrés — peuvent cesser de fonctionner.',
    h6: '6. Vos droits (RGPD, CCPA, LPRPDE)',
    droitsIntro: 'Selon l’endroit où vous vivez, vous avez le droit de :',
    droits: [
      'Demander quelles données nous détenons sur vous.',
      'Nous demander de les corriger ou de les supprimer.',
      'Nous demander de les transférer vers un autre service.',
      'Retirer votre consentement à tout moment.',
      'Déposer une plainte auprès de votre autorité de protection des données.',
    ],
    droitsFin: 'Pour exercer l’un de ces droits, écrivez à {mail} depuis l’adresse liée à votre compte. Nous répondons sous 30 jours.',
    h7: '7. Les enfants',
    enfants: 'Pressing 90’ ne s’adresse pas aux enfants de moins de 13 ans, et nous ne recueillons pas sciemment leurs données. Si vous pensez qu’un enfant a créé un compte, écrivez-nous et nous le supprimerons.',
    h8: '8. Sécurité',
    securite: 'Tout le trafic passe en HTTPS uniquement. Les comptes vivent chez Supabase (Postgres infogéré, chiffré au repos). Nous ne conservons jamais de mot de passe — seulement les empreintes Argon2 gérées par Supabase. Les dépendances sont corrigées au fil de l’eau. Si vous trouvez un problème de sécurité, écrivez à {mail} : nous répondons vite, et nous vous créditons dans le correctif si vous le souhaitez.',
    h9: '9. Modifications de cette politique',
    changements: 'Si nous changeons notre façon de traiter les données, nous mettons à jour la date de « dernière mise à jour » en haut de cette page et, pour un changement important, nous affichons un avis sur la page d’accueil pendant au moins 30 jours.',
    h10: '10. Nous écrire',
    contact: 'Questions, demandes et plaintes relatives à la vie privée : {mail}.',
  },
  ar: {
    eyebrow: 'سياسة الخصوصية',
    titre1: 'بياناتك، ',
    titreOr: 'بوضوح',
    titre2: '.',
    dates: 'سارية منذ 9 يونيو 2026 · آخر تحديث: 12 أكتوبر 2026',
    intro: 'بريسينغ 90 (يديره استوديو mehdijabry.dev — «نحن») يحترم خصوصيتك. تشرح هذه الصفحة ما نجمعه ولماذا، ومع من نتشاركه، وما هي حقوقك. إن كان أي شيء هنا غير واضح، اكتب إلى {mail} وسنصحّح الصياغة.',
    h1: '1. ما الذي نجمعه',
    aTitre: 'أ. عند التصفّح فقط (بدون حساب)',
    aListe: [
      'سجلّات الخادم المعتادة (عنوان IP، المتصفّح، الصفحات المزارة، التوقيت)، تُحفظ نحو ثلاثين يومًا للأمان وقياس الزيارات.',
      'قياس زيارات مجهول ومجمّع عبر Cloudflare Web Analytics — بلا كوكيز وبلا بصمة رقمية.',
      'عدّاد الصفحات الخاص بنا: عنوان الصفحة، البلد الذي يرسله Cloudflare، الموقع الذي أتيت منه، ولغتك. لا كوكي، لا معرّف، ولا شيء يتتبّعك بين الجلسات — ولا تُقرأ هذه الأرقام إلا كمجاميع.',
      'تخزين محلي على جهازك لما تفعله في الموقع (توقّعاتك، يومك المفضّل). يبقى على جهازك ما لم تسجّل الدخول.',
    ],
    bTitre: 'ب. عند إنشاء حساب',
    bListe: [
      'بريدك الإلكتروني والاسم المعروض الذي تختاره.',
      'توقّعاتك وسجلّها، كي تتبعك من جهاز إلى آخر.',
      'إذا سجّلت الدخول بحساب Google، نتلقّى من Google اسمك وبريدك وصورتك — لا شيء غير ذلك.',
      'رمز جلسة يديره OAuth ويُحفظ في كوكي.',
    ],
    cTitre: 'ج. ما لا نجمعه أبدًا',
    cListe: [
      'معلومات الدفع — لا توجد أي مدفوعات على هذا الموقع.',
      'رقم هاتفك.',
      'موقعك الجغرافي، بما يتجاوز ما يدلّ عليه عنوان IP تقريبًا.',
      'الميكروفون أو الكاميرا أو أي مستشعر في جهازك.',
    ],
    h2: '2. لماذا نجمعه',
    pourquoi: [
      'لتشغيل الموقع أصلًا — لا يمكن زيارته بدون عنوان IP.',
      'لحفظ توقّعاتك كي تعود إليها.',
      'لتحسين الموقع: معرفة ما يُستخدم وما يتعطّل.',
      'لمنع الإساءة — السحب الآلي للبيانات ومحاولات الدخول بالقوة.',
      'لعرض الإعلانات (انظر §4) كي يبقى الموقع مجانيًا.',
    ],
    h3: '3. مع من نتشاركه',
    partageIntro: 'نستعين بخدمات خارجية لتشغيل الموقع. كلٌّ منها لا يتلقّى إلا ما يحتاجه:',
    roles: {
      'Cloudflare': 'نطاقات وشبكة توصيل وأمان على الحافة — يرى كل طلب إلى الموقع على مستوى الشبكة.',
      'Supabase': 'قاعدة البيانات والمصادقة — تحفظ حسابك وتوقّعاتك إن أنشأت حسابًا.',
      'Google': 'تسجيل الدخول بحساب Google — فقط إن اخترت هذه الطريقة.',
      'Google AdSense': 'الإعلانات — يعرض إعلانات هذا الموقع وقد يضع كوكيز ويستخدم إشارات الجهاز وعنوان IP. انظر §4.',
      'Adsterra': 'شبكة إعلانات، مطفأة حاليًا — كانت ستضع كوكي خاصًا بها وقد تستخدم إشارات الجهاز وعنوان IP. انظر §4.',
      'ESPN, TheSportsDB': 'مصادر البيانات — نستدعي واجهاتها العامة من خادمنا، فترى عنوان خادمنا لا عنوانك.',
      'Resend': 'البريد التشغيلي — يرسل رسائل تسجيل الدخول واستعادة الحساب إن أنشأت حسابًا.',
    } as Record<string, string>,
    lienPolitique: 'سياسة الخصوصية لديهم',
    pasDeVente: 'نحن لا نبيع بياناتك الشخصية، ولا نتشاركها مع أي جهة غير مذكورة أعلاه، إلا حين يُلزمنا القانون بذلك.',
    h4: '4. الإعلانات',
    pub1: 'نعرض إعلانات من أطراف خارجية كي يبقى الموقع مجانيًا. شريكنا الإعلاني الحالي هو Google AdSense. قد تضع Google وشركاؤها كوكيز وتستخدم عنوان IP ومعلومات جهازك لعرض الإعلانات وقياسها؛ يمكنك الاطّلاع على ما تفعله Google ببياناتك على {gpartners} وإيقاف الإعلانات المخصّصة على {gads}.',
    pub2: 'Adsterra (مُحمّل turbulentrefreshments.com) شبكة ثانية موصولة بالموقع لكنها مطفأة حاليًا. إن أُعيد تشغيلها فقد تضع كوكيز خاصة بها وتستخدم عنوان IP وجهازك بالطريقة نفسها، وستقول هذه الصفحة ذلك.',
    pub3: 'لا نسمح بإعلانات النوافذ الخلفية ولا بإشعارات الدفع ولا بالأشرطة الاجتماعية ولا بإعادة التوجيه داخل الصفحة — فقط لافتات محصورة داخل إطار وبطاقات مدمجة. إن رأيت شيئًا مزعجًا فهو خلل: أبلغنا به.',
    pub4: 'إن كنت في الاتحاد الأوروبي أو المملكة المتحدة أو المنطقة الاقتصادية الأوروبية: يفرض النظام الأوروبي لحماية البيانات موافقتك على الاستهداف الإعلاني. وعند ظهور نافذة الموافقة لدينا، فإن اختياراتك فيها تعلو على كل ما هو مكتوب في هذه الصفحة.',
    h5: '5. ملفات تعريف الارتباط',
    cookiesIntro: 'نستخدم أصغر مجموعة كوكيز تؤدّي فعلًا وظيفة:',
    cookies: [
      ['كوكيز الجلسة', 'تُبقيك مسجّل الدخول.'],
      ['كوكيز التفضيلات', 'تحفظ خياراتك في الواجهة، كلغتك مثلًا.'],
      ['كوكيز القياس', 'لا شيء. عدّادنا و Cloudflare Web Analytics يعملان بدونها.'],
      ['كوكيز الإعلانات', 'تضعها الشبكة الإعلانية عند عرض الإعلانات. امنعها من متصفّحك إن فضّلت ذلك.'],
    ],
    cookiesFin: 'تتيح معظم المتصفّحات منع الكوكيز أو تقييدها أو حذفها. وإن فعلت، فقد تتوقّف أجزاء من الموقع — تسجيل الدخول، التوقّعات المحفوظة — عن العمل.',
    h6: '6. حقوقك (GDPR، CCPA، PIPEDA)',
    droitsIntro: 'بحسب مكان إقامتك، يحقّ لك أن:',
    droits: [
      'تسأل عن البيانات التي نحتفظ بها عنك.',
      'تطلب منّا تصحيحها أو حذفها.',
      'تطلب نقلها إلى خدمة أخرى.',
      'تسحب موافقتك في أي وقت.',
      'تقدّم شكوى إلى سلطة حماية البيانات في بلدك.',
    ],
    droitsFin: 'لممارسة أيٍّ من هذه الحقوق، اكتب إلى {mail} من العنوان المرتبط بحسابك. نردّ خلال 30 يومًا.',
    h7: '7. الأطفال',
    enfants: 'بريسينغ 90 ليس موجّهًا لمن هم دون 13 سنة، ولا نجمع بياناتهم عن قصد. إن كنت تعتقد أن طفلًا أنشأ حسابًا، فاكتب إلينا وسنحذفه.',
    h8: '8. الأمان',
    securite: 'كل حركة البيانات عبر HTTPS فقط. الحسابات محفوظة لدى Supabase (قاعدة Postgres مُدارة ومشفّرة في حالة السكون). لا نحتفظ بكلمات المرور أبدًا — فقط بصمات Argon2 التي يديرها Supabase. ونحدّث المكتبات أولًا بأول. إن وجدت ثغرة أمنية فاكتب إلى {mail}: نردّ بسرعة، وننسب لك الفضل في الإصلاح إن أردت.',
    h9: '9. تعديلات هذه السياسة',
    changements: 'إن غيّرنا طريقة تعاملنا مع البيانات، نحدّث تاريخ «آخر تحديث» أعلى هذه الصفحة، وننشر إشعارًا على الصفحة الرئيسية لمدة ثلاثين يومًا على الأقل عند أي تغيير جوهري.',
    h10: '10. تواصل معنا',
    contact: 'أسئلة وطلبات وشكاوى الخصوصية: {mail}.',
  },
} as const

export function Privacy() {
  const lang = useLang((s) => s.lang)
  const c = COPY[lang]

  useEffect(() => {
    document.title = 'Privacy Policy · Pressing 90’'
  }, [])

  const h2 = 'text-2xl font-display font-bold text-slate-900 mt-10 mb-3'
  const lien = 'text-accent-gold underline'

  /** Une phrase dont un repère ({mail}, {gads}…) devient un lien. */
  const avecLien = (texte: string, repere: string, href: string, libelle: string) => {
    const [avant, apres] = texte.split(repere)
    return (
      <>
        {avant}
        <a href={href} className={lien} target={href.startsWith('mailto:') ? undefined : '_blank'} rel="noopener noreferrer">
          {libelle}
        </a>
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
        <p>{avecLien(c.intro, '{mail}', `mailto:${COURRIEL}`, COURRIEL)}</p>

        <h2 className={h2}>{c.h1}</h2>
        <p><strong>{c.aTitre}</strong></p>
        <Puces items={c.aListe} />
        <p><strong>{c.bTitre}</strong></p>
        <Puces items={c.bListe} />
        <p><strong>{c.cTitre}</strong></p>
        <Puces items={c.cListe} />

        <h2 className={h2}>{c.h2}</h2>
        <Puces items={c.pourquoi} />

        <h2 className={h2}>{c.h3}</h2>
        <p>{c.partageIntro}</p>
        <ul className="space-y-2 list-disc list-inside ml-2">
          {PARTENAIRES.map((p) => (
            <li key={p.nom}>
              <strong>{p.nom}</strong> — {c.roles[p.nom]}
              {p.url && (
                <>
                  {' '}
                  <a href={p.url} className={lien} target="_blank" rel="noopener noreferrer">
                    {c.lienPolitique}
                  </a>.
                </>
              )}
            </li>
          ))}
        </ul>
        <p>{c.pasDeVente}</p>

        <h2 className={h2}>{c.h4}</h2>
        <p>
          {(() => {
            const [a, reste] = c.pub1.split('{gpartners}')
            const [milieu, fin] = reste.split('{gads}')
            return (
              <>
                {a}
                <a href="https://policies.google.com/technologies/partner-sites" className={lien} target="_blank" rel="noopener noreferrer">
                  policies.google.com/technologies/partner-sites
                </a>
                {milieu}
                <a href="https://adssettings.google.com" className={lien} target="_blank" rel="noopener noreferrer">
                  adssettings.google.com
                </a>
                {fin}
              </>
            )
          })()}
        </p>
        <p>{c.pub2}</p>
        <p>{c.pub3}</p>
        <p>{c.pub4}</p>

        <h2 className={h2}>{c.h5}</h2>
        <p>{c.cookiesIntro}</p>
        <ul className="space-y-1 list-disc list-inside ml-2">
          {c.cookies.map(([titre, texte]) => (
            <li key={titre}><strong>{titre}</strong> — {texte}</li>
          ))}
        </ul>
        <p>{c.cookiesFin}</p>

        <h2 className={h2}>{c.h6}</h2>
        <p>{c.droitsIntro}</p>
        <Puces items={c.droits} />
        <p>{avecLien(c.droitsFin, '{mail}', `mailto:${COURRIEL}`, COURRIEL)}</p>

        <h2 className={h2}>{c.h7}</h2>
        <p>{c.enfants}</p>

        <h2 className={h2}>{c.h8}</h2>
        <p>{avecLien(c.securite, '{mail}', `mailto:${COURRIEL}`, COURRIEL)}</p>

        <h2 className={h2}>{c.h9}</h2>
        <p>{c.changements}</p>

        <h2 className={h2}>{c.h10}</h2>
        <p>{avecLien(c.contact, '{mail}', `mailto:${COURRIEL}`, COURRIEL)}</p>
      </section>

      <footer className="mt-16 pt-8 border-t border-slate-200 font-mono text-xs text-slate-500">
        Pressing 90’ · pressing90.live
      </footer>
    </div>
  )
}
