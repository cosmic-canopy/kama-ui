# Changelog

All notable changes to `@kama/ui`. The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.2] — 2026-10-29

Builds on kama 0.9.758, no change to what it does. Needs **kama ≥ 0.9.758**, up from 0.9.577. Built on @kama/rmlui
0.2.0, unchanged.

### Changed

- **Needs kama 0.9.758**, up from 0.9.577. `find` answers an `Optional<isize>` from kama 0.9.706, so the code below
  that holds its results no longer type-checks on an older compiler; 0.9.758 is the one this release was tested on.

### Fixed

- **It builds on kama 0.9.758**, whose `find` answers an `Optional<isize>` (the size type) and which refuses a
  statement no path reaches: six `find` results in `uidoc/rml.kama` held as `isize` (their casts gone), the return
  after the native `UiContext.pollEvent`'s endless loop deleted, and the tests' `main` an exit status (`uint8`). Found by forge's
  page, which could not build on 0.9.758.

## [0.5.1] — 2026-10-20

A fix to `findElement`, on both legs. Built on @kama/rmlui 0.2.0, unchanged, and tested with kama 0.9.675.

### Fixed

- **`findElement` answers 0 when no element has the id**, as its contract says, on both legs. An id named before (found,
  bound, or an event's target) answered its old handle after a rewrite had removed its element, so a program asking
  whether an element is there (a form's optional control, drawn for one choice and not another) read a gone one as
  present, with an empty value. The handle itself is unchanged: it names the element again once one has the id.
  Found by forge's page (a Fill form whose preset select was drawn for one tool, then not for the next).

## [0.5.0] — 2026-10-18

A `<video>` or `<audio>` element's playback — where it is, a seek, its length, play and pause, and an event when any
of it changes — which is what a page needs to pick a frame of a clip; and `textFocused` counting every control a
person types into. Media plays on the web only: natively RmlUi has no media element until the toolkit gets a
decoder, so there every answer is None or false. Built on @kama/rmlui 0.2.0, unchanged, and tested with kama 0.9.667.

### Breaking

- `UiEventKind` gains `Media`. A `match` on it needs the new arm.
- `UiHost` gains the media methods below; a backend of its own must implement them.

### Added

- **Media playback** (host.kama, "media"), by handle, as an element's value is:
  - `mediaTime(h)`, `mediaDuration(h)` (seconds, `Optional<float64>`) and `mediaPaused(h)` (`Optional<bool>`). None for
    0, an unknown or stale handle, an element that is not a `<video>` or `<audio>`, and a length not known yet (before
    the metadata has loaded) or without end.
  - `seekMedia(h, seconds)`: true when it was asked of a media element with a finite time >= 0. The time reads back at
    once (clamped to the clip by the browser once its length is known), and a `Media` event follows when the frame
    there has been decoded.
  - `playMedia(h)` and `pauseMedia(h)`: true when asked of a media element. A pause takes effect at once; a play is
    the browser's to allow (`mediaPaused` says whether it did).
  - A **`Media`** event when a media element's metadata has loaded, it plays or pauses, a seek has finished, or its
    time moves while it plays. `target` names it by the usual rule, and the event says only that something changed:
    read the state. A browser's media events do not bubble, so the web hears them in the capture phase, as Focus — a
    bound container hears its clips', ancestors first. One waits at a time per binding and clip: a `Media` not yet
    polled absorbs the next, so a seek (whose time moves, then it finishes) is one event at the next poll.
  - Natively every one answers None or false, whatever the handle names, and a `Media` event never arrives. A
    document may carry a `<video>` on both legs; natively it lays out as an empty box.

### Changed

- **`textFocused()` counts every control a person types into, the same on both legs**: a `<textarea>`, and an
  `<input>` whose `type` is absent or empty, `text`, `password`, `number`, `search`, `email`, `url` or `tel`, in any
  case. It was `text` and `password` only, so a shortcut such as Ctrl+Z could take a number or a search field's own
  undo. Any other type is not, on either leg (natively RmlUi makes a type it does not know a text field, which a
  browser does not).

## [0.4.0] — 2026-10-15

Files into and out of the page, and drops that land where a document means them to: what a tool needs to take a
person's pictures and give its own results back. Built on @kama/rmlui 0.2.0, unchanged. The same events reach
`pollEvent` on both legs, as before.

### Breaking

- `UiEventKind` gains `Files`, `Paste` and `Read`. A `match` on it needs the new arms.
- `UiEvent` gains `files`, `atX` and `atY`, and `UiEvent.make` takes all nine fields.
- `UiHost` gains the files' methods below; a backend of its own must implement them.

### Added

- **Drop zones**: an element with `droppable="true"` and an id is a zone. A drop anywhere inside one names the zone
  as its `target` (up to the bound element that hears it), and the zone has `ui-drop-target`, not the inner element
  under the pointer. With no zone, both are the nearest element with an id, as in 0.3.0.
- **Where a drop landed**: `atX` and `atY`, 0 to 1 across the target's border box — before or after a row. Natively
  read from RmlUi's drop event itself, so a pointer moved before the poll does not change it.
- **Files**, one contract on both legs (host.kama, "files"):
  - `chooseFiles(accept, multiple)`: a file list its answer fills, reported by a `Files` event (empty: cancelled).
    One at a time; 0 with no document, and on the web without a person's recent gesture.
  - Files dropped from outside the page are a `Drop` with `source` 0 and `files` their list, by the zone rules. On
    the web the zone is highlighted while they are dragged over, and a file dropped anywhere in the window is never
    opened as a page. Text dragged in from outside is no drop.
  - Files pasted are a `Paste`, the document's, naming the focused element.
  - `fileCount`, `fileName`, `fileSize`, `fileType`, `filePath` (natively the absolute path, "" on the web) and
    `releaseFiles`. A list lives until released or `close`, across documents.
  - `readFile(files, index, offset, count)`: a slice read without blocking, reported by a `Read` event; `readBytes`
    moves the bytes out and lets the read go, `readError` says why one failed.
  - `saveFile(name, bytes)`: a download on the web, a save request natively.
  - `uiFileType(name)`: a media type from the name's extension, the package's own table, the same on both legs.
  - On the web a file stays the browser's `File` until a read asks, and `Module.kamaUiFile(files, index)` hands it to
    another library whole (a fetch's body).
- **The program's half natively**, as for the clipboard: `takeFileRequest`, `fileRequestAccept`,
  `fileRequestMultiple` and `provideFiles` for the open dialog; `takeSaveRequest`, `saveRequestName` and
  `saveRequestBytes` for the save dialog; `dropFiles(paths, x, y)` for the window's drop; `pasteFiles(paths)`. No-ops
  and zeros on the web, where the browser does all of it.
- A new document drops the events queued for the old one but not a `Files` or a `Read`: those answer the program.

### Fixed

- **Natively a class toggled on an `<input>` dropped RmlUi's own class for its type** (`range`, `checkbox`…), so a
  document's `input.range` rule stopped matching: a drag passing over a slider, or `setElementClass` on one, gave it a
  text field's size and moved everything below. The type class is set again after every class write.
- **On the web an `<input>` now carries its type as a class too**, as RmlUi gives it one, so `input.range` styles a
  slider on both legs (it matched natively only).

## [0.3.0] — 2026-10-14

Everything else a tool page needs, in one release: a list that grows and is trimmed in place, keys and shortcuts,
focus, double clicks, drag and drop, tooltips, the clipboard, and plain text. Built on @kama/rmlui 0.2.0
(`"@kama/rmlui": { "version": "^0.2.0" }`). It carries 0.2.2, which was never published. The same events reach
`pollEvent` in the same order on both legs, and the suite compares them as one string per leg.

### Breaking

- `UiEventKind` gains `DoubleClick`, `Key`, `Focus`, `Blur` and `Drop`. A `match` on it needs the new arms.
- `UiEvent` gains `source`, `key` and `mods`, and `UiEvent.make` takes all six fields.
- `key(code, down, mods)` takes the UI_MOD_* mask; it was `bool shift`. `mouseButton(button, down, mods)` takes it
  too.
- Natively the program forwards every key of the table, with modifiers, not only the navigation subset. `key` sends
  each to RmlUi first, so the first-press rule ("a navigation key with nothing focused lands on the first control")
  now runs after the document has heard the key.

### Added

- **Appending and trimming** (from 0.2.2): `appendInnerRml(handle, rml)` adds markup after the children without
  touching them. It costs the new markup's: the web uses `insertAdjacentHTML`, and native now uses @kama/rmlui
  0.2.0's `appendRml` (0.2.2 round-tripped the whole content). `isScrolledToEnd(handle)` lets a log follow only a
  reader at its end. New: `childCount(handle)` and `removeChildren(handle, from, count)`, so a log drops its oldest
  lines without a rewrite. What is removed is released.
- **Keys**: a `Key` event (`key`, `mods`, `element` 0, `target` the focused element) for Enter, Escape, Tab, the
  arrows, Delete, Backspace, Home/End, PageUp/PageDown and F1–F12. A–Z and 0–9 come only with Ctrl or Alt held, so
  text still arrives as `Change`. types.kama's UI_KEY_* table grows to cover them, with UI_MOD_SHIFT, UI_MOD_CTRL and
  UI_MOD_ALT; Cmd folds into Ctrl. The web hears the browser's keydown on the window. Natively the package listens on
  the document root, in the capture phase.
- `claimKey(key, mods)`: on the web the browser's default for that combination (Ctrl+S's save dialog) is prevented
  as the key goes down. Natively there is nothing to prevent, and it does nothing.
- **Focus and blur**: `Focus` and `Blur` for a button, a form control or an element with a tab index. RmlUi focuses
  whatever is pressed and sends focus to every element of the focus chain, so natively only these are reported.
  RmlUi's do not bubble, so both legs listen in the capture phase and deliver them ancestors first.
- **Double clicks**: `DoubleClick` on the second press of two within half a second, between the two clicks
  (Click, DoubleClick, Click). Natively it is RmlUi's, on the clock `update`/`updateAt` keeps. On the web it is the
  second `mousedown` (`detail` 2), not `dblclick`, which arrives after the second click.
- **Modifiers on a press**: `mods` on a Click, a DoubleClick and a Drop.
- **Drag and drop**, one markup: `draggable="true"`. Natively the package gives such an element RCSS
  `drag: drag-drop` wherever markup is inserted. On the web it is HTML5's own attribute; the package starts no drag
  from anything unmarked and accepts drops anywhere in the document.
  - A drop is a `Drop` heard by the element dropped on and its bound ancestors, with `target` the element dropped on
    and `source` the element dragged.
  - During the drag the dragged element has `ui-dragging` and the element under the pointer has `ui-drop-target`.
- **Tooltips from `title`**: the package's `#kama-ui-tooltip` (class `ui-tooltip`) shows an element's title after
  half a second of hover (UI_TOOLTIP_DELAY, on the program's clock), 12 px right of and 16 px below the pointer.
  - It hides when the pointer leaves, on a press and on a scroll, and stays hidden until another element is hovered.
  - On the web the browser's own popup never appears: a title is held as `data-kama-ui-title`.
- **The clipboard**: `copyText(text)` on both legs. On the web it goes through `navigator.clipboard`. Natively
  `provideClipboard(text)` and `takeClipboardWrite()` pass @kama/rmlui's pulled clipboard through, so the program
  bridges the OS clipboard. Ctrl+A/C/X/V work in a native field.
- `scrollIntoView(handle)`: like `scrollToEnd`, at once on the web, after the next layout natively.
- `elementContent(handle)` / `setElementContent(handle, text)`: an element's plain text, never parsed. A form control
  ignores both.
- A `<select>`'s options are rebuilt by `setInnerRml`, `appendInnerRml` and `removeChildren`, and its value settles
  with no change event (@kama/rmlui 0.2.0 natively).
- types.kama: `UI_TOOLTIP_DELAY`.

### Changed

- `update` and `updateAt` keep the program's clock on the web too, where they did nothing. The tooltip's delay is
  measured on that clock.
- Native `setElementClass` writes the `class` attribute, as a browser's `classList` does (from 0.2.2).
- Native `scrollToEnd` and `scrollIntoView` queue a mark that `update` honours. With nothing marked, `update` no
  longer queries the document.

### Tests

- Native 219 checks (debug, release, AddressSanitizer), web 224 (headless Firefox). The shared checks compare event
  sequences as strings on both legs:
  - keys, including Ctrl+S and Alt+1 reported and a plain or Shifted letter not;
  - focus moving, and a press taking it away;
  - Click, DoubleClick, Click, and two spaced clicks giving no double click;
  - Ctrl and Shift+Alt clicks;
  - a drag with its classes mid-drag and its Drop, and an appended row dragged;
  - a tooltip's delay, position and three ways of hiding;
  - scrolling a line into view, and trimming a log;
  - plain text, and a select rebuilt.
- Web only: a claimed key prevented (and Cmd+S folded into it), the clipboard spied, and a title held.
- Native only: Ctrl+A/C/V against the pulled clipboard.
- Input is injected per leg:
  - natively as RmlUi's own pointer and keys, a click half a second apart from the last so it never pairs;
  - on the web as the event sequence a browser fires, including the focus a press gives, since a synthetic event
    performs no default action.
- Mutation checks: each of these fails the checks that guard it:
  - reporting every native focus;
  - dressing no draggable natively;
  - counting the web's `dblclick`;
  - setting a native class with `setClass` (from 0.2.2);
  - `innerHTML +=` on the web in place of the append (from 0.2.2).

## [0.2.1] — 2026-10-14

Built on @kama/rmlui 0.1.1 (`"@kama/rmlui": { "version": "^0.1.1" }`), which adds element scrolling, quiet attribute
writes, and a range `change` only when the value moved. The legs now have no known difference in what reaches
`pollEvent`.

### Added

- `scrollToEnd(handle)`: scroll an element to the end of its content, so a log can follow its newest line. Write, then
  ask in the same frame, and the next frame drawn shows the end on both legs. The web sets `scrollTop` to
  `scrollHeight` at once, since a browser lays out on demand. Natively the request is a quiet mark on the element,
  honoured in the next `update` after the layout pass, because RmlUi measures only there. Scrolling at the call would
  follow one line behind. The `scroll` event it raises reaches no binding.

### Changed

- Native `setElementAttribute` / `removeElementAttribute` write every attribute quietly. Writing `checked` no longer
  raises a change, matching the web. This is the 0.2.0 known difference, now gone and unpinned from the native suite.
- Native range: a step past either end, or a drag within one step, no longer raises a change (@kama/rmlui drops it).
  It is one change per edit on both legs. This is 0.2.0's other known difference, also gone.

### Tests

- Native 165 checks (debug, release, AddressSanitizer), web 165 (headless Firefox). The new shared checks: no event
  from `checked` writes, none from a range stepped past its end, and `scrollToEnd` right after a rewrite, before any
  update. Scrolling at the call instead fails the last one natively: the newest line ends 240 px below the log.

## [0.2.0] — 2026-10-14

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

## [0.1.0] — 2026-10-13

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
