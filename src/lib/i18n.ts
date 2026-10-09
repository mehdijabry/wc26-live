import { create } from 'zustand'

/**
 * Site-wide EN/AR language switch — "Match Night" bilingual layer.
 *
 * Small by design: a dictionary keyed by the ENGLISH string (so the
 * source code stays readable), a `useT()` hook for components, and a
 * league-name map (established Arabic media forms, beIN/Kooora register).
 * Team names stay in Latin script in v1 — mixed-script boards are the
 * norm on Arabic live-score sites.
 *
 * Switching flips <html lang/dir> so the whole layout mirrors (flex/grid
 * handle RTL automatically) and Tajawal takes over via index.css.
 */

export type Lang = 'en' | 'ar' | 'fr'
const LS_KEY = 'p90.lang'

function readInitial(): Lang {
  try {
    // 1. explicit ?lang= link (e.g. the Arabic Facebook post) wins
    const q = new URLSearchParams(window.location.search).get('lang')
    if (q === 'ar' || q === 'en' || q === 'fr') return q
    // 2. the visitor's own previous choice
    const s = localStorage.getItem(LS_KEY)
    if (s === 'ar' || s === 'en' || s === 'fr') return s
    // 3. auto-detect from the browser: first Arabic or French preference
    //    wins (in the visitor's own priority order), else English.
    const prefs = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const l of prefs) {
      const low = (l ?? '').toLowerCase()
      if (low.startsWith('ar')) return 'ar'
      if (low.startsWith('fr')) return 'fr'
    }
  } catch { /* SSR */ }
  return 'en'
}

function applyLang(l: Lang) {
  try {
    document.documentElement.lang = l
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'
    localStorage.setItem(LS_KEY, l)
  } catch { /* SSR */ }
}

export const useLang = create<{ lang: Lang; setLang: (l: Lang) => void }>((set) => ({
  lang: typeof window !== 'undefined' ? readInitial() : 'en',
  setLang(l) { applyLang(l); set({ lang: l }) },
}))

if (typeof window !== 'undefined') applyLang(useLang.getState().lang)

/** Date/number locale — Arabic with WESTERN digits (user rule: scores
 *  and times keep 0-9), Morocco/Maghreb convention. */
export function localeOf(l: Lang): string {
  if (l === 'ar') return 'ar-u-nu-latn'
  if (l === 'fr') return 'fr'
  // Et surtout PAS `undefined`. Rendre undefined laissait `toLocaleString`
  // et `toLocaleDateString` retomber sur la langue de la MACHINE : sur un
  // Mac réglé en français, la page anglaise affichait « 7 500 » au lieu de
  // « 7,500 », y compris dans le HTML prérendu que lit Google. Le site est
  // en anglais : ses nombres et ses dates le sont aussi, quel que soit
  // l'appareil.
  return 'en-US'
}

