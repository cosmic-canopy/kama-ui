# @kama/ui

One set of HTML-like documents for a [kama](https://kama-lang.org) program's UI. It has **two backends behind one
contract**:

- **In a browser, the browser's own DOM.** The documents become real elements over the canvas, painted by the
  browser. No JavaScript library is used: only the DOM and CSS, through about 500 lines of emcc `--js-library` glue.
- **Natively, RmlUi** through [`@kama/rmlui`](../kama-rmlui). It records draw commands for the program's own renderer.

The program writes `ui::UiContext` and never knows which backend it has. Each build has exactly one: `native.kama` and
`web.kama` declare `UiContext` under complementary `@compileFor` gates, and both are checked against the `UiHost`
contract where they are written.

> **Status: new, not yet published.** Needs **kama ≥ 0.9.577**. Tested natively on Linux x86_64 (debug and release)
> and in headless Firefox 157 (emcc 6.0.9).

**The plan.** RmlUi is today's native engine. Matt's own HTML/CSS engine replaces `@kama/rmlui` later, behind this
same contract. Only `native.kama` changes. The documents, the web leg and every program using `UiContext` stay as they
are. What a replacement must provide is exactly `UiHost` in `src/host.kama`:

- documents from a file and from text;
- bindings by id that survive rewrites;
- clicks and changes, polled;
- a focus ring driven by TAB, the arrows and ENTER;
- quiet writes into controls, classes and inline properties;
- recorded draw commands and textures.

## The contract

`src/host.kama` is the authority. Every method there carries its reasons. In short:

| group | methods |
|---|---|
| documents | `loadDocument(path)`, `loadDocumentText(rml)`, `closeDocument()`, `setInnerRml(handle, rml)` |
| assets | `loadFont(path, fallback)`, `provideImage(name, rgba: ConstView<uint8>, w, h)`, `setImageRewrite(nativeExt, webExt)` |
| frame | `setSize`, `setViewport(offsetX, offsetY, scale, visible)`, `setDpRatio`, `update()`, `updateAt(seconds)`, `render()` |
| drawing (native) | `commandCount`, `command(i)` → `UiCommand` (`kind`, vertices, indices, texture, translation, scissor, transform), `textureCount`, `texture(h)`, `textureGeneration(h)` |
| pointer (native) | `mouseMove`, `mouseButton`, `mouseWheel` |
| keyboard | `key(code, down, shift)` with `UI_KEY_*` (GLFW's numbers), `typeChar(codepoint)`, `focusHeld()`, `focusDocument()`, `focusElement(h)`, `focusedElement()`, `textFocused()` |
| elements | `bindElement(id)` → handle, `elementRect`, `elementValue` / `setElementValue` (a float), `elementText` / `setElementText`, `setElementClass`, `setElementProperty` |
| events | `pollEvent()` → `UiEvent { kind: Click \| Change, element: handle }` |
| lifetime | `UiContext.open(width, height, fontPath)`, `isOpen()`, `close()` |

`ui::UiNav` turns a pad's d-pad and stick into arrow presses (hysteresis, one direction at a time, delay then repeat).
`ui::uidoc` holds the RML → HTML rewriter (`rmlToHtml`) and `escapeText`, the escaping both parsers agree on.

The rules that matter most:

- **A `UiContext` is a value.** Its state lives on the other side of the seam, so a program may keep copies in module
  statics; `close()` is explicit.
- **Handles are integers.** Binding an id again gives the same handle, and repairs it after `setInnerRml` replaced the
  element. Re-bind what you wrote, after the write.
- **Events bubble on both legs.** A bound container also hears its children's clicks.
- **Writes into controls raise no event on either leg.** Only a person's edit is queued.
- **The program gets every key first** and forwards the subset: TAB, the arrows, ENTER, and the four editing keys.
  ENTER clicks the focused element, so it arrives as an ordinary click.
- **The native renderer must apply `UiCommand`s in order and skip** (or implement) **every one whose `kind` is not
  `Draw`.** A `ClipSet` carries a mask's geometry, not a picture.

## Using it

### Natively

Build `@kama/rmlui` once (`tools/fetch-rmlui.sh`, `tools/fetch-freetype.sh`, `make -C native` in that repo). Then in
the program's manifest:

```json
"dependencies": {
  "@kama/ui":    { "path": "../kama-ui" },
  "@kama/rmlui": { "path": "../kama-rmlui" }
},
"select": { "TARGET": {
  "LINUX":   { "ldflags": ["-L../kama-rmlui/native/build/linux/lib"] },
  "MACOS":   { "ldflags": ["-L../kama-rmlui/native/build/darwin/lib"] },
  "WINDOWS": { "ldflags": ["-L../kama-rmlui/native/build/windows/lib", "-static-libgcc", "-Wl,-Bstatic", "-lstdc++",
                           "-lpthread", "-Wl,-Bdynamic"] }
} }
```

`@kama/rmlui` is listed again because kama makes each consumer restate a path dependency's path dependencies.
The `-L` is the root's job, because a package may not name a library path. (Both are described in
`../kama-rmlui/README.md`.)

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

### In a browser

Build the program with `--target WASM`. This package's `jsLibraries` and `emSettings` reach the build on their own.

- **The page**: the shell may provide `#ui-stage` and `#ui-root`; if it does not, `open` creates them. The stage is
  the virtual resolution given to `open`. `setViewport(…, visible: true)` positions it over `#canvas` and shows it.
- **Documents** are read from the program's virtual filesystem (`--embed-file` them) and rewritten to HTML by
  `ui::uidoc::rmlToHtml`. `loadDocumentText` needs no file.
- **Fonts** come from the page's own `@font-face`. **Images** are served beside the page. If native and web read
  different files for one picture, `setImageRewrite(nativeExt: ".pam", webExt: ".webp")` rewrites every `<img src>` as
  it is inserted.
- **Keys.** The web leg assumes the page swallows the keys (a game's platform layer preventDefaults them, so SPACE and
  the arrows do not scroll the page) and forwards the navigation subset through `key()`. The JS then moves the focus
  in document order and clicks on ENTER. The browser types into its own `<input>`s.
- `mouseMove`, `mouseButton`, `mouseWheel`, `update`, `render`, `typeChar`, `setDpRatio`, `loadFont` and
  `provideImage` are no-ops here: the browser does those itself.

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
- Not drawn natively yet: `box-shadow`, `filter` and gradients (`../kama-rmlui/README.md`, "Not here yet").

## Tests

```sh
KAMA=/path/to/kama tools/test.sh       # native, debug and release, through ../kama-rmlui (build it first)
KAMA=/path/to/kama tools/test-web.sh   # emcc (EMSDK, default ~/emsdk), served locally, run in headless Firefox
```

The two scripts build one program, `tests/`. Shared on both legs:

- `ui::uidoc`: friendly-fire-department's rewriter suite.
- `ui::UiNav`: the-mallow-man's pad suite.
- **the seam suite**, run against whichever `UiContext` the build has:
  - a document from a file and one from text;
  - every id bound, an unknown one 0, a re-bind giving the same handle;
  - laid-out boxes;
  - the focus ring starting on `autofocus`, walked down and up with wrapping, and TAB;
  - ENTER clicking the focused button, with the bubble to its container;
  - **a real click, injected, arriving as a polled event**, bubbling to the container;
  - quiet writes of text and of a range, read back, raising nothing;
  - a class and an inline `dp` property changing a box;
  - a rewrite with a new id bound and an old handle kept;
  - closing the document;
  - `close()`.

On the native leg the click is RmlUi's own input: pointer, button down and up, update. On the web it is the browser's
own hit test (`document.elementFromPoint`) and a bubbling `MouseEvent`. Each leg adds its own checks:

- **Natively**: draws with vertices and a glyph-atlas texture, the provided picture at its own size, typing with
  Backspace, Home and Delete, change events from typing, and "a navigation key with nothing focused lands on the first
  control".
- **On the web**: no commands and no textures, the image rewrite done before the browser fetched, and real elements.

Results: **native 105 checks**, passing in debug and in release. **Web 96 checks**, passing in headless Firefox.

The web verdict comes back over HTTP. The page POSTs `{run, failed, output}` to `tools/web-test-server.py`, so nothing
reads a screenshot or a DOM dump. The page then closes its own window, which ends the browser. A failing check makes
the script exit 1 with the check's name.

⚠️ Brave 144 hangs in `--headless` on this machine, even for a one-line page. Firefox is the default; set `BROWSER` to
override.

## Where it came from, and what was reconciled

Every source started as the-mallow-man's copy (`ui/`, `uidoc/`; E7b/E7c, 2026-10-07). That copy was itself
friendly-fire-department's (a676ca3, last changed 2026-09-29), renamed `ffd_` → `tmm_` and extended. After renaming
FFD's copy the same way and diffing it against the-mallow-man's, **FFD's had no lines the newer copy lacked** apart
from one comment naming its stage size. Everything FFD built is already in the-mallow-man's copy. Two things came
from FFD's *other* files: its uidoc test suite (`tests/src/uidoc_test.kama`) and its `licenses/manifest.tsv` shape
(used in `@kama/rmlui`).

Prefixes are renamed from `tmm_` / `TmmUi` to `kama_ui_` / `KamaUi`. Then:

| decision | why |
|---|---|
| The native backend is `native.kama` over `@kama/rmlui`. The game's C++ shim is gone from this package. | The binding is general now. This file holds only the seam's policy: one document, bind by id, the GLFW key subset, first-press focus, the 1/60 step, quiet writes. |
| `UiCommand` gained `kind` (clip masks), `transformed` and `transform`. Its pointers are `UnsafeConstPtr`. | RmlUi 6's clip masks and transforms are recorded now, not dropped. The const pointers were owed (the games' headers said so). |
| `provideImage` takes `ConstView<uint8>`, not `UnsafeConstPtr<uint8>`. | Safe and length-checked; the web leg ignores it either way. |
| Added `loadDocumentText(rml)`. | Generated documents, and tests that need no files. |
| `uidoc`'s `.pam"` → `.webp"` rule became `setImageRewrite(nativeExt:, webExt:)`, applied by the web JS before parsing. | One game's convention no longer sits inside a general rewriter. It now reaches `setInnerRml` content too, and it runs before the browser fetches the wrong file. |
| `uidoc` is a module, `ui::uidoc`, not its own package. | One package to depend on and publish. |
| The web ring includes `input`, `select` and `textarea`, and excludes `tabindex="-1"` and inline `tab-index: none`. | The legs agree. RmlUi rings every form control. The-mallow-man's join panel fields (no `tabindex` attribute) were skipped on the web and stopped on natively. |
| The web leg focuses `[autofocus]` when a document is set. | `autofocus` does nothing in `innerHTML`. RmlUi's show focuses it, so the rings start in the same place. |
| The web leg's `setElementProperty` turns `dp` into `px` and reports whether the browser took the value. | `"150dp"` was invalid CSS there, and was dropped without a word. |
| The contract's comments are generalised (no vote screens, no receipts); the measured warnings stay. | It is a package now. |

