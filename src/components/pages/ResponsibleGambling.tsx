import { useEffect } from 'react'
import { Icone } from '../Icone'
import { useLang } from '../../lib/i18n'

/**
 * Responsible Gambling — /responsible-gambling.
 *
 * ── POURQUOI CETTE PAGE EXISTE, ET CE QUI A CHANGÉ ───────────────────────
 * Elle a été écrite en prévision d'une affiliation bookmaker : les régies
 * d'affiliation exigent une page 18+ / jeu responsable, et l'ANJ impose son
 * message de risque là où des paris sont promus à un public français.
 *
 * **Cette affiliation n'a jamais existé.** Le 12/10/2026, toutes ses traces
 * ont été retirées du site (meta « Gambling Affiliation » dans l'en-tête,
 * bandeau 18+ du pied de page, paragraphe des conditions, section « liens
 * d'affiliation » ci-dessous). Ce qui reste ici de légitime tient en deux
 * phrases : les cotes affichées sont une information, et nous ne sommes pas
 * un bookmaker.
 *
 * ATTENTION — le reste du texte décrit encore un produit qu'on n'opère pas :
 * « ne misez que l'argent que vous pouvez perdre », « outils de limite de
 * dépôt et d'auto-exclusion », le message ANJ. Chez nous on ne dépose rien
 * et on ne retire rien : on mise des crampons gratuits. À réécrire ou à
 * retirer — décision de Mehdi en attente.
 *
 * Trilingue (EN/FR/AR) via un dictionnaire local : les paragraphes sont trop
 * longs pour la table i18n globale.
 */

