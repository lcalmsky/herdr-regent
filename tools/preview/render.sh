#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
APP="/Applications/Herdr.app"
KEEP=0
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if ! CONSOLE="$(ioreg -n Root -d1 -a)" || [ -z "$CONSOLE" ]; then
  echo "Could not read the console session state (ioreg failed); not rendering blind." >&2
  exit 3
fi
if printf '%s' "$CONSOLE" | grep -c CGSSessionScreenIsLocked >/dev/null; then
  echo "The screen is locked. A hidden Herdr window draws nothing while it is; unlock and run again." >&2
  exit 3
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/rgprev-work.XXXXXX")"
LINK="/tmp/rgprev-$$"
ln -sfn "$WORK" "$LINK"

BEFORE=()
while IFS= read -r pid; do
  [ -n "$pid" ] && BEFORE+=("$pid")
done < <(pgrep -x Herdr || true)

kill_new() {
  local pid old
  for pid in $(pgrep -x Herdr || true); do
    for old in ${BEFORE[@]+"${BEFORE[@]}"}; do
      if [ "$pid" = "$old" ]; then
        continue 2
      fi
    done
    kill "$pid" 2>/dev/null || true
  done
}

cleanup() {
  kill_new
  if [ "$KEEP" = "1" ]; then
    echo "work dir kept: $WORK (link: $LINK)" >&2
  else
    rm -rf "$WORK" "$LINK"
  fi
}
trap cleanup EXIT

rsync -a --exclude herdr-app.sock --exclude 'mods/regent' --exclude 'layouts/regent.*' "$SRC/" "$WORK/"
mkdir -p "$WORK/mods" "$WORK/layouts"
rsync -a --exclude tests "$ROOT/mods/regent/" "$WORK/mods/regent/"
cp "$ROOT/tools/preview/source.demo.js" "$WORK/mods/regent/source.js"
rsync -a "$ROOT/tools/preview/mods/regent-demo-term/" "$WORK/mods/regent-demo-term/"

python3 - "$ROOT/layouts/regent.json" "$WORK/layouts/regent.json" <<'PY'
import json, sys

src, dst = sys.argv[1], sys.argv[2]
with open(src) as f:
    layout = json.load(f)


def walk(node):
    if node.get("id") == "main":
        block = {"id": "main", "type": node.get("type", "block")}
        if "size" in node:
            block["size"] = node["size"]
        block["content"] = {"mod": "regent-demo-term"}
        return block
    if "children" in node:
        node["children"] = [walk(child) for child in node["children"]]
    return node


with open(dst, "w") as f:
    json.dump(walk(layout), f, indent=2)
PY

python3 - "$WORK/shared.json" <<'PY'
import json, os, sys

path = sys.argv[1]
data = {}
if os.path.exists(path):
    try:
        with open(path) as f:
            data = json.load(f)
    except ValueError:
        data = {}
if not isinstance(data, dict):
    data = {}
data = {k: v for k, v in data.items() if not k.startswith("regent.")}
data["layout"] = "regent"
with open(path, "w") as f:
    json.dump(data, f, indent=2)
PY

python3 - "$SRC/window.json" "$WORK/window.json" <<'PY'
import json, os, sys

src, dst = sys.argv[1], sys.argv[2]
out = {"state": "windowed", "bounds": [0.0, 30.0, 1600.0, 1000.0]}
if os.path.exists(src):
    try:
        with open(src) as f:
            old = json.load(f)
    except ValueError:
        old = {}
    if isinstance(old, dict) and "display" in old:
        out["display"] = old["display"]
with open(dst, "w") as f:
    json.dump(out, f, indent=2)
PY

open -n -g -j --env HERDR_APP_HOME="$LINK" -a "$APP"
sleep "${WAIT:-3}"
HERDR_APP_HOME="$LINK" herdr-app shot "$WORK/shot.png"
kill_new

ffmpeg -v error -y -i "$WORK/shot.png" -vf scale=2560:1600:flags=lanczos "$WORK/preview.png"
ffmpeg -v error -y -i "$WORK/shot.png" -vf scale=640:400:flags=lanczos "$WORK/regent.png"
mv "$WORK/preview.png" "$ROOT/preview.png"
mv "$WORK/regent.png" "$ROOT/layouts/regent.png"

echo "$ROOT/preview.png"
echo "$ROOT/layouts/regent.png"
sips -g pixelWidth -g pixelHeight "$ROOT/preview.png" "$ROOT/layouts/regent.png"