## What the-mallow-man and friendly-fire-department would change to switch

Not done; listed so it can be.

**the-mallow-man**

1. Replace the `ui` and `uidoc` dependencies in `game/kama.json` and `tests/kama.json` with `"@kama/ui": { "path":
   "../../kama-ui" }` and `"@kama/rmlui": { "path": "../../kama-rmlui" }` (paths relative to each manifest). Delete
   `ui/` and `uidoc/`.
2. Imports: `ui::…` names are unchanged (`UiContext`, `UiNav`, `UiEvent`, `UiRect`, `UI_KEY_*`). `uidoc::escapeText`
   and `uidoc::rmlToHtml` become `ui::uidoc::…`.
3. Linking: drop `"link": ["tmm_ui", "rmlui", "freetype"]` and the three `-Lnative/build/<plat>/{ui,rmlui,freetype/lib}`
   flags. Use one `-L../kama-rmlui/native/build/<plat>/lib` per arm instead; the package's `link` names the
   libraries, and the shim is compiled from its `csources`.
   - Remove `native/Makefile`'s `ui`, `rmlui` and `freetype` targets, and `tools/fetch-rmlui.sh` /
     `fetch-freetype.sh`. Point `tools/build` at `../kama-rmlui` (fetch and `make -C native`).
   - On Windows, build with `--cxx g++`.
