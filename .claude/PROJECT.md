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
| `net-peerjs.js` | Adaptateur WebRTC — **seul fichier mentionnant `Peer`** ; localise le broker et les relais à partir de `location`, sans adresse en dur |
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

**Client → hôte** : `hello {token,joinId,name}` · `vote {target,turn,round}` · `unvote {turn,round}` · `spoke {on}` · `clue {text,turn}` · `mw_answer {guess,turn}` · `set_name` · `buzz` · `ping` · `leave`
**Hôte → client** : `welcome {token,playerId,roomCode,state}` · `reject {reason}` · `state <Snapshot>` · `seat {playerId}` · **`secret {turn,word,isMrWhite,category}` — ciblé uniquement** · **`yourvote {turn,round,target}` — ciblé uniquement** · `timer {action,remaining}` · `buzzed` · `pong`

### Identité — les cinq règles

Une session ne doit **jamais** glisser d'un joueur à l'autre. Cinq garde-fous, chacun corrigeant un cas observé :

1. **Un siège par connexion.** `hostHello()` refuse de créer un second siège pour un `connId` déjà assis et renvoie le `welcome` du siège existant. Sans ça, une connexion pouvait s'attribuer les douze sièges en douze `hello` — et comme `sendSecretTo()` vise `seat.connId`, elle recevait au lancement autant de mots secrets. Deux suffisaient à connaître toute la paire.
2. **Jointure idempotente par `joinId`.** Le token n'existe qu'à partir du `welcome` : si le canal meurt entre le `hello` et le `welcome`, le client revient avec un token nul, sur une **nouvelle** connexion. Le `joinId`, tiré par le client avant son premier `hello` et persisté dans `uc_net_client`, permet à l'hôte de reconnaître la même tentative. C'est un secret au même titre que le token — jamais dans le snapshot.
3. **Reprise de siège explicite.** `uc_net_client` est partagé par tous les onglets d'un navigateur, et entre la PWA installée et l'onglet ordinaire : deux contextes présentent le **même token**. `attachSeat()` réassigne le siège au dernier arrivé puis évince l'ancien par `reject:"replaced"`. **L'ordre compte** : réassigner d'abord, fermer ensuite, sinon l'événement de fermeture retrouve encore le siège par son ancien `connId`. Le client évincé, lui, **ne vide pas** `uc_net_client` — il est partagé avec le gagnant.
4. **Un siège exclu ne se rouvre pas.** `kickPlayer()` pose `kicked`, `hostHello()` le consulte. Le token restait valide sans ça.
5. **Le lobby retire ses fantômes.** `hostSweep()` **supprime** un siège muet depuis 20 s en phase `lobby`, là où en partie il le conserve pour le retour du joueur. Un fantôme gonflait `S.pc` et faisait distribuer un rôle à personne.

### Vote — l'état vient de l'hôte

`iVoted` se dérive de `snapshot().vote.votedIds`, **jamais** d'une variable locale : `C.myVote` ne survit ni au rechargement ni à la reconnexion, et l'écran mentait alors dans les deux sens.

« Pour qui » voyage par **message ciblé `yourvote`**, comme les mots secrets — à l'acquittement d'un vote, après un retrait, et à chaque reconnexion. Le snapshot ne publie que `votedIds`. Y glisser une seule cible ruinerait le secret du vote.

`unvote` est un vrai message : changer d'avis reste permis, mais l'hôte l'enregistre. Avant, le bouton « Changer mon vote » se contentait d'effacer un affichage local — l'hôte gardait la voix, la comptait dans `allVoted()`, et pouvait clore le scrutin pendant que le joueur croyait choisir.

**L'hôte joue selon les mêmes règles** : `hostVote()` / `hostUnvote()`, et son bloc de vote reste affiché après son choix.

### Ce que l'hôte refuse

| Message | Contrôle |
|---|---|
| `clue` | phase `playing`, joueur vivant, tour courant, **et aucun indice déjà donné** — sinon on lisait le tableau des autres avant de réécrire le sien |
| `spoke` | phase `playing`, joueur vivant |
| `vote` / `unvote` | phase `vote`, tour **et** round courants, votant vivant, cible parmi les candidats |
| `mw_answer` | phase `mrwhite_guess`, expéditeur = le Mr. White démasqué |
| `set_name` | phase `lobby` uniquement |
| `buzz` | emoji sur liste blanche, cible existante, pas soi-même, délai respecté |
| **tous** | `connRateOk(cid)` — 12 messages/s par connexion. Le `ping` en est exempté et rafraîchit `lastSeen` **avant** tout filtrage, sinon le balayeur déclarerait mort un joueur présent. |

L'expéditeur est **toujours** déterminé par `seatByConn(cid)`, jamais par un identifiant annoncé.

