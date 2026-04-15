# UNDERCOVER — Night City Edition
## Mémoire projet Claude

---

## Présentation

Jeu de société **Undercover** en version navigateur, thème cyberpunk "Night City".
Pur statique : `index.html` + `app.js` + `style.css`. Zéro dépendance, zéro build.
Déployable sur Apache HTTP ou tout serveur de fichiers statiques.

**Repo** : `jumanocta/uc-game`
**Branche de développement** : `claude/takeover-project-JGQPx`

---

## Stack technique

| Élément | Détail |
|---|---|
| Langage | Vanilla JS (ES5+), HTML5, CSS3 |
| Fonts | Google Fonts — Orbitron (titres), Rajdhani (corps) |
| Stockage | `localStorage` (Hall of Fame, options) |
| Audio | Web Audio API (oscillateurs, zéro fichier son) |
| PWA | `manifest.json` + `sw.js` (cache-first, offline ready) |
| Build | Aucun — fichiers servis directement |

---

## Architecture

### Fichiers

```
uc-game/
├── index.html          # Shell HTML (~30 lignes)
├── app.js              # DB + toute la logique (~400 lignes)
├── style.css           # Thème cyberpunk (~280 lignes)
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (cache-first)
├── icons/icon.svg      # Icône PWA (design UC cyan)
├── README.md
└── .claude/
    └── PROJECT.md      # Ce fichier — mémoire projet
```

### État global `S`

Objet unique qui contient tout l'état de la partie :

```javascript
S = {
  // Config partie
  phase,        // phase courante (voir machine à états)
  pc,           // nombre de joueurs (3-20)
  uc,           // nombre d'undercover
  mw,           // Mr. White activé (bool)
  cat,          // afficher catégorie (bool)
  timer,        // durée timer débat en secondes (0 = off)
  skipvote,     // vote nul activé (bool)
  night,        // mode nuit activé (bool)
  kids,         // mode enfant activé (bool) — filtre PP()
  nsfw,         // mode adulte activé (bool) — à implémenter

  // Joueurs
  nm,           // {id: nom} — noms des joueurs
  players,      // [{id, role}] — liste complète
  alive,        // [id] — joueurs encore en jeu
  elim,         // [id] — joueurs éliminés (ordre)
  sc,           // {id: pts} — scores de la partie

  // Tour en cours
  turn,         // numéro du tour
  used,         // indices DB déjà tirés (anti-répétition)
  tp,           // [{id, role, word}] — joueurs du tour
  ro,           // [index] — ordre de parole (shuffled)
  ri,           // index courant dans ro (handoff/reveal)
  pair,         // [mot_civil, mot_uc] du tour
  ct,           // catégorie du tour
  wv,           // mot révélé (bool, phase reveal)
  vt,           // vote target id (null = rien, -1 = personne)
  skipt,        // tour sauté (vote nul)
  spoken,       // [id] — joueurs ayant parlé ce tour (reset startTurn)

  // Timer
  tid,          // setInterval id
  trem,         // secondes restantes

  // Fin de partie
  gr,           // {winner, msg} — résultat

  // Historique
  hist,         // [{turn, cat, pair, skipped, elim}]
  showHist,     // toggle historique dans la phase playing

  // UI
  err,          // message d'erreur setup (noms dupliqués)
  lbSaved,      // leaderboard déjà sauvegardé ce tour (bool)
  showLB,       // (réservé)
}
```

### Machine à états (`S.phase`)

```
splash → setup → handoff → reveal → playing → vote → turn_recap → game_over
                                                ↗ mrwhite_guess ↗
```

| Phase | Description |
|---|---|
| `splash` | Écran d'intro animé (chargement initial uniquement) |
| `setup` | Configuration : joueurs, noms, rôles, options |
| `handoff` | Passage du téléphone au joueur suivant |
| `reveal` | Le joueur découvre son mot en privé |
| `playing` | Débat + timer + ordre de parole + cocher les parlants |
| `vote` | Vote d'élimination (ou vote nul) |
| `mrwhite_guess` | Mr. White tente de deviner le mot civil |
| `turn_recap` | Révélation du rôle éliminé + scores + historique |
| `game_over` | Écran de fin avec classement et Hall of Fame |

### Base de données de mots (`DB`)

**704 paires** `[mot_civil, mot_uc, catégorie, kid_safe]` en **40 catégories** :

| Groupe | Catégories |
|---|---|
| Originales (14) | Cinéma · Séries · Jeux vidéo · Musique · Nourriture · Sport · Culture · Tech · Personnages · Marques · Divers · Animaux · Contes · École |
| Gastronomie (5) | Fromages · Épices · Cocktails · Vins · Petit-déjeuner |
| Fantastique & Univers (5) | Monstres · Espace · Dinosaures · Superpouvoirs · Magie |
| Quotidien (3) | Objets · Métiers · Corps |
| Tech & Culture moderne (5) | Informatique · Applis · Jeux de société · Voitures · Emojis |
| Arts & Histoire (4) | Danse · Instruments · Architecture · Époques |
| Sensations & Insolite (4) | Couleurs · Matières · Phobies · Géographie |

