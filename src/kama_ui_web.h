// kama_ui_web.h — the web half of the UI seam (see src/host.kama).
//
// `kama_ui_web_set_image_rewrite` is this package's addition to the seam; 0.2.0's are marked below.
//
// DECLARATIONS ONLY. The bodies live in kama_ui_web.js and are linked by emcc's `--js-library`, which
// arrives from this package's `jsLibraries` and propagates to every consumer.
//
// ⚠️ NO `static inline` BODIES AND NO `EM_JS`, and the reason is measured rather than stylistic. kama
// emits every `extern "…h";` into ONE shared generated header included by EVERY translation unit of
// the program, so anything here that DEFINES a symbol is defined N times. `EM_JS` does exactly that,
// and the wasm link fails with `duplicate symbol: __em_js__…` — found in a game built on this seam,
// whose audio web header paid for it first.
//
// ⚠️ **0.9.408 CHANGED THE PREMISE OF THE PARAGRAPH ABOVE, AND THE RULE IS KEPT ANYWAY.** kama no
// longer unions every `extern "<h>"` into one shared header for every TU: a header backing extern
// FUNCTIONS now goes to the `.c` of the module that CALLS them, and only headers backing extern
// TYPES, ENUMS or `extern const` stay in the shared one (KR-77). This header declares nothing but
// functions, so it now reaches ONE translation unit rather than all of them — which means the
// "defined N times" mechanism described above no longer applies to it as written.
//
// ⚠️ **WHETHER `EM_JS` WOULD NOW LINK IS UNPROBED, AND THE RULE STANDS REGARDLESS.** Nobody has
// re-run that experiment, so this comment says so rather than guessing in either direction. An FFI
// header holding declarations and no definitions is right on its own merits — it is what lets the
// same header be included from anywhere without thinking about how many TUs got it. (Measured under
// kama 0.9.4xx; this package builds with 0.9.577.)
//
// ⚠️ AND THIS BACKEND EMITS NO DRAW COMMANDS AT ALL, WHICH IS THE WHOLE DESIGN. RmlUi hands geometry
// to a recording render interface because it has no way to put pixels anywhere; a browser lays out
// and PAINTS the DOM itself. So there is no counterpart here to @kama/rmlui's `kama_rmlui_command_*` or
// `kama_rmlui_texture_*` — `commandCount()` and `textureCount()` are 0 on this leg for ever, the canvas
// draws nothing behind the screen, and the document is real elements over it. That is what
// "one asset, two rasterizers" means: the browser rasterizes DOM text from the same `.ttf` FreeType
// reads natively.
//
// The vocabulary is deliberately NOT `.rml`. `ui::UiContext` runs a document through
// `ui::uidoc::rmlToHtml` before it gets here, so everything crossing this seam is already HTML.

#ifndef KAMA_UI_WEB_H
#define KAMA_UI_WEB_H

#ifndef __EMSCRIPTEN__
// A tripwire, not a portability guard: this header is gated out of the native build by
// `file @compileFor(ARCH_WASM32);` at the top of src/web.kama. If that gate ever stops holding,
// fail here rather than at a confusing link error.
#error "kama_ui_web.h reached the native build — the @compileFor gate on its extern did not hold"
#endif

#include <stdint.h>

// Find or build the overlay the documents live in, and size it to the VIRTUAL resolution. Returns 0
// when there is no DOM at all — node, a worker — which the caller reports as `isOpen() == false` and
// every screen already handles by falling back.
//
// The shell owns `#ui-stage` and `#ui-root`; this creates them only if the page did not, so a program
// still shows its UI under emcc's stock shell.
//
// `page` (0.2.0) non-zero: the stage is the WINDOW instead — pinned to its four edges, sized and resized by CSS, shown
// at once and never scaled — and `width`/`height` are ignored. `kama_ui_web_set_viewport` then only shows and hides it.
extern int32_t kama_ui_web_init(int32_t width, int32_t height, int32_t page);

// Replace the live document. ⚠️ INVALIDATES EVERY HANDLE `kama_ui_web_bind` HAS RETURNED, exactly as
// the native backend's document load does — the bindings are dropped here rather than left dangling.
extern int32_t kama_ui_web_set_document(const char* html);

// Replace a bound element's content. ⚠️ DESTROYS ITS SUBTREE, so a handle bound to something INSIDE
// it is stale afterwards. Binding what this call just created is the other order and is fine.
// (0.2.0) Those bindings are RELEASED before the write — element and listeners — and every entry point re-finds a
// released handle by its id, or treats it as unknown.
extern void kama_ui_web_set_inner(int32_t handle, const char* html);

