# Gaps found in kama, from building @kama/ui

Found while lifting the UI seam out of the-mallow-man and friendly-fire-department (2026-10-13). Each was run on the
version named. The binding's packaging gaps (gated `link`, the OS arm, gated `cincludes`) are in
[../kama-rmlui/KAMA_GAPS.md](../kama-rmlui/KAMA_GAPS.md).

**Current compiler:** `kama 0.9.577+g660b7812` (`../kama`).

---

## OPEN

### 1. `scope` is reserved but missing from AGENTS.md's list (DOC)

`scope` (structured concurrency) cannot name a binding, and AGENTS.md's reserved-word list does not say so; the same
family as the-mallow-man's KM-27 (`base`, `drop`, `get`, `in`, `out`, `as`, `self`…). The compiler's message is clear.

### Seen again

the-mallow-man's KM-60 (a check summary names the wrong file of a module) and KM-61 (semantic errors report column 0).
