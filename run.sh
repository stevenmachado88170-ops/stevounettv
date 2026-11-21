#!/usr/bin/env bash
# Lance Salon. Si Electron échoue tout de suite (sandbox refusée : AppArmor, espaces de noms utilisateur désactivés…),
# relance automatiquement sans sandbox.
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1
[ -d "$HOME/.local/share/salon-node/bin" ] && export PATH="$HOME/.local/share/salon-node/bin:$PATH"
E="$DIR/node_modules/.bin/electron"
if [ ! -x "$E" ]; then echo "Salon : dépendances absentes, lance d'abord ./install.sh" >&2; exit 1; fi
start=$(date +%s)
"$E" "$DIR" "$@"; rc=$?
now=$(date +%s)
if [ "$rc" -ne 0 ] && [ $((now-start)) -lt 6 ]; then
  echo "Salon : démarrage immédiat en erreur ($rc), nouvel essai sans sandbox" >&2
  exec "$E" "$DIR" --no-sandbox "$@"
fi
exit "$rc"
