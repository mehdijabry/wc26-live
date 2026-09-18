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
export function localeOf(l: Lang): string | undefined {
  if (l === 'ar') return 'ar-u-nu-latn'
  if (l === 'fr') return 'fr'
  return undefined
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
