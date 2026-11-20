#!/bin/bash
# Usage: tools/android/make-icons.sh
# Draws the app icon (tools/android/art/icon.html) and writes every size Android needs
# into android/app/src/main/res/mipmap-*, plus store/android/icon-512.png for the Play
# listing. Run it from WSL: it needs python3 and Windows Chrome. It serves the folder
# itself for the moment it takes (PORT=8769 unless you set another).
cd "$(dirname "$0")/../.." || exit 1
PORT="${PORT:-8769}"
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null' EXIT
sleep 1
RUN="mer_$$_$RANDOM"
WIN_DIR='C:\Users\Public\mer_runs'
mkdir -p /mnt/c/Users/Public/mer_runs
"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --user-data-dir="$WIN_DIR\\$RUN" \
  --window-size=1280,720 --virtual-time-budget=4000 --dump-dom "http://localhost:$PORT/tools/android/art/icon.html" 2>/dev/null \
  | python3 -c '
import sys, re, json, base64, html, os
m = re.search(r"<pre id=\"icons\">([^<]*)", sys.stdin.read())
if not m: sys.exit("make-icons: the icon page produced nothing (is Windows Chrome installed, and is the port free?)")
for path, url in json.loads(html.unescape(m.group(1))).items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(base64.b64decode(url.split(",", 1)[1]))
    print(path)
'
rm -rf "/mnt/c/Users/Public/mer_runs/$RUN"
