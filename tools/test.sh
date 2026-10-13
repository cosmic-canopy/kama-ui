#!/bin/sh
# test.sh — build the package's tests (tests/, one program) natively, debug and release, and run them: the RML -> HTML
# rewriter, the pad's presses, and the seam suite against the native UiContext (RmlUi, through @kama/rmlui). `kama` is
# taken from $KAMA or the PATH. Runs from the package root, which tests/kama.json's `-L` paths and the suite's
# fixture and font paths are relative to.
#
# Needs @kama/rmlui beside this repository (../kama-rmlui), fetched and built:
#   (cd ../kama-rmlui && tools/fetch-rmlui.sh && tools/fetch-freetype.sh && make -C native)
# The browser half is tools/test-web.sh.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
KAMA=${KAMA:-kama}
cd "$ROOT"
PLAT=$(tools/platform)
TARGET=$(tools/platform target)
[ -f "../kama-rmlui/native/build/$PLAT/lib/librmlui.a" ] || {
    echo "test.sh: no ../kama-rmlui/native/build/$PLAT/lib/librmlui.a — build @kama/rmlui first (see the top of this file)" >&2
    exit 1
}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

"$KAMA" pkg install tests/kama.json >/dev/null
for mode in --debug --release; do
    "$KAMA" build tests/kama.json --target "$TARGET" $mode -o "$tmp/tests$mode"
    "$tmp/tests$mode"
done
echo "test.sh: OK"