const COPY = {
  en: {
    eyebrow: 'Odds & fair play',
    title: 'Odds are information — not an invitation.',
    updated: 'Last updated: October 12, 2026',
    s1h: 'What the odds on this site are',
    s1: 'Pressing 90′ is a live-scores, news and predictions site. The 1X2 odds shown next to a match come from third-party providers and are displayed for information and editorial purposes. They let you see how a result is priced — nothing more. They may be out of date, and they may differ from what any operator offers at any given moment. They are not advice, and they are not an invitation to bet anywhere.',
    s2h: 'We are not a bookmaker',
    s2a: 'We do not accept, place, broker, or pay out bets of any kind. We take no payment, we hold no money for you, and we have no commercial relationship with any betting operator. There are no affiliate links on this site.',
    s2b: 'The prediction game is free. You stake crampons — credits the site gives you — on real odds, and you win pressings. Neither can be bought, sold, cashed out, or exchanged for money or anything of value. Nothing you do here can cost you a cent.',
    s4h: 'Keeping it a game',
    s4list: [
      'A bad run costs you nothing but your place on the table. There is nothing to win back, so there is no reason to chase.',
      'The odds are set by the server and are the same for everyone — no insider edge, no hidden advantage.',
      'Your daily crampons are deliberately small. The game is built to be played a few minutes a day, not all evening.',
      'Predicting football is largely luck. A good week says less about your judgement than it feels like it does.',
      'If you notice yourself opening the app out of compulsion rather than interest, step away for a while — nothing here expires that matters.',
    ],
    s5h: 'If real-money gambling is a problem for you',
    s5: 'Nothing on this site is real-money gambling. But we show odds, and some of our readers bet elsewhere. If gambling is causing you or someone close to you harm — debt, isolation, anxiety, loss of control — help is free and confidential:',
    resources: [
      { area: 'France', name: 'Joueurs Info Service — 09 74 75 13 13 (non-premium call, 8am–2am)', url: 'https://www.joueurs-info-service.fr' },
      { area: 'International', name: 'Gambling Therapy — free online support, available in Arabic', url: 'https://www.gamblingtherapy.org' },
      { area: 'United Kingdom', name: 'BeGambleAware', url: 'https://www.begambleaware.org' },
    ],
  },
  fr: {
    eyebrow: 'Les cotes et le jeu',
    title: 'Les cotes sont une information — pas une invitation.',
    updated: 'Dernière mise à jour : 12 octobre 2026',
    s1h: 'Ce que sont les cotes affichées ici',
    s1: 'Pressing 90′ est un site de scores en direct, d’actualités et de pronostics. Les cotes 1X2 affichées à côté d’un match viennent de fournisseurs tiers et sont là à titre d’information. Elles servent à voir comment un résultat est évalué — rien de plus. Elles peuvent être périmées et différer de ce qu’un opérateur propose à un instant donné. Ce ne sont ni un conseil, ni une invitation à parier où que ce soit.',
    s2h: 'Nous ne sommes pas un bookmaker',
    s2a: 'Nous n’acceptons, ne plaçons, ne courtons et ne payons aucun pari. Nous n’encaissons rien, nous ne détenons pas d’argent pour vous, et nous n’avons aucun lien commercial avec un opérateur de paris. Il n’y a aucun lien d’affiliation sur ce site.',
    s2b: 'Le jeu de pronostics est gratuit. On mise des crampons — des crédits que le site vous donne — sur des cotes réelles, et on gagne des pressings. Ni les uns ni les autres ne peuvent être achetés, vendus, retirés ou échangés contre de l’argent ou quoi que ce soit de valeur. Rien de ce que vous faites ici ne peut vous coûter un centime.',
    s4h: 'Que ça reste un jeu',
    s4list: [
      'Une mauvaise série ne vous coûte que votre place au classement. Il n’y a rien à récupérer, donc aucune raison de se refaire.',
      'Les cotes sont imposées par le serveur et sont les mêmes pour tout le monde — aucun avantage caché.',
      'Les crampons quotidiens sont volontairement peu nombreux. Le jeu est fait pour quelques minutes par jour, pas pour une soirée entière.',
      'Pronostiquer du football relève surtout de la chance. Une bonne semaine en dit moins sur votre jugement qu’on ne le croit sur le moment.',
      'Si vous vous surprenez à ouvrir l’application par réflexe plutôt que par envie, laissez-la de côté un moment — rien ici n’expire qui vaille la peine.',
    ],
    s5h: 'Si les jeux d’argent posent problème',
    s5: 'Rien sur ce site n’est un jeu d’argent. Mais nous affichons des cotes, et certains de nos lecteurs parient ailleurs. Si les jeux d’argent vous font du mal, à vous ou à un proche — dettes, isolement, anxiété, perte de contrôle — l’aide est gratuite et confidentielle :',
    resources: [
      { area: 'France', name: 'Joueurs Info Service — 09 74 75 13 13 (appel non surtaxé, 8h–2h)', url: 'https://www.joueurs-info-service.fr' },
      { area: 'International', name: 'Gambling Therapy — soutien en ligne gratuit, disponible en arabe', url: 'https://www.gamblingtherapy.org' },
      { area: 'Royaume-Uni', name: 'BeGambleAware', url: 'https://www.begambleaware.org' },
    ],
  },
  ar: {
    eyebrow: 'الكوتات واللعب',
    title: 'الكوتات معلومة — وليست دعوة.',
    updated: 'آخر تحديث: 12 أكتوبر 2026',
    s1h: 'ما هي الكوتات المعروضة هنا',
    s1: 'بريسينغ 90 موقع للنتائج المباشرة والأخبار والتوقّعات. الكوتات 1X2 المعروضة بجانب المباراة تأتي من مزوّدين خارجيين وتُعرض للعلم فقط. وظيفتها أن تُظهر كيف تُقيَّم نتيجة ما — لا أكثر. قد تكون قديمة وقد تختلف عمّا يعرضه أي مشغّل في لحظة معيّنة. وهي ليست نصيحة ولا دعوة للمراهنة في أي مكان.',
    s2h: 'لسنا شركة مراهنات',
    s2a: 'نحن لا نقبل ولا نضع ولا نتوسّط ولا ندفع أي رهان. لا نحصّل أي مبلغ، ولا نحتفظ بأموال لك، وليست لنا أي علاقة تجارية مع أي مشغّل مراهنات. ولا توجد أي روابط إحالة على هذا الموقع.',
    s2b: 'لعبة التوقّعات مجانية. تراهن بالكرامبون — وهي أرصدة يمنحها لك الموقع — على كوتات حقيقية، وتربح البريسينغ. لا يمكن شراء أي منهما ولا بيعه ولا سحبه ولا استبداله بمال أو بأي شيء ذي قيمة. لا شيء تفعله هنا يمكن أن يكلّفك سنتًا واحدًا.',
    s4h: 'لتبقى مجرّد لعبة',
    s4list: [
      'السلسلة السيئة لا تكلّفك سوى مركزك في الترتيب. لا شيء تستعيده، إذن لا سبب للمطاردة.',
      'الكوتات يفرضها الخادم وهي نفسها للجميع — لا أفضلية خفية لأحد.',
      'الكرامبون اليومية قليلة عن قصد. اللعبة مصمَّمة لدقائق في اليوم، لا لسهرة كاملة.',
      'توقّع كرة القدم مسألة حظّ في معظمه. أسبوع جيّد يقول عن حكمك أقلّ بكثير مما يبدو وقتها.',
      'إن وجدت نفسك تفتح التطبيق بدافع العادة لا الرغبة، ابتعد عنه فترة — لا شيء هنا ينتهي ويستحقّ العناء.',
    ],
    s5h: 'إذا كانت مقامرة المال الحقيقي تسبّب لك مشكلة',
    s5: 'لا شيء في هذا الموقع مقامرة بمال حقيقي. لكننا نعرض كوتات، وبعض قرّائنا يراهنون في أماكن أخرى. إذا كانت المقامرة تؤذيك أو تؤذي شخصًا قريبًا منك — ديون، عزلة، قلق، فقدان السيطرة — فالمساعدة مجانية وسرّية:',
    resources: [
      { area: 'دوليًا', name: 'Gambling Therapy — دعم مجاني عبر الإنترنت، متوفر بالعربية', url: 'https://www.gamblingtherapy.org' },
      { area: 'فرنسا', name: 'Joueurs Info Service — 09 74 75 13 13', url: 'https://www.joueurs-info-service.fr' },
      { area: 'المملكة المتحدة', name: 'BeGambleAware', url: 'https://www.begambleaware.org' },
    ],
  },
} as const

