/**
 * Déclare au plan du site les JOURNÉES de résumés et de buts.
 *
 * ── POURQUOI CE SCRIPT EXISTE ─────────────────────────────────────────
 * `/resumes/2026-10-19` est la page vers laquelle pointe CHAQUE commentaire
 * qu'on pose sous un reel. Elle n'était déclarée nulle part, donc jamais
 * prérendue : elle servait le gabarit d'accueil, avec son titre et sa
 * canonique. Pour Google ce n'était pas une page, c'était un doublon de la
 * page d'accueil — mesuré le 21/10/2026 :
 *
 *   /resumes             → « Match highlights · Pressing 90 »        ✓
 *   /resumes/2026-10-19  → « Pressing 90' — Live Football Scores… »  ✗
 *
 * Chaque journée porte pourtant un contenu qui ne se répète jamais, et une
 * fois la journée passée, il ne bouge plus — le cas idéal du prérendu.
 *
 * ── CE QU'IL FAIT ─────────────────────────────────────────────────────
 * Il demande à la base quelles journées ont des vidéos, et écrit leurs
 * adresses entre deux marques dans `public/sitemap.xml`. Le prérendu lit
 * ensuite ce fichier : déclarer une journée suffit donc à la faire
 * prérendre, sans toucher à rien d'autre.
 *
 * À lancer AVANT `vite build`, comme `sitemap-clubs.mjs`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SITEMAP = join(process.cwd(), 'public', 'sitemap.xml')
const DEBUT = '  <!-- journees:debut -->'
const FIN = '  <!-- journees:fin -->'
const ORIGINE = 'https://pressing90.live'

// QUARANTE-CINQ JOURS, ET PAS PLUS. Chaque journée déclarée est une page de
// plus à prérender, et le prérendu passe déjà huit minutes sur 545 routes.
// Au-delà d'un mois et demi, une journée ne rapporte plus que de la traîne
// longue — on la laisse accessible, simplement pas annoncée.
const JOURS = 45

/** Les clés de la base, lues dans .env.local comme le fait Vite. */
function env() {
  const direct = { url: process.env.VITE_SUPABASE_URL, cle: process.env.VITE_SUPABASE_ANON_KEY }
  if (direct.url && direct.cle) return direct
  const f = join(process.cwd(), '.env.local')
  if (!existsSync(f)) return {}
  const txt = readFileSync(f, 'utf8')
  const lire = (k) => (txt.match(new RegExp(`^${k}=(.*)$`, 'm')) ?? [])[1]?.trim().replace(/^["']|["']$/g, '')
  return { url: lire('VITE_SUPABASE_URL'), cle: lire('VITE_SUPABASE_ANON_KEY') }
}

const { url, cle } = env()
if (!url || !cle) {
  // Pas de clés : on ne touche à rien. Un plan du site amputé serait pire
  // qu'un plan du site d'hier.
  console.error('[journées] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY absents — plan du site laissé intact.')
  process.exit(0)
}

const limite = new Date(Date.now() - JOURS * 86400_000).toISOString().slice(0, 10)

/**
 * LES JOURNÉES, VUES PAR LE SITE LUI-MÊME.
 *
 * Première version : une requête sur la table `videos_matchs`. Elle
 * trouvait douze journées là où le site n'en montre que quatre, et trois
 * des pages déclarées affichaient « Nothing was published on that day ».
 * La fonction `jours_de_videos` filtre ce que la table ignore — une vidéo
 * que l'ayant droit refuse de laisser embarquer n'est pas une vidéo qu'on
 * peut montrer.
 *
 * On interroge donc EXACTEMENT ce que la page interroge. C'est la règle
 * que `sitemap-clubs.mjs` énonce déjà : si les deux divergent, le plan du
 * site publie des adresses vides.
 */
async function rpc(nom, corps) {
  const r = await fetch(`${url}/rest/v1/rpc/${nom}`, {
    method: 'POST',
    headers: { apikey: cle, authorization: `Bearer ${cle}`, 'content-type': 'application/json' },
    body: JSON.stringify(corps),
  })
  if (!r.ok) throw new Error(`${nom} → HTTP ${r.status}`)
  return r.json()
}

const estResume = (k) => k === 'resume' || k === 'resume_court' || k === 'resume_long'

const urls = []
const echecs = []
let resumes = 0, buts = 0
try {
  // Les journées qui portent quelque chose, la plus récente d'abord.
  const jours = (await rpc('jours_de_videos', { p_kind: null, p_limite: 200 }))
    .map((x) => String(x.jour).slice(0, 10))
    .filter((j) => /^\d{4}-\d{2}-\d{2}$/.test(j) && j >= limite)

  for (const j of jours) {
    // Le contenu RÉEL de la page, pas une approximation : une journée qui
    // n'a que des buts ne doit pas être annoncée comme page de résumés.
    const lignes = await rpc('videos_du_jour', { p_jour: j, p_kind: null })
    const aResumes = lignes.some((x) => estResume(x.kind))
    const aButs = lignes.some((x) => x.kind === 'but')
    // `lastmod` = la journée elle-même : une journée passée ne bouge plus.
    const ligne = (base) => `  <url><loc>${ORIGINE}${base}/${j}</loc><lastmod>${j}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`
    if (aResumes) { urls.push(ligne('/resumes')); resumes++ }
    if (aButs) { urls.push(ligne('/buts')); buts++ }
  }
  console.log(`[journées] ${jours.length} journée(s) avec des vidéos · ${resumes} de résumés · ${buts} de buts`)
} catch (e) {
  echecs.push(e.message)
}

if (echecs.length) {
  console.log('[journées] ATTENTION — la base n’a pas répondu :')
  for (const e of echecs) console.log(`  - ${e}`)
}
if (!urls.length) {
  console.error('[journées] aucune journée récupérée — le plan du site est laissé intact.')
  process.exit(0)
}

const xml = readFileSync(SITEMAP, 'utf8')
const bloc = `${DEBUT}\n${urls.join('\n')}\n${FIN}`
const sortie = xml.includes(DEBUT)
  ? xml.replace(new RegExp(`${DEBUT}[\\s\\S]*?${FIN}`), bloc)
  : xml.replace('</urlset>', `${bloc}\n</urlset>`)
writeFileSync(SITEMAP, sortie, 'utf8')
console.log(`[journées] ${urls.length} adresses écrites au plan du site.`)
