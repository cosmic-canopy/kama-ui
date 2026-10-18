#!/usr/bin/env bash
# test-web.sh — the browser half of the gate: build tests/ for the web (emcc), serve it, open it in a HEADLESS browser,
# and wait for the page to report. The same program as tools/test.sh — the rewriter, the pad's presses and the seam
# suite — against the DOM backend: real elements, a click injected through the browser's own hit test
# (document.elementFromPoint + a bubbling MouseEvent), the focus ring, controls, a rewrite, the image rewrite.
#
# The verdict comes back over HTTP (tests/web/kama_ui_test.js POSTs it to tools/web-test-server.py), so nothing reads a
# screenshot or a DOM dump.
#
#   KAMA     the kama compiler                       (default: kama on the PATH)
#   EMSDK    an activated emsdk                      (default: ~/emsdk; skipped when emcc is already on the PATH)
#   BROWSER  firefox | chrome-family binary          (default: the first of firefox, chromium, google-chrome found)
#   PORT     the local port                          (default: 18765)
#
# ⚠️ Brave 144 (Chromium 144) on Ubuntu 24.04 hangs with --headless here, even on a one-line page (measured
# 2026-10-13); Firefox 157 --headless runs it. Hence Firefox first.
set -euo pipefail
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
KAMA=${KAMA:-kama}
PORT=${PORT:-18765}
cd "$ROOT"

if ! command -v emcc >/dev/null 2>&1; then
    EMSDK=${EMSDK:-$HOME/emsdk}
    [ -f "$EMSDK/emsdk_env.sh" ] || { echo "test-web.sh: no emcc on the PATH and no $EMSDK/emsdk_env.sh" >&2; exit 1; }
    . "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
fi

if [ -z "${BROWSER:-}" ]; then
    for b in firefox chromium chromium-browser google-chrome; do
        if command -v "$b" >/dev/null 2>&1; then BROWSER=$b; break; fi
    done
fi
[ -n "${BROWSER:-}" ] || { echo "test-web.sh: no browser found — set BROWSER" >&2; exit 1; }

out="$ROOT/out/web-test"
rm -rf "$out"
mkdir -p "$out/profile"
# Let the page close its own window once it has reported, which ends a headless Firefox cleanly.
printf 'user_pref("dom.allow_scripts_to_close_windows", true);\n' > "$out/profile/user.js"
"$KAMA" pkg install tests/kama.json >/dev/null
"$KAMA" build tests/kama.json --target WASM -o "$out/tests.html"
# The media suite's clip (0.5.0) is fetched by the browser as any `<video src>` is: served beside the page.
cp "$ROOT/tests/fixtures/clip.webm" "$out/clip.webm"

python3 -I "$ROOT/tools/web-test-server.py" "$out" "$PORT" 120 &
server=$!
sleep 1
url="http://127.0.0.1:$PORT/tests.html"
case "$(basename "$BROWSER")" in
    firefox*) setsid "$BROWSER" --headless --no-remote --new-instance --profile "$out/profile" "$url" >"$out/browser.log" 2>&1 & ;;
    *)        setsid "$BROWSER" --headless=new --disable-gpu --no-first-run --user-data-dir="$out/profile" "$url" >"$out/browser.log" 2>&1 & ;;
esac
browser=$!

status=0
wait "$server" || status=$?

# The browser should have closed itself; if not, stop it. ⚠️ A SNAP Firefox (Ubuntu's) runs in its own systemd scope,
# outside our process group, and refuses signals from outside its confinement ("Permission denied") — so a process still
# holding our profile is stopped through its scope, and anything else is killed.
sleep 2
kill -TERM -- "-$browser" 2>/dev/null || true
for pid in $(pgrep -f -- "$out/profile" || true); do
    scope=$(sed -n 's|^0::.*/||p' "/proc/$pid/cgroup" 2>/dev/null || true)
    case "$scope" in
        snap.*.scope) systemctl --user stop "$scope" 2>/dev/null || true ;;
        *)            kill -KILL "$pid" 2>/dev/null || true ;;
    esac
done

if [ "$status" -ne 0 ]; then
    echo "test-web.sh: FAILED (server exit $status; the browser's log is $out/browser.log)" >&2
    exit 1
fi
echo "test-web.sh: OK ($BROWSER)"
