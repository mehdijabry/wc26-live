import { useEffect } from 'react'
import { Icone } from '../Icone'
import { useLang } from '../../lib/i18n'

/**
 * À propos — /about.
 *
 * ── RÉÉCRITE LE 12/10/2026 ───────────────────────────────────────────────
 * Elle décrivait encore un site construit AUTOUR DE LA COUPE DU MONDE 2026
 * (« We're building the cleanest place to follow WC2026 »), alors que le
 * site est généraliste depuis le 06/08/2026 et que le Mondial y est une
 * archive. Elle ne mentionnait ni les pronostics, ni l'analyse IA, ni les
 * ligues privées — c'est-à-dire presque tout le produit.
 *
 * Elle était aussi EN ANGLAIS SEULEMENT, sur un site FR/EN/AR, avec un bout
 * de français égaré au milieu d'une phrase anglaise (« grimpe le
 * leaderboard ») et la marque écrite deux fois de suite dans le pied de
 * page, une fois avec l'apostrophe typographique et une fois avec la droite.
 *
 * Même dictionnaire local que /responsible-gambling : les paragraphes sont
 * trop longs pour la table i18n globale.
 */
const COPY = {
  en: {
    eyebrow: 'About · Pressing 90’',
    titre: 'Football, without the junk drawer.',
    intro: 'Pressing 90′ is an independent football site: live scores from forty-odd competitions, the news that matters, a match-by-match read of what is likely to happen, and a free prediction game you play against your friends. It is built and run by one person.',
    s1h: 'What you will find here',
    s1: [
      ['Live scores', 'every match, the minute ticking, scorers and assists, half-time and shoot-outs. It refreshes itself.'],
      ['Leagues and clubs', 'tables, fixtures and squads for the competitions we cover, from the Premier League to the Copa Libertadores.'],
      ['Match analysis', 'probable line-ups, who is missing and why, ten-match form, head-to-head and expected goals — summed up in four sentences before the detail.'],
      ['The prediction game', 'back a result at real odds with free credits. No money goes in, none comes out.'],
      ['Private leagues', 'make a group, invite your friends, and settle who actually reads a match best.'],
      ['Where to watch', 'the broadcaster for a match in your country.'],
      ['World Cup 2026', 'the full tournament archive — bracket, results and stats — kept as it finished.'],
    ],
    s2h: 'About the prediction game',
    s2: 'It is free, and it stays free. You are given crampons every day; you stake them on real 1X2 odds and you win pressings. Neither can be bought, sold, cashed out, or exchanged for anything of value. We are not a bookmaker, we take no payment, and there are no betting links on this site.',
    s3h: 'Why it exists',
    s3: 'Most live-score sites are either ad-stuffed junk drawers or paywalled aggregators. This one is meant to read like a sports paper you actually enjoy opening: real typography, room to breathe, information where you expect it, and no pop-ups.',
    s4h: 'Where the data comes from',
    s4: 'Scores, squads and match detail come from ESPN’s public football API. Broadcast rights per country come from TheSportsDB. Probable line-ups, injuries and form come from Bzzoiro Sports Data. The odds come from third-party providers and are shown for information. We are not affiliated with FIFA, any federation or any broadcaster; logos and trademarks belong to their owners.',
    s5h: 'Who is behind it',
    s5: 'Pressing 90′ is designed and built by mehdijabry.dev, a freelance web studio in Canada. Football has been Mehdi’s first sport for as long as he can remember — atlas lions for life — and this site is both a fan letter and a public workshop.',
    s6h: 'Get in touch',
    s6: 'Press, partnerships, feature requests, bug reports — all welcome on the contact page. Everything gets read.',
    lien: 'contact page',
    maj: 'Last updated: October 12, 2026',
  },
  fr: {
    eyebrow: 'À propos · Pressing 90’',
    titre: 'Du football, sans le fourre-tout.',
    intro: 'Pressing 90′ est un site de football indépendant : les scores en direct d’une quarantaine de compétitions, l’actualité qui compte, une lecture match par match de ce qui risque d’arriver, et un jeu de pronostics gratuit auquel on joue contre ses amis. Il est construit et tenu par une seule personne.',
    s1h: 'Ce qu’on y trouve',
    s1: [
      ['Les scores en direct', 'tous les matchs, la minute qui défile, les buteurs et les passeurs, la mi-temps et les tirs au but. Ça se rafraîchit tout seul.'],
      ['Les ligues et les clubs', 'classements, calendriers et effectifs des compétitions couvertes, de la Premier League à la Copa Libertadores.'],
      ['L’analyse d’un match', 'onze probable, qui manque et pourquoi, la forme sur dix matchs, les confrontations directes et les buts attendus — résumés en quatre phrases avant le détail.'],
      ['Le jeu de pronostics', 'jouer un résultat à cotes réelles avec des crédits offerts. Aucun argent n’entre, aucun ne sort.'],
      ['Les ligues privées', 'créer un groupe, inviter ses amis, et régler qui lit vraiment le mieux un match.'],
      ['Où regarder', 'le diffuseur d’un match dans votre pays.'],
      ['Coupe du monde 2026', 'l’archive complète du tournoi — tableau, résultats et statistiques — laissée telle qu’elle s’est terminée.'],
    ],
    s2h: 'À propos du jeu de pronostics',
    s2: 'Il est gratuit, et il le reste. On reçoit des crampons chaque jour ; on les mise sur de vraies cotes 1X2 et on gagne des pressings. Ni les uns ni les autres ne peuvent être achetés, vendus, retirés ou échangés contre quoi que ce soit de valeur. Nous ne sommes pas un bookmaker, nous n’encaissons rien, et il n’y a aucun lien de paris sur ce site.',
    s3h: 'Pourquoi il existe',
    s3: 'La plupart des sites de scores sont soit des fourre-tout bourrés de publicité, soit des agrégateurs payants. Celui-ci est fait pour se lire comme un journal sportif qu’on ouvre avec plaisir : une vraie typographie, de l’air, l’information là où on l’attend, et aucune fenêtre surgissante.',
    s4h: 'D’où viennent les données',
    s4: 'Les scores, les effectifs et le détail des matchs viennent de l’API football publique d’ESPN. Les droits de diffusion par pays viennent de TheSportsDB. Les onze probables, les absents et la forme viennent de Bzzoiro Sports Data. Les cotes viennent de fournisseurs tiers et sont affichées à titre d’information. Nous ne sommes affiliés ni à la FIFA, ni à une fédération, ni à un diffuseur ; les logos et marques appartiennent à leurs propriétaires.',
    s5h: 'Qui est derrière',
    s5: 'Pressing 90′ est conçu et développé par mehdijabry.dev, un studio web indépendant au Canada. Le football est le premier sport de Mehdi depuis toujours — atlas lions for life — et ce site est à la fois une lettre de supporter et un atelier public.',
    s6h: 'Nous écrire',
    s6: 'Presse, partenariats, idées de fonctionnalités, signalements de bogues — tout est bienvenu sur la page contact. Tout est lu.',
    lien: 'page contact',
    maj: 'Dernière mise à jour : 12 octobre 2026',
  },
  ar: {
    eyebrow: 'من نحن · Pressing 90’',
    titre: 'كرة قدم، بلا فوضى.',
    intro: 'بريسينغ 90 موقع كرة قدم مستقل: نتائج مباشرة لأربعين مسابقة تقريبًا، الأخبار التي تهمّ، قراءة لكل مباراة لما قد يحدث فيها، ولعبة توقّعات مجانية تلعبها مع أصدقائك. يبنيه ويديره شخص واحد.',
    s1h: 'ما ستجده هنا',
    s1: [
      ['النتائج المباشرة', 'كل المباريات، الدقيقة تمرّ، الهدّافون والممرّرون، الشوط الأول وركلات الترجيح. يتحدّث وحده.'],
      ['الدوريات والأندية', 'الترتيب والجدول والتشكيلات للمسابقات التي نغطّيها، من البريميرليغ إلى كوبا ليبرتادوريس.'],
      ['تحليل المباراة', 'التشكيلة المتوقّعة، من يغيب ولماذا، الحالة في عشر مباريات، المواجهات المباشرة والأهداف المتوقّعة — ملخّصة في أربع جمل قبل التفاصيل.'],
      ['لعبة التوقّعات', 'راهن على نتيجة بكوتات حقيقية بأرصدة مجانية. لا مال يدخل ولا مال يخرج.'],
      ['الدوريات الخاصة', 'أنشئ مجموعة، ادعُ أصدقاءك، واحسم من يقرأ المباراة أفضل فعلًا.'],
      ['أين تُشاهد', 'القناة الناقلة للمباراة في بلدك.'],
      ['كأس العالم 2026', 'أرشيف البطولة كاملًا — الجدول والنتائج والإحصاءات — كما انتهت.'],
    ],
    s2h: 'عن لعبة التوقّعات',
    s2: 'هي مجانية وستبقى كذلك. تحصل على كرامبون كل يوم؛ تراهن بها على كوتات 1X2 حقيقية وتربح بريسينغ. لا يمكن شراء أي منهما ولا بيعه ولا سحبه ولا استبداله بأي شيء ذي قيمة. لسنا شركة مراهنات، ولا نحصّل أي مبلغ، ولا توجد أي روابط مراهنة على هذا الموقع.',
    s3h: 'لماذا وُجد',
    s3: 'معظم مواقع النتائج إمّا فوضى محشوّة بالإعلانات وإمّا مجمّعات بأسعار اشتراك. هذا الموقع مصمَّم ليُقرأ كصحيفة رياضية تفتحها بسرور: خطّ حقيقي، مساحة للتنفّس، المعلومة حيث تتوقّعها، ولا نوافذ منبثقة.',
    s4h: 'من أين تأتي البيانات',
    s4: 'النتائج والتشكيلات وتفاصيل المباريات من واجهة ESPN العامة لكرة القدم. حقوق البثّ حسب البلد من TheSportsDB. التشكيلات المتوقّعة والغيابات والحالة من Bzzoiro Sports Data. الكوتات من مزوّدين خارجيين وتُعرض للعلم. لسنا تابعين للفيفا ولا لأي اتحاد ولا لأي ناقل؛ الشعارات والعلامات ملك أصحابها.',
    s5h: 'من خلفه',
    s5: 'بريسينغ 90 من تصميم وتطوير mehdijabry.dev، استوديو ويب مستقل في كندا. كرة القدم رياضة مهدي الأولى منذ دائمًا — أسود الأطلس مدى الحياة — وهذا الموقع رسالة مشجّع وورشة مفتوحة في آن.',
    s6h: 'تواصل معنا',
    s6: 'الصحافة، الشراكات، اقتراحات الميزات، بلاغات الأخطاء — كلها مرحّب بها في صفحة التواصل. كل شيء يُقرأ.',
    lien: 'صفحة التواصل',
    maj: 'آخر تحديث: 12 أكتوبر 2026',
  },
} as const