// ─── UI strings (keyed by the English source string) ─────────────────
const AR: Record<string, string> = {
  // Nav / shell
  'Home': 'الرئيسية',
  'Matches': 'المباريات',
  'News': 'الأخبار',
  'WC26 Archive': 'أرشيف المونديال',
  'Sign in': 'دخول',
  'Sign out': 'خروج',
  'live football scores': 'نتائج مباشرة',
  'Open menu': 'افتح القائمة',
  'Close menu': 'أغلق القائمة',
  // Hero / scoreboard
  'LIVE': 'مباشر',
  'FT': 'انتهت',
  'HT': 'الاستراحة',
  'KICK-OFF': 'الانطلاق',
  "Today's matches ↓": '⚽ مباريات اليوم ↓',
  'Articles ↓': '📰 المقالات ↓',
  'WC26 archive →': '🏆 أرشيف المونديال ←',
  'Previous featured match': 'المباراة السابقة',
  'Next featured match': 'المباراة التالية',
  // Daily board
  'football today': 'كرة اليوم',
  'Every match, everywhere': 'كل المباريات، في مكان واحد',
  'Today': 'اليوم',
  'Scheduled': 'لم تبدأ',
  'Live': 'مباشر',
  'View stats →': '← الإحصاءات',
  'All': 'الكل',
  'Filter': 'تصفية',
  'matches': 'مباراة',
  'match': 'مباراة',
  'Previous day': 'اليوم السابق',
  'Next day': 'اليوم التالي',
  '· today ↺': '· اليوم ↺',
  'live': 'مباشر',
  'pre-match': 'قبل المباراة',
  "Loading the day's matches…": '…جارٍ تحميل مباريات اليوم',
  'No matches on': 'لا مباريات يوم',
  'Use ← Previous or Next → to pick another day.': 'استخدم الأسهم لاختيار يوم آخر.',
  // News
  'newsroom': 'غرفة الأخبار',
  'Pressing 90′ · the briefing': 'Pressing 90′ · الموجز اليومي',
  'Football News': 'أخبار كرة القدم',
  'Quick takes on the football stories that actually matter, with original commentary and links to the full source.': 'قراءات سريعة لأهم قصص كرة القدم، بتعليق أصلي وروابط إلى المصدر الكامل.',
  'Latest articles': 'آخر المقالات',
  'All articles →': '← كل المقالات',
  'Back to news': 'العودة إلى الأخبار',
  'Read original': 'المقال الأصلي',
  'Today·news': 'اليوم',
  // Footer
  'About': 'من نحن',
  'Contact': 'اتصل بنا',
  'Privacy': 'الخصوصية',
  'Terms': 'الشروط',
  'Not affiliated with FIFA or any league. Data source: ESPN public API.': 'غير تابع للفيفا أو لأي دوري. مصدر البيانات: واجهة ESPN العامة.',
  'Built by': 'من تطوير',
  '⚽ Live scores · news': '⚽ نتائج مباشرة · أخبار',
  'Gambling involves risks: debt, isolation, addiction.': 'المراهنات تنطوي على مخاطر: الديون، العزلة، الإدمان.',
  'Play responsibly': 'العب بمسؤولية',
  'Responsible Gambling': 'اللعب المسؤول',
  'World Cup 2026 archive': 'أرشيف كأس العالم 2026',
  'Football': 'كرة القدم',
  // ── لعبة التوقعات ──────────────────────────────────────────────────
  // أسماء العملتين — crampons و pressings — تبقى كما هي: أسماء خاصة باللعبة.
  'Predictions': 'التوقعات',
  'Pick a side, set your stake, the odds do the rest.': 'اختر فريقك، حدّد رهانك، والمعامل يفعل الباقي.',
  'How it works': 'كيف تعمل',
  'You get {d} {jeton} a day, claimed by signing in — unclaimed, they are lost. Stake at least {min} of them on a result, at the real match odds: the clearer the favourite, the less it pays. Winnings are {point}, and {palier} {point} unlock {prix}. Nothing to deposit, no bookmaker. Every match we have a price for is playable — leagues, cups and national teams, the biggest competitions first.':
    'تحصل على {d} {jeton} يوميًا، تطالب بها عند تسجيل الدخول — وإن لم تطالب بها تضيع. راهن بـ {min} على الأقل على نتيجة، بالمعامل الحقيقي للمباراة: كلما كان المرشح أوضح قلّ المردود. أرباحك {point}، و{palier} {point} تفتح {prix}. لا إيداع ولا مراهنات. كل مباراة لدينا معامل لها قابلة للعب — دوريات وكؤوس ومنتخبات، وأكبر المسابقات أولًا.',
  '+{d} free': '+{d} مجانًا',
  'claimed': 'تم الاستلام',
  'to get {d} free {jeton} every day.': 'لتحصل على {d} {jeton} مجانًا كل يوم.',
  'Tomorrow': 'غدًا',
  'Loading…': 'جارٍ التحميل…',
  'Fixtures are not responding. Try again in a moment.': 'المباريات لا تستجيب. أعد المحاولة بعد قليل.',
  'Nothing to back that day — no odds published. Try another day: the weekend has the most.':
    'لا شيء للمراهنة عليه في ذلك اليوم — لا معاملات منشورة. جرّب يومًا آخر: عطلة الأسبوع هي الأكثر.',
  'vs': 'ضد',
  'lost': 'خسر',
  '{n} staked · {g} to win': '{n} مراهَن · {g} محتمل',
  'Your pick': 'اختيارك',
  'all': 'الكل',
  'Stake {n} · win {g}': 'راهن بـ {n} · اربح {g}',
  'You need {n} {jeton}': 'تحتاج {n} {jeton}',
  'Bet placed': 'تم تسجيل الرهان',
  'Could not claim right now.': 'تعذّر الاستلام الآن.',
  'Already claimed today — come back tomorrow.': 'تم الاستلام اليوم — عُد غدًا.',
  '+{d} {jeton} · balance {n}': '+{d} {jeton} · الرصيد {n}',
  'Settle it with your mates in a': 'احسم الأمر مع أصحابك في',
  'private league': 'دوري خاص',
  'or see where you stand on': 'أو اطّلع على ترتيبك في',
  'the table': 'الترتيب',
  'The World Cup 2026 bracket is kept on the': 'جدول كأس العالم 2026 محفوظ في',
  'bracket page': 'صفحة الجدول',
  'Close': 'إغلاق',
  // ── الدوريات الخاصة ───────────────────────────────────────────────
  'Private leagues': 'دوريات خاصة',
  'Create a league, send one link, and settle the argument once and for all — who actually knows their football? Everyone starts level: points only count from the day each member joins.':
    'أنشئ دوريًا، أرسل رابطًا واحدًا، واحسم النقاش نهائيًا — من يفهم في كرة القدم حقًا؟ الجميع يبدأ من الصفر: النقاط تُحتسب من يوم انضمام كل عضو.',
  'League name': 'اسم الدوري',
  'Create': 'إنشاء',
  'Sign in and create': 'سجّل الدخول وأنشئ',
  'Your leagues': 'دورياتك',
  'You are not in any league yet. Create one above, or open an invite link a friend sent you.':
    'لست في أي دوري بعد. أنشئ واحدًا أعلاه، أو افتح رابط دعوة أرسله لك صديق.',
  'The league could not be created. Try again in a moment.': 'تعذّر إنشاء الدوري. أعد المحاولة بعد قليل.',
  'Points come from your bets on the': 'النقاط تأتي من رهاناتك في',
  'predictions page': 'صفحة التوقعات',
  'and the global table lives on': 'والترتيب العام في',
  'the leaderboard': 'لوحة الترتيب',
  'League not found': 'الدوري غير موجود',
  'That invite link is wrong, or the league was deleted.': 'رابط الدعوة خاطئ، أو أن الدوري حُذف.',
  'member': 'عضو',
  'members': 'أعضاء',
  'points counted from the day each member joined, so everyone starts level.':
    'نقاط محتسبة من يوم انضمام كل عضو، فيبدأ الجميع من الصفر.',
  'Join this league': 'انضم إلى هذا الدوري',
  'Sign in and join': 'سجّل الدخول وانضم',
  'Link copied': 'تم نسخ الرابط',
  'Copy invite link': 'نسخ رابط الدعوة',
  'Leave': 'مغادرة',
  'Nobody has joined yet. Share the link above — anyone who opens it can see the league before signing up.':
    'لم ينضم أحد بعد. شارك الرابط أعلاه — من يفتحه يرى الدوري قبل التسجيل.',
  'Player': 'اللاعب',
  'Settled': 'محسومة',
  'anonymous': 'مجهول',
  'Points': 'النقاط',
  // ── الجداول المنشورة (أرشيف كأس العالم) ───────────────────────────
  'Published brackets': 'الجداول المنشورة',
  'Who called the 2026 World Cup, and how it actually went. Open one to read the full bracket.':
    'من توقّع كأس العالم 2026 بدقة، وكيف جرت الأمور فعلًا. افتح واحدًا لقراءة الجدول كاملًا.',
  'you': 'أنت',
  'Their champion': 'بطله',
  '3rd': 'الثالث',
  'Predict': 'توقّع',
  'Table': 'الترتيب',
  'Clubs': 'الأندية',
}