### Assainissement

Côté hôte, rien n'entre dans `S` sans filtrage : `cleanName()`, `submitClue()` et `mw_answer` retirent `<>&"`.

Côté client, `scrubSnap()` échappe **à l'entrée** tout ce qui arrive de l'hôte — noms, indices, catégorie, faute, récapitulatif, fin de partie, proposition du Mr. White — plutôt qu'aux quinze points de rendu, qui s'oublient au prochain écran ajouté. Un hôte honnête filtre déjà ; un hôte modifié contrôle le snapshot en entier et exécuterait sinon du script chez tous ses joueurs. `escN()` préserve `null`, faute de quoi le mot absent de Mr. White deviendrait une chaîne vide et basculerait l'écran affiché.

### Tirage aléatoire

`newRoomCode()`, `newToken()` et le `joinId` passent par `crypto.getRandomValues` via `randBytes()`. `Math.random` ne convenait pas : son état se reconstitue à partir de quelques sorties, et les trois valeurs viennent du même flux — un joueur connaissant son token pourrait déduire ceux des autres, donc leur siège, donc leur mot. Le code de salle **rejette les tirages ≥ 240** : 256 n'est pas multiple de 30, et un simple modulo ferait sortir les 16 premiers caractères 12,5 % plus souvent.

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

Le texte **décrit la partie réellement en cours** : côté joueur distant il lit `C.snap.opts` (révélation des mots, indices écrits, faute de catégorie, catégorie affichée) et non l'état local, qui n'est pas le sien. La règle de la catégorie est tue quand elle est sans effet — option désactivée, ou catégorie affichée à tous.

