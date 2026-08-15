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
├── app.js              # DB + toute la logique (~430 lignes)
├── style.css           # Thème cyberpunk (~300 lignes)
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
  cats,         // null = toutes catégories ; sinon [string] = catégories actives

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
| `setup` | Configuration : joueurs, noms, rôles, options, catégories |
| `handoff` | Passage du téléphone au joueur suivant |
| `reveal` | Le joueur découvre son mot en privé |
| `playing` | Débat + timer + ordre de parole + cocher les parlants |
| `vote` | Vote d'élimination (ou vote nul) |
| `mrwhite_guess` | Mr. White tente de deviner le mot civil |
| `turn_recap` | Révélation du rôle éliminé + scores + historique |
| `game_over` | Écran de fin avec classement, Hall of Fame et partage |

### Base de données de mots (`DB`)

**816 paires** `[mot_civil, mot_uc, catégorie, kid_safe]` en **48 catégories** :

| Groupe | Catégories |
|---|---|
| Originales (14) | Cinéma · Séries · Jeux vidéo · Musique · Nourriture · Sport · Culture · Tech · Personnages · Marques · Divers · Animaux · Contes · École |
| Gastronomie (5) | Fromages · Épices · Cocktails · Vins · Petit-déjeuner |
| Fantastique & Univers (5) | Monstres · Espace · Dinosaures · Superpouvoirs · Magie |
| Quotidien (3) | Objets · Métiers · Corps |
| Tech & Culture moderne (5) | Informatique · Applis · Jeux de société · Voitures · Emojis |
| Arts & Histoire (4) | Danse · Instruments · Architecture · Époques |
| Sensations & Insolite (4) | Couleurs · Matières · Phobies · Géographie |
| Lifestyle (2) | Mode · Nature |
| Quotidien élargi (3) | Transports · Outils · Météo |
| Plaisirs & imaginaire (3) | Desserts · Fêtes · Mythologie |

- `kid_safe = true` : paire incluse en Mode Enfant — **691 paires sur 45 catégories**
- `kid_safe = false` : paire exclue en Mode Enfant (alcool, horreur, violence, sujets adultes) — 125 paires

`Cocktails` (0/12), `Vins` (0/10) et `Phobies` (0/12) n'ont **aucune** paire kid-safe : ces catégories sont affichées barrées et non sélectionnables quand le Mode Enfant est actif.

Anti-répétition : `S.used` trace les **indices originaux DB** déjà tirés. Quand le pool filtré est épuisé, `S.used` est réinitialisé sur ce pool uniquement.