// ─── Competition names (established Arabic media forms) ──────────────
const AR_LEAGUES: Record<string, string> = {
  'FIFA World Cup': 'كأس العالم',
  'UEFA Euro': 'كأس أمم أوروبا',
  'Copa América': 'كوبا أمريكا',
  'Africa Cup of Nations': 'كأس الأمم الأفريقية',
  'AFC Asian Cup': 'كأس آسيا',
  'Concacaf Gold Cup': 'الكأس الذهبية',
  "Men's Olympic Tournament": 'أولمبياد الرجال',
  'World Cup Qualifiers · UEFA': 'تصفيات المونديال · أوروبا',
  'World Cup Qualifiers · CONMEBOL': 'تصفيات المونديال · أمريكا الجنوبية',
  'World Cup Qualifiers · Concacaf': 'تصفيات المونديال · كونكاكاف',
  'World Cup Qualifiers · AFC': 'تصفيات المونديال · آسيا',
  'World Cup Qualifiers · CAF': 'تصفيات المونديال · أفريقيا',
  'World Cup Qualifiers · OFC': 'تصفيات المونديال · أوقيانوسيا',
  'World Cup Qualifiers · Playoffs': 'ملحق تصفيات المونديال',
  'UEFA Nations League': 'دوري الأمم الأوروبية',
  'Euro Qualifiers': 'تصفيات اليورو',
  'AFCON Qualifiers': 'تصفيات كأس أفريقيا',
  'Asian Cup Qualifiers': 'تصفيات كأس آسيا',
  'Gold Cup Qualifiers': 'تصفيات الكأس الذهبية',
  'Concacaf Nations League': 'دوري أمم الكونكاكاف',
  'Finalissima': 'فيناليسيما',
  'Arabian Gulf Cup': 'كأس الخليج العربي',
  'African Nations Championship': 'بطولة أفريقيا للمحليين (الشان)',
  'ASEAN Championship': 'بطولة آسيان',
  'SAFF Championship': 'بطولة جنوب آسيا',
  'COSAFA Cup': 'كأس كوسافا',
  'FIFA Club World Cup': 'كأس العالم للأندية',
  'FIFA Intercontinental Cup': 'كأس الإنتركونتيننتال',
  'Champions League': 'دوري أبطال أوروبا',
  'Champions League Qualifying': 'تصفيات دوري أبطال أوروبا',
  'UEFA Super Cup': 'كأس السوبر الأوروبي',
  'Europa League': 'الدوري الأوروبي',
  'Europa League Qualifying': 'تصفيات الدوري الأوروبي',
  'Copa Libertadores': 'كأس ليبرتادوريس',
  'Conference League': 'دوري المؤتمر الأوروبي',
  'Conference League Qualifying': 'تصفيات دوري المؤتمر',
  'Copa Sudamericana': 'كأس سود أمريكانا',
  'CAF Champions League': 'دوري أبطال أفريقيا',
  'AFC Champions League Elite': 'دوري أبطال آسيا للنخبة',
  'AFC Champions League Two': 'دوري أبطال آسيا 2',
  'Concacaf Champions Cup': 'كأس أبطال الكونكاكاف',
  'CAF Confederation Cup': 'كأس الكونفدرالية الأفريقية',
  'CONMEBOL Recopa': 'الريكوبا',
  'Premier League': 'الدوري الإنجليزي الممتاز',
  'LaLiga': 'الدوري الإسباني',
  'Serie A': 'الدوري الإيطالي',
  'Bundesliga': 'الدوري الألماني',
  'Ligue 1': 'الدوري الفرنسي',
  'FA Cup': 'كأس الاتحاد الإنجليزي',
  'Copa del Rey': 'كأس ملك إسبانيا',
  'Coppa Italia': 'كأس إيطاليا',
  'DFB-Pokal': 'كأس ألمانيا',
  'Coupe de France': 'كأس فرنسا',
  'Carabao Cup': 'كأس الرابطة الإنجليزية',
  'Community Shield': 'الدرع الخيرية',
  'Supercopa de España': 'كأس السوبر الإسباني',
  'Supercoppa Italiana': 'كأس السوبر الإيطالي',
  'DFL-Supercup': 'كأس السوبر الألماني',
  'Trophée des Champions': 'كأس الأبطال الفرنسي',
  'International Friendlies': 'مباريات ودية دولية',
  'Non-FIFA Friendlies': 'وديات خارج الفيفا',
  'Eredivisie': 'الدوري الهولندي',
  'Primeira Liga': 'الدوري البرتغالي',
  'Belgian Pro League': 'الدوري البلجيكي',
  'Süper Lig': 'الدوري التركي',
  'Scottish Premiership': 'الدوري الاسكتلندي',
  'Brasileirão': 'الدوري البرازيلي',
  'Liga Profesional Argentina': 'الدوري الأرجنتيني',
  'MLS': 'الدوري الأمريكي',
  'Liga MX': 'الدوري المكسيكي',
  'Saudi Pro League': 'دوري روشن السعودي',
  'EFL Championship': 'دوري البطولة الإنجليزية (تشامبيونشيب)',
  'LaLiga 2': 'الدوري الإسباني الدرجة الثانية',
  '2. Bundesliga': 'الدوري الألماني الدرجة الثانية',
  'Serie B': 'الدوري الإيطالي الدرجة الثانية',
  'Ligue 2': 'الدوري الفرنسي الدرجة الثانية',
  'Austrian Bundesliga': 'الدوري النمساوي',
  'Greek Super League': 'الدوري اليوناني',
  'Russian Premier League': 'الدوري الروسي',
  'Danish Superliga': 'الدوري الدنماركي',
  'Allsvenskan': 'الدوري السويدي',
  'Eliteserien': 'الدوري النرويجي',
  'J.League': 'الدوري الياباني',
  'Chinese Super League': 'الدوري الصيني',
  'A-League': 'الدوري الأسترالي',
  'South African Premiership': 'الدوري الجنوب أفريقي',
  "Saudi King's Cup": 'كأس الملك السعودي',
  'Copa do Brasil': 'كأس البرازيل',
  'Copa Argentina': 'كأس الأرجنتين',
  'U.S. Open Cup': 'كأس أمريكا المفتوحة',
  'Leagues Cup': 'كأس الدوريات',
  'Club Friendlies': 'وديات الأندية',
  'Club friendlies': 'وديات الأندية',
  "Women's World Cup": 'كأس العالم للسيدات',
  "Women's Champions League": 'دوري أبطال أوروبا للسيدات',
  "Women's Africa Cup of Nations": 'كأس أفريقيا للسيدات',
  'NWSL': 'الدوري الأمريكي للسيدات',
}

