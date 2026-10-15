// kama_ui_test.h — what the web test needs from its page that the seam does not offer: a REAL injected click, and a
// way to say the verdict where a headless browser's --dump-dom can read it. Bodies in kama_ui_test.js. Declarations
// only (see src/kama_ui_web.h for why there is no EM_JS here).
#ifndef KAMA_UI_TEST_H
#define KAMA_UI_TEST_H
#include <stdint.h>
// A press at the element under (x, y) — FRAMEBUFFER pixels, as `elementRect` returns them — found by the browser's own
// hit test (document.elementFromPoint), as a browser reports one: mousedown (and, unless it was prevented, the focus a
// press gives — a synthetic event performs no default action, so the helper does that one), mouseup, click; `clicks` 2
// repeats it with `detail` 2 and adds dblclick. `mods` are UI_MOD_*. 1 when something was under the point.
extern int32_t kama_ui_test_press_at(float x, float y, int32_t mods, int32_t clicks);
// A key's keydown and keyup at the focused element, for a UI_KEY_* with UI_MOD_* (and `meta` for Cmd). 1 when the
// keydown's default was prevented.
extern int32_t kama_ui_test_key(int32_t code, int32_t mods, int32_t meta);
// mouseover and mousemove at the element under (x, y). 1 when something was there.
extern int32_t kama_ui_test_hover_at(float x, float y);
// A drag as a browser reports one, from the element under one point to the element under another: mousedown (with its
// focus), dragstart, dragenter and dragover — then, at `drag_end`, drop and dragend. 1 when both points hit something.
extern int32_t kama_ui_test_drag_begin(float from_x, float from_y, float to_x, float to_y);
extern int32_t kama_ui_test_drag_end(void);
// navigator.clipboard.writeText replaced by a recorder, and whether it last recorded `text`.
extern void kama_ui_test_spy_clipboard(void);
extern int32_t kama_ui_test_copied_is(const char* text);
// 1 when the element with this id has the attribute.
extern int32_t kama_ui_test_has_attr(const char* id, const char* attr);
// Set document.title to "kama-ui web: PASS <run>" or "kama-ui web: FAIL <failed>/<run>", and write the same into
// <pre id="kama-ui-test-result">.
extern void kama_ui_test_report(int32_t run, int32_t failed);
// 1 when the element with this id has the attribute and its value ends with `suffix` (what the image rewrite did).
extern int32_t kama_ui_test_attr_ends(const char* id, const char* attr, const char* suffix);
// The wheel at (x, y) — framebuffer pixels: a `wheel` event at the element there, then the nearest scrollable box
// scrolled by `notches` x 40 CSS pixels, which is what the browser does for a wheel itself (a synthetic WheelEvent
// scrolls nothing). 1 when something scrolled.
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
// 0.4.0: files. A drag of two files (a.txt, b.png) from outside to the point: `how` 1 enters and goes over, 2 drops
// too, 3 leaves the window, 4 drops plain text instead. The chooser allowed (a gesture assumed), checked against
// what was asked and answered (or cancelled); a paste of a.txt; the downloads stopped and recorded ("name size type",
// measured); and the bridge's File at an index, by its name ("" for null).
extern int32_t kama_ui_test_drop_files(float x, float y, int32_t how);
extern void kama_ui_test_allow_chooser(void);
extern int32_t kama_ui_test_chooser_is(const char* accept, int32_t multiple);
extern int32_t kama_ui_test_answer_chooser(int32_t cancel);
extern int32_t kama_ui_test_paste_files(void);
extern void kama_ui_test_spy_saves(void);
extern int32_t kama_ui_test_saved(char* buffer, int32_t capacity);
extern int32_t kama_ui_test_bridge_is(int32_t files, int32_t index, const char* name);
#endif
