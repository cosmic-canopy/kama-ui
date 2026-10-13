// kama_ui_test.h — what the web test needs from its page that the seam does not offer: a REAL injected click, and a
// way to say the verdict where a headless browser's --dump-dom can read it. Bodies in kama_ui_test.js. Declarations
// only (see src/kama_ui_web.h for why there is no EM_JS here).
#ifndef KAMA_UI_TEST_H
#define KAMA_UI_TEST_H
#include <stdint.h>
// Dispatch a bubbling MouseEvent('click') at the element under (x, y) — FRAMEBUFFER pixels, as `elementRect` returns
// them — found by the browser's own hit test (document.elementFromPoint). 1 when something was under the point.
extern int32_t kama_ui_test_click_at(float x, float y);
// Set document.title to "kama-ui web: PASS <run>" or "kama-ui web: FAIL <failed>/<run>", and write the same into
// <pre id="kama-ui-test-result">.
extern void kama_ui_test_report(int32_t run, int32_t failed);
// 1 when the element with this id has the attribute and its value ends with `suffix` (what the image rewrite did).
extern int32_t kama_ui_test_attr_ends(const char* id, const char* attr, const char* suffix);
#endif
