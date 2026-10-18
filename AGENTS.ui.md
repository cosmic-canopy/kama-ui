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
  verdict POSTed back to `tools/web-test-server.py`, and serves `tests/fixtures/clip.webm` beside the page for the
  media suite (made once by `tools/make-test-clip.py`, PyAV; run Python with `-I`). A change to `src/` is not proven
  until both pass. `web.kama`
  and the JS compile only on the web leg, so the native script cannot catch a break there.
- **The seam suite is shared** (`tests/src/seam_test.kama`). Put a check there unless the legs legitimately differ,
  and then put it in `tests/src/leg_native.kama` or `leg_web.kama`. Input is injected per leg (`injectClick`,
  `injectKey`, `dragBegin`…).
  - Natively it is RmlUi's own input. A click first runs half a second of the clock, so it never pairs with the last
    one into a double click.
  - On the web it is the exact event sequence a browser fires, from `tests/web/kama_ui_test.js`. A synthetic event
    performs no default action, so the helper does the ones the legs depend on, chiefly the focus a press gives.
  - **Compare events as one string per leg** (`trace`, `kindsOn`): the same events in the same order is the contract.
- **`kama_ui_web.h` holds declarations only, never `EM_JS`** (the header says why). Every `extern fn` in `web.kama`
  needs its line there, because kama emits no prototype for an `extern`. JS state lives in `$KamaUi`, and every entry
  point names it in `__deps`.
- **Keep `UiContext` a `value`.** Programs keep copies in module statics, which may own nothing. Anything a backend
  must remember lives on the other side of the seam: `@kama/rmlui`'s bindings and attributes natively (a quiet
  `data-kama-ui-*` mark is how `scrollToEnd` waits for the layout), `$KamaUi` on the web. Per-document state that is
  plain numbers stays on the value: natively the document and the tooltip's timer, so a program keeps one UiContext
  and passes it by `ref`.
- **The one native state that is not RmlUi's** is the files' `FileStore` (0.4.0): lists, reads, save requests and their
  events, on the heap behind the context's `store` pointer — made in `start`, handed out with `Owned.release()`,
  borrowed in place as `store[0]`, and adopted back and dropped in `close`. A value still owns nothing.
- **Media (0.5.0) is the web's alone.** RmlUi has no `<video>` or `<audio>`, so natively every media method answers
  None or false and no `Media` event is queued; the shared suite (`tests/src/media_test.kama`) branches on the leg's
  `playsMedia()` rather than living in a leg file, so a native decoder later meets the same checks. On the web the
  media events are heard in the capture phase (they do not bubble), and one `Media` waits at a time per binding and
  clip (`listen`).
- **Native events have three sources** in `pollEvent`. Bindings feed `heard`; the package's own listeners on the
  document root (keys, drag progress, scroll) feed `own`; and (0.4.0) the files' queue follows once RmlUi's is
  drained. RmlUi sends Focus and Blur to every element of the focus chain and focuses whatever is pressed, so only
  `focusable` elements report them. Bindings hear them in the capture
  phase, and so do the web's: that is why both legs deliver them ancestors first.
- **On the web every entry point resolves a handle through `KamaUi.el(handle)`**, never `els[h - 1]`. It re-finds a
  released element by its id (what @kama/rmlui's bindings do natively), which is what keeps a stale handle a no-op.
  A binding's listeners go on and come off through `KamaUi.heard` and `heardCapture`, one list per phase, so a
  detach can never miss an event. Keys, hover, drag and dismissal are page-level listeners (`KamaUi.install`), on
  once; they act only while a document is up (`KamaUi.loaded`).
- **`ui::uidoc` is pure** (string in, string out). Its suite runs on both legs. A new RCSS/CSS disagreement goes there,
  with a check, never into a per-screen special case.
- **This package depends on `@kama/rmlui` `^0.2.0` from the registry** (FreeType comes with it). To work against
  checkouts, override them in a gitignored `kama.local.json` (`"overrides": {"@kama/rmlui": {"path":
  "../kama-rmlui"}}`); never commit a path dependency, since a published package cannot carry one. Since kama 0.9.603
  an override stands in for an UNPUBLISHED version too, as long as the checkout's version satisfies the range. An
  override does not reach a transitive dependency (`tests/`), which takes a local file registry holding a tarball of
  the checkout, layered before the official one in `tests/kama.local.json`'s `registries`; `tests/kama.lock` then pins
  that tarball: restore it (`git checkout tests/kama.lock`) and never commit it until the version is published.
