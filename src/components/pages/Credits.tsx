import { useEffect } from 'react'

/**
 * Photo credits & legal notices for the Facebook page visuals (2026-09-14).
 * Wikimedia Commons licences (CC BY / CC BY-SA) require attribution and a
 * note when the work is modified — our player visuals are cropped and
 * AI-edited (kits). Trademark disclaimer for club crests and logos.
 */
const PHOTOS: Array<{ player: string; file: string; author: string; licence: string; licenceUrl: string; url: string }> = [
  { player: 'Jules Koundé', file: 'Jules Kounde France v Spain 7.24.26-180.jpg', author: 'Bryan Berlin', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', url: 'https://commons.wikimedia.org/wiki/File:Jules_Kounde_France_v_Spain_7.24.26-180.jpg' },
  { player: 'Pau Cubarsí', file: 'Pau Cubarsi Argentina v Spain 19 July 2026-130.jpg', author: 'Bryan Berlin', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', url: 'https://commons.wikimedia.org/wiki/File:Pau_Cubarsi_Argentina_v_Spain_19_July_2026-130.jpg' },
  { player: 'Pedri', file: 'Pedri Argentina v Spain 19 July 2026-164.jpg', author: 'Bryan Berlin', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', url: 'https://commons.wikimedia.org/wiki/File:Pedri_Argentina_v_Spain_19_July_2026-164.jpg' },
  { player: 'Lamine Yamal', file: 'Lamine Yamal in 2025 (cropped2).jpg', author: 'Biso', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', url: 'https://commons.wikimedia.org/wiki/File:Lamine_Yamal_in_2025_(cropped2).jpg' },
  { player: 'Raphinha', file: 'Raphinha.jpg', author: 'Rccousins', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', url: 'https://commons.wikimedia.org/wiki/File:Raphinha.jpg' },
  { player: 'Dani Olmo', file: 'Dani Olmo France v Spain 7.24.26-176.jpg', author: 'Bryan Berlin', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', url: 'https://commons.wikimedia.org/wiki/File:Dani_Olmo_France_v_Spain_7.24.26-176.jpg' },
  { player: 'Gavi', file: 'Gavi France v Spain 7.24.26-276 (cropped).jpg', author: 'Bryan Berlin', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', url: 'https://commons.wikimedia.org/wiki/File:Gavi_France_v_Spain_7.24.26-276_(cropped).jpg' },
]

export function Credits() {
  useEffect(() => { document.title = 'Crédits & mentions légales · Pressing 90’' }, [])
  return (
    <div className="container max-w-3xl mx-auto px-6 py-16">
      <header className="mb-12">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 mb-3">Crédits · الاعتمادات</div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-slate-900 tracking-tight">Crédits photos & <span className="text-accent-gold">mentions légales</span></h1>
        <p className="mt-4 font-mono text-xs text-slate-500">Dernière mise à jour : 14 septembre 2026</p>
      </header>

      <section className="prose prose-slate prose-lg max-w-none space-y-6 text-slate-700 leading-relaxed">
        <h2 className="text-2xl font-display font-bold text-slate-900 mt-4 mb-3">Photos des joueurs (page Facebook et visuels)</h2>
        <p>
          Les portraits de joueurs utilisés sur notre page Facebook (couverture, cartes de but, joueur vedette, compositions) proviennent de
          <strong> Wikimedia Commons</strong>, sous licences Creative Commons. Conformément à ces licences, chaque image est créditée ci-dessous avec
          son auteur, sa licence et un lien vers l'original. <strong>Ces images ont été recadrées, détourées et modifiées par intelligence
          artificielle</strong> (notamment le maillot, remplacé par une représentation du maillot domicile du FC Barcelone). Les versions
          modifiées sont publiées sous la même licence que l'original lorsque celle-ci l'exige (CC BY-SA).
        </p>
        <div className="not-prose overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left font-mono text-xs uppercase tracking-wider text-slate-500 border-b"><th className="py-2 pr-4">Joueur</th><th className="py-2 pr-4">Auteur</th><th className="py-2 pr-4">Licence</th><th className="py-2">Fichier original</th></tr></thead>
            <tbody>
              {PHOTOS.map((p) => (
                <tr key={p.file} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-semibold text-slate-800">{p.player}</td>
                  <td className="py-2 pr-4">{p.author}</td>
                  <td className="py-2 pr-4"><a href={p.licenceUrl} className="text-accent-gold underline" target="_blank" rel="noreferrer">{p.licence}</a></td>
                  <td className="py-2"><a href={p.url} className="text-accent-gold underline break-all" target="_blank" rel="noreferrer">{p.file}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="text-2xl font-display font-bold text-slate-900 mt-10 mb-3">Contenu généré ou modifié par IA</h2>
        <p>
          Certains visuels (maillots sur les portraits, fonds animés, effets sonores) sont générés ou modifiés par des outils d'intelligence
          artificielle. Ils sont signalés comme tels sur les visuels ou dans les légendes. Aucun visuel ne représente une scène réelle qui n'aurait pas eu lieu :
          les modifications portent sur l'habillage graphique (tenue, arrière-plan), jamais sur les faits sportifs.
        </p>

        <h2 className="text-2xl font-display font-bold text-slate-900 mt-10 mb-3">Marques, blasons et logos</h2>
        <p>
          Pressing 90’ est un média indépendant édité par mehdijabry.dev studio. Il n'est <strong>pas affilié, sponsorisé ni approuvé</strong> par le
          FC Barcelone, LaLiga, l'UEFA ou tout autre club ou compétition. Les blasons, logos et noms de clubs et de compétitions sont la propriété
          de leurs détenteurs respectifs et ne sont utilisés qu'à des fins éditoriales d'identification. Les logos de clubs proviennent des données ESPN.
        </p>

        <h2 className="text-2xl font-display font-bold text-slate-900 mt-10 mb-3">Polices, musiques et données</h2>
        <p>
          Polices : Anton, Tajawal, IBM Plex Mono et Archivo (Google Fonts, licence SIL Open Font). Musiques et effets sonores : produits par nos soins ou
          générés par IA (ElevenLabs). Résultats, calendriers et compositions : données ESPN. Actualités : sources citées sur chaque article.
        </p>

        <h2 className="text-2xl font-display font-bold text-slate-900 mt-10 mb-3" dir="rtl" lang="ar">الاعتمادات والإشعارات القانونية</h2>
        <p dir="rtl" lang="ar">
          صور اللاعبين المستخدمة على صفحتنا في فيسبوك مأخوذة من ويكيميديا كومنز بموجب رخص المشاع الإبداعي (CC BY / CC BY-SA)، والمصورون مذكورون في الجدول أعلاه.
          تم اقتطاع الصور وتعديلها بالذكاء الاصطناعي (القميص خصوصًا). بريسينغ 90 منصة إعلامية مستقلة غير تابعة لنادي برشلونة أو أي نادٍ أو مسابقة؛
          الشعارات والأسماء ملك لأصحابها وتُستخدم لأغراض تحريرية فقط.
        </p>

        <p className="mt-10 font-mono text-xs text-slate-500">
          Demande de retrait ou de correction d'un crédit : <a href="mailto:info@pressing90.live" className="text-accent-gold underline">info@pressing90.live</a>
        </p>
      </section>
    </div>
  )
}
