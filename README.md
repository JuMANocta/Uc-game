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
| **Undercover** | Nombre d'imposteurs via slider (auto-équilibré à 1/3 des joueurs) |
| **Mr. White** | Active le rôle sans mot |
| **Catégorie** | Affiche ou masque la thématique du mot |
| **Timer débat** | Off · 1min · 2min · 3min · 5min |
| **Vote nul** | Permet de passer un tour sans élimination |
| **Mode nuit** | Masque le compteur d'imposteurs et les rôles éliminés pendant le débat |
| **Mode Enfant 🧒** | Filtre les mots adultes (614 paires kid-safe sur 39 catégories) |
| **Filtre catégories** | Active/désactive individuellement chacune des 42 catégories, avec compteur de paires |

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

**744 paires** réparties en **42 catégories** :

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

Les paires jouées ne se répètent pas avant épuisement complet du pool (ou du pool filtré en Mode Enfant / filtre catégories).

**614 paires** sont marquées *kid-safe*. Trois catégories (`Cocktails`, `Vins`, `Phobies`) n'en contiennent aucune : elles apparaissent barrées et non sélectionnables lorsque le Mode Enfant est actif. Le Mode Enfant n'est jamais contourné, même si le filtre de catégories vide le pool.

---

## Fonctionnalités

- **Options persistantes** — nombre de joueurs, noms, timer, modes et filtres restaurés au rechargement
- **Filtre de catégories** — active/désactive chacune des 42 catégories, avec le nombre de paires par catégorie et la taille du pool résultant
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
| `game_over` | Classement final + Hall of Fame + partage |

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