- `kid_safe = true` : paire incluse en Mode Enfant (~520 paires)
- `kid_safe = false` : paire exclue en Mode Enfant (alcool, horreur, violence, sujets adultes)

Anti-répétition : `S.used` trace les **indices originaux DB** déjà tirés. Quand le pool filtré est épuisé, `S.used` est réinitialisé sur ce pool uniquement (pas sur la DB entière).

### Fonctions clés

| Fonction | Rôle |
|---|---|
| `render()` | Rendu complet selon `S.phase` |
| `startSession()` | Valide les noms, assigne les rôles, lance le 1er tour |
| `startTurn()` | Tire un mot via `PP()`, shuffle l'ordre, reset `spoken`, passe en `handoff` |
| `confirmSeen()` | Avance dans le handoff/reveal, lance le timer au dernier joueur |
| `doElim()` | Élimine un joueur ou traite le vote nul (`S.vt === -1`) |
| `checkEnd()` | Vérifie les conditions de victoire et distribue les points |
| `mwGuess(ok)` | Gère la tentative de devine de Mr. White |
| `fullReset()` | Remet à zéro en conservant toutes les options (pc, uc, mw, cat, nm, timer, skipvote, night, kids) |
| `PP()` | Pioche une paire non-utilisée, filtrée par `S.kids` |
| `startTimer()` | Lance le countdown (setInterval, met à jour `#tdisp` directement) |
| `stopTimer()` | Arrête le countdown proprement |
| `recordTurn(elim)` | Enregistre le tour dans `S.hist` |
| `saveLeaderboard()` | Cumule les scores dans `localStorage['uc_lb']` (protégé par `S.lbSaved`) |
| `SND.ping/click/elim/alarm/win` | Sons via Web Audio API (oscillateurs) |
| `VIB(pattern)` | Vibration via `navigator.vibrate` |
| `G(text, class)` | Génère l'effet glitch CSS |
| `CSC()` | Scores compacts (handoff/playing) |
| `FSC()` | Scores complets (game_over) |
| `HIST(max)` | Historique des tours (HTML) |
| `FLB()` | Hall of Fame depuis localStorage (HTML) |
| `WR()` | Affiche la paire de mots (turn_recap/game_over) |
| `CP(d)` | Incrémente/décrémente `S.pc`, met à jour `S.uc` |
| `BAL()` | UC recommandés = `floor(pc/3) - (1 si MW actif)`, plancher 1 — appliqué à chaque changement de `pc` |
| `MUC()` | Max undercovers selon `S.pc` et `S.mw` |
| `WW()` | Mr. White jouable ? (≥4 joueurs, assez de civils) |
| `CC()` | Nombre de civils calculé |
| `N(id)` | Nom du joueur (fallback "Joueur N") |
| `TF(sec)` | Formate les secondes en "Xm Xs" |

---

## Historique des modifications

### Bugs corrigés

| # | Commit | Description |
|---|---|---|
| 1 | `185a1f0` | `mwGuess(false)` passait `null` à `checkEnd` → civils ne recevaient pas leur +1 pt |
| 2 | `6354c6c` | "Animal Crossing" × 2 dans Jeux vidéo, "Vampire" × 2 dans Divers |
| 3 | `d1ded0e` | `element.style.width` remplacé par CSS custom property `--pbar-w` |
| 4 | `8613ee9` | `style=""` vide sur bouton Hall of Fame (game_over) + historique manquant dans turn_recap normal |

### Améliorations UX

| # | Commit | Description |
|---|---|---|
| A | `d96f823` | Ordre de parole numéroté affiché pendant le débat (utilise `S.ro`) |
| B | `f698bb9` | Validation des noms : vides → auto-fill, doublons → erreur inline |
| C | `192103e` | Timer de discussion configurable : Off / 1min / 2min / 3min / 5min |
| D | `f44675e` | Vote nul "Personne" en option (toggle setup, `S.vt === -1`) |
| E | `1f4ac5c` | Sons Web Audio API + vibrations sur toutes les transitions clés |
| F | `f2d9515` | Historique des tours : toggle en phase playing, `<details>` en récap/game_over |
| M | `764887e` | Tap sur l'ordre de parole pour cocher un joueur (spoke state, reset chaque tour) |
| N | `501d912` | Bouton "Abandonner" discret en phase playing (confirm natif avant fullReset) |
| O | `7b820ba` | Confirmation avant d'effacer le Hall of Fame (setup + game_over) |
| P | `d8e3749` | Saisie directe du nombre de joueurs (input number dans le stepper) |

### Nouvelles fonctionnalités

