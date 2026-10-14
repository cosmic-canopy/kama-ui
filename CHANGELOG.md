# Changelog

All notable changes to `@kama/ui`. The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — unreleased

The first version: the UI seam the-mallow-man (E7b/E7c, 2026-10-07) and friendly-fire-department (a676ca3) built for
their menus, as a package. README.md, "Where it came from, and what was reconciled", lists every change.

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
