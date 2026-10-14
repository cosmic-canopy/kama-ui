# Gaps found in kama, from building @kama/ui

Found while lifting the UI seam out of the-mallow-man and friendly-fire-department (2026-10-13). Each was run on the
version named. The binding's packaging gaps are in [../kama-rmlui/KAMA_GAPS.md](../kama-rmlui/KAMA_GAPS.md): a
dependency cannot be gated by target (so this package's web build compiles FreeType for nothing), and the older
link-time ones.

**Current compiler:** `kama 0.9.577+g660b7812` (`../kama`).

---

## OPEN

### 1. `scope` is reserved but missing from AGENTS.md's list (DOC)

`scope` (structured concurrency) cannot name a binding, and AGENTS.md's reserved-word list does not say so; the same
family as the-mallow-man's KM-27 (`base`, `drop`, `get`, `in`, `out`, `as`, `self`…). The compiler's message is clear.

### 2. Every path dependency down the chain is restated at the top (friction, documented)

`@kama/ui` depends on `@kama/rmlui` by path, which depends on `@kama/freetype` by path. `kama pkg install kama.json`
in this repo refuses until FreeType is listed here too: `path dependency '@kama/freetype' (required by @kama/rmlui)
is only allowed at the top level, or between two members of one kama_workspace.json`. So this manifest names a
package it never imports, and `tests/kama.json` names all three. A `kama_workspace.json` over the three sibling
repositories is the documented way out, but the three are separate repositories. The restating ends once the
dependencies are registry versions. **Open: language, std or package?** The toolchain (`pkg install`).

### Seen again

the-mallow-man's KM-60 (a check summary names the wrong file of a module) and KM-61 (semantic errors report column 0).
