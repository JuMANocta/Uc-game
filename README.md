# UNDERCOVER — Night City Edition

Jeu de société **Undercover** en version navigateur, thème cyberpunk "Night City". Aucune installation, aucune dépendance : ouvrez `index.html` et jouez.

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
| **Undercover** | Nombre d'imposteurs via slider |
| **Mr. White** | Active le rôle sans mot |
| **Catégorie** | Affiche ou masque la thématique du mot |
| **Timer débat** | Off · 1min · 2min · 3min · 5min |
| **Vote nul** | Permet de passer un tour sans élimination |
| **Mode nuit** | Masque le compteur d'imposteurs et les rôles éliminés pendant le débat |
| **Mode Enfant 🧒** | Filtre les mots adultes (~520 paires kid-safe sur 704) |

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

**704 paires** réparties en **40 catégories** :

| Groupe | Catégories |
|---|---|
| Originales | `Cinéma` · `Séries` · `Jeux vidéo` · `Musique` · `Nourriture` · `Sport` · `Culture` · `Tech` · `Personnages` · `Marques` · `Divers` · `Animaux` · `Contes` · `École` |
| Gastronomie | `Fromages` · `Épices` · `Cocktails` · `Vins` · `Petit-déjeuner` |
| Fantastique | `Monstres` · `Espace` · `Dinosaures` · `Superpouvoirs` · `Magie` |
| Quotidien | `Objets` · `Métiers` · `Corps` |
| Tech & Culture | `Informatique` · `Applis` · `Jeux de société` · `Voitures` · `Emojis` |
| Arts & Histoire | `Danse` · `Instruments` · `Architecture` · `Époques` |
| Sensations | `Couleurs` · `Matières` · `Phobies` · `Géographie` |

Les paires jouées ne se répètent pas avant épuisement complet du pool (ou du pool filtré en Mode Enfant, ~520 paires).

---

## Fonctionnalités

- **Ordre de parole** — affiché pendant le débat ; tap sur un nom pour le cocher (a parlé)
- **Timer** — countdown configurable, alerte sonore + vibration à l'expiration
- **Sons & vibrations** — Web Audio API (zéro fichier audio), vibrations sur toutes les transitions clés
- **Historique** — consultable pendant le débat et dans les récapitulatifs
- **Hall of Fame** — scores cumulés en `localStorage`, top 10 persistant entre les parties
- **Splash screen** — boot log animé au premier chargement
- **Bouton Abandonner** — disponible pendant le débat (avec confirmation)
- **PWA** — installable sur mobile, fonctionne hors-ligne sur HTTPS

---

## Phases de jeu

```
splash → setup → handoff → reveal → playing → vote → turn_recap → game_over
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
| `game_over` | Classement final + Hall of Fame |

---

## Structure du projet

```
uc-game/
├── index.html       # Shell HTML
├── app.js           # DB + logique complète (vanilla JS)
├── style.css        # Thème cyberpunk Night City
├── manifest.json    # PWA manifest
├── sw.js            # Service worker (cache-first)
└── icons/
    └── icon.svg     # Icône PWA
```

**Aucune dépendance** — pas de Node, pas de bundler, pas de framework.

---

## Compatibilité

Navigateurs modernes (Chrome, Firefox, Safari, Edge). Optimisé mobile (écran unique, tactile, `user-scalable=no`).

## Licence

Projet personnel — libre d'utilisation et de modification.
