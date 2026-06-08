# 🎬 WC26 Live — Lottie Animations Setup (100% GRATUIT)

## ⚠️ Règle d'or sur LottieFiles

Sur chaque page d'animation, dans la section **"Download as"** à droite :

| Option | Statut |
|---|---|
| **Lottie JSON** (~5-20 KB) | ✅ **GRATUIT** — toujours dispo |
| **dotLottie** (~1-3 KB, sans 👑) | ✅ **GRATUIT** — *meilleur choix* |
| ~~Optimized Lottie JSON 👑~~ | ❌ Payant (Pro) — ÉVITE |
| ~~Optimized dotLottie 👑~~ | ❌ Payant (Pro) — ÉVITE |

**Toujours prendre `dotLottie` (sans crown) ou `Lottie JSON`.**

---

## 📁 Dossier de destination

```
/Users/Mehdi/Desktop/wc2026-hub/public/lottie/
```

(le dossier existe déjà — `mkdir public/lottie` a été fait)

---

## 📋 Les 8 animations — TOUTES GRATUITES

### 1. `ball-spin.lottie` ⚪️ BALLON QUI TOURNE
**Pour** : refresh micro-loaders, badges chargement
**Lien direct** : https://lottiefiles.com/12710-spinning-ball
**Sur la page** : clique **"dotLottie"** (1.6 KB, sans 👑)
**Renomme en** : `ball-spin.lottie`

---

### 2. `ball-kick.lottie` ⚽️ JOUEUR QUI SHOOTE
**Pour** : Predictions / BracketWizard loading
**Lien direct** : https://lottiefiles.com/free-animation/soccer-player-kick-on-the-ball-DoHT9f3SkM
**Sur la page** : clique **"dotLottie"** (sans 👑)
**Renomme en** : `ball-kick.lottie`

---

### 3. `whistle.lottie` 🟡 LOADING SOCCER (remplace le sifflet — pas trouvé gratuit pur)
**Pour** : Schedule / fixtures loading (coup d'envoi)
**Lien direct** : https://lottiefiles.com/free-animation/loading-soccer-mQpwzVYi49
**Sur la page** : clique **"dotLottie"** (sans 👑)
**Renomme en** : `whistle.lottie`

---

### 4. `trophy.lottie` 🏆 TROPHÉE QUI BRILLE
**Pour** : Bracket export PNG / Leaderboard top 1 / Final reveal
**Lien direct** : https://lottiefiles.com/8846-trophy
**Sur la page** : clique **"dotLottie"** (sans 👑)
**Renomme en** : `trophy.lottie`

*(Alternatives si celle-ci ne te plaît pas, toutes gratuites :)*
- https://lottiefiles.com/4768-trophy *(par NorthSea — plus minimaliste)*
- https://lottiefiles.com/35683-trophy *(par zanwei.guo — moderne)*
- https://lottiefiles.com/2837-trophy-animation *(par Vinoth E — classique gold)*

---

### 5. `goal-net.lottie` 🥅 BUT MARQUÉ / CÉLÉBRATION
**Pour** : LiveTicker "GOAL!", notif score
**Lien direct** : https://lottiefiles.com/free-animation/soccer-player-goal-celebration-leUZblmIie
**Sur la page** : clique **"dotLottie"** (sans 👑)
**Renomme en** : `goal-net.lottie`

---

### 6. `stadium-crowd.lottie` 🏟 BALLON ROULANT (substitut foule)
**Pour** : TeamSheet loading / page équipe
**Lien direct** : https://lottiefiles.com/free-animation/ball-soccer-pvLzQfrE3Q
**Sur la page** : clique **"dotLottie"** (sans 👑)
**Renomme en** : `stadium-crowd.lottie`

*Note : la "foule qui acclame" n'existe pas en libre. Le ballon qui roule est la meilleure alternative thématique gratuite.*

---

### 7. `jersey-swap.lottie` 👕 JOUEUR EN MOUVEMENT
**Pour** : Squad / Players loading
**Lien direct** : https://lottiefiles.com/free-animation/soccer-player-flying-kick-the-ball-XPMiq5OvFB
**Sur la page** : clique **"dotLottie"** (sans 👑)
**Renomme en** : `jersey-swap.lottie`

---

### 8. `card-yellow.lottie` 🟨 CARTON / WARNING
**Pour** : erreurs (login failed, API down)
**Lien direct** : recherche libre sur https://lottiefiles.com/search?q=warning+card&type=free
**Suggestion à chercher** : "warning yellow" / "card yellow"
**Renomme en** : `card-yellow.lottie`

*Si tu trouves pas de carton de foot gratuit, n'importe quelle animation "warning" / "alert" gratuite fait le job — c'est juste un visuel d'erreur.*

---

## 🚀 Procédure en 5 minutes

1. Ouvre les 7 premiers liens (le 8 est optionnel)
2. Sur chaque page → bouton **"Download"** → choisis **"dotLottie"** (le 1.X KB sans crown)
3. Va dans ton dossier `~/Downloads/`
4. Renomme les fichiers téléchargés selon la colonne **"Renomme en"** ci-dessus
5. Déplace-les dans `/Users/Mehdi/Desktop/wc2026-hub/public/lottie/`

```bash
# Commande Terminal pour bouger tout d'un coup :
mv ~/Downloads/*.lottie /Users/Mehdi/Desktop/wc2026-hub/public/lottie/
ls /Users/Mehdi/Desktop/wc2026-hub/public/lottie/
```

Tu devrais voir au moins :
```
ball-spin.lottie
ball-kick.lottie
whistle.lottie
trophy.lottie
goal-net.lottie
stadium-crowd.lottie
jersey-swap.lottie
```

---

## ✅ Quand t'as fini

Dis-moi **"lottie ready"** ou **"fait"**.

Je wire ensuite les animations dans tous les Suspense fallbacks du site :
- `Schedule` loading → `whistle`
- `Predictions` loading → `ball-kick`
- `BracketWizard` step 1 quand `!ready` → `ball-spin`
- `LiveTicker` mise à jour score → `goal-net`
- `TeamSheet` loading → `stadium-crowd`
- `Squad` / `Players` loading → `jersey-swap`
- `Leaderboard` top 1 / Final winner → `trophy`
- Errors → `card-yellow`

---

## 🛠 Si tu ne trouves pas le bon bouton de download

LottieFiles a redesigné leur UI plusieurs fois. Si la page ressemble pas à ton screenshot :

1. Sur certaines pages, le bouton **"Download"** est en haut à droite (vert)
2. Sur d'autres, c'est dans une sidebar "Download as"
3. **Toujours chercher** : un format **sans crown 👑** (les crowns = payant)
4. **dotLottie** est préféré (10x plus léger que JSON)
5. Si seul **Lottie JSON** est gratuit, prends-le et change l'extension du fichier (`.json` → `.lottie` ne marche pas — je vais devoir adapter le composant)

Si tu te retrouves avec des `.json` au lieu de `.lottie`, dis-moi — je modifie `LottieLoader.tsx` pour gérer les 2 formats.