export function About() {
  const lang = useLang((s) => s.lang)
  const c = COPY[lang]

  useEffect(() => {
    document.title = 'About · Pressing 90’'
  }, [])

  const h2 = 'text-2xl font-display font-bold text-slate-900 mt-10 mb-3'

  return (
    <div className="container max-w-3xl mx-auto px-6 py-16">
      <header className="mb-12">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 mb-3">
          {c.eyebrow}
        </div>
        <Icone nom="goal-post" taille={56} className="mb-3 opacity-90" />
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-slate-900 tracking-tight">
          {c.titre}
        </h1>
      </header>

      <section className="prose prose-slate prose-lg max-w-none space-y-6 text-slate-700 leading-relaxed">
        <p>{c.intro}</p>

        <h2 className={h2}>{c.s1h}</h2>
        <ul className="space-y-2 list-disc list-inside">
          {c.s1.map(([titre, texte]) => (
            <li key={titre}>
              <strong>{titre}</strong> — {texte}
            </li>
          ))}
        </ul>

        <h2 className={h2}>{c.s2h}</h2>
        <p>{c.s2}</p>

        <h2 className={h2}>{c.s3h}</h2>
        <p>{c.s3}</p>

        <h2 className={h2}>{c.s4h}</h2>
        <p>{c.s4}</p>

        <h2 className={h2}>{c.s5h}</h2>
        <p>
          {c.s5.split('mehdijabry.dev')[0]}
          <a href="https://mehdijabry.dev" className="text-accent-gold underline underline-offset-2 decoration-2 hover:text-yellow-600">
            mehdijabry.dev
          </a>
          {c.s5.split('mehdijabry.dev')[1]}
        </p>

        <h2 className={h2}>{c.s6h}</h2>
        <p>
          {c.s6.split(c.lien)[0]}
          <a href="/contact" className="text-accent-gold underline underline-offset-2 decoration-2 hover:text-yellow-600">
            {c.lien}
          </a>
          {c.s6.split(c.lien)[1]}
        </p>
      </section>

      <footer className="mt-16 pt-8 border-t border-slate-200 font-mono text-xs text-slate-500">
        {c.maj} · pressing90.live
      </footer>
    </div>
  )
}