**Cascade de repli de `PP()`** (le Mode Enfant n'est jamais contourné) :
1. pool = `kids` ∩ `cats`
2. si vide → pool = `kids` seul (le filtre catégories saute, pas le filtre enfant)
3. si vide → DB entière (inatteignable : 691 paires kid-safe)

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
| `fullReset()` | Remet à zéro en conservant toutes les options (pc, uc, mw, cat, nm, timer, skipvote, night, kids, cats) |
| `PP()` | Pioche une paire non-utilisée, filtrée par `S.kids` et `S.cats` (repli en cascade) |
| `allCats()` | Catégories triées présentes dans DB — mémoïsé dans `_allCats` |
| `catCount(c)` | Paires jouables dans la catégorie `c`, Mode Enfant appliqué |
| `poolSize()` | Taille du pool avec les filtres courants (affiché dans le setup) |
| `TCat(c)` | Toggle une catégorie dans `S.cats` (null = toutes actives) — refuse les catégories à 0 paire |
| `saveOpts()` | Persiste pc/uc/mw/cat/timer/skipvote/night/kids/cats/nm dans `localStorage['uc_opts']` |
| `loadOpts()` | Restaure et **valide** les options au démarrage (types, bornes, catégories obsolètes) |
| `resetOpts()` | Efface `uc_opts` et remet toutes les options par défaut |
| `startTimer()` | Lance le countdown (setInterval, met à jour `#tdisp` directement) |
| `stopTimer()` | Arrête le countdown proprement |
| `recordTurn(elim)` | Enregistre le tour dans `S.hist` |
| `saveLeaderboard()` | Cumule les scores + victoires par rôle dans `localStorage['uc_lb']` |
| `showConfirm(msg, cb)` | Modal de confirmation personnalisé (remplace `confirm()` natif) |
| `shareResult()` | Génère le récap texte de fin de partie et le copie dans le presse-papiers |
| `SND.ping/click/elim/alarm/win` | Sons via Web Audio API (oscillateurs) |
| `VIB(pattern)` | Vibration via `navigator.vibrate` |
| `G(text, class)` | Génère l'effet glitch CSS |
| `CSC()` | Scores compacts (handoff/playing) |
| `FSC()` | Scores complets (game_over) |
| `HIST(max)` | Historique des tours (HTML) |
| `FLB()` | Hall of Fame depuis localStorage (HTML) — inclut badges victoires par rôle |
| `WR()` | Affiche la paire de mots (turn_recap/game_over) |
| `CP(d)` | Incrémente/décrémente `S.pc`, met à jour `S.uc` |
| `BAL()` | UC recommandés = `floor(pc/3) - (1 si MW actif)`, plancher 1 |
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
| D1 | — | Phobies reformulées : termes techniques → "Peur de X / Peur de Y" (9/12 paires) |
| D2 | — | "Berlinette" remplacé par "Cabriolet sport" (terme inconnu du grand public) |
| D3 | — | "Bit/Octet" remplacé par "Mot de passe/Code PIN" |
| D4 | — | Flags `kid_safe` corrigés pour Applis (YouTube, Spotify, Netflix, Google Maps → `true`) |
| D5 | — | Vins obscurs (Sancerre/Pouilly-Fumé, Chablis/Meursault) remplacés par des paires accessibles |
| 5 | — | **Mode Enfant contournable** : le repli de `PP()` sur pool vide repiochait dans la DB entière. En ne gardant que Cocktails/Vins/Phobies (0 paire kid-safe) avec le Mode Enfant actif, des mots adultes étaient servis. Repli désormais en cascade sur le pool kid-safe. |
| 6 | — | **`sw.js` figé** : `CACHE` jamais bumpé + stratégie cache-first stricte → les installations PWA ne recevaient plus aucune mise à jour. Passage en stale-while-revalidate + `cache:'reload'` à l'install. |
| 7 | — | Libellé Mode Enfant faux (« ~520 paires sur 40 catégories » → 614 sur 39) |

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
| N | `501d912` | Bouton "Abandonner" discret en phase playing (modal personnalisé avant fullReset) |
| O | `7b820ba` | Confirmation avant d'effacer le Hall of Fame (setup + game_over) |
| P | `d8e3749` | Saisie directe du nombre de joueurs (input number dans le stepper) |
| I1 | — | Description Mode Enfant clarifiée dans le setup |
| I2 | — | Hint "RECOMMANDÉ : N UC (1/3 des joueurs)" sous le slider UC |
| I3 | — | Handoff : "C'EST TON TOUR" pour le 1er joueur au lieu de "PASSE LE TÉLÉPHONE" |
| I4 | — | Bouton "↺ Tout décocher" dans l'ordre de parole |
| I5 | — | Bouton "↺ Relancer" quand le timer est expiré |
| I6 | — | `showConfirm()` — modal personnalisée remplaçant `confirm()` natif (PWA compatible) |
| I11 | — | Timer : animation pulsante `.timer-disp.urgent` sous 10s restantes |
| I13 | — | Animations CSS entrée : `.hline` slide-in, `.icon-big/.icon-med` pop |
| I15 | — | Options persistantes (`uc_opts`) + bouton « Réinitialiser les options » |
| I16 | — | Compteur de paires par catégorie et taille du pool dans le setup ; alerte pool < 25 |
| I17 | — | `navigator.share()` pour le partage natif mobile (presse-papiers en secours) |
| I18 | — | `aria-label` + `aria-pressed` sur tous les toggles ; `allCats()` mémoïsé |
| P0 | `40633e5` | Fondations multi-appareils : `S.mode`, `readNameInputs()`, correction de `fullReset`/`resetOpts`/`saveOpts` |
| P1 | `c1eeb3b` | Lobby réseau : façade `NET`, adaptateur PeerJS, QR, code de salle, roster live, exclusion |
| P2 | `7c9bde6` | Reconnexion (backoff, heartbeat, visibilitychange) et persistance de l'hôte + Wake Lock |
| P3 | `d7c25c0` | Mots secrets ciblés — les phases `handoff`/`reveal` disparaissent en multi |
| P4 | `6140889` | Vote secret distribué, dépouillement animé, revote sur égalité |
| P5 | — | Écrans récap/fin côté client, Mr. White tapant sa proposition, vote à découvert (feature J) |

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
| Z | — | Bloc 7 Lifestyle : +24 paires (Mode · Nature) — DB totale : 744 paires, 42 catégories |
| I9 | `92a04b3` | Filtre catégories : chips cliquables pour activer/désactiver les 42 catégories individuellement |
| I10 | — | Bouton "Partager" en game_over : copie le récap dans le presse-papiers |
| I12 | — | Hall of Fame enrichi : victoires par rôle (👤 civils · 🕵️ UC · 🤍 Mr.White) |

---

---

## Mode multi-appareils

Chacun joue sur son propre téléphone. Le choix se fait à l'entrée de l'application ; le mode mono-téléphone reste strictement inchangé.

### Fichiers

| Fichier | Rôle |
|---|---|
| `net.js` | Façade `NET`, protocole, `snapshot()`, session hôte, Wake Lock, cycle de vie |
| `net-peerjs.js` | Adaptateur WebRTC — **seul fichier mentionnant `Peer`** |
| `client.js` | État `C` et `renderClient()` — écrans du joueur distant |
| `qr.js` | `drawQR(canvas, texte)` — peint le QR sans passer par les helpers à `style=""` |
| `vendor/peerjs.min.js` | PeerJS 1.5.5 (MIT), chargé paresseusement, précaché par le SW |
| `vendor/qrcode.js` | qrcode-generator 1.4.4 (MIT) |

### Principes structurants

1. **L'hôte fait autorité.** `S` reste l'unique source de vérité, sur son appareil.
2. **Snapshots complets, jamais de deltas.** La reconnexion emprunte le même chemin de code que le fonctionnement normal — c'est ce qui la rend structurelle plutôt que rustinée.
3. **Le client tolère l'absence de réseau.** Son mot est en cache local et reste affiché pendant une coupure ; l'écran n'est jamais vidé. Le lien n'est requis que pour envoyer un vote et recevoir un snapshot.
4. **Un client ne reçoit jamais son rôle** — seulement `word` et `isMrWhite`.
5. **L'identité est le token, jamais l'id de connexion.** Les `connId` sont opaques et forgés par l'adaptateur ; la logique de jeu ne doit jamais les inspecter ni les corréler.
6. **Les sièges sont un tableau ordonné** (`playerId = index + 1`) : la renumérotation après un départ est automatique et préserve l'invariant d'ids contigus dont dépend `startSession()`.

### Protocole

Enveloppe `{v:1, t:<type>, …}`.

**Client → hôte** : `hello {token,name}` · `vote {target,turn,round}` · `spoke {on}` · `mw_answer {guess,turn}` · `set_name` · `ping` · `leave`
**Hôte → client** : `welcome {token,playerId,roomCode,state}` · `reject {reason}` · `state <Snapshot>` · **`secret {turn,word,isMrWhite,category}` — ciblé uniquement** · `timer {action,remaining}` · `pong`

### Fonctions clés

| Fonction | Rôle |
|---|---|
| `hostStart()` / `resumeHost()` | Ouvre ou reprend une salle (même code → les clients la retrouvent seuls) |
| `snapshot()` | **Unique producteur** des données diffusées |
| `pushState()` | Diffusion idempotente, appelée sans condition depuis `render()` |
| `sendSecretTo(pid)` / `sendSecrets()` | Envoi ciblé des mots |
| `startVote()` / `closeVote()` / `computeTally()` | Vote secret et dépouillement |
| `applyVote(t)` | Pose `S.vt` et appelle `doElim()` — seul point de sortie vers le moteur |
| `submitClue(pid,txt)` | Enregistre un indice, ou déclenche la faute |
| `saysWord(indice,mot)` | Détection du mot entier, tolérante aux accents et pluriels |
| `clueFault(pid,...)` | Élimination immédiate → `checkEnd()` |
| `doRevote()` / `tieRandom()` / `canRevote()` | Départage des égalités |
| `hostSweep()` | Marque déconnecté un siège silencieux > 20 s |
| `scheduleReconnect()` / `clientWakeUp()` | Backoff avec gigue, reprise immédiate au retour à l'écran |
| `requestWake()` / `releaseWake()` | Wake Lock — mitigation principale sur iOS |

### Indices écrits (option `S.writeClues`, multi-appareils)

Chacun tape son indice ; `S.clues = {playerId: texte}` est remis à zéro chaque tour et diffusé à tous — c'est tout l'intérêt, garder une trace de ce qui a été dit.

`saysWord(indice, mot)` normalise casse, accents et ponctuation, puis exige le mot **entier** : « chat » ne se déclenche ni sur « château », ni sur « achat », ni sur « chatons », mais bien sur « des chats ». Pluriel toléré dans les deux sens.

**Faute de catégorie** (`S.faultCat`) — écrire la catégorie élimine aussi, mais **uniquement quand elle n'est pas affichée**. Quand le badge la montre à toute la table, la répéter ne fuite rien : sanctionner reviendrait à éliminer quelqu'un pour avoir recopié son propre écran. Contrairement au mot, elle lie **tous** les joueurs, Mr. White compris — c'est une information partagée, pas un secret personnel.

`wordForms()` gère les pluriels français au-delà du simple `-s` : « Animaux » se déclenche sur « animal », `-eaux/-eau`, `-x`. Sans quoi la règle ratait le cas le plus fréquent, les catégories étant presque toutes au pluriel alors qu'on écrit spontanément au singulier.

Seul **son propre** mot est fautif : un civil qui prononce le mot Undercover fait une déduction légitime, pas une faute. Mr. White n'ayant pas de mot ne peut jamais être sanctionné.

**Aucun avertissement local avant l'envoi** — prévenir « ton indice contient ton mot » rendrait la règle décorative, plus personne ne se ferait prendre. C'est délibéré, et c'est pourquoi l'option est désactivable.

`clueFault()` emprunte exactement le chemin d'une élimination par vote : `checkEnd()` distribue les points et décide de la fin de partie. Seul l'écran de récap diffère, via `S.fault`.

### Règles en jeu (`showRules()`)

Fenêtre flottante accessible partout via un bouton « ? » installé **hors de `#app`** : il survit donc à tous les rendus, et un joueur qui lit les règles pendant le débat ne les perd pas quand l'état est rediffusé.

Le contenu insiste sur les deux points qui perdent les nouveaux joueurs : **on ignore son propre rôle** (on ne voit qu'un mot), et surtout **les rôles ne changent jamais de la partie alors que les mots changent à chaque tour**. La règle des indices écrits n'apparaît que si l'option est active.

### Préservation des champs de saisie

`render()` remplace tout `#app` par `innerHTML`, donc chaque champ est détruit et recréé. En multi, l'hôte rediffuse l'état dès qu'un joueur envoie un indice : un joueur en train de taper le sien perdait son texte, son curseur, et sur mobile **son clavier se refermait**.

`render()` encapsule désormais `renderInner()` entre `captureInput()` et `restoreInput()` — id, valeur et sélection du champ actif. Un seul point d'entrée protège l'indice, la proposition de Mr. White, le pseudo, le renommage de l'hôte et les noms du setup.

### Révélation des mots (`S.revealWords`, défaut `false`)

Masquer la paire à chaque fin de tour préserve l'incertitude sur son propre rôle : la révéler apprendrait à un Undercover survivant qu'il **est** l'intrus, dès le tour 2. La fin de partie affiche de toute façon `ALLW()` — toutes les paires jouées, tour par tour, côté hôte comme côté joueurs via `gameOver.allWords`.

### Règles de vote

- Clôture automatique quand tous les vivants **connectés** ont voté ; bouton manuel toujours présent.
- **« Personne » ne gagne jamais une égalité**, seulement une majorité franche.
- Égalité → revote limité aux ex æquo, **plafonné à un seul**, puis tour nul. L'hôte garde « personne » et « le sort décide ».
- `turn` et `round` sur chaque vote : un client reconnecté ne peut pas injecter un vote périmé.

### Stockage

- `uc_net_host` : `{code, seats, S (complet moins tid/net), savedAt}` — throttlé à 1/s, purgé après 6 h
- `uc_net_client` : `{code, token, playerId, name, secret}`

### CSP — piège de déploiement confirmé en production

Une CSP restrictive bloque `wss://0.peerjs.com` **sans que le jeu puisse s'en apercevoir** : le navigateur coupe la connexion au niveau du WebSocket, PeerJS ne reçoit ni `open` ni `error`, et l'écran reste figé sur « ouverture de la salle ». Seule la console signale la violation.

Directives requises : `connect-src https://0.peerjs.com wss://0.peerjs.com stun: turn:`, plus `style-src-elem https://fonts.googleapis.com` et `font-src https://fonts.gstatic.com` pour les polices. Voir le README pour l'exemple nginx complet.

`diag.html` écoute `securitypolicyviolation` et nomme la directive fautive — c'est le seul moyen de diagnostiquer ce cas depuis le navigateur du joueur.

### PWA (`pwa.js`)

Fichier dédié : ni logique de jeu, ni transport, uniquement le dialogue avec le navigateur.

- `isOnline()` — `navigator.onLine` ne prouve pas qu'Internet est joignable, mais quand il répond `false` on est certainement hors ligne. Suffisant pour barrer le multi-appareils **avant** une tentative vouée à l'échec, plutôt que d'attendre les 12 s du chien de garde.
- `canInstall()` / `doInstall()` — l'événement `beforeinstallprompt` est capturé et neutralisé pour garder la main sur le moment de l'invite.
- Bannière de mise à jour — le SW appelle `skipWaiting()`, donc la nouvelle version prend la main tout de suite, mais la **page** continue de faire tourner l'ancien code jusqu'au rechargement. D'où une bannière plutôt qu'un rechargement d'autorité, qui couperait une partie en cours.
- L'enregistrement du service worker a quitté `index.html` : plus aucun script inline, donc plus besoin de `script-src 'unsafe-inline'` pour lui.

### Limites assumées

- **HTTPS obligatoire** (WebRTC) — bouton désactivé avec explication sinon.
- **12 joueurs maximum** en multi (l'hôte tient N−1 `RTCPeerConnection`) ; le solo garde 20.
- **TURN fourni par PeerJS** : la 1.5 embarque `stun.l.google.com` **plus** `turn:eu-0/us-0.turn.peerjs.com` (identifiants `peerjs`/`peerjsp`) dans sa config ICE par défaut. Le NAT symétrique des opérateurs mobiles est donc relayé sans configuration. Serveurs publics gratuits, sans SLA : passer ses propres `iceServers` au constructeur pour s'en affranchir.
  *(Note : une lecture antérieure de la doc concluait à tort à l'absence de TURN — un `grep` tronqué au premier `]` imbriqué masquait le second bloc `urls:[…]`.)*
- **Pas de migration d'hôte** : répliquer la table des rôles sur un appareil de secours détruirait la confidentialité. Si l'hôte meurt, la partie est finie.
- Le broker public `peerjs.com` sert d'annuaire : Internet est requis pour **établir** la liaison.

### Bancs d'essai

Cinq suites Node exercent le protocole sans WebRTC (adaptateur factice, horloge et minuteries pilotées) : lobby et tokens, reconnexion et persistance, distribution des secrets et étanchéité, dépouillement et égalités, écrans de fin. Elles vérifient notamment qu'**aucun mot de joueur vivant ni champ `role` ne sort dans une diffusion**.

---

## Roadmap (à faire)

### En attente

| # | Priorité | Description |
|---|---|---|
| G | Moyenne | **Listes de mots custom** — écran dédié pour ajouter ses propres paires `[civil, UC, catégorie]`, sauvegardées en `localStorage['uc_custom']`, sélectionnables à la place ou en complément de la DB |
| P6 | Conditionnelle | **Adaptateur Supabase** (`net-supabase.js`) implémentant les quatre mêmes fonctions que l'adaptateur PeerJS. Devient nécessaire — et non plus optionnel — si le test inter-réseaux (WiFi + 4G) échoue à cause du NAT symétrique. La façade est déjà en place. |

✅ **J — Récap visuel des votes** : livré avec P5 en multi (option « vote à découvert »). Reste à porter en mode solo si souhaité.

### Idées futures non planifiées

| Idée | Description |
|---|---|
| **Mode 18+ (NSFW)** | Toggle "🔞 Mode Adulte" dans le setup (avec avertissement consentement). Pool séparé `DB_NSFW`, incompatible avec Mode Enfant. Flag `nsfw` par entrée ou tableau distinct. |
| **Niveaux de difficulté** | Flag `facile/moyen/difficile` par paire (5ème élément), filtre activable en options |
| Animations de transition | Fade/slide entre les phases plutôt que le rendu instantané |
| Mode multi-appareils | Chaque joueur sur son propre téléphone (nécessite un backend WebSocket) |
| Thèmes visuels | Alterner entre Night City et d'autres palettes (rétro, nature, etc.) |
| Export de partie | Partager le résumé d'une partie (screenshot ou texte) |
| Statistiques joueur | Dans le Hall of Fame, détailler les victoires par rôle (déjà implémenté en I12) |
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
- `uc_lb` : Hall of Fame `{nom: {name, pts, games, wins:{civil, uc, mrwhite}}}`
- `uc_opts` : options persistées `{pc, uc, mw, cat, timer, skipvote, night, kids, cats, nm}`
  Écrit à chaque rendu du setup et au lancement d'une partie ; relu au boot via `loadOpts()`.
  `loadOpts()` valide chaque champ (type, bornes, catégories encore présentes dans DB) pour
  qu'un `localStorage` corrompu ou obsolète ne casse pas le démarrage.
- Clé prévue : `uc_custom` pour les mots personnalisés (Feature G)

### Service worker — déploiement
`sw.js` est en **stale-while-revalidate** : le cache répond immédiatement (rapide + offline)
et une requête réseau rafraîchit l'entrée en arrière-plan. Le rechargement suivant sert la
nouvelle version, **sans dépendre d'un bump manuel de `CACHE`**.
Bumper `CACHE` (`uc-game-vN`) reste recommandé à chaque déploiement pour purger d'un coup
les anciennes entrées via le handler `activate`.

### Audio
`AudioContext` créé lazily au premier appel (respect de la politique navigateur).
Si `AudioContext` non supporté, les sons sont silencieusement ignorés.

### Scores
Les scores de partie (`S.sc`) sont indépendants du Hall of Fame.
`saveLeaderboard()` est protégé par `S.lbSaved` pour n'écrire qu'une fois par partie.

### Modes exclusifs
`kids` et `nsfw` (futur) ne doivent pas être activés simultanément.
Le toggle NSFW devra désactiver `S.kids` si actif, et vice versa.

### Filtre de catégories (`S.cats`)
`S.cats = null` signifie toutes les catégories actives (état par défaut).
`S.cats = [string]` = tableau des catégories incluses dans `PP()`.
`TCat(c)` gère le toggle : si toutes actives → retire `c` ; si `c` présente → retire ; si absente → ajoute.
Minimum 1 catégorie active imposé dans `TCat()`.
`fullReset()` conserve `S.cats` entre les parties.
