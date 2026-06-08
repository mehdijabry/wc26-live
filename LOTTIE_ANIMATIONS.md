# 🎬 WC26 Live — Lottie Animations Setup

## 📁 Dossier de destination

Tous les fichiers téléchargés vont dans :

```
/Users/Mehdi/Desktop/wc2026-hub/public/lottie/
```

(le dossier existe déjà, ne pas le supprimer)

## 🎯 Format à télécharger

Sur lottiefiles.com, pour chaque animation :
1. Clique **"Download"**
2. Sélectionne **`.lottie`** (format optimisé, ~10x plus léger que JSON)
3. Renomme le fichier téléchargé EXACTEMENT comme indiqué ci-dessous
4. Déplace dans `/Users/Mehdi/Desktop/wc2026-hub/public/lottie/`

> 💡 Si tu n'as que le format `.json`, ça marche aussi — change l'extension dans `src/components/LottieLoader.tsx` (ligne `const src = \`/lottie/${name}.lottie\``).

---

## 📋 Les 8 animations curées

### 1. `whistle.lottie` 🟡 SIFFLET ARBITRE
**Pour** : chargement Schedule / fixtures (l'arbitre siffle le coup d'envoi)
**Lien** : https://lottiefiles.com/marketplace/football-158 *(pack "Football Animation Pack" — contient "football whistle")*
**Alternative gratuite** : https://lottiefiles.com/free-animations/football *(filtre "whistle")*
**Nom final** : `whistle.lottie`

---

### 2. `ball-spin.lottie` ⚪️ BALLON QUI TOURNE
**Pour** : loaders génériques courts (badges chargement, refresh)
**Lien** : https://lottiefiles.com/12710-spinning-ball
**Nom final** : `ball-spin.lottie`

---

### 3. `ball-kick.lottie` ⚽️ BALLON TIRÉ / CHAUSSURE
**Pour** : chargement Predictions / BracketWizard (envoyer son pronostic)
**Lien** : https://lottiefiles.com/animation/soccer-ball-10080310 *(par WebSensePro)*
**Alternative** : https://lottiefiles.com/animation/soccer-ball-8857427 *(par Moon Studio)*
**Nom final** : `ball-kick.lottie`

---

### 4. `trophy.lottie` 🏆 TROPHÉE
**Pour** : Bracket export PNG / révélation Final / Leaderboard top 1
**Lien** : https://lottiefiles.com/8846-trophy
**Nom final** : `trophy.lottie`

---

### 5. `goal-net.lottie` 🥅 FILET QUI ONDULE
**Pour** : LiveTicker mise à jour score / notif "GOAL!"
**Lien** : https://lottiefiles.com/free-animations/soccer-match *(filtre "goal" / "net")*
**Alternative** : https://lottiefiles.com/free-animation/soccer-player-goal-celebration-leUZblmIie *(célébration de but)*
**Nom final** : `goal-net.lottie`

---

### 6. `stadium-crowd.lottie` 🏟 FOULE QUI ACCLAME
**Pour** : chargement TeamSheet / page d'une équipe (l'ambiance du stade)
**Lien** : https://lottiefiles.com/free-animations/soccer
**À chercher** : "stadium", "crowd", "fans"
**Nom final** : `stadium-crowd.lottie`

---

### 7. `jersey-swap.lottie` 👕 2 MAILLOTS QUI SWAPPENT
**Pour** : chargement Squad / Players section (échange de maillots)
**Lien** : https://lottiefiles.com/marketplace/football-158 *(contient "shirt")*
**Alternative** : https://lottiefiles.com/17434-soccer-player
**Nom final** : `jersey-swap.lottie`

---

### 8. `card-yellow.lottie` 🟨 CARTON JAUNE
**Pour** : erreurs / warnings (login failed, API down, etc.) — l'arbitre te sort un carton
**Lien** : https://lottiefiles.com/marketplace/football-158 *(contient "referee card")*
**Alternative** : https://lottiefiles.com/free-animations/football *(filtre "card")*
**Nom final** : `card-yellow.lottie`

---

## 🎁 Bonus — Le pack tout-en-un (recommandé)

Au lieu de télécharger 8 fichiers séparés, le pack **Football Animation Pack** contient déjà sifflet, ballon, médaille, filet, écran score, maillot, chaussure, chrono, trophée et carton arbitre — tout en un coup :

🔗 **https://lottiefiles.com/marketplace/football-158**

Si tu prends ce pack :
1. Dézippe-le
2. Renomme les fichiers selon la liste ci-dessus
3. Déplace dans `public/lottie/`

---

## ✅ Vérification après téléchargement

Une fois les fichiers en place :

```bash
ls -la /Users/Mehdi/Desktop/wc2026-hub/public/lottie/
```

Tu devrais voir :
```
whistle.lottie
ball-spin.lottie
ball-kick.lottie
trophy.lottie
goal-net.lottie
stadium-crowd.lottie
jersey-swap.lottie
card-yellow.lottie
```

Puis dis-moi **"lottie ready"** et je wire les animations dans les Suspense fallbacks (`SectionSkeleton`, `GroupsSkeleton`, `BracketWizard StepGroups` quand `!ready`, etc.) — partout où il y a actuellement un skeleton statique.

---

## 🛠 Comment c'est intégré côté code

J'ai déjà créé `src/components/LottieLoader.tsx`. À l'usage :

```tsx
import { LottieLoader } from './components/LottieLoader'

// Schedule loader
<LottieLoader name="whistle" caption="Coup d'envoi imminent…" size={80} />

// Predictions loader
<LottieLoader name="ball-kick" size={64} loop />

// Generic micro-loader (badges, refresh)
<LottieLoader name="ball-spin" size={32} />
```

Si un fichier `.lottie` manque, un fallback CSS ring spinner s'affiche — donc rien ne casse pendant que tu télécharges.