// ─── French UI strings (same keys as AR) ─────────────────────────────
const FR: Record<string, string> = {
  // Nav / shell
  'Home': 'Accueil',
  'Matches': 'Matchs',
  'News': 'Actus',
  'WC26 Archive': 'Archive CM26',
  'Sign in': 'Connexion',
  'Sign out': 'Déconnexion',
  'live football scores': 'scores foot en direct',
  'Open menu': 'Ouvrir le menu',
  'Close menu': 'Fermer le menu',
  // Hero / scoreboard
  'LIVE': 'LIVE',
  'FT': 'FT',
  'HT': 'MT',
  'KICK-OFF': 'COUP D’ENVOI',
  "Today's matches ↓": '⚽ Matchs du jour ↓',
  'Articles ↓': '📰 Articles ↓',
  'WC26 archive →': '🏆 Archive CM26 →',
  'Previous featured match': 'Match précédent',
  'Next featured match': 'Match suivant',
  // Daily board
  'football today': 'le foot aujourd’hui',
  'Every match, everywhere': 'Tous les matchs, au même endroit',
  'Today': 'Aujourd’hui',
  'Scheduled': 'À venir',
  'Live': 'En direct',
  'View stats →': 'Statistiques →',
  'All': 'Tout',
  'Filter': 'Filtrer',
  'matches': 'matchs',
  'match': 'match',
  'Previous day': 'Jour précédent',
  'Next day': 'Jour suivant',
  '· today ↺': '· aujourd’hui ↺',
  'live': 'direct',
  'pre-match': 'avant-match',
  "Loading the day's matches…": 'Chargement des matchs du jour…',
  'No matches on': 'Aucun match le',
  'Use ← Previous or Next → to pick another day.': 'Utilisez les flèches pour choisir un autre jour.',
  // News
  'newsroom': 'rédaction',
  'Pressing 90′ · the briefing': 'Pressing 90′ · le brief',
  'Football News': 'Actualités football',
  'Quick takes on the football stories that actually matter, with original commentary and links to the full source.': 'Des lectures rapides des histoires qui comptent vraiment dans le foot, avec un commentaire original et le lien vers la source.',
  'Latest articles': 'Derniers articles',
  'All articles →': 'Tous les articles →',
  'Back to news': 'Retour aux actus',
  'Read original': 'Article original',
  'Today·news': 'Aujourd’hui',
  // Footer
  'About': 'À propos',
  'Contact': 'Contact',
  'Privacy': 'Confidentialité',
  'Terms': 'Conditions',
  'Not affiliated with FIFA or any league. Data source: ESPN public API.': 'Sans affiliation avec la FIFA ni aucune ligue. Source des données : API publique ESPN.',
  'Built by': 'Créé par',
  '⚽ Live scores · news': '⚽ Scores en direct · actus',
  'World Cup 2026 archive': 'Archive Coupe du monde 2026',
  'Football': 'Football',
  'Gambling involves risks: debt, isolation, addiction.': 'Les jeux d’argent comportent des risques : endettement, isolement, dépendance. Appelez le 09 74 75 13 13 (appel non surtaxé).',
  'Play responsibly': 'Jouez responsable',
  'Responsible Gambling': 'Jeu responsable',
  // ── Jeu de pronostics (page /predictions, /leagues, /l/:slug) ──────
  // Les noms des monnaies — crampons, pressings — ne se traduisent pas :
  // ce sont les noms propres du jeu, comme « Gambz » chez Gamby.
  'Predictions': 'Pronostics',
  'Pick a side, set your stake, the odds do the rest.': 'Choisis un camp, décide ta mise, la cote fait le reste.',
  'How it works': 'Comment ça marche',
  'You get {d} {jeton} a day, claimed by signing in — unclaimed, they are lost. Stake at least {min} of them on a result, at the real match odds: the clearer the favourite, the less it pays. Winnings are {point}, and {palier} {point} unlock {prix}. Nothing to deposit, no bookmaker. Every match we have a price for is playable — leagues, cups and national teams, the biggest competitions first.':
    'Tu reçois {d} {jeton} par jour, à réclamer en te connectant — non réclamés, ils sont perdus. Tu en mises au moins {min} sur un résultat, à la cote réelle du match : plus le favori est net, moins ça rapporte. Tes gains sont des {point}, et {palier} {point} débloquent {prix}. Rien à déposer, aucun bookmaker. Tous les matchs pour lesquels une cote existe sont jouables — championnats, coupes et sélections, les plus grandes compétitions en tête.',
  '+{d} free': '+{d} gratuits',
  'claimed': 'réclamés',
  'to get {d} free {jeton} every day.': 'pour recevoir {d} {jeton} gratuits chaque jour.',
  'Tomorrow': 'Demain',
  'Loading…': 'Chargement…',
  'Fixtures are not responding. Try again in a moment.': 'Les matchs ne répondent pas. Réessaie dans un instant.',
  'Nothing to back that day — no odds published. Try another day: the weekend has the most.':
    'Rien à parier ce jour-là — aucune cote publiée. Essaie un autre jour : le week-end en concentre le plus.',
  'vs': 'vs',
  'lost': 'perdu',
  '{n} staked · {g} to win': '{n} engagés · {g} possible',
  'Your pick': 'Ton choix',
  'all': 'tout',
  'Stake {n} · win {g}': 'Miser {n} · gagner {g}',
  'You need {n} {jeton}': 'Il te faut {n} {jeton}',
  'Bet placed': 'Pari enregistré',
  'Could not claim right now.': 'Impossible de réclamer pour le moment.',
  'Already claimed today — come back tomorrow.': 'Déjà réclamés aujourd’hui — reviens demain.',
  '+{d} {jeton} · balance {n}': '+{d} {jeton} · solde {n}',
  'Settle it with your mates in a': 'Règle le débat avec tes potes dans une',
  'private league': 'ligue privée',
  'or see where you stand on': 'ou vois où tu en es au',
  'the table': 'classement',
  'The World Cup 2026 bracket is kept on the': 'Le tableau du Mondial 2026 reste consultable sur la',
  'bracket page': 'page bracket',
  'Close': 'Fermer',
  // ── Ligues privées ────────────────────────────────────────────────
  'Private leagues': 'Ligues privées',
  'Create a league, send one link, and settle the argument once and for all — who actually knows their football? Everyone starts level: points only count from the day each member joins.':
    'Crée une ligue, envoie un lien, et tranche le débat une bonne fois pour toutes — qui s’y connaît vraiment en foot ? Tout le monde part à égalité : les points ne comptent qu’à partir du jour où chacun rejoint.',
  'League name': 'Nom de la ligue',
  'Create': 'Créer',
  'Sign in and create': 'Se connecter et créer',
  'Your leagues': 'Tes ligues',
  'You are not in any league yet. Create one above, or open an invite link a friend sent you.':
    'Tu n’es dans aucune ligue. Crée-en une ci-dessus, ou ouvre le lien d’invitation d’un ami.',
  'The league could not be created. Try again in a moment.': 'La ligue n’a pas pu être créée. Réessaie dans un instant.',
  'Points come from your bets on the': 'Les points viennent de tes paris sur la',
  'predictions page': 'page pronostics',
  'and the global table lives on': 'et le classement général se trouve sur',
  'the leaderboard': 'le classement',
  'League not found': 'Ligue introuvable',
  'That invite link is wrong, or the league was deleted.': 'Ce lien d’invitation est erroné, ou la ligue a été supprimée.',
  'member': 'membre',
  'members': 'membres',
  'points counted from the day each member joined, so everyone starts level.':
    'points comptés à partir du jour où chacun a rejoint, donc tout le monde part à égalité.',
  'Join this league': 'Rejoindre cette ligue',
  'Sign in and join': 'Se connecter et rejoindre',
  'Link copied': 'Lien copié',
  'Copy invite link': 'Copier le lien d’invitation',
  'Leave': 'Quitter',
  'Nobody has joined yet. Share the link above — anyone who opens it can see the league before signing up.':
    'Personne n’a encore rejoint. Partage le lien ci-dessus — qui l’ouvre voit la ligue avant même de s’inscrire.',
  'Player': 'Joueur',
  'Settled': 'Réglés',
  'anonymous': 'anonyme',
  'Points': 'Points',
  // ── Brackets publiés (archive Mondial, sur /bracket) ──────────────
  'Published brackets': 'Brackets publiés',
  'Who called the 2026 World Cup, and how it actually went. Open one to read the full bracket.':
    'Qui avait vu juste pour le Mondial 2026, et ce qui s’est réellement passé. Ouvre-en un pour lire le tableau complet.',
  'you': 'toi',
  'Their champion': 'Son champion',
  '3rd': '3e',
  // Entrées de navigation ajoutées avec les clubs et le jeu.
  'Predict': 'Pronos',
  'Table': 'Classement',
  'Clubs': 'Clubs',
}