| # | Commit | Description |
|---|---|---|
| H | `c267544` | Hall of Fame : scores cumulés en `localStorage['uc_lb']`, top 10, effaçable |
| I | `9b75aa5` | Mode nuit : compteur imposteurs masqué, rôles éliminés masqués pendant débat |
| K | `f1d06ac` | Splash screen animé : boot log CSS staggeré, icône zoom/glow, bouton fade-in |
| L | `3fada63` | PWA : `manifest.json`, `sw.js` cache-first offline, metas iOS, icône SVG |
| Q | `935e1f4` | Mode Enfant + DB × 1,75 : 225 → 394 paires, 11 → 14 catégories, flag kid_safe |
| R | `bad9e04` | `BAL()` : auto-équilibrage UC à 1/3 des joueurs (MW compris dans le tiers) |
| S | `b56c5ec` | VIB+SND sur bouton handoff — couverture haptique complète de tous les écrans |
| T | `7d35713` | Bloc 1 Gastronomie : +58 paires (Fromages · Épices · Cocktails · Vins · Petit-déjeuner) |
| U | `d32474e` | Bloc 2 Fantastique : +60 paires (Monstres · Espace · Dinosaures · Superpouvoirs · Magie) |
| V | `a24a41c` | Bloc 3 Quotidien : +36 paires (Objets · Métiers · Corps) |
| W | `90ca18b` | Bloc 4 Tech & Culture : +60 paires (Informatique · Applis · Jeux de société · Voitures · Emojis) |
| X | `134baa3` | Bloc 5 Arts & Histoire : +48 paires (Danse · Instruments · Architecture · Époques) |
| Y | `e38715e` | Bloc 6 Sensations : +48 paires (Couleurs · Matières · Phobies · Géographie) |

---

## Roadmap (à faire)

### En attente

| # | Priorité | Description |
|---|---|---|
| G | Moyenne | **Listes de mots custom** — écran dédié pour ajouter ses propres paires `[civil, UC, catégorie]`, sauvegardées en `localStorage['uc_custom']`, sélectionnables à la place ou en complément de la DB |
| J | Moyenne | **Récap visuel des votes** — après chaque élimination, afficher qui a voté pour qui (nécessite d'enregistrer les votes pendant la phase `vote`) |

### Idées futures non planifiées

| Idée | Description |
|---|---|
| **Mode 18+ (NSFW)** | Toggle "🔞 Mode Adulte" dans le setup (avec avertissement consentement). Ajoute un pool de paires explicites/grivois dans des catégories dédiées (Séduction, Corps, Soirée, Relations…). Implémentation : 5ème flag `nsfw` par entrée DB, ou tableau `DB_NSFW` séparé inclus dans le pool quand `S.nsfw = true`. Ne s'active pas avec le Mode Enfant. |
| **Niveaux de difficulté** | Flag `facile/moyen/difficile` par paire (4 éléments → 5), filtre activable en options. Ex : Cappuccino/Latte = difficile, iPhone/Samsung = facile |
| Animations de transition | Fade/slide entre les phases plutôt que le rendu instantané |
| Mode multi-appareils | Chaque joueur sur son propre téléphone (nécessite un backend WebSocket) |
| Thèmes visuels | Alterner entre Night City et d'autres palettes (rétro, nature, etc.) |
| Export de partie | Partager le résumé d'une partie (screenshot ou texte) |
| Statistiques joueur | Dans le Hall of Fame, détailler les victoires par rôle |
| Raccourci clavier | Navigation au clavier pour les grandes tablettes |

---

## Notes techniques importantes

### PWA & HTTPS
Le service worker ne s'enregistre que sur HTTPS (ou `localhost`).
Sur Apache HTTP standard, le jeu fonctionne intégralement mais sans offline ni install prompt.
Avec Let's Encrypt sur Apache → PWA complète activée automatiquement.

### CSP
Le projet se veut CSP-safe : aucun attribut `style=""` dans le HTML.
Les inline `onclick=""` existent (nécessitent `script-src 'unsafe-inline'`).
La largeur de la progress bar passe par `element.style.setProperty('--pbar-w', ...)`.

### localStorage
- `uc_lb` : Hall of Fame `{nom: {name, pts, games}}`
- Clé prévue : `uc_custom` pour les mots personnalisés (Feature G)

### Audio
`AudioContext` créé lazily au premier appel (respect de la politique navigateur).
Si `AudioContext` non supporté, les sons sont silencieusement ignorés.

### Scores
Les scores de partie (`S.sc`) sont indépendants du Hall of Fame.
`saveLeaderboard()` est protégé par `S.lbSaved` pour n'écrire qu'une fois par partie.

### Modes exclusifs
`kids` et `nsfw` (futur) ne doivent pas être activés simultanément.
Le toggle NSFW devra désactiver `S.kids` si actif, et vice versa.
