# @kama/ui: what is true in THIS repo

`AGENTS.md` (the language) and `AGENTS.package.md` (a publishable library) are written by `kama agents install` and are
not hand-edited. This file is the project-specific third, and it is the one to edit. README.md holds the design and
the contract. These are the working rules.

- **Two legs, one contract.** `src/host.kama` (`UiHost`) is the contract. `src/native.kama`
  (`@compileFor(!ARCH_WASM32)`, over `@kama/rmlui`) and `src/web.kama` (`@compileFor(ARCH_WASM32)`, over
  `src/kama_ui_web.js`) each declare `UiContext implements UiHost`. A change to the contract changes both files in
  the same commit. `kama check kama.json` analyses both configurations.
- **The gate is BOTH test scripts.** `tools/test.sh` runs natively, in debug, in release and under AddressSanitizer
  (Linux). @kama/rmlui and @kama/freetype come from the registry; both vendor their sources, so
  there is nothing to build first. `tools/test-web.sh` uses emcc (`EMSDK`, default `~/emsdk`) and headless Firefox, with the
  verdict POSTed back to `tools/web-test-server.py`. A change to `src/` is not proven until both pass. `web.kama`
  and the JS compile only on the web leg, so the native script cannot catch a break there.
- **The seam suite is shared** (`tests/src/seam_test.kama`). Put a check there unless the legs legitimately differ,
  and then put it in `tests/src/leg_native.kama` or `leg_web.kama`. The click is injected per leg: RmlUi's input
  natively, `elementFromPoint` plus a `MouseEvent` on the web.
- **`kama_ui_web.h` holds declarations only, never `EM_JS`** (the header says why). Every `extern fn` in `web.kama`
  needs its line there, because kama emits no prototype for an `extern`. JS state lives in `$KamaUi`, and every entry
  point names it in `__deps`.
- **Keep `UiContext` a `value`.** Programs keep copies in module statics, which may own nothing. Anything a backend
  must remember lives on the other side of the seam: `@kama/rmlui`'s bindings natively, `$KamaUi` on the web.
- **On the web every entry point resolves a handle through `KamaUi.el(handle)`**, never `els[h - 1]`. It re-finds a
  released element by its id (what @kama/rmlui's bindings do natively), which is what keeps a stale handle a no-op.
  A binding's listeners go on and come off through `KamaUi.heard`, one list, so a detach can never miss an event.
- **`ui::uidoc` is pure** (string in, string out). Its suite runs on both legs. A new RCSS/CSS disagreement goes there,
  with a check, never into a per-screen special case.
- **This package depends on `@kama/rmlui` `^0.1.0` from the registry** (FreeType comes with it). To work against
  checkouts, override them in a gitignored `kama.local.json` (`"overrides": {"@kama/rmlui": {"path":
  "../kama-rmlui"}}`); never commit a path dependency, since a published package cannot carry one.
