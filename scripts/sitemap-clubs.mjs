/**
 * Génère les routes « clubs » du plan du site en interrogeant l'API.
 *
 * C'est la pièce qui rend l'ensemble réellement piloté par l'API : aucune
 * liste de clubs n'existe dans le dépôt. Ce script demande à ESPN les clubs
 * de chaque championnat sélectionné dans `src/lib/clubs.ts`, en déduit les
 * adresses, et les écrit entre deux marques dans `public/sitemap.xml`. Le
 * prérendu lit ensuite ce fichier — donc un club promu apparaît sur le site
 * au déploiement suivant, sans qu'une ligne soit écrite.
 *
 * À lancer AVANT `vite build`, ce que fait `npm run build:prerender`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// MÊME source que `clubsDuChampionnat` dans src/lib/clubs.ts : le classement.
// Si les deux divergent, le plan du site publie des adresses vides.
const ESPN = 'https://site.web.api.espn.com/apis/v2/sports/soccer'
const SITEMAP = join(process.cwd(), 'public', 'sitemap.xml')
const DEBUT = '  <!-- clubs:debut -->'
const FIN = '  <!-- clubs:fin -->'
const ORIGINE = 'https://pressing90.live'

/** Lit la sélection de championnats dans la source, pour n'avoir qu'un seul endroit à tenir. */
function championnats() {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'clubs.ts'), 'utf8')
  // Ancré en début de ligne, sinon une entrée MISE EN COMMENTAIRE est lue
  // comme active — la Botola commentée faisait réapparaître 18 championnats
  // au lieu de 17, et le plan du site aurait publié des adresses vides.
  return [...src.matchAll(/^\s*\{\s*espn:\s*'([^']+)',\s*slug:\s*'([^']+)'/gm)].map((m) => ({
    espn: m[1],
    slug: m[2],
  }))
}

/** Même règle que `slugDuClub` côté application — les deux doivent produire la même chaîne. */
function slugDuClub(nom) {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// L'adresse du worker est lue dans src/lib/api.ts, pas recopiée : deux
// copies finiraient par diverger le jour d'un changement de domaine.
function adresseDuWorker() {
  const src = readFileSync('src/lib/api.ts', 'utf8')
  const m = src.match(/VITE_API_BASE \?\? '([^']+)'/)
  if (!m) throw new Error("adresse du worker introuvable dans src/lib/api.ts")
  return m[1]
}

async function clubs(espnSlug) {
  // La Botola passe par le worker : api-sports exige une clé, qui ne sort pas
  // de là. Même source que `clubsDuChampionnat` côté site.
  if (espnSlug === 'botola') {
    const r = await fetch(`${adresseDuWorker()}/botola/teams`)
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    const d = await r.json()
    if (d.error) throw new Error(d.error)
    return (d.clubs ?? []).map((c) => c.nom).filter(Boolean)
  }

  const r = await fetch(`${ESPN}/${espnSlug}/standings`)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  const d = await r.json()
  const vus = new Map()
  const descendre = (n) => {
    for (const e of n?.standings?.entries ?? []) {
      const t = e?.team
      if (t?.id && !vus.has(t.id)) vus.set(t.id, { team: t })
    }
    for (const enfant of n?.children ?? []) descendre(enfant)
  }
  descendre(d)
  const liste = [...vus.values()]
  return liste
    .map((x) => x.team?.displayName || x.team?.shortDisplayName)
    .filter(Boolean)
    .map(slugDuClub)
}

const aujourdhui = new Date().toISOString().slice(0, 10)
const urls = [`  <url><loc>${ORIGINE}/clubs</loc><lastmod>${aujourdhui}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`]

let total = 0
const echecs = []
for (const ch of championnats()) {
  try {
    const liste = await clubs(ch.espn)
    if (!liste.length) throw new Error('aucun club renvoyé')
    urls.push(
      `  <url><loc>${ORIGINE}/clubs/${ch.slug}</loc><lastmod>${aujourdhui}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
    )
    for (const c of liste) {
      urls.push(
        `  <url><loc>${ORIGINE}/club/${ch.slug}/${c}</loc><lastmod>${aujourdhui}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`,
      )
    }
    total += liste.length
    console.log(`[clubs] ${ch.slug.padEnd(26)} ${String(liste.length).padStart(3)} clubs`)
  } catch (e) {
    echecs.push(`${ch.slug} (${ch.espn}) : ${e.message}`)
  }
}

if (echecs.length) {
  console.log('[clubs] ATTENTION — championnats injoignables, absents du plan du site :')
  for (const e of echecs) console.log(`  - ${e}`)
}
// Un échec total voudrait dire qu'ESPN est tombé : mieux vaut garder le plan
// précédent que de publier un sitemap amputé de toutes ses pages clubs.
if (!total) {
  console.error('[clubs] aucun club récupéré — le plan du site est laissé intact.')
  process.exit(0)
}

const xml = readFileSync(SITEMAP, 'utf8')
const bloc = `${DEBUT}\n${urls.join('\n')}\n${FIN}`
const sortie = xml.includes(DEBUT)
  ? xml.replace(new RegExp(`${DEBUT}[\\s\\S]*?${FIN}`), bloc)
  : xml.replace('</urlset>', `${bloc}\n</urlset>`)
writeFileSync(SITEMAP, sortie, 'utf8')
console.log(`[clubs] ${total} clubs dans ${championnats().length - echecs.length} championnats → ${urls.length} adresses écrites.`)