Le contenu insiste sur les deux points qui perdent les nouveaux joueurs : **on ignore son propre rôle** (on ne voit qu'un mot), et surtout **les rôles ne changent jamais de la partie alors que les mots changent à chaque tour**. La règle des indices écrits n'apparaît que si l'option est active.

### Préservation des champs de saisie

`render()` remplace tout `#app` par `innerHTML`, donc chaque champ est détruit et recréé. En multi, l'hôte rediffuse l'état dès qu'un joueur envoie un indice : un joueur en train de taper le sien perdait son texte, son curseur, et sur mobile **son clavier se refermait**.

`render()` encapsule désormais `renderInner()` entre `captureInput()` et `restoreInput()` — id, valeur et sélection du champ actif. Un seul point d'entrée protège l'indice, la proposition de Mr. White, le pseudo, le renommage de l'hôte et les noms du setup.

### Révélation des mots (`S.revealWords`, défaut `false`)

Masquer la paire à chaque fin de tour préserve l'incertitude sur son propre rôle : la révéler apprendrait à un Undercover survivant qu'il **est** l'intrus, dès le tour 2. La fin de partie affiche de toute façon `ALLW()` — toutes les paires jouées, tour par tour, côté hôte comme côté joueurs via `gameOver.allWords`.

### Résidus de session — piège de connexion

`clientJoin()` doit repartir d'une session **neuve** : token, identifiant, mot et snapshot de la salle précédente sont effacés, sauf si l'on retape le code de la salle où l'on était déjà (reprise légitime).

Le token périmé était le plus traître. `onError` ne signale « salle introuvable » **que si l'on n'a pas de token** — avec un vieux token en mémoire, un code erroné faisait retenter indéfiniment, laissant le joueur sur « connexion… » sans aucune explication.

`C.err` provient de deux sources : un refus explicite de l'hôte (`REJECT_MSG`) ou un échec réseau (`netErrLabel`). `rejectText()` chaîne les deux — sans quoi « hors ligne », « timeout » ou « bibliothèque absente » tombaient tous sur un « Connexion impossible. » qui n'aide personne.

### Vérification de version à la connexion

Un joueur qui scanne un QR peut tourner sur une version en cache datant de plusieurs jours. Trois garde-fous :

1. `checkForUpdate()` force `reg.update()` **à chaque connexion** — par code comme par QR. Le navigateur ne consulte le service worker que sporadiquement.
2. Le `welcome` porte le `BUILD` de l'hôte. Version différente mais protocole identique → bandeau non bloquant nommant la version, la partie reste jouable.
3. **Protocole différent → écran dédié.** Auparavant `clientOnMsg` faisait un simple `return` sur `msg.v !== PROTO_V` : le joueur restait indéfiniment sur « connexion » sans la moindre explication. Il voit désormais la raison et un bouton pour recharger.

### Identité des sièges — piège structurel

`playerId = index + 1` dans un tableau. Retirer un siège décale donc **tous les suivants**. Or `playerId` n'était transmis qu'une fois, dans le `welcome` : un client resté connecté gardait un identifiant périmé et se croyait être quelqu'un d'autre — jusqu'à s'afficher éliminé à la place d'un autre, `C.playerId` pilotant aussi l'écran affiché.

`pushSeatIds()` renvoie à chaque client son identifiant faisant autorité, et **doit être appelé après toute mutation du tableau des sièges**. La reconnexion, elle, était déjà correcte : `hostHello` recalcule `playerId` depuis le token.

Les votes et indices n'ont jamais été affectés : l'hôte les attribue via `seatByConn`, jamais via l'identifiant annoncé par le client.

### Noms — deux notions distinctes

| Clé | Portée |
|---|---|
| `S.nm` | Roster de la partie **courante** — en solo il contient les noms des autres joueurs |
| `uc_me` | **Mon nom sur cet appareil** — durable, indépendant de toute partie |

L'hôte tirait son nom de `S.nm[1]`, c'est-à-dire « le premier de la liste » et non « moi » : il héritait donc du nom d'un ancien hôte ou d'un ami. Il lit désormais `uc_me`, qui alimente aussi le pré-remplissage du pseudo à la connexion.

### Pings (`S.pingOn`, `S.pingGap`, `S.pingMax`)

Fenêtre flottante sur le modèle des règles, hors de `#app` : elle survit aux rediffusions d'état. Un tap = un ping envoyé, sans étape intermédiaire.

**Le wizz à la réception** — plein écran, centré, `WIZZ_MS = 1000` ms. Un bandeau discret en haut de l'écran se manquait pendant un débat, or un ping qui ne coupe pas la conversation ne sert à rien.

Trois nœuds imbriqués, `.wizz` › `.wizz-card` › `.wizz-in`, parce que trois transformations se superposent : le centrage (figé), le zoom, le tremblement. Les empiler sur un seul élément ferait que la dernière animation déclarée écrase les autres — le tremblement mangerait le zoom. **`WIZZ_MS` et la durée de `wizzZoom` doivent rester égales** : changer l'une sans l'autre laisse un cadavre à l'écran ou coupe l'animation en plein vol.

`S.pingMax` (« wizz ultime ») ajoute un flash plein écran, double le tremblement et **secoue `#app` lui-même** via une classe posée par `showPingToast()` puis retirée au bout de `WIZZ_MS`. Comme le délai, l'option est **arbitrée par l'hôte** et voyage dans `snapshot().opts` : sinon chacun choisirait à quel point il accepte d'être secoué, et l'option perdrait tout son sel. Un `@media (prefers-reduced-motion)` neutralise le tremblement sans supprimer le message.

**Le nom du message sur le fil est `buzz`/`buzzed`, surtout pas `ping`/`pong`** — ces deux-là appartiennent au battement de cœur de la reconnexion, traité en tête de `hostOnMsg`, qui interceptait le message avant qu'il n'arrive à destination. C'est le premier bug qu'a révélé le banc d'essai.

Deux portées, deux sens :

| Portée | Diffusion | Décompte | Sens |
|---|---|---|---|
| `to = 0` ou public | à tous | `pingTally` | montrer ce que l'on pense |
| privé | **message ciblé** | aucun | mettre la pression |

Un ping privé **ne figure jamais dans le snapshot**, qui est diffusé à tous — il part par `NET.send` sur la seule connexion de la cible, exactement comme les mots secrets. La cible voit toujours qui l'envoie : un buzz anonyme ouvrirait la porte au harcèlement.

`pingTally` est remis à zéro à chaque tour. L'anti-flood vit côté hôte (`pingReady`), par expéditeur : un client modifié ne peut pas le contourner.

### Règles de vote

- Clôture automatique quand tous les vivants **connectés** ont voté ; bouton manuel toujours présent.
- **« Personne » ne gagne jamais une égalité**, seulement une majorité franche.
- Égalité → revote limité aux ex æquo, **plafonné à un seul**, puis tour nul. L'hôte garde « personne » et « le sort décide ».
- `turn` et `round` sur chaque vote : un client reconnecté ne peut pas injecter un vote périmé.

### Stockage

- `uc_net_host` : `{code, seats, S (complet moins tid/net), savedAt}` — throttlé à 1/s, purgé après 6 h
- `uc_net_client` : `{code, token, joinId, playerId, name, secret}` — **partagé entre les onglets d'un même navigateur**, d'où la règle de reprise de siège explicite

### CSP — piège de déploiement confirmé en production

Une CSP restrictive bloque `wss://0.peerjs.com` **sans que le jeu puisse s'en apercevoir** : le navigateur coupe la connexion au niveau du WebSocket, PeerJS ne reçoit ni `open` ni `error`, et l'écran reste figé sur « ouverture de la salle ». Seule la console signale la violation.

Directives requises : `connect-src wss://<domaine> https://0.peerjs.com wss://0.peerjs.com stun: turn: turns:`, plus `style-src-elem https://fonts.googleapis.com` et `font-src https://fonts.gstatic.com` pour les polices. Voir le README pour l'exemple nginx complet.

Le premier terme couvre le serveur de signaling auto-hébergé ; les deux suivants restent nécessaires tant que le repli vers le broker public est actif.

`diag.html` écoute `securitypolicyviolation` et nomme la directive fautive — c'est le seul moyen de diagnostiquer ce cas depuis le navigateur du joueur.

### PWA (`pwa.js`)

Fichier dédié : ni logique de jeu, ni transport, uniquement le dialogue avec le navigateur.

- `isOnline()` — `navigator.onLine` ne prouve pas qu'Internet est joignable, mais quand il répond `false` on est certainement hors ligne. Suffisant pour barrer le multi-appareils **avant** une tentative vouée à l'échec, plutôt que d'attendre les 12 s du chien de garde.
- `canInstall()` / `doInstall()` — l'événement `beforeinstallprompt` est capturé et neutralisé pour garder la main sur le moment de l'invite.
- Avis de mise à jour — le SW appelle `skipWaiting()`, donc la nouvelle version prend la main tout de suite, mais la **page** continue de faire tourner l'ancien code jusqu'au rechargement. D'où un avis plutôt qu'un rechargement d'autorité, qui couperait une partie en cours. Il est **plein écran et centré, sur un tiers de la hauteur** : le pied de page est justement la zone qu'on ne regarde jamais sur un téléphone, et le joueur qui rate le message reste sur une version incompatible avec celle de l'hôte — c'est-à-dire le seul cas où l'avis comptait. Le fond n'est pas cliquable, on veut un choix explicite (« Plus tard » compris). `showUpdateBanner(msg)` sert aussi à l'alerte de version divergente émise par `client.js`.
- L'enregistrement du service worker a quitté `index.html` : plus aucun script inline, donc plus besoin de `script-src 'unsafe-inline'` pour lui.

### Limites assumées

- **HTTPS obligatoire** (WebRTC) — bouton désactivé avec explication sinon.
- **12 joueurs maximum** en multi (l'hôte tient N−1 `RTCPeerConnection`) ; le solo garde 20.
- **Aucun relais par défaut** — `eu-0.turn.peerjs.com` et `us-0.turn.peerjs.com` **ne résolvent pas en DNS** (vérifié). Les entrées existent dans la bibliothèque PeerJS, aucun relais n'est joignable. `ICE_DEFAULT` ne déclare donc que du STUN vérifié : déclarer un TURN mort ne sauve personne et retarde la négociation, le navigateur attendant chaque serveur injoignable avant de conclure.
- **Sans TURN, la 4G échoue** — et c'est la seule explication du symptôme « ça marche chez lui mais pas chez moi ». Derrière un NAT symétrique (CGNAT mobile), deux pairs ne peuvent pas se joindre directement, **quel que soit l'annuaire**. Changer de broker n'y change rien : c'est un problème de chemin, pas d'annuaire.
  *(L'ancienne note attribuant les échecs Free Mobile à un filtrage du port 3478 était une mauvaise conclusion : les relais visés n'existaient tout simplement pas.)*
- **Trois sources ICE**, par priorité décroissante (`net-peerjs.js`) : `localStorage['uc_ice']` (surcharge manuelle) → `<répertoire>ice` (serveur du domaine, identifiants éphémères) → `ICE_DEFAULT` (STUN seul). `loadIce()` interroge le serveur **avant** de construire le `Peer` : les `iceServers` sont un argument du constructeur, les ajouter après coup n'a aucun effet.
- **Le serveur du domaine est optionnel** — `brokerConfig()` le déduit de `location`, jamais d'adresse en dur. S'il ne répond pas (timeout de 7 s, ou erreur `network`/`server-error`/`socket-*`), on bascule sur le broker public pour le reste de la session. Côté client, un `peer-unavailable` déclenche aussi le repli : l'hôte a pu basculer de son côté, et il faut le chercher là où il est avant d'annoncer « salle introuvable ».
- **`/ice` et `/peerjs` sont exclus du service worker** (`sw.js`) : le cache stale-while-revalidate y servirait des identifiants TURN expirés, sans qu'aucune erreur ne le signale.
- `diag.html` rapporte les types de candidats obtenus — sans `relay`, la 4G échouera. C'est le test qui tranche.
- **Pas de migration d'hôte** : répliquer la table des rôles sur un appareil de secours détruirait la confidentialité. Si l'hôte meurt, la partie est finie.
- Un annuaire — le sien ou le broker public — est requis pour **établir** la liaison ; Internet reste donc nécessaire au démarrage. Une fois la liaison établie, les données passent en direct entre les appareils.

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
