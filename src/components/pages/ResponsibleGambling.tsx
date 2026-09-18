import { useEffect } from 'react'
import { useLang } from '../../lib/i18n'

/**
 * Responsible Gambling — /responsible-gambling.
 *
 * Required before any bookmaker affiliation goes live: affiliate networks
 * review the site for an 18+ / responsible-play page, and the ANJ (France)
 * mandates the risk message + Joueurs Info Service helpline anywhere
 * betting is promoted to a French audience. Fully bilingual (EN/AR) via a
 * local dict — the paragraphs are too long for the global i18n table.
 */

const COPY = {
  en: {
    eyebrow: 'Responsible gambling',
    title: 'Odds are information — not an invitation.',
    updated: 'Last updated: August 29, 2026',
    s1h: '18+ only',
    s1: 'Betting odds displayed on Pressing 90′ are strictly reserved for adults. If you are under 18 (or under the legal gambling age in your country), the betting-related parts of this site are not for you. Gambling by minors is prohibited.',
    s2h: 'What the odds on this site are',
    s2a: 'Pressing 90′ is a live-scores and news site. The 1X2 odds shown next to upcoming matches come from third-party providers and are displayed for information and editorial purposes only. They may be outdated or differ from what a bookmaker actually offers at any moment.',
    s2b: 'We are not a bookmaker. We do not accept, place, broker, or pay out bets of any kind.',
    s3h: 'Affiliate links',
    s3: 'Some outbound links to betting operators may be affiliate links: if you sign up through them, we may earn a commission, at no extra cost to you. This never changes the odds we display or the matches we cover. Operator sites have their own terms, and their availability depends on the laws of your country — always check what is legal where you live.',
    s4h: 'Play responsibly',
    s4list: [
      'Only bet money you can afford to lose — never money for rent, food, or debts.',
      'Set a budget and a time limit before you start, and stick to both.',
      'Never chase losses. A loss is a cost, not a debt to win back.',
      'Betting is entertainment, not a source of income.',
      'Never gamble when upset, tired, or under the influence.',
      'Take regular breaks, and use the deposit-limit and self-exclusion tools operators must provide.',
    ],
    s5h: 'Need help? It is free and confidential',
    s5: 'If gambling is causing you or someone close to you harm — debt, isolation, anxiety, loss of control — help exists in every region:',
    resources: [
      { area: 'France', name: 'Joueurs Info Service — 09 74 75 13 13 (non-premium call, 8am–2am)', url: 'https://www.joueurs-info-service.fr' },
      { area: 'International', name: 'Gambling Therapy — free online support, available in Arabic', url: 'https://www.gamblingtherapy.org' },
      { area: 'United Kingdom', name: 'BeGambleAware', url: 'https://www.begambleaware.org' },
    ],
    s5b: 'Risk warning (France — ANJ): « Les jeux d’argent et de hasard peuvent être dangereux : pertes d’argent, conflits familiaux, addiction. Retrouvez nos conseils sur joueurs-info-service.fr (09 74 75 13 13). »',
  },
  fr: {
    eyebrow: 'Jeu responsable',
    title: 'Les cotes sont une information — pas une invitation.',
    updated: 'Dernière mise à jour : 31 août 2026',
    s1h: 'Réservé aux 18 ans et plus',
    s1: 'Les cotes affichées sur Pressing 90′ sont strictement réservées aux adultes. Si vous avez moins de 18 ans (ou moins que l’âge légal pour parier dans votre pays), les sections liées aux paris de ce site ne vous sont pas destinées. Les jeux d’argent sont interdits aux mineurs.',
    s2h: 'Ce que sont les cotes affichées sur ce site',
    s2a: 'Pressing 90′ est un site de scores en direct et d’actualités. Les cotes 1X2 affichées à côté des matchs à venir proviennent de fournisseurs tiers et sont présentées à titre informatif et éditorial uniquement. Elles peuvent être obsolètes ou différer de ce qu’un opérateur propose réellement à un instant donné.',
    s2b: 'Nous ne sommes pas un opérateur de paris. Nous n’acceptons, ne plaçons, ne négocions ni ne payons aucun pari.',
    s3h: 'Liens d’affiliation',
    s3: 'Certains liens sortants vers des opérateurs de paris peuvent être des liens d’affiliation : si vous vous inscrivez via ces liens, nous pouvons percevoir une commission, sans aucun coût supplémentaire pour vous. Cela ne modifie jamais les cotes que nous affichons ni les matchs que nous couvrons. Les sites des opérateurs ont leurs propres conditions, et leur disponibilité dépend des lois de votre pays — vérifiez toujours ce qui est légal là où vous vivez. En France, seuls les opérateurs agréés par l’ANJ sont autorisés.',
    s4h: 'Jouez responsable',
    s4list: [
      'Ne pariez que de l’argent que vous pouvez vous permettre de perdre — jamais l’argent du loyer, des courses ou des dettes.',
      'Fixez un budget et une limite de temps avant de commencer, et tenez-vous-y.',
      'Ne cherchez jamais à « vous refaire ». Une perte est un coût, pas une dette à récupérer.',
      'Le pari est un divertissement, pas une source de revenus.',
      'Ne pariez jamais sous le coup de la colère, de la fatigue ou d’une substance.',
      'Faites des pauses régulières et utilisez les outils de limite de dépôt et d’auto-exclusion que les opérateurs doivent proposer.',
    ],
    s5h: 'Besoin d’aide ? C’est gratuit et confidentiel',
    s5: 'Si le jeu vous cause du tort, à vous ou à un proche — dettes, isolement, anxiété, perte de contrôle — de l’aide existe :',
    resources: [
      { area: 'France', name: 'Joueurs Info Service — 09 74 75 13 13 (appel non surtaxé, 8h–2h)', url: 'https://www.joueurs-info-service.fr' },
      { area: 'International', name: 'Gambling Therapy — soutien en ligne gratuit', url: 'https://www.gamblingtherapy.org' },
      { area: 'Royaume-Uni', name: 'BeGambleAware', url: 'https://www.begambleaware.org' },
    ],
    s5b: 'Message de prévention (France — ANJ) : « Les jeux d’argent et de hasard peuvent être dangereux : pertes d’argent, conflits familiaux, addiction. Retrouvez nos conseils sur joueurs-info-service.fr (09 74 75 13 13). »',
  },
  ar: {
    eyebrow: 'اللعب المسؤول',
    title: 'الكوتات معلومة — وليست دعوة للرهان.',
    updated: 'آخر تحديث: 29 أغسطس 2026',
    s1h: 'للبالغين فقط (+18)',
    s1: 'كوتات المراهنات المعروضة على Pressing 90′ مخصصة حصريًا للبالغين. إذا كان عمرك أقل من 18 سنة (أو أقل من السن القانوني للمراهنة في بلدك)، فإن الأقسام المتعلقة بالمراهنات في هذا الموقع ليست موجهة إليك. المراهنة ممنوعة على القاصرين.',
    s2h: 'ما هي الكوتات المعروضة على هذا الموقع',
    s2a: 'Pressing 90′ موقع نتائج مباشرة وأخبار. كوتات 1X2 المعروضة بجانب المباريات القادمة مصدرها أطراف خارجية، وتُعرض لأغراض إعلامية وتحريرية فقط. قد تكون غير محدّثة أو مختلفة عمّا يعرضه وكيل المراهنات فعليًا في أي لحظة.',
    s2b: 'نحن لسنا وكيل مراهنات. لا نقبل أي رهانات ولا نضعها ولا نتوسط فيها ولا ندفع أرباحها.',
    s3h: 'روابط الإحالة (الأفلييت)',
    s3: 'بعض الروابط الخارجية نحو مواقع المراهنات قد تكون روابط إحالة: إذا سجّلت عبرها فقد نحصل على عمولة، دون أي تكلفة إضافية عليك. هذا لا يغيّر أبدًا الكوتات التي نعرضها ولا المباريات التي نغطيها. لمواقع المشغّلين شروطها الخاصة، وتوفرها يعتمد على قوانين بلدك — تحقق دائمًا مما هو قانوني حيث تعيش.',
    s4h: 'العب بمسؤولية',
    s4list: [
      'لا تراهن إلا بمال يمكنك تحمّل خسارته — أبدًا بمال الإيجار أو الطعام أو الديون.',
      'حدّد ميزانية ووقتًا قبل أن تبدأ، والتزم بهما.',
      'لا تحاول أبدًا تعويض الخسائر. الخسارة تكلفة، وليست دَينًا تستردّه.',
      'المراهنة ترفيه، وليست مصدر دخل.',
      'لا تراهن أبدًا وأنت غاضب أو مرهق أو تحت أي تأثير.',
      'خذ فترات راحة منتظمة، واستخدم أدوات حدود الإيداع والاستبعاد الذاتي التي يوفرها المشغّلون.',
    ],
    s5h: 'تحتاج مساعدة؟ إنها مجانية وسرّية',
    s5: 'إذا كانت المراهنات تسبب لك أو لأحد المقربين منك ضررًا — ديون، عزلة، قلق، فقدان السيطرة — فالمساعدة موجودة في كل منطقة:',
    resources: [
      { area: 'دوليًا', name: 'Gambling Therapy — دعم مجاني عبر الإنترنت، متوفر بالعربية', url: 'https://www.gamblingtherapy.org' },
      { area: 'فرنسا', name: 'Joueurs Info Service — 09 74 75 13 13', url: 'https://www.joueurs-info-service.fr' },
      { area: 'المملكة المتحدة', name: 'BeGambleAware', url: 'https://www.begambleaware.org' },
    ],
    s5b: 'تحذير (فرنسا — ANJ): ألعاب المال والحظ قد تكون خطيرة: خسائر مالية، نزاعات عائلية، إدمان.',
  },
} as const