4. `game/src/menu.kama` around line 425: build the treeline in a `FixedArray<uint8>` (not `malloc`) and pass
   `rgba: buf.view()`. In `tests/src/menu_test.kama`, pass `texel.view()`.
5. `game/src/menu.kama` around line 929: skip every `UiCommand` whose `kind` is not `Draw` (or implement clip masks in
   `gfx`'s UI pass), and optionally apply `transform`. The `cast<UnsafeConstPtr<…>>` around `c.vertices`, `c.indices`
   and `t.pixels` become no-ops; `gfx`'s UI texture path can take const pointers end to end.
6. Call `ui.setImageRewrite(nativeExt: ".pam", webExt: ".webp")` once after `UiContext.open`.
7. Native binding handles are opaque integers, not 1..N. `keyboardui.kama`'s `idOf` compares handles, which is still
   correct.
8. The documents need nothing new. The join panel's fields now join the web ring as they always did natively. Add an
   inline `style="tab-index: none"` to any form control that should stay out of the ring on either leg.
9. Bump `.kama-version` to 0.9.577 or later (the packages declare `"kama": ">=0.9.577"`, and the game pins 0.9.542).
   Re-read `docs/KAMA_GAPS.md` at the bump.
10. `licenses/` keeps its RmlUi and FreeType texts. They are identical to `../kama-rmlui/licenses/`.

**friendly-fire-department**: the same steps 1–3, 5 and 9, plus:

- Its kama pin is 0.9.457, so the bump to ≥ 0.9.577 is larger.
- `game/src/badge_native.kama` passes `rgba.view()` (it holds a `DynamicArray`).
- `Batcher.putGeometry` (`game/src/game.kama` around line 9512) skips non-`Draw` commands and takes const pointers.
- The `.pam` → `.webp` badge rule becomes `setImageRewrite`.
- `uispike` retires in favour of `@kama/rmlui`'s tests, along with its `ffd_ui` / `stdc++` / `c++` link lines.
- It gains the-mallow-man's E7b/E7c methods (text entry, focus, `updateAt`, `setElementProperty`) for free.
- Its `tools/check-web` (Playwright) can keep running against the same DOM.

## License

`@kama/ui` is licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option. It vendors nothing. Its native leg links `@kama/rmlui`, whose README says what a program that ships
RmlUi and FreeType must carry: two MIT notices and the FreeType FTL with its credit line. The web leg ships only this
package's own code.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in `@kama/ui` by you, as
defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.
