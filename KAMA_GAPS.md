# Gaps found in kama, from building @kama/ui

Found while extracting the UI seam into this package (2026-10-13). Each was run on the version named. The binding's
packaging gaps are in [../kama-rmlui/KAMA_GAPS.md](../kama-rmlui/KAMA_GAPS.md): a dependency cannot be gated by
target (so this package's web build compiles FreeType for nothing), and the older link-time ones.

**Current compiler:** `kama 0.9.577+g660b7812` (`../kama`).

---

## OPEN

### 1. `scope` is reserved but missing from AGENTS.md's list (DOC)

`scope` (structured concurrency) cannot name a binding, and AGENTS.md's reserved-word list does not say so. The list
names only the C keywords, and kama's own words bite the same way (`base`, `drop`, `get`, `in`, `out`, `as`, `self`…).
The compiler's message is clear.

### 2. Every path dependency down the chain is restated at the top (friction, documented)

`@kama/ui` depends on `@kama/rmlui` by path, which depends on `@kama/freetype` by path. `kama pkg install kama.json`
in this repo refuses until FreeType is listed here too: `path dependency '@kama/freetype' (required by @kama/rmlui)
is only allowed at the top level, or between two members of one kama_workspace.json`. So this manifest names a
package it never imports, and `tests/kama.json` names all three. A `kama_workspace.json` over the three sibling
repositories is the documented way out, but the three are separate repositories. The restating ends once the
dependencies are registry versions. **Open: language, std or package?** The toolchain (`pkg install`).

### 3. `std::fs::File` has no seek or positioned read (GAP, worked around)

`readFile`'s slice of a large file must not cost reading everything before it, and std's `File` offers no seek
(`read`, `write`, `readAll`, `metadata`; the-mallow-man's KM-57 found the same in 0.9.577, for an HTTP `Range`). The
native leg seeks the descriptor itself: `lseek` (or `_lseeki64` on Windows) through `src/kama_ui_native.h`, on
`File.rawFd()`. **Open: language, std or package?** std: a `seek` (or `readAt`) on `File`. Found 0.9.603, 2026-10-15.

### Seen again

- With several files in a module, a failed check's summary names the wrong file (errors in `b.kama` print
  `src/a.kama FAILED`).
- Semantic errors always report column 0; parse errors carry the real column.
