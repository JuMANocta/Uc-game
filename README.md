# UNDERCOVER — Night City Edition

Jeu de société **Undercover** en version navigateur, thème cyberpunk "Night City". Aucune installation, aucune dépendance : ouvrez `index.html` et jouez.

## Deux façons de jouer

Le choix se fait à l'ouverture de l'application.

| Mode | Fonctionnement |
|---|---|
| 📱 **Un seul téléphone** | Le jeu original : on se passe l'appareil, chacun découvre son mot en privé, le vote se fait à voix haute. Fonctionne hors-ligne. |
| 📡 **Chacun son téléphone** | L'hôte affiche un **QR code**, les autres le scannent, saisissent leur pseudo et rejoignent la salle. Chacun reçoit **son mot sur son propre écran** et **vote en secret**. Plus de passage de téléphone. |

> Le mode multi-appareils exige **HTTPS** (contrainte WebRTC) et une connexion Internet pour établir la liaison. Le bouton est désactivé avec explication si l'application est servie en HTTP simple.

## Principe du jeu

Chaque joueur reçoit secrètement un mot. La plupart ont le **même mot (civils)**, mais quelques-uns ont un **mot proche mais différent (Undercover)**, et éventuellement un joueur n'a **aucun mot (Mr. White)**.

À tour de rôle, chaque joueur donne un indice sans révéler son mot. Après la discussion, le groupe vote pour éliminer le suspect numéro un. Les civils gagnent en éliminant tous les imposteurs ; les imposteurs gagnent en survivant assez longtemps.

### Rôles

| Rôle | Icône | Mot reçu | Condition de victoire |
|---|---|---|---|
| Civil | 👤 | Mot civil | Éliminer tous les imposteurs |
| Undercover | 🕵️ | Mot undercover (proche du civil) | Survivre jusqu'à être en majorité |
| Mr. White | 🤍 | Aucun | Survivre ET deviner le mot civil lors de son élimination |

---

## Lancer le jeu

