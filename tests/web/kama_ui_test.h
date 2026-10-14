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
// Scroll the nearest scrollable box under (x, y) — framebuffer pixels — by `notches` x 40 CSS pixels, which is what the
// browser does for a wheel itself (a synthetic WheelEvent scrolls nothing). 1 when something scrolled.
extern int32_t kama_ui_test_scroll_at(float x, float y, float notches);
// Keep the element with this id, to fire at after a rewrite or a new document has let it go. 1 when found.
extern int32_t kama_ui_test_hold(const char* id);
// Dispatch a bubbling click, input and change at the held element. 1 when one is held.
extern int32_t kama_ui_test_fire_held(void);
// The window's size (the viewport less any scrollbar), in framebuffer pixels.
extern void kama_ui_test_window(float* width, float* height);
// 1 when #ui-stage is a page's: pinned to the four edges with no size of its own, unscaled, shown, the window's size.
extern int32_t kama_ui_test_stage_is_page(void);
// What a browser reports for a person's edit, fired at the element with this id (a synthetic key types nothing):
// typing is an `input` per character then the `change` of the field letting go; picking selects the option, then
// `input` and `change`; a drag is an `input` per step then the `change` of the release. 1 when the element exists.
extern int32_t kama_ui_test_type(const char* id, const char* text);
extern int32_t kama_ui_test_pick(const char* select_id, const char* option_id);
extern int32_t kama_ui_test_drag(const char* id, int32_t steps);
// Select the text inside the element with this id, as a person's drag would. 1 when it exists.
extern int32_t kama_ui_test_select(const char* id);
// 1 when the page's selection is still that text: not collapsed, its nodes still in the document and inside the element.
extern int32_t kama_ui_test_selection_holds(const char* id);
#endif