export function ResponsibleGambling() {
  const lang = useLang((s) => s.lang)
  const c = COPY[lang]

  useEffect(() => {
    // Le titre disait « Responsible Gambling ». C'est ce que Google lit en
    // premier, et c'était faux : on n'opère aucun jeu d'argent. L'adresse
    // reste /responsible-gambling — elle est indexée, et une redirection
    // coûterait son référencement pour rien.
    document.title = 'Odds & fair play · Pressing 90’'
  }, [])

  const h2 = 'text-2xl font-display font-bold text-slate-900 mt-10 mb-3'

  return (
    <div className="container max-w-3xl mx-auto px-6 py-16">
      <header className="mb-12">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 mb-3">
          {c.eyebrow}
        </div>
        {/* Le carton rouge et jaune faisait lire cette page comme « les
            règles du football » (Mehdi, 12/10/2026). Le sifflet dit le bon
            mot : l'arbitrage, pas la sanction. */}
        <Icone nom="whistle" taille={56} className="mb-3 opacity-90" />
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
        {/* Le message de risque de l'ANJ a été retiré : il s'impose aux
            opérateurs agréés et à ceux qui promeuvent leurs paris. Nous ne
            sommes ni l'un ni l'autre, et reprendre la formule obligatoire
            d'un régulateur sans y être soumis laisse croire qu'on opère un
            jeu d'argent — précisément ce que cette page dit ne pas faire. */}
      </section>
    </div>
  )
}