```bash
git clone https://github.com/jumanocta/uc-game.git
cd uc-game
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

Ou double-cliquer sur `index.html`. Aucun serveur requis.

> **PWA** : sur HTTPS, le jeu est installable et fonctionne hors-ligne.

---

## Configuration d'une partie

| Option | Détail |
|---|---|
| **Joueurs** | 3 à 20 — stepper ou saisie directe |
| **Noms** | Prénom par joueur (auto-rempli si vide) |
| **Undercover** | Nombre d'imposteurs via slider (auto-équilibré à 1/3 des joueurs) |
| **Mr. White** | Active le rôle sans mot |
| **Catégorie** | Affiche ou masque la thématique du mot |
| **Timer débat** | Off · 1min · 2min · 3min · 5min |
| **Vote nul** | Permet de passer un tour sans élimination |
| **Mode nuit** | Masque le compteur d'imposteurs et les rôles éliminés pendant le débat |
| **Mode Enfant 🧒** | Filtre les mots adultes (691 paires kid-safe sur 45 catégories) |
| **Filtre catégories** | Active/désactive individuellement chacune des 48 catégories, avec compteur de paires |

> Toutes les options et les noms des joueurs sont **conservés d'une session à l'autre** (`localStorage`). Un bouton « Réinitialiser les options » remet les valeurs par défaut.

---

## Système de points

| Événement | Points |
|---|---|
| Civil élimine un imposteur | +1 pt par civil survivant |
| Civils éliminent tous les imposteurs | +3 pts par civil survivant |
| Undercover gagnent (majorité) | +4 pts par UC survivant |
| Mr. White survit avec les UC | +2 pts |
| Mr. White devine le mot civil | +5 pts |

---

## Base de mots

**816 paires** réparties en **48 catégories** :

| Groupe | Catégories |
|---|---|
| Originales | `Cinéma` · `Séries` · `Jeux vidéo` · `Musique` · `Nourriture` · `Sport` · `Culture` · `Tech` · `Personnages` · `Marques` · `Divers` · `Animaux` · `Contes` · `École` |
| Gastronomie | `Fromages` · `Épices` · `Cocktails` · `Vins` · `Petit-déjeuner` |
| Fantastique | `Monstres` · `Espace` · `Dinosaures` · `Superpouvoirs` · `Magie` |
| Quotidien | `Objets` · `Métiers` · `Corps` |
| Tech & Culture | `Informatique` · `Applis` · `Jeux de société` · `Voitures` · `Emojis` |
| Arts & Histoire | `Danse` · `Instruments` · `Architecture` · `Époques` |
| Sensations | `Couleurs` · `Matières` · `Phobies` · `Géographie` |
| Lifestyle | `Mode` · `Nature` |
| Quotidien élargi | `Transports` · `Outils` · `Météo` |
| Plaisirs & imaginaire | `Desserts` · `Fêtes` · `Mythologie` |

Les paires jouées ne se répètent pas avant épuisement complet du pool (ou du pool filtré en Mode Enfant / filtre catégories).

**691 paires** sont marquées *kid-safe*. Trois catégories (`Cocktails`, `Vins`, `Phobies`) n'en contiennent aucune : elles apparaissent barrées et non sélectionnables lorsque le Mode Enfant est actif. Le Mode Enfant n'est jamais contourné, même si le filtre de catégories vide le pool.

---

## Fonctionnalités

- **Multi-appareils** — QR code, code de salle à 6 caractères, lobby live, reconnexion automatique après verrouillage du téléphone, reprise de la salle après rechargement de l'hôte
- **Indices écrits** *(multi-appareils)* — chacun tape son indice sur son téléphone : la partie garde une trace de ce qui a été dit, et **prononcer son propre mot élimine sur-le-champ**. Option désactivable ; sans écran individuel, taper son indice le montrerait à tout le monde
- **Vote secret** — chacun vote sur son écran, dépouillement animé, revote en cas d'égalité, option « vote à découvert » montrant qui a voté pour qui
- **Options persistantes** — nombre de joueurs, noms, timer, modes et filtres restaurés au rechargement
- **Filtre de catégories** — active/désactive chacune des 48 catégories, avec le nombre de paires par catégorie et la taille du pool résultant
- **Ordre de parole** — affiché pendant le débat ; tap sur un nom pour le cocher (a parlé) ; bouton pour tout décocher
- **Timer** — countdown configurable, bouton de relance si expiré, alerte sonore + vibration à l'expiration ; animation urgente sous 10s
- **Sons & vibrations** — Web Audio API (zéro fichier audio), vibrations sur toutes les transitions clés
- **Historique** — consultable pendant le débat et dans les récapitulatifs
- **Hall of Fame** — scores cumulés en `localStorage`, top 10 persistant, détail des victoires par rôle (👤 🕵️ 🤍)
- **Partage** — partage natif du récapitulatif (`navigator.share`), presse-papiers en secours
- **Splash screen** — boot log animé au premier chargement
- **Bouton Abandonner** — disponible pendant le débat (avec confirmation modale)
- **PWA** — installable sur mobile, fonctionne hors-ligne sur HTTPS

---

## Phases de jeu

**Un seul téléphone**
```
splash → setup → handoff → reveal → playing → vote → turn_recap → game_over
                                               ↗ mrwhite_guess ↗
```

**Chacun son téléphone** — `handoff` et `reveal` disparaissent, un dépouillement s'intercale
```
splash → lobby → setup → playing → vote → vote_result → turn_recap → game_over
                            ↑                              ↓
                            └──────────────────────────────┘
                                    ↗ mrwhite_guess ↗
```

| Phase | Description |
|---|---|
| `setup` | Configuration de la partie |
| `handoff` | Passage du téléphone au joueur suivant |
| `reveal` | Le joueur découvre son mot en privé |
| `playing` | Débat + timer + ordre de parole |
| `vote` | Élimination par vote (ou vote nul) |
| `mrwhite_guess` | Mr. White tente de deviner le mot civil |
| `turn_recap` | Révélation du rôle éliminé + scores + historique |
| `game_over` | Classement final + Hall of Fame + partage |

---

## Structure du projet

```
uc-game/
├── index.html         # Shell HTML
├── app.js             # DB + logique de jeu (vanilla JS)
├── net.js             # Façade réseau NET + protocole + session hôte
├── net-peerjs.js      # Adaptateur WebRTC (seul fichier utilisant PeerJS)
├── client.js          # État et écrans du joueur distant
├── qr.js              # Peinture du QR code dans un canvas
├── style.css          # Thème cyberpunk Night City
├── manifest.json      # PWA manifest
├── sw.js              # Service worker (stale-while-revalidate)
├── vendor/
│   ├── peerjs.min.js  # PeerJS 1.5.5 (MIT)
│   └── qrcode.js      # qrcode-generator 1.4.4 (MIT)
└── icons/
    └── icon.svg       # Icône PWA
