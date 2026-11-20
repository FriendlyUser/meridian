#!/bin/bash
# Usage: tools/android/store-shots.sh [--preview] [name ...]
#
# Takes the Google Play listing pictures and writes them to store/android/:
#   screenshots/NN-<name>.jpg   1080 x 1920 (9:16), the phone slot
#   tablet/NN-<name>.jpg        1920 x 1080 (16:9), for the 7-inch and 10-inch slots
#   feature-graphic.jpg         1024 x 500
# With names, only those shots are retaken; --preview writes small phone shots to
# store/android/preview/ for a quick look. Run it from WSL: it needs python3 and
# Windows Chrome, and serves the folder itself while it works (PORT=8769 unless set).
#
# Every shot is the app opened on its made-up workspace (index.html?demo, see
# src/core/seed.js), so nothing here depends on what is stored on this machine.
cd "$(dirname "$0")/../.." || exit 1

# name | page | which sets it belongs to (p phone, t tablet)
SHOTS=(
  "01-today|index.html?demo#/today|pt"
  "02-tasks|index.html?demo#/tasks|p"
  "02-board|index.html?demo&tasks=board#/tasks|t"
  "03-matrix|index.html?demo&tasks=matrix#/tasks|p"
  "04-calendar|index.html?demo#/calendar|pt"
  "05-notes|index.html?demo#/notes|pt"
  "06-habits|index.html?demo#/habits|pt"
  "07-focus|index.html?demo&timer=run#/focus|pt"
  "08-progress|index.html?demo#/progress|pt"
)
WAIT=5000

PREVIEW=0
[[ "$1" == "--preview" ]] && { PREVIEW=1; shift; }
PORT="${PORT:-8769}"
CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
WIN_DIR='C:\Users\Public\mer_runs'
LIN_DIR=/mnt/c/Users/Public/mer_runs
mkdir -p "$LIN_DIR" store/android/screenshots store/android/tablet store/android/preview

python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null' EXIT
sleep 1

# take <name> <url> <layout W,H> <scale> <out WxH> <out file>
take() {
  local name="$1" url="$2" layout="$3" scale="$4" out="$5" file="$6" run="mer_$$_$RANDOM"
  "$CHROME" --headless=new --user-data-dir="$WIN_DIR\\$run" --window-size="$layout" --force-device-scale-factor="$scale" \
    --hide-scrollbars --virtual-time-budget="$WAIT" --run-all-compositor-stages-before-draw --screenshot="$WIN_DIR\\$run.png" \
    "http://localhost:$PORT/$url" >/dev/null 2>&1
  [[ -s "$LIN_DIR/$run.png" ]] || { echo "store-shots: $name produced no picture" >&2; rm -rf "$LIN_DIR/$run"; return 1; }
  # The page can only read pictures this server serves: park the PNG in the repo for a moment.
  local tmp="store/android/.$run.png"
  cp "$LIN_DIR/$run.png" "$tmp"
  "$CHROME" --headless=new --user-data-dir="$WIN_DIR\\$run" --virtual-time-budget=6000 \
    --dump-dom "http://localhost:$PORT/tools/android/art/to-jpeg.html?src=/$tmp&w=${out%x*}&h=${out#*x}&q=0.93" 2>/dev/null \
    | python3 -c '
import sys, re, base64
m = re.search(r"<pre id=\"jpeg\" data-size=\"([^\"]*)\">([^<]*)", sys.stdin.read())
if not m: sys.exit("store-shots: could not convert " + sys.argv[1])
data = base64.b64decode(m.group(2).split(",", 1)[1])
open(sys.argv[1], "wb").write(data)
print("%s  (%s captured, %d kB)" % (sys.argv[1], m.group(1), len(data) // 1024))
' "$file"
  rm -rf "$tmp" "$LIN_DIR/$run" "$LIN_DIR/$run.png"
}

wanted() { [[ $# -eq 1 ]] && return 0; local n="$1"; shift; for w in "$@"; do [[ "$n" == *"$w"* ]] && return 0; done; return 1; }

# Three browsers at a time. Wait for those jobs by name: a bare `wait` would also wait
# for the web server, which never ends.
pids=()
drain() { (( ${#pids[@]} )) && wait "${pids[@]}"; pids=(); }
launch() { "$@" & pids+=("$!"); if (( ${#pids[@]} >= 3 )); then drain; fi; }

for spec in "${SHOTS[@]}"; do
  IFS='|' read -r name url sets <<< "$spec"
  wanted "$name" "$@" || continue
  if [[ $PREVIEW == 1 ]]; then
    [[ "$sets" == *p* ]] && launch take "$name" "$url" 540,960 1 540x960 "store/android/preview/$name.jpg"
    continue
  fi
  # A phone held upright lays the app out 540 x 960; at 2 device pixels each that is 1080 x 1920.
  [[ "$sets" == *p* ]] && launch take "$name" "$url" 540,960 2 1080x1920 "store/android/screenshots/$name.jpg"
  # A tablet on its side gets the wide layout, 1280 x 720 at 1.5.
  [[ "$sets" == *t* ]] && launch take "$name" "$url" 1280,720 1.5 1920x1080 "store/android/tablet/$name.jpg"
done
if [[ $PREVIEW == 0 ]] && wanted feature-graphic "$@"; then
  launch take feature-graphic tools/android/art/feature.html 1024,500 2 1024x500 store/android/feature-graphic.jpg
fi
drain
