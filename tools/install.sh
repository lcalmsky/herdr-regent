#!/bin/sh
# Copies the regent layout and mod into the Herdr home, merges the layout's keys, and checks the mod.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
HOME_DIR=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
mkdir -p "$HOME_DIR/layouts" "$HOME_DIR/mods"
cp "$REPO/layouts/regent.json" "$HOME_DIR/layouts/"
if [ -f "$REPO/layouts/regent.png" ]; then
  cp "$REPO/layouts/regent.png" "$HOME_DIR/layouts/"
fi
TARGET="$HOME_DIR/mods/regent"
if [ -L "$TARGET" ] && [ "$(cd "$TARGET" && pwd -P)" = "$(cd "$REPO/mods/regent" && pwd -P)" ]; then
  :
else
  mkdir -p "$TARGET"
  cp -R "$REPO/mods/regent/." "$TARGET/"
fi
python3 -I "$REPO/tools/merge-keys.py" "$HOME_DIR/keys.json" "$REPO/layouts/regent.keys.json"
herdr-app check "$TARGET"
