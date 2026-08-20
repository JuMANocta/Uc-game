#!/bin/sh
# Lance les quinze bancs d'essai. Aucune dépendance : node suffit.
#
#   ./tests/run.sh          toutes les suites
#   ./tests/run.sh t-p13    une seule, avec son détail
#
# Le projet n'a ni build ni gestionnaire de paquets, et ces suites n'en
# introduisent pas : chacune charge les fichiers du jeu avec eval() dans un
# faux DOM, branche un adaptateur réseau factice, et pilote l'horloge. Aucun
# navigateur, aucun WebRTC, aucun réseau — donc rien à installer et un
# résultat déterministe.
set -e
cd "$(dirname "$0")"

if [ -n "$1" ]; then
  exec node "$1.js"
fi

fails=0
for f in t-p*.js; do
  out=$(node "$f" 2>&1) || true
  last=$(printf '%s' "$out" | tail -1)
  if [ "$last" = "✓ tout passe" ]; then
    n=$(printf '%s' "$out" | grep -c '✓' || true)
    printf '  ✓ %-10s %s assertions\n' "${f%.js}" "$((n - 1))"
  else
    printf '  ✗ %-10s\n' "${f%.js}"
    printf '%s\n' "$out" | grep '✗' | sed 's/^/      /'
    fails=$((fails + 1))
  fi
done

echo
if [ "$fails" -eq 0 ]; then
  echo "Tout passe."
else
  echo "$fails suite(s) en échec."
  exit 1
fi