export function ResponsibleGambling() {
  const lang = useLang((s) => s.lang)
  const c = COPY[lang]

  useEffect(() => {
    document.title = 'Responsible Gambling · Pressing 90’'
  }, [])

  const h2 = 'text-2xl font-display font-bold text-slate-900 mt-10 mb-3'

  return (
    <div className="container max-w-3xl mx-auto px-6 py-16">
      <header className="mb-12">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 mb-3">
          {c.eyebrow} · 18+
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-slate-900 tracking-tight">
          {c.title}
        </h1>
        <p className="mt-4 font-mono text-xs text-slate-500">{c.updated}</p>
      </header>

      <section className="prose prose-slate prose-lg max-w-none space-y-6 text-slate-700 leading-relaxed">
        <h2 className={h2}>{c.s1h}</h2>
        <p>{c.s1}</p>

        <h2 className={h2}>{c.s2h}</h2>
        <p>{c.s2a}</p>
        <p><strong>{c.s2b}</strong></p>

        <h2 className={h2}>{c.s3h}</h2>
        <p>{c.s3}</p>

        <h2 className={h2}>{c.s4h}</h2>
        <ul className="space-y-1 list-disc list-inside ml-2">
          {c.s4list.map((li) => <li key={li}>{li}</li>)}
        </ul>

        <h2 className={h2}>{c.s5h}</h2>
        <p>{c.s5}</p>
        <ul className="space-y-2 list-none">
          {c.resources.map((r) => (
            <li key={r.url} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-xs uppercase tracking-widest text-slate-500">{r.area}</span>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-accent-gold underline">
                {r.name}
              </a>
            </li>
          ))}
        </ul>
        <p className="font-mono text-xs text-slate-500 border border-slate-200/60 rounded-lg p-3">
          {c.s5b}
        </p>
      </section>
    </div>
  )
}