// Name an element once, get a dense 1-based integer handle. 0 when no element has that id. Binding
// the same id twice yields the same handle.
//
// ⚠️ THE CLICK LISTENER IT ATTACHES DOES NOT STOP PROPAGATION, and that is required rather than
// careless: RmlUi bubbles, so natively a bound CONTAINER already receives its children's clicks and
// one press on a button inside a bound container delivers TWO events. A backend that swallowed the
// bubble would deliver one, and the two legs would count differently.
extern int32_t kama_ui_web_bind(const char* element_id);

// Pop one event: returns the kind (0 none, 1 click, 2 change) and writes the handle. Polled, never
// pushed — kama holds no callback on either leg (see @kama/rmlui's kama_rmlui.h for the argument).
// Move the focus ring, or activate what it is on. `key` is a GLFW key code and only the
// navigation subset is acted on — TAB, the four arrows, ENTER. ⚠️ **There is no key-UP counterpart**:
// the DOM moves focus on the press and has nothing to do on a release, so `src/web.kama` drops
// those rather than crossing the seam to do nothing. See src/types.kama for why the subset is a subset.
extern void kama_ui_web_key(int32_t key, int32_t shift);
// 1 when the focus ring is on a navigable control, 0 otherwise. See host.kama's `focusHeld` for why
// this exists: it is what lets ONE key mean both "press this button" and "leave this screen".
extern int32_t kama_ui_web_focus_held(void);

// Give the live document keyboard focus, so a pad can navigate without a mouse click first.
//
// ⚠️ **THIS DECLARATION WAS ONCE MISSING FOR A COMMIT, AND THE WEB BUILD WAS RED THE WHOLE TIME**:
// its kama `extern` and its JS body both landed, the header did not, and **kama emits no prototype
// for an `extern`** — so the emitted C called an undeclared function and clang refused it under C99. Every `extern fn` in web.kama needs its line here.
extern void kama_ui_web_focus_document(void);

// `target` (0.2.0): the handle for the nearest element with an id from the event's target up to the bound element,
// minted without a listener if nobody bound it; 0 when the target has left the document since. (0.3.0) Kinds 3 a double
// click, 4 a key, 5 focus, 6 blur, 7 a drop; `source` a drop's dragged element named the same way, `key` a key's
// UI_KEY_*, `mods` UI_MOD_*. Every output is written on every path.
extern int32_t kama_ui_web_poll_event(int32_t* handle, int32_t* target, int32_t* source, int32_t* key, int32_t* mods,
                                      int32_t* files, float* at_x, float* at_y);

// Where the overlay sits over the canvas, and whether it is on screen at all.
//
// ⚠️ THE OFFSETS AND SCALE ARE IN FRAMEBUFFER PIXELS, because that is what a program's letterbox
// computes and this seam must not hold a second copy of that mapping. The conversion to CSS pixels is
// one division by the canvas's own backing-store ratio, done in the JS — the same ratio a platform
// layer divides the mouse by.
extern void kama_ui_web_set_viewport(float offset_x, float offset_y, float scale, int32_t visible);

// An element's border box, in framebuffer pixels to match the native side. Returns 0 and zeroes all
// four outputs on an unknown handle.
extern int32_t kama_ui_web_element_rect(int32_t handle, float* x, float* y, float* width, float* height);

// A bound form control's value as a number — `parseFloat(el.value)`, and 0 when that is NaN, which
// covers both an unknown handle and an element that has no `value` at all. The native counterpart
// reaches RmlUi's `ElementFormControl::GetValue`.
extern float kama_ui_web_element_value(int32_t handle);

// The two setters — `el.value = v` (no event, as natively) and `el.classList.toggle(name, on)`.
extern void kama_ui_web_set_value(int32_t handle, float value);
extern void kama_ui_web_set_class(int32_t handle, const char* name, int32_t on);

extern void kama_ui_web_shutdown(void);

// ---- text entry and focus. A browser types into its own <input>, has no dp ratio to set (the viewport
// transform carries the scale) and keeps its own clock, so those three have no web call.
extern int32_t kama_ui_web_focus_element(int32_t handle);
extern int32_t kama_ui_web_focused(void);
extern int32_t kama_ui_web_text_focused(void);
// Writes at most `capacity - 1` bytes and a NUL, and returns the value's FULL length in bytes whatever the capacity:
// call it with no buffer to measure, then with `length + 1` (0.2.0; there was a 512-byte buffer).
extern int32_t kama_ui_web_element_text(int32_t handle, char* buffer, int32_t capacity);
extern void kama_ui_web_set_text(int32_t handle, const char* text);
extern void kama_ui_web_close_document(void);
// el.style[name] = value ("" removes it).
extern int32_t kama_ui_web_set_property(int32_t handle, const char* name, const char* value);
// Every `<img src>` inserted from now on (documents and set_inner) has a trailing `native_ext` rewritten to
// `web_ext`, in the markup before the browser parses it. "" for either turns it off.
extern void kama_ui_web_set_image_rewrite(const char* native_ext, const char* web_ext);