// ─── French competition names (only where French usage differs) ──────
const FR_LEAGUES: Record<string, string> = {
  'FIFA World Cup': 'Coupe du monde',
  'UEFA Euro': 'Euro',
  'Africa Cup of Nations': 'Coupe d’Afrique des nations',
  'AFC Asian Cup': 'Coupe d’Asie',
  "Men's Olympic Tournament": 'Tournoi olympique',
  'World Cup Qualifiers · UEFA': 'Qualifs Mondial · Europe',
  'World Cup Qualifiers · CONMEBOL': 'Qualifs Mondial · Amérique du Sud',
  'World Cup Qualifiers · Concacaf': 'Qualifs Mondial · Concacaf',
  'World Cup Qualifiers · AFC': 'Qualifs Mondial · Asie',
  'World Cup Qualifiers · CAF': 'Qualifs Mondial · Afrique',
  'World Cup Qualifiers · OFC': 'Qualifs Mondial · Océanie',
  'World Cup Qualifiers · Playoffs': 'Barrages du Mondial',
  'UEFA Nations League': 'Ligue des nations',
  'Euro Qualifiers': 'Qualifs Euro',
  'AFCON Qualifiers': 'Qualifs CAN',
  'Asian Cup Qualifiers': 'Qualifs Coupe d’Asie',
  'Gold Cup Qualifiers': 'Qualifs Gold Cup',
  'Concacaf Nations League': 'Ligue des nations Concacaf',
  'Arabian Gulf Cup': 'Coupe du Golfe',
  'African Nations Championship': 'CHAN',
  'FIFA Club World Cup': 'Coupe du monde des clubs',
  'FIFA Intercontinental Cup': 'Coupe intercontinentale',
  'Champions League': 'Ligue des champions',
  'Champions League Qualifying': 'Qualifs Ligue des champions',
  'UEFA Super Cup': 'Supercoupe de l’UEFA',
  'Europa League': 'Ligue Europa',
  'Europa League Qualifying': 'Qualifs Ligue Europa',
  'Conference League': 'Ligue Conférence',
  'Conference League Qualifying': 'Qualifs Ligue Conférence',
  'CAF Champions League': 'Ligue des champions CAF',
  'AFC Champions League Elite': 'Ligue des champions asiatique',
  'AFC Champions League Two': 'Ligue des champions asiatique 2',
  'Concacaf Champions Cup': 'Coupe des champions Concacaf',
  'CAF Confederation Cup': 'Coupe de la confédération CAF',
  'Copa del Rey': 'Coupe du Roi',
  'Coppa Italia': 'Coupe d’Italie',
  'DFB-Pokal': 'Coupe d’Allemagne',
  'Supercopa de España': 'Supercoupe d’Espagne',
  'Supercoppa Italiana': 'Supercoupe d’Italie',
  'DFL-Supercup': 'Supercoupe d’Allemagne',
  'International Friendlies': 'Amicaux internationaux',
  'Non-FIFA Friendlies': 'Amicaux hors FIFA',
  'Belgian Pro League': 'Pro League belge',
  'Scottish Premiership': 'Championnat écossais',
  'Liga Profesional Argentina': 'Championnat argentin',
  'Russian Premier League': 'Championnat russe',
  'Greek Super League': 'Championnat grec',
  'Austrian Bundesliga': 'Championnat autrichien',
  'Danish Superliga': 'Championnat danois',
  'Eliteserien': 'Championnat norvégien',
  'Chinese Super League': 'Championnat chinois',
  'South African Premiership': 'Championnat sud-africain',
  "Saudi King's Cup": 'Coupe du Roi saoudienne',
  'Copa do Brasil': 'Coupe du Brésil',
  'Copa Argentina': 'Coupe d’Argentine',
  'Club Friendlies': 'Amicaux de clubs',
  'Club friendlies': 'Amicaux de clubs',
  "Women's World Cup": 'Coupe du monde féminine',
  "Women's Champions League": 'Ligue des champions féminine',
  "Women's Africa Cup of Nations": 'CAN féminine',
}

/** Translate a UI string (returns the source string when EN or unknown). */
export function useT(): (s: string) => string {
  const lang = useLang((s) => s.lang)
  return (s: string) => {
    if (lang === 'ar') return AR[s] ?? s
    if (lang === 'fr') return FR[s] ?? s
    return s
  }
}

/** Translate a competition label (falls back to the English label). */
export function trLeague(label: string, lang: Lang): string {
  if (lang === 'ar') return AR_LEAGUES[label] ?? label
  if (lang === 'fr') return FR_LEAGUES[label] ?? label
  return label
}