```

**Pas de build, pas de Node, pas de bundler.** Les deux bibliothèques tierces sont commitées dans `vendor/` : un `git pull` suffit à déployer. PeerJS n'est chargé qu'au moment où l'on choisit le multi-appareils, le mode solo ne paie pas ses 90 Ko.

### Content-Security-Policy

Si ton serveur envoie une CSP, elle doit autoriser le serveur d'annuaire PeerJS, **sinon le multi-appareils reste bloqué sur « ouverture de la salle »** — le navigateur coupe la connexion avant que la bibliothèque ne puisse réagir, donc aucune erreur ne remonte au jeu.

| Directive | À autoriser | Pourquoi |
|---|---|---|
| `connect-src` | `https://0.peerjs.com wss://0.peerjs.com` | **Indispensable** — signaling PeerJS |
| `connect-src` | `stun: turn:` | Relais pour les réseaux à NAT symétrique (4G) |
| `style-src-elem` | `https://fonts.googleapis.com` | Polices Orbitron / Rajdhani |
| `font-src` | `https://fonts.gstatic.com` | Fichiers de polices |
| `script-src` | `'unsafe-inline'` | Le jeu utilise des `onclick=` en attribut |

CSP minimale pour le jeu :

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self' https://0.peerjs.com wss://0.peerjs.com stun: turn:;
worker-src 'self'; manifest-src 'self';
```

Le mieux est d'isoler le jeu dans son propre `location`, pour que le reste du site garde sa CSP stricte.

> ⚠️ **Piège nginx** — les `add_header` ne sont **pas hérités** dans un `location` qui déclare les siens : nginx remplace la liste entière au lieu de la compléter. Tous les en-têtes du `server` doivent y être répétés, faute de quoi HSTS et consorts disparaissent silencieusement sur ce chemin.

> **Permissions-Policy** — un `vibrate=()` désactive tout le retour haptique du jeu, qui vibre à chaque transition clé. À retirer pour le chemin du jeu.

> Pour se passer entièrement de Google Fonts, héberger les deux polices en local et retirer les `<link>` correspondants d'`index.html` : seule la ligne `connect-src` reste alors nécessaire.

En cas de doute, ouvrir **`diag.html`** : elle détecte et nomme les violations CSP.

### Architecture réseau

L'hôte fait autorité : l'état complet vit sur son téléphone, les clients sont des terminaux passifs qui reçoivent des **snapshots complets** (jamais des deltas — la reconnexion emprunte ainsi le même chemin de code que le fonctionnement normal).

Toute la logique de jeu ne parle qu'à la façade `NET` ; `net-peerjs.js` est le seul fichier qui mentionne PeerJS. Un adaptateur Supabase peut être ajouté sans toucher `app.js` ni `client.js`.

**Confidentialité** — un client ne reçoit que `word` et `isMrWhite`, jamais son `role` : lui dire qu'il est « undercover » lui révélerait son camp, ce que l'écran de révélation mono-téléphone se garde bien de faire. Une seule fonction, `snapshot()`, produit les données diffusées, et n'expose les rôles qu'une fois les joueurs éliminés.

**Limites assumées** — 12 joueurs maximum en multi (l'hôte tient N−1 connexions, c'est lourd sur mobile ; le solo garde 20). Si le téléphone de l'hôte meurt définitivement, la partie est perdue : il n'y a pas de migration d'hôte, car répliquer la table des rôles sur un appareil de secours détruirait la confidentialité.

**Traversée de NAT** — PeerJS 1.5 embarque par défaut un STUN Google **et deux relais TURN** (`eu-0`/`us-0.turn.peerjs.com`). Les réseaux mobiles à NAT symétrique, qui bloqueraient une connexion purement STUN, passent donc par ces relais sans configuration. Ce sont des serveurs publics gratuits, sans garantie de disponibilité : pour une fiabilité contractuelle, fournir ses propres `iceServers`.

---

## Compatibilité

Navigateurs modernes (Chrome, Firefox, Safari, Edge). Optimisé mobile (écran unique, tactile, `user-scalable=no`).

## Licence

Projet personnel — libre d'utilisation et de modification.
