// kama_ui_web.h — the web half of the UI seam (see src/host.kama).
//
// `kama_ui_web_set_image_rewrite` is this package's addition to the seam.
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
extern int32_t kama_ui_web_init(int32_t width, int32_t height);

// Replace the live document. ⚠️ INVALIDATES EVERY HANDLE `kama_ui_web_bind` HAS RETURNED, exactly as
// the native backend's document load does — the bindings are dropped here rather than left dangling.
extern int32_t kama_ui_web_set_document(const char* html);

// Replace a bound element's content. ⚠️ DESTROYS ITS SUBTREE, so a handle bound to something INSIDE
// it is stale afterwards. Binding what this call just created is the other order and is fine.
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

extern int32_t kama_ui_web_poll_event(int32_t* handle);

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
extern int32_t kama_ui_web_element_text(int32_t handle, char* buffer, int32_t capacity);
extern void kama_ui_web_set_text(int32_t handle, const char* text);
extern void kama_ui_web_close_document(void);
// el.style[name] = value ("" removes it).
extern int32_t kama_ui_web_set_property(int32_t handle, const char* name, const char* value);
// Every `<img src>` inserted from now on (documents and set_inner) has a trailing `native_ext` rewritten to
// `web_ext`, in the markup before the browser parses it. "" for either turns it off.
extern void kama_ui_web_set_image_rewrite(const char* native_ext, const char* web_ext);

#endif  // KAMA_UI_WEB_H
