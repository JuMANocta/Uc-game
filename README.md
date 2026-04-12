# UNDERCOVER — Night City Edition

Jeu de société **Undercover** en version navigateur, thème cyberpunk. Aucune installation, aucune dépendance : ouvrez `index.html` et jouez.

## Principe du jeu

Chaque joueur reçoit secrètement un mot. La plupart des joueurs ont le **même mot (civils)**, mais quelques-uns ont un **mot proche mais différent (Undercover)**, et éventuellement un joueur n'a **aucun mot (Mr. White)**.

À tour de rôle, chaque joueur donne un indice sur son mot sans le révéler. Après la discussion, le groupe vote pour éliminer le suspect numéro un. Les civils gagnent en éliminant tous les imposteurs ; les imposteurs gagnent en survivant assez longtemps.

### Rôles

| Rôle | Icône | Mot reçu | Condition de victoire |
|---|---|---|---|
| Civil | 👤 | Mot civil | Éliminer tous les imposteurs |
| Undercover | 🕵️ | Mot undercover (proche du civil) | Survivre jusqu'à être en majorité |
| Mr. White | 🤍 | Aucun | Survivre ET deviner le mot civil lors de son élimination |

## Lancer le jeu

```bash
# Cloner le dépôt
git clone https://github.com/jumanocta/uc-game.git
cd uc-game

# Ouvrir dans le navigateur (pas de serveur requis)
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

Ou simplement double-cliquer sur `index.html`.

## Configuration d'une partie

1. **Joueurs** : de 3 à 20 (stepper +/-)
2. **Noms** : saisir un prénom par joueur (optionnel)
3. **Undercover** : choisir le nombre d'imposteurs via le slider
4. **Options** :
   - Activer / désactiver Mr. White
   - Afficher / masquer la catégorie du mot

## Système de points

| Événement | Points |
|---|---|
| Civil élimine un imposteur | +1 pt par civil survivant |
| Civils éliminent tous les imposteurs | +3 pts par civil survivant |
| Undercover gagnent (majorité) | +4 pts par UC survivant |
| Mr. White survit avec les UC | +2 pts |
| Mr. White devine le mot civil | +5 pts |

## Catégories de mots

Le jeu contient **~500 paires de mots** réparties en 13 catégories :

`Cinéma` · `Séries` · `Jeux vidéo` · `Musique` · `Nourriture` · `Sport` · `Culture` · `Tech` · `Personnages` · `Marques` · `Divers`

Les paires déjà jouées ne se répètent pas avant épuisement complet du pool.

## Structure du projet

```
uc-game/
├── index.html   # Shell HTML (point d'entrée)
├── app.js       # Logique de jeu complète (vanilla JS)
└── style.css    # Thème cyberpunk Night City
```

**Aucune dépendance** — pas de Node, pas de bundler, pas de framework.

## Phases de jeu

```
setup → handoff → reveal → playing → vote → turn_recap → game_over
```

1. **setup** : configuration de la partie
2. **handoff** : passage du téléphone au joueur suivant
3. **reveal** : le joueur découvre son mot en privé
4. **playing** : discussion collective
5. **vote** : élimination par vote
6. **turn_recap** : révélation du rôle de l'éliminé + scores
7. **game_over** : écran de fin avec classement complet

## Compatibilité

Fonctionne dans tout navigateur moderne (Chrome, Firefox, Safari, Edge). Optimisé mobile (écran unique, tactile).

## Licence

Projet personnel — libre d'utilisation et de modification.