// ---- 0.2.0 ----
// The id a handle names, measured and read as `kama_ui_web_element_text` is.
extern int32_t kama_ui_web_element_id(int32_t handle, char* buffer, int32_t capacity);
// One attribute set or removed. `checked` and `value` also write the control's live property (the attribute is only
// its default in a browser); `src` gets the image rewrite.
extern void kama_ui_web_set_attribute(int32_t handle, const char* name, const char* value);
extern void kama_ui_web_remove_attribute(int32_t handle, const char* name);
// 1 when the handle names an `<input>` whose `.checked` is true.
extern int32_t kama_ui_web_element_checked(int32_t handle);
// `kama_ui_web_bind` without the listener: the same handle for the id, 0 when no element has it.
extern int32_t kama_ui_web_find(const char* element_id);
// (0.2.1) `el.scrollTop = el.scrollHeight`, which the browser clamps to the end. Reading `scrollHeight` lays out first.
extern void kama_ui_web_scroll_to_end(int32_t handle);
// (0.2.2) 1 when `scrollHeight - scrollTop - clientHeight <= 1` (which a box that cannot scroll always is).
extern int32_t kama_ui_web_is_scrolled_to_end(int32_t handle);
// (0.2.2) `insertAdjacentHTML('beforeend', …)` after the image rewrite: the existing children, their listeners and a
// text selection in them are untouched, and no binding is released.
extern void kama_ui_web_append_inner(int32_t handle, const char* html);

// ---- 0.3.0 ----
// The program's clock — a step (`absolute` 0, from `update`) or the time itself (1, `updateAt`) — and the tooltip's turn.
extern void kama_ui_web_update(double seconds, int32_t absolute);
// Children as RmlUi counts them (elements and non-blank text), and removing `count` from `from` (clamped; returns how
// many went, their bindings released).
extern int32_t kama_ui_web_child_count(int32_t handle);
extern int32_t kama_ui_web_remove_children(int32_t handle, int32_t from, int32_t count);
// Plain text: the non-blank text runs inside (measured and read as `kama_ui_web_element_text` is), and `textContent`.
// Nothing for a form control.
extern int32_t kama_ui_web_element_content(int32_t handle, char* buffer, int32_t capacity);
extern void kama_ui_web_set_content(int32_t handle, const char* text);
extern void kama_ui_web_scroll_into_view(int32_t handle);
// The browser's default for this key and these modifiers is prevented from now on (the window's keydown listener).
extern void kama_ui_web_claim_key(int32_t key, int32_t mods);
// `navigator.clipboard.writeText`, whose refusal is swallowed.
extern void kama_ui_web_copy_text(const char* text);

// ---- 0.4.0: files ----
// The chooser (`<input type=file>`, clicked within the person's gesture): the list its answer fills, or 0 (one is
// waiting, no document, no recent gesture). A list's size, name (measured and read as `kama_ui_web_element_text` is)
// and release. The size is a double, exact to 2^53, so no 64-bit integer crosses the JS boundary.
extern int32_t kama_ui_web_choose_files(const char* accept, int32_t multiple);
extern int32_t kama_ui_web_file_count(int32_t files);
extern int32_t kama_ui_web_file_name(int32_t files, int32_t index, char* buffer, int32_t capacity);
extern double  kama_ui_web_file_size(int32_t files, int32_t index);
extern void    kama_ui_web_release_files(int32_t files);
// A read of a slice of a file: its handle (0 for a bad list or index), and later its length (-2 while it waits, -1
// failed or unknown), its bytes copied into `buffer` (which lets the read go), and its error text.
extern int32_t kama_ui_web_read_file(int32_t files, int32_t index, double offset, int32_t count);
extern int32_t kama_ui_web_read_length(int32_t read);
extern void    kama_ui_web_read_take(int32_t read, uint8_t* buffer);
extern int32_t kama_ui_web_read_error(int32_t read, char* buffer, int32_t capacity);
extern void    kama_ui_web_read_release(int32_t read);
// A download of `count` bytes as `name` (`type` its media type): 1 when offered.
extern int32_t kama_ui_web_save_file(const char* name, const char* type, const uint8_t* bytes, int32_t count);

#endif  // KAMA_UI_WEB_H
