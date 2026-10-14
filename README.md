# @kama/ui

One set of HTML-like documents for a [kama](https://kama-lang.org) program's UI. It has **two backends behind one
contract**:

- **In a browser, the browser's own DOM.** The documents become real elements over the canvas, painted by the
  browser. No JavaScript library is used: only the DOM and CSS, through about 700 lines of emcc `--js-library` glue.
- **Natively, RmlUi** through [`@kama/rmlui`](https://github.com/cosmic-canopy/kama-rmlui). It records draw commands for the program's own renderer.

The program writes `ui::UiContext` and never knows which backend it has. Each build has exactly one: `native.kama` and
`web.kama` declare `UiContext` under complementary `@compileFor` gates, and both are checked against the `UiHost`
contract where they are written.

> **Status: published** (registry.kama-lang.org, 0.2.0 on 2026-10-14). Needs **kama ≥ 0.9.577**. Tested natively on Linux x86_64 (debug, release and
> AddressSanitizer) and in headless Firefox 157 (emcc 6.0.9).

**The plan.** RmlUi is today's native engine. Matt's own HTML/CSS engine replaces `@kama/rmlui` later, behind this
same contract. Only `native.kama` changes. The documents, the web leg and every program using `UiContext` stay as they
are. What a replacement must provide is exactly `UiHost` in `src/host.kama`:

- documents from a file and from text, on a scaled stage or as a page that fills the window;
- bindings by id that survive rewrites, and let go of what a rewrite replaced;
- markup appended and children removed in place;
- events, polled, each naming where it happened: clicks, changes, double clicks, keys, focus and blur, drops;
- a focus ring driven by TAB, the arrows and ENTER;
- tooltips from `title`, and drag and drop from `draggable`;
- quiet writes into controls, classes, attributes, inline properties and plain text;
- a clipboard the program bridges;
- recorded draw commands and textures.

## The contract

`src/host.kama` is the authority. Every method there carries its reasons. In short:

| group | methods |
|---|---|
| documents | `loadDocument(path)`, `loadDocumentText(rml)`, `closeDocument()`, `setInnerRml(handle, rml)` (releases what it replaces), `appendInnerRml(handle, rml)` (keeps it), `childCount(h)`, `removeChildren(h, from, count)` |
| assets | `loadFont(path, fallback)`, `provideImage(name, rgba: ConstView<uint8>, w, h)`, `setImageRewrite(nativeExt, webExt)` |
| frame | `setSize`, `setViewport(offsetX, offsetY, scale, visible)`, `setDpRatio`, `update()`, `updateAt(seconds)`, `render()` |
| drawing (native) | `commandCount`, `command(i)` → `UiCommand` (`kind`, vertices, indices, texture, translation, scissor, transform), `textureCount`, `texture(h)`, `textureGeneration(h)` |
| pointer (native) | `mouseMove`, `mouseButton(button, down, mods)`, `mouseWheel` |
| keyboard | `key(code, down, mods)` with `UI_KEY_*` (GLFW's numbers) and `UI_MOD_*`, `claimKey(key, mods)`, `typeChar(codepoint)`, `focusHeld()`, `focusDocument()`, `focusElement(h)`, `focusedElement()`, `textFocused()` |
| clipboard | `copyText(text)`, `provideClipboard(text)` / `takeClipboardWrite()` (native; no-op / None on the web) |
| elements | `bindElement(id)` → handle, `findElement(id)` → a handle that hears nothing, `elementId(h)` → its id, `elementRect`, `elementValue` / `setElementValue` (a float), `elementText` / `setElementText` (no length cap), `elementChecked(h)`, `setElementClass`, `setElementProperty`, `setElementAttribute(h, name, value)` / `removeElementAttribute(h, name)`, `elementContent(h)` / `setElementContent(h, text)` (plain text), `scrollToEnd(h)`, `isScrolledToEnd(h)`, `scrollIntoView(h)` |
| events | `pollEvent()` → `UiEvent { kind: Click \| Change \| DoubleClick \| Key \| Focus \| Blur \| Drop, element, target, source, key, mods }` |
| lifetime | `UiContext.open(width, height, fontPath)` (a stage), `UiContext.openPage(width, height, fontPath)` (a page), `isOpen()`, `close()` |

`ui::UiNav` turns a pad's d-pad and stick into arrow presses (hysteresis, one direction at a time, delay then repeat).
`ui::uidoc` holds the RML → HTML rewriter (`rmlToHtml`) and `escapeText`, the escaping both parsers agree on.

The rules that matter most:

- **A `UiContext` is a value.** Its state lives on the other side of the seam, so a program may keep copies in module
  statics; `close()` is explicit.
- **A stage or a page.** `open` is a fixed virtual resolution the program letterboxes and scales (`setViewport`): a
  game's menus. `openPage` is a document that fills the window and reflows like a web page: a tool, an editor. On the
  web a page's stage is pinned to the window, shown at once, never scaled, and resized by CSS alone; natively the
  program passes its window's size to `setSize` on every resize and draws the commands at the origin, unscaled. Both
  scroll an `overflow: auto` element in place.
- **Handles are integers.** Binding an id again gives the same handle, and repairs it after `setInnerRml` replaced the
  element. Re-bind what you wrote, after the write.
- **A rewrite releases what it replaced.** A handle into the old content lets go of its element and its listeners, and
  every call on it is a no-op until an element carries its id again; then the same handle names the new one.
- **Events bubble on both legs.** A bound container also hears its children's clicks.
- **An event names its target**: the nearest element with an id, from where it happened up to the bound element. One
  binding on a list tells its rows apart. The target is a handle (the one `bindElement` gives for that id), so
  `elementId` turns it into the row's id. Poll before you rewrite: a target the rewrite destroyed reads as 0.
- **Name what you only write to with `findElement`.** It gives the handle `bindElement` would, without listening: a
  list rewritten with `setInnerRml`, a row given a class, a box measured. Nothing is queued for it, and it does not
  hear its children.
- **One change per edit, the same count on both legs**: each character typed into a text field or a textarea, each
  step of a range (live, as a slider previews), each toggle of a checkbox, each choice of a radio or an option. A
  commit is no edit: ENTER in a text field, a field losing focus, a slider let go, and the radio a choice unchecks.
  Neither is a movement that changes nothing: a range stepped past its end, or dragged within one step.
- **Writes into controls raise no event on either leg**, attributes included (`checked`, `value`). Only a person's
  edit is queued.
- **`scrollToEnd` follows a log**: write the new line, ask in the same frame, and the next frame drawn shows the end
  on both legs. The web scrolls at once; natively the request waits for the next `update`, whose layout pass measures
  what was written. To follow only while the reader is at the bottom (scrolling up to read is not yanked back), ask
  first and append with `appendInnerRml`, which rewrites nothing:

  ```kama
  bool follow = ui.isScrolledToEnd(handle: log);
  ui.appendInnerRml(handle: log, rml: line);
  if (follow) { ui.scrollToEnd(handle: log); }
  ```

  `isScrolledToEnd` is true within a pixel of the end, for a box that cannot scroll, and while a `scrollToEnd` waits
  for the next update. On the web an append touches no existing node, so a person's text selection survives it.
  The cost is the new markup's on both legs. `childCount` and `removeChildren(h, 0, n)` trim the oldest lines without
  a rewrite.
- **The same events, in the same order, on both legs.**
  - Two presses within half a second are Click, DoubleClick, Click.
  - Focus moving is Blur on what had it, then Focus on what has it, for a button, a form control or an element with
    a tab index. A bound container hears them before the element: RmlUi's focus does not bubble, so both legs listen
    on the way down.
  - A Click, a DoubleClick and a Drop carry the `mods` held (UI_MOD_*, Cmd folded into Ctrl).
- **Keys are events too.** A `Key` (element 0, `target` the focused element) arrives for every key of the table that
  types no character: Enter, Escape, Tab, the arrows, Delete, Backspace, Home/End, PageUp/PageDown and F1–F12. A–Z
  and 0–9 arrive only with Ctrl or Alt held. `claimKey(UI_KEY_S, UI_MOD_CTRL)` keeps a shortcut from the browser
  (no save dialog) as the key goes down; natively there is nothing to keep it from.
- **The program gets every key first.** On the web the browser hears its own keys, and the program forwards the ring's
  (TAB, the arrows, ENTER) to `key` for a page that swallows them. Natively it forwards every key it does not keep,
  with its modifiers. ENTER clicks the focused element, so it arrives as an ordinary click.
- **Drag and drop: `draggable="true"`.** Natively the package makes it RCSS `drag: drag-drop`; on the web it is
  HTML5's. A drop raises `Drop` where it lands, with `target` the element dropped on and `source` the one dragged.
  During the drag the dragged element has the class `ui-dragging` and the element under the pointer has
  `ui-drop-target`.
- **Tooltips: `title`.** After half a second of hover, on the program's clock (so call `update` or `updateAt` every
  frame on the web too), the package shows the title in `#kama-ui-tooltip`. The document styles `.ui-tooltip`. It
  hides on leaving, on a press and on a scroll. On the web the attribute is held as `data-kama-ui-title`, so the
  browser's own popup never shows; a `[title]` rule matches natively only.
- **The clipboard is the program's to bridge, natively.** Hand the OS clipboard's text to `provideClipboard` before
  forwarding a paste, and put every `takeClipboardWrite` on the OS clipboard; RmlUi's fields then copy, cut and paste
  with Ctrl+C/X/V. `copyText` works on both legs. The web needs none of this.
- **The native renderer must apply `UiCommand`s in order and skip** (or implement) **every one whose `kind` is not
  `Draw`.** A `ClipSet` carries a mask's geometry, not a picture.

## Using it

### Natively

`@kama/rmlui` and `@kama/freetype` vendor RmlUi and FreeType, and kama compiles them into the program. There is
nothing to fetch or build first, and no `-L` path to set. Once the packages are on the registry, depend on this one
alone:

```json
"dependencies": { "@kama/ui": { "version": "^0.3.0" } }
```

`@kama/rmlui` and `@kama/freetype` come with it. To build against a checkout instead (working on the package itself),
override it in your gitignored `kama.local.json`, never in `kama.json`:

```json
{ "overrides": { "@kama/ui": { "path": "../kama-ui" } } }
```

[`@kama/rmlui`'s README](https://github.com/cosmic-canopy/kama-rmlui) covers the rest: build times, `"debug": { "optimize": ["rmlui", "freetype"] }` to keep
  the layout engine at release speed in a debug build, and Windows' static libstdc++.

```kama
import { ui::UiContext, ui::UiEvent, ui::UiCommand, ui::UI_KEY_DOWN };

fn void frame(ref UiContext ui, int32 play) {
    ui.updateAt(seconds: 12.5);      // a monotonic clock: hover transitions, the caret
    ui.render();
    int32 i = 0;
    while (i < ui.commandCount()) {
        UiCommand c = ui.command(index: i);
        bool draw = match (c.kind) { case Draw: true; case _: false; };
        // if (draw) { upload c.vertices (8 floats a vertex, premultiplied), c.indices; texture c.texture,
        //             keyed on ui.textureGeneration(handle: c.texture) }
        i = i + 1;
    }
    bool more = true;
    while (more) {
        Optional<UiEvent> e = ui.pollEvent();
        match (e) {
            case None: { more = false; }
            case Some(value: ev): { if (ev.element == play) { /* start */ } }
        };
    }
}

fn void open() {
    UiContext ui = UiContext.open(width: 1920, height: 1080, fontPath: "assets/fonts/Inter-Regular.ttf");
    ui.setDpRatio(ratio: 1.0);
    ui.loadDocument(path: "assets/ui/menu.rml");
    int32 play = ui.bindElement(elementId: "play");
    frame(ui: ui, play: play);
}
```

A page — a tool's window, say — opens with `openPage`, follows the window with `setSize`, and needs one binding for a
whole list:

```kama
fn void openTool(int32 width, int32 height) {
    UiContext ui = UiContext.openPage(width: width, height: height, fontPath: "assets/fonts/Inter-Regular.ttf");
    ui.loadDocument(path: "assets/ui/items.rml");   // <div id="items"><div id="item-17">…</div>…</div>
    int32 items = ui.bindElement(elementId: "items");
    // every window resize: ui.setSize(width: w, height: h);  (a no-op on the web, where CSS follows the window)
    Optional<UiEvent> e = ui.pollEvent();
    match (e) {
        case None: { }
        case Some(value: ev): {
            if (ev.element == items) { string row = ui.elementId(handle: ev.target); /* "item-17" */ }
        }
    };
}
```

The program owns the window natively, so four things are its part. The browser does all four by itself.

- **Every key it does not keep** goes to `key(code, down, mods)`, with Cmd as `UI_MOD_CTRL`, and every character goes
  to `typeChar`. That is how shortcuts reach the document as `Key` events, and how a field's Ctrl+A/C/X/V works.
- **The modifiers held** go to `mouseButton(button, down, mods)`.
- **`updateAt(seconds)` every frame**, on a monotonic clock. Double clicks and the tooltip's delay are measured on it.
- **The clipboard:**

  ```kama
  ui.provideClipboard(text: osClipboardText);       // before forwarding a paste, or every frame
  bool more = true;
  while (more) {
      Optional<string> w = ui.takeClipboardWrite();  // each copy, cut or copyText, oldest first
      match (w) { case None: { more = false; } case Some(value: s): { /* put s on the OS clipboard */ } };
  }
  ```

### In a browser

Build the program with `--target WASM`. This package's `jsLibraries` and `emSettings` reach the build on their own.

- **The page**: the shell may provide `#ui-stage` and `#ui-root`; if it does not, `open` creates them. The stage is
  the virtual resolution given to `open`. `setViewport(…, visible: true)` positions it over `#canvas` and shows it.
  `openPage` pins the stage to the window's four edges instead: it is shown at once, never scaled, and CSS resizes
  it; `setViewport` then only shows and hides it.
- **Documents** are read from the program's virtual filesystem (`--embed-file` them) and rewritten to HTML by
  `ui::uidoc::rmlToHtml`. `loadDocumentText` needs no file.
- **Fonts** come from the page's own `@font-face`. **Images** are served beside the page. If native and web read
  different files for one picture, `setImageRewrite(nativeExt: ".pam", webExt: ".webp")` rewrites every `<img src>` as
  it is inserted.
- **Keys.** `Key` events come from the browser's own keydown, heard on the window in the capture phase, where
  `claimKey` prevents a claimed shortcut's default. For a page that swallows the keys (a game's platform layer
  preventDefaults them, so SPACE and the arrows do not scroll the page), the program forwards the navigation subset
  through `key()`, and the JS moves the focus in document order and clicks on ENTER. The browser types into its own
  `<input>`s.
- **The clock.** `update` and `updateAt` keep the program's clock, which the tooltip's delay is measured on. Call one
  every frame here too.
- `mouseMove`, `mouseButton`, `mouseWheel`, `render`, `typeChar`, `setDpRatio`, `loadFont`, `provideImage` and
  `provideClipboard` are no-ops here, and `takeClipboardWrite` is always None: the browser does those itself.

### Writing documents for both legs

`ui::uidoc` repairs the five places RCSS and CSS disagree: borders have no style in RCSS, RmlUi has no default
stylesheet, the browser's UA sheet, inheritance, and form-control accents. It also turns `dp` into `px` and scopes
every selector under `#ui-root`, mapping `body` and RmlUi's scrollbar elements. Beyond that, the document's own job:

- Declare `display: block` for the tags you use. RmlUi defaults everything to inline, and the web leg reproduces that
  on purpose.
- Make controls focusable with `tab-index: auto; nav: auto;`. To wrap the ring at its ends, write `nav-up` on the
  first control and `nav-down` on the last. The web wraps by itself and walks document order, so lay out one column,
  or spell every `nav-*`.
- **To take a form control out of the ring, write it inline: `style="tab-index: none"`.** RmlUi gives every form
  control an inline `tab-index: auto` that no stylesheet rule beats, and the web leg reads the same inline style
  (`tabindex="-1"` also works there).
- `autofocus` puts the ring on a control when the document loads, on both legs.
- Inline properties set with `setElementProperty` may use `dp`. The web leg rewrites it to `px`.
- Text another person typed goes through `ui::uidoc::escapeText` before `setInnerRml`. On the web an unescaped `<` is
  script injection.
- Not drawn natively yet: `box-shadow`, `filter` and gradients ([`@kama/rmlui`'s README](https://github.com/cosmic-canopy/kama-rmlui), "Not here yet").

## Tests

```sh
KAMA=/path/to/kama tools/test.sh       # native: debug, release, and AddressSanitizer (Linux), through @kama/rmlui
KAMA=/path/to/kama tools/test-web.sh   # emcc (EMSDK, default ~/emsdk), served locally, run in headless Firefox
```

The two scripts build one program, `tests/`. Shared on both legs:

- `ui::uidoc`: the rewriter suite.
- `ui::UiNav`: the focus-navigation suite.
- **the seam suite**, run against whichever `UiContext` the build has:
  - a document from a file and one from text;
  - every id bound, an unknown one 0, a re-bind giving the same handle;
  - laid-out boxes;
  - the focus ring starting on `autofocus`, walked down and up with wrapping, and TAB;
  - ENTER clicking the focused button, with the bubble to its container;
  - **a real click, injected, arriving as a polled event**, bubbling to the container, each naming its target;
  - quiet writes of text and of a range, read back, raising nothing;
  - a class and an inline `dp` property changing a box;
  - a rewrite with a new id bound and an old handle kept;
  - a rewrite releasing what it replaced: every call on a stale handle a no-op (under ASan natively), its id kept, and
    the same handle naming the element once its id is back;
  - one binding on a list: a click on each row naming the row (or the row's text, by its own id), a target being the
    handle `bindElement` gives, and naming one adding no listener;
  - `findElement`: a found element's click raising nothing, a found container not hearing its children, a found handle
    taking a write and a rewrite, and binding it later giving the same handle, which then hears;
  - **one change per edit, counted per control**: three characters typed into a text field, two into a textarea, a
    range step, a range step past its end (none), a checkbox toggle, a radio choice (one, though RmlUi also unchecks
    the neighbour), an option picked, and ENTER in a text field (none);
  - attributes: `hidden` against the document's `[hidden]` rule, `checked` set and removed quietly, a person's click toggling
    it, a write after that still taking, and a `value` attribute written quietly;
  - a 3,400-byte value with three-byte characters read back whole;
  - **keys**: Escape, F2, PageDown, Ctrl+S and Alt+1 each one `Key` naming the focused element; a letter alone or with
    Shift none;
  - **focus and blur** as one string per leg (`Blur:panel>first,Blur:first>first,Focus:panel>second,…`), and a press
    on what cannot hold the focus taking it away with no Focus;
  - Click, DoubleClick, Click for two presses within half a second, two spaced clicks giving none, and a Ctrl and a
    Shift+Alt click carrying their modifiers;
  - **a drag and drop**: the two classes mid-drag, one Drop heard by the list with its target and source, the classes
    gone after, and an appended `draggable` row dragged onto a bound row's text;
  - plain text written and read, ignored by a form control; a select's options rebuilt, appended to and trimmed with
    its value settled and no change;
  - closing the document;
  - `close()`;
  - **a page** (`openPage`): shown without `setViewport` at the window's corner, and an `overflow: auto` box scrolled by
    the wheel while the page stays put;
  - `scrollToEnd` asked right after a rewrite, before any update, showing the newest line at the log's bottom with no
    event, and doing nothing for an unknown handle or a box that does not scroll;
  - a log appended to with `appendInnerRml`: followed while at its end (`isScrolledToEnd` true even before the update),
    the line before the new one kept in order with its handle, its class and its listener (clicked before its handle
    is used again); scrolled up, an append leaving the reader where they were, unfollowed; a pending `scrollToEnd`
    reading as at the end;
  - a line scrolled to the top of the log, and the oldest five lines removed (a handle into them stale, one to a kept
    line valid, a range past the end removing nothing);
  - **a tooltip**: nothing a sixth of a second in, the title past half a second at 12 and 16 px from the pointer,
    hidden on leaving, on a press (and staying hidden while hovered) and on the wheel;
  - a stage opened after the page, shown by `setViewport` at its own virtual width.

On the native leg the input is RmlUi's own: the pointer, the buttons (a click half a second of the clock apart from the
last, so it never pairs into a double click), the wheel and keys. On the web it is the browser's own hit test
(`document.elementFromPoint`) and the events a browser fires, in its order. A synthetic event performs no default
action, so the helpers perform the ones that matter: a press focuses what it hits; typing sends an `input` per
character and the `change` of letting go; an option is selected, then `input` and `change`; a drag is mousedown,
dragstart, dragenter, dragover, drop, dragend; a key is a keydown at the focused element, then the same key forwarded to
`key`. Each leg adds its own checks:

- **Natively**: draws with vertices and a glyph-atlas texture, the provided picture at its own size, typing with
  Backspace, Home and Delete, change events from typing, "a navigation key with nothing focused lands on the first
  control", Ctrl+A/C/V against the clipboard the program bridges, and a page reflowing to `setSize`.
  The wheel is RmlUi's own input, with a second of updates for its smooth scroll.
- **On the web**: a claimed Ctrl+S prevented (and Cmd+S folded into it) while Ctrl+P is not, `copyText` reaching
  `navigator.clipboard`, a title held as `data-kama-ui-title`, a text selection surviving an append, a slider dragged two steps and let go giving two changes, no commands and no textures, the image rewrite done before the browser fetched (and on an `src`
  attribute), real elements, a row a rewrite released and a field from a closed
  document hearing nothing (click, input and change fired at the detached element), and a page's stage pinned to the
  window, filling it, hidden and shown again by `setViewport` without moving. The wheel is the browser's own scroll,
  applied to the box under the point (a synthetic `WheelEvent` scrolls nothing).

Results: **native 219 checks**, passing in debug, in release and under AddressSanitizer with leak checking. The ASan
leg wraps `cc`/`c++`, so RmlUi, FreeType and both shims are instrumented. **Web 224 checks**, passing in headless
Firefox. The native leg's font is Lato (SIL OFL 1.1), committed under `tests/fonts/` with its licence and never
published.

The web verdict comes back over HTTP. The page POSTs `{run, failed, output}` to `tools/web-test-server.py`, so nothing
reads a screenshot or a DOM dump. The page then closes its own window, which ends the browser. A failing check makes
the script exit 1 with the check's name.

⚠️ Brave 144 hangs in `--headless` on this machine, even for a one-line page. Firefox is the default; set `BROWSER` to
override.

## Where it came from

Extracted from the UI layer of earlier kama games. Two copies were reconciled: the older had no lines the newer
lacked, and its document-rewriter test suite (`tests/src/uidoc_test.kama`) came across with it. Prefixes became
`kama_ui_` / `KamaUi`. The changes made on the way:

| decision | why |
|---|---|
| The native backend is `native.kama` over `@kama/rmlui`. The original C++ shim is gone from this package. | The binding is general now. This file holds only the seam's policy: one document, bind by id, the GLFW key subset, first-press focus, the 1/60 step, quiet writes. |
| `UiCommand` gained `kind` (clip masks), `transformed` and `transform`. Its pointers are `UnsafeConstPtr`. | RmlUi 6's clip masks and transforms are recorded now, not dropped. The const pointers were owed (the original headers said so). |
| `provideImage` takes `ConstView<uint8>`, not `UnsafeConstPtr<uint8>`. | Safe and length-checked; the web leg ignores it either way. |
| Added `loadDocumentText(rml)`. | Generated documents, and tests that need no files. |
| `uidoc`'s `.pam"` → `.webp"` rule became `setImageRewrite(nativeExt:, webExt:)`, applied by the web JS before parsing. | One game's convention no longer sits inside a general rewriter. It now reaches `setInnerRml` content too, and it runs before the browser fetches the wrong file. |
| `uidoc` is a module, `ui::uidoc`, not its own package. | One package to depend on and publish. |
| The web ring includes `input`, `select` and `textarea`, and excludes `tabindex="-1"` and inline `tab-index: none`. | The legs agree. RmlUi rings every form control. Form fields with no `tabindex` attribute were skipped on the web and stopped on natively. |
| The web leg focuses `[autofocus]` when a document is set. | `autofocus` does nothing in `innerHTML`. RmlUi's show focuses it, so the rings start in the same place. |
| The web leg's `setElementProperty` turns `dp` into `px` and reports whether the browser took the value. | `"150dp"` was invalid CSS there, and was dropped without a word. |
| The contract's comments are generalised (nothing game-specific); the measured warnings stay. | It is a package now. |

## Publishing

`kama publish` ships exactly what git tracks, minus `publish.exclude` (`tools/`, `tests/`, the agent notes). The three
packages published in order on 2026-10-13: **@kama/freetype**, then **@kama/rmlui**, then **@kama/ui**, each once the
one before it was live, because a published package cannot carry a `path` dependency. Publish from kama-registry with
`./ops publish ../kama-ui/kama.json`.

## License

`@kama/ui` is licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option. It vendors nothing. Its native leg builds `@kama/rmlui` and `@kama/freetype`, and their READMEs say
what a program that ships them must carry:

- RmlUi's MIT notice, and the containers' (robin_hood and itlib).
- FreeType's FTL, with its credit line.
- The MIT notice of FreeType's hashing code.

The web leg ships only this package's own code. A wasm build compiles FreeType (kama cannot gate a dependency by
target, [`@kama/rmlui`'s KAMA_GAPS.md](https://github.com/cosmic-canopy/kama-rmlui/blob/main/KAMA_GAPS.md) #4), but nothing calls it, and the link drops it.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in `@kama/ui` by you, as
defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.
