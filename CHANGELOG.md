# Changelog

All notable changes to `@kama/ui`. The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — unreleased

What a desktop-tool-style page needs (a library, editors, tables, live logs), on both legs. `src/host.kama` marks each
addition with its version.

### Added

- **A page**: `UiContext.openPage(width, height, fontPath)`, beside `open`'s scaled stage. On the web the stage is
  pinned to the window's four edges: shown without `setViewport`, never scaled, resized by CSS alone, and an
  `overflow: auto` element scrolls. `setViewport` only shows and hides it. Natively the program passes its window's
  size to `setSize` on every resize.
- **`UiEvent.target`**: the nearest element with an id, walking up from where the event happened to the bound
  element (inclusive), so one binding on a list tells its rows apart. It is a handle, the one `bindElement` gives for
  that id, named without listening. A `value` cannot own a `string`, and a `resource` event would end copying events
  out of a match arm. 0 when a rewrite destroyed the target before the poll.
- `elementId(handle)`: the id a handle names ("" for none). It is what turns a target back into a row.
- `setElementAttribute(handle, name, value)` / `removeElementAttribute(handle, name)`. `checked` and `value` write the
  control's state on both legs, `value` quietly. On the web `src` gets the image rewrite.
- `elementChecked(handle)`: a checkbox or radio's state.
- `findElement(id)`: the handle `bindElement` gives, without listening. Nothing is queued for it, and a container
  found this way does not hear its children. It is for what a program only writes into or reads. `bindElement` on it
  later starts listening, with the same handle.

### Changed

- `setInnerRml` **releases the bindings to what it replaces**. Their handles let go of the element and its listeners,
  and are no-ops until an element carries their id again; then they name the new one with the same handle. Natively
  this was already @kama/rmlui's doing (observer pointers, self-retiring listeners). The suite now proves it under
  AddressSanitizer. On the web a rewritten list used to keep every old row alive, with listeners attached.
- Web: every handle resolves through one lookup that re-finds a released element by its id, as the native bindings do.
- `elementText` has **no length cap** on the web. It was 511 bytes there; the JS is asked for the byte length first.
  On both legs it answers only for `<input>`, `<textarea>` and `<select>`. A browser's `<li>` has a numeric `value`,
  which used to read back as "0".
- `UiEvent.make` takes `target`.
- **One change per edit, the same count on both legs.** The web counted both `input` and `change`, so a checkbox, a
  radio or a `<select>` delivered two changes per edit there and one natively. It now hears `input` from a text field,
  a textarea and a range (live, so a slider still previews), and `change` from the rest. Natively, ENTER in a text
  field (`linebreak`) and the radio a choice unchecks raise none, as on the web.

### Fixed

- Web: a new document, `closeDocument` and `close` took off only the `click` listener of each binding. `change` and
  `input` stayed on every control the page had shown.
- Web: `close` then `open` again could leave the stage hidden, because the viewport memo outlived the stage.
- Web: `bindElement("")` threw from `querySelector`. It is 0, as natively.

### Known difference

- Natively, writing `checked` on a checkbox or radio raises a change event. RmlUi dispatches one from the attribute,
  and @kama/rmlui 0.1.0 has no quiet attribute write. A browser raises none. The native suite pins this.
- Natively, RmlUi forces a change for every movement of a range's bar. A step past either end, or a drag within one
  step, raises a change that changes nothing; a browser raises none. Telling them apart needs @kama/rmlui.
- No `scrollToEnd` yet. @kama/rmlui 0.1.0 exposes only `Element.scrollIntoView()` (top-aligned) and the wheel, not
  RmlUi's `GetScrollTop`/`SetScrollTop`/`GetScrollHeight`/`GetClientHeight`.

### Tests

- Native 161 checks (debug, release, AddressSanitizer), web 161 (headless Firefox). The new web checks fail against
  0.1.0's listener handling, its event mapping and its viewport memo. With its edit filter off, the native leg counts
  two changes for a radio choice and one for ENTER.

## [0.1.0] — unreleased

The first version: the UI seam earlier kama games built for their menus, as a package. README.md, "Where it came
from", lists every change.

- `UiHost`, with `UiContext` on the browser's DOM (web) and on RmlUi through `@kama/rmlui` (native).
- `ui::uidoc`: the RML → HTML rewriter and `escapeText`, now a module.
- `ui::UiNav`: a pad as arrow presses.
- Added: `loadDocumentText`, `setImageRewrite`, a `kind` and a `transform` on `UiCommand`, and const pointers.
  `provideImage` takes a `ConstView<uint8>`.
- Web: form controls are in the focus ring, `autofocus` is honoured, and `dp` works in inline properties.
- Native builds compile `@kama/rmlui` and `@kama/freetype` from their vendored sources. There is nothing to fetch or
  build first, and no `-L` paths, in this package's tests or in a consumer. `tools/platform` is gone with them.
- `tests/`: native 105 checks (debug, release, and AddressSanitizer with leak checking), web 96 checks (headless
  Firefox). The native leg's font (Lato, OFL) is committed under `tests/fonts/`.
- `publish.exclude` names only tracked paths. `kama publish --dry-run` refused the old list
  (`.claude/ matches no tracked file`).
