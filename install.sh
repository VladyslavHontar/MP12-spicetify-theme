#!/bin/sh
# Installs the MP12 extensions into Spicetify. `./install.sh remove` undoes it.
set -e
cd "$(dirname "$0")"

command -v spicetify >/dev/null 2>&1 || {
  echo "Spicetify not found. Install it first: https://spicetify.app/docs/getting-started" >&2
  exit 1
}

dir="$(dirname "$(spicetify -c)")/Extensions"
exts="wmpotify-compat.js wmpotify-skin.js"

if [ "$1" = "remove" ]; then
  for f in $exts; do
    spicetify config extensions "$f-" >/dev/null
    rm -f "$dir/$f"
  done
else
  mkdir -p "$dir"
  for f in $exts; do
    cp "extensions/$f" "$dir/$f"
    spicetify config extensions "$f" >/dev/null
  done
fi

spicetify apply || spicetify backup apply
echo "Done. Restart Spotify."
