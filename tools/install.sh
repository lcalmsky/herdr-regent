#!/bin/sh
# Copies the regent layout and mod into the Herdr home, merges the layout's keys, and checks the mod.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
HOME_DIR=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
SHARED=${HERDR_SHARED:-$HOME/git-repo/herdr-shared}
SHARED_HOME=${HERDR_SHARED_HOME:-$HOME/.local/share/herdr-shared}
mkdir -p "$HOME_DIR/layouts" "$HOME_DIR/mods"
cp "$REPO/layouts/regent.json" "$HOME_DIR/layouts/"
if [ -f "$REPO/layouts/regent.png" ]; then
  cp "$REPO/layouts/regent.png" "$HOME_DIR/layouts/"
fi
TARGET="$HOME_DIR/mods/regent"
if [ -L "$TARGET" ] && [ "$(cd "$TARGET" && pwd -P)" = "$(cd "$REPO/mods/regent" && pwd -P)" ]; then
  :
else
  # The copy below must write real files: a link into the shared home from the last install
  # would be written through. The link step below puts the links back.
  if [ -d "$TARGET" ] && [ ! -L "$TARGET" ]; then
    find "$TARGET" -maxdepth 1 -type l -lname "$SHARED_HOME/*" -exec rm -f {} +
  fi
  mkdir -p "$TARGET"
  cp -R "$REPO/mods/regent/." "$TARGET/"
fi
# The installed mod is often a symlink to this repo's own mods/regent; linking there would turn the
# repo's files into links, so only a separately copied install is linked.
if [ -x "$SHARED/tools/link-installed.sh" ] && [ -d "$SHARED_HOME" ]; then
  case "$(cd "$TARGET" && pwd -P)/" in
    "$(cd "$REPO" && pwd -P)/"*) ;;
    *) "$SHARED/tools/link-installed.sh" "$TARGET" ;;
  esac
fi
python3 -I "$REPO/tools/merge-keys.py" "$HOME_DIR/keys.json" "$REPO/layouts/regent.keys.json" --backup-tag regent
herdr-app check "$TARGET"
