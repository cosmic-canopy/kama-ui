// kama_ui_web.js — the web UI backend, as an emcc `--js-library`. The DOM and CSS, and nothing else: no JS library.
//
// From the-mallow-man's ui/src/tmm_ui_web.js (E7b/E7c; itself friendly-fire-department@a676ca3's ffd_ui_web.js), renamed
// tmm_/TmmUi -> kama_ui_/KamaUi, with two changes: the image rewrite (`kama_ui_web_set_image_rewrite`) and text
// controls in the focus ring (`navItems`).
//
// The bodies of kama_ui_web.h. Linked by the `--js-library` this package's `jsLibraries` contributes,
// which the driver propagates to every consumer of `@kama/ui`.
//
// WHY NOT `EM_JS` IN THE HEADER, which would have needed no manifest entry at all: kama emitted every
// `extern "…h";` into ONE shared generated header that every translation unit included. `EM_JS`
// defines a real symbol, so each of those TUs emitted it and the wasm link failed with
// `duplicate symbol: __em_js__…`. A `--js-library` is linked once for the whole program. (kama_ui_web.h
// says what changed in kama 0.9.408 and why the rule stands anyway.)
//
// ⚠️ NOTHING HERE DRAWS, AND NOTHING HERE IS ASKED TO. The native backend records geometry for the
// program's renderer because RmlUi cannot put pixels anywhere; a browser paints the DOM itself. So this
// file creates elements, writes markup and queues clicks, and the canvas behind the overlay simply draws
// nothing on the frames a screen is up.

mergeInto(LibraryManager.library, {
    // Per-page state. `$`-prefixed so emcc treats it as a library object rather than a function, and
    // every entry point below names it in `__deps` or it is dead-code-eliminated away.
    $KamaUi: {
        stage: null,       // the fixed virtual-resolution box that carries the letterbox transform
        root: null,        // the document's own <body>, inside it
        els: [],           // handle N -> els[N - 1]; dense and 1-based, matching the native shim
        ids: [],           // parallel to els: the id each handle was bound to
        listeners: [],     // parallel to els: so a document swap can detach before dropping
        events: [],        // {kind, handle}, drained by poll
        head: 0,
        imageFrom: '',     // kama_ui_web_set_image_rewrite: `<img src` ending in this ...
        imageTo: '',       // ... is rewritten to end in this, before the browser parses the markup

        // ⚠️ IN THE STRING, BEFORE `innerHTML`, NOT ON THE ELEMENTS AFTER IT: the browser starts fetching an
        // `<img src>` the moment it parses one, so rewriting the DOM afterwards would fetch the native file first —
        // a 404 per picture. The rule is the one `uidoc` used to carry as a string rewrite: the extension followed by
        // the attribute's closing double quote, so prose that happens to name the file is left alone.
        rewrite: function (html) {
            if (!this.imageFrom || !this.imageTo) return html;
            return html.split(this.imageFrom + '"').join(this.imageTo + '"');
        },

        // The set the focus ring can actually land on, in document order.
        //
        // ⚠️ **ONE DEFINITION, BECAUSE THE NAVIGATION AND THE FOCUS QUERY MUST AGREE.** Two copies of
        // this filter would drift, and the drift would be invisible in the worst way: a screen-level
        // verb suppressed by a ring that the navigation does not believe is there, or the reverse.
        //
        // ⚠️ `:not([disabled])` MATTERS: a screen whose primary action is disabled until a field is filled
        // would otherwise focus a control that refuses clicks — a dead end a player cannot see the edge
        // of. And `offsetParent === null` is `display:none` and everything inside it, which is exactly
        // the set a player cannot see.
        //
        // ⚠️ TEXT CONTROLS ARE IN THE RING (CHANGED from the games' copy, which had buttons and [tabindex]
        // only): RmlUi reaches an `<input>` through the `tab-index: auto` its RCSS gives it, but a browser
        // reads no RCSS, so the-mallow-man's join panel — whose name and address fields carry no
        // `tabindex` attribute — walked straight past them on the web while the native ring stopped on both.
        navItems: function () {
            if (!this.root) return [];
            var list = this.root.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
                'select:not([disabled]), textarea:not([disabled]), [tabindex]');
            // Out of the ring: HTML's `tabindex="-1"`, or RCSS's inline `style="tab-index: none"` — which is the ONLY
            // way to take a form control out natively, because RmlUi gives every form control an INLINE
            // `tab-index: auto` that no stylesheet rule can beat (ElementFormControl's constructor). So a document
            // writes the inline style, and this reads it, and the two rings agree.
            return Array.prototype.filter.call(list, function (el) {
                if (el.offsetParent === null || el.getAttribute('tabindex') === '-1') return false;
                var st = (el.getAttribute('style') || '').replace(/\s+/g, '');
                return st.indexOf('tab-index:none') < 0;
            });
        },

        // The last transform actually written to the DOM. ⚠️ THIS IS NOT AN OPTIMISATION — IT IS
        // WHAT LETS A DOCUMENT SCROLL AT ALL. A game hides the overlay at the top of every scene and
        // shows it again only on the paths that draw a document, so an unguarded implementation would
        // set `display:none` and back sixty times a second — and `display:none` RESETS SCROLL
        // POSITION, so a scrolled list would snap to the top on every frame and the wheel would look dead.
        // Writing only on a real change also keeps the whole overlay out of the frame's layout work.
        //
        // ⚠️ IT MEMOISES THE FINISHED STRING RATHER THAN THE FOUR ARGUMENTS, because the transform
        // also depends on where the CANVAS is, which the arguments do not carry: a window resize
        // moves the canvas without changing the viewport the program hands over, and comparing
        // arguments would leave the overlay behind.
        vt: '', vv: -1,

        // ⚠️ THE RATIO IS READ OFF THE CANVAS, NOT FROM devicePixelRatio. a game's platform layer sized the
        // backing store from the dpr ONCE at init and the CSS size is what it set; asking the window
        // again would disagree the moment a page is dragged between monitors, and the mouse path
        // already derives its own scale exactly this way. One source, two readers. No canvas (a page
        // that is all UI) is ratio 1.
        ratio: function () {
            var c = document.getElementById('canvas');
            if (!c) return 1;
            var cw = c.clientWidth;
            if (!(cw > 0)) return 1;
            return c.width / cw;
        },

        // Drop every binding. Called when the document is replaced — the native shim detaches its
        // RmlUi listeners here too, and for a sharper reason: over there a listener outliving its
        // element is a use-after-free one frame later. Ours would merely leak, which is exactly why
        // it is worth doing deliberately rather than relying on the difference.
        clearBindings: function () {
            for (var i = 0; i < KamaUi.els.length; i++) {
                var el = KamaUi.els[i];
                var fn = KamaUi.listeners[i];
                if (el && fn) el.removeEventListener('click', fn);
            }
            KamaUi.els = [];
            KamaUi.ids = [];
            KamaUi.listeners = [];
            KamaUi.events = [];
            KamaUi.head = 0;
        }
    },

    kama_ui_web_init__deps: ['$KamaUi'],
    kama_ui_web_init: function (width, height) {
        if (typeof document === 'undefined' || !document.body) return 0;

        KamaUi.stage = document.getElementById('ui-stage');
        if (!KamaUi.stage) {
            // The shell did not supply one. Build it, so a program still shows its screens under
            // emcc's stock shell rather than looking like the backend does nothing.
            KamaUi.stage = document.createElement('div');
            KamaUi.stage.id = 'ui-stage';
            document.body.appendChild(KamaUi.stage);
        }
        KamaUi.root = document.getElementById('ui-root');
        if (!KamaUi.root) {
            KamaUi.root = document.createElement('div');
            KamaUi.root.id = 'ui-root';
            KamaUi.stage.appendChild(KamaUi.root);
        }

        // The stage is the VIRTUAL resolution in CSS pixels and is scaled as a whole, which is what
        // makes a document identical at every window size.
        var s = KamaUi.stage.style;
        s.position = 'fixed';
        s.left = '0';
        s.top = '0';
        s.width = width + 'px';
        s.height = height + 'px';
        s.transformOrigin = '0 0';
        s.display = 'none';
        KamaUi.clearBindings();
        return 1;
    },

    kama_ui_web_set_document__deps: ['$KamaUi'],
    kama_ui_web_set_document: function (htmlPtr) {
        if (!KamaUi.root) return 0;
        KamaUi.clearBindings();
        KamaUi.root.innerHTML = KamaUi.rewrite(UTF8ToString(htmlPtr));
        // ⚠️ `autofocus` DOES NOTHING IN MARKUP SET THROUGH innerHTML — a browser runs it once per page, at load — but
        // RmlUi's document show focuses it (FocusFlag::Auto), and a menu's first button is where a pad starts. So it
        // is done here, by hand, to keep the two legs' rings starting in the same place (ADDED; the games' copy
        // started the web ring on nothing).
        var af = KamaUi.root.querySelector('[autofocus]');
        if (af && typeof af.focus === 'function') af.focus();
        return 1;
    },

    kama_ui_web_set_inner__deps: ['$KamaUi'],
    kama_ui_web_set_inner: function (handle, htmlPtr) {
        var el = KamaUi.els[handle - 1];
        if (!el) return;
        el.innerHTML = KamaUi.rewrite(UTF8ToString(htmlPtr));
    },

    kama_ui_web_set_image_rewrite__deps: ['$KamaUi'],
    kama_ui_web_set_image_rewrite: function (fromPtr, toPtr) {
        KamaUi.imageFrom = fromPtr ? UTF8ToString(fromPtr) : '';
        KamaUi.imageTo = toPtr ? UTF8ToString(toPtr) : '';
    },

    kama_ui_web_bind__deps: ['$KamaUi'],
    kama_ui_web_bind: function (idPtr) {
        if (!KamaUi.root) return 0;
        var id = UTF8ToString(idPtr);
        var at = KamaUi.ids.indexOf(id);
        if (at >= 0) {
            // Already bound. ⚠️ RE-RESOLVE IF THE ELEMENT HAS BEEN DETACHED BY A `set_inner`.
            // Keeping the HANDLE stable is what matters to a caller (dispatch is a chain of `==`
            // against integers), so re-pointing it changes nothing about the contract.
            //
            // ✅ **THE NATIVE LEG DOES THE SAME**, through @kama/rmlui's bindings, which track each element
            // with RmlUi's ObserverPtr. ⚠️ It could not use this leg's `contains` test on a raw pointer: a
            // destroyed element's memory is commonly reused by its replacement, so the pointers compare
            // equal — the games' shims found that the hard way. A detached DOM node stays detached.
            var old = KamaUi.els[at];
            if (old && KamaUi.root.contains(old)) return at + 1;
            var again = KamaUi.root.querySelector('#' + CSS.escape(id));
            if (!again) return at + 1;
            if (KamaUi.listeners[at]) {
                again.addEventListener('click', KamaUi.listeners[at]);
                again.addEventListener('change', KamaUi.listeners[at]);
                again.addEventListener('input', KamaUi.listeners[at]);
            }
            KamaUi.els[at] = again;
            return at + 1;
        }

        var el = KamaUi.root.querySelector('#' + CSS.escape(id));
        if (!el) return 0;

        var handle = KamaUi.els.length + 1;
        // ⚠️ NO stopPropagation. RmlUi bubbles, so natively a bound container receives its children's
        // clicks and one press on a button inside it delivers TWO events. Swallowing the bubble here
        // would make the two legs count differently, which is the kind of divergence nothing would catch.
        //
        // ⚠️ **`input` AS WELL AS `change`, AND THAT IS WHAT MAKES A SLIDER BEHAVE THE SAME ON BOTH
        // LEGS.** RmlUi's range fires its Change event on every movement of the bar; a browser's
        // `change` fires only when the drag is RELEASED, and `input` is the one that fires
        // continuously. Listening to `change` alone would give a volume dial that previews live
        // natively and jumps at the end in a browser — a divergence a structural check cannot see and
        // an ear can. Both map to kind 2, so a release delivers two events, which is the same
        // duplicate shape the bubbling container already produces.
        var fn = function (e) {
            var kind = (e && (e.type === 'change' || e.type === 'input')) ? 2 : 1;
            KamaUi.events.push({ kind: kind, handle: handle });
        };
        el.addEventListener('click', fn);
        el.addEventListener('change', fn);
        el.addEventListener('input', fn);

        KamaUi.els.push(el);
        KamaUi.ids.push(id);
        KamaUi.listeners.push(fn);
        return handle;
    },

    // ---- moving the focus, because the browser never gets the chance ----------------------------
    //
    // ⚠️ **THE DOM WOULD DO ALL OF THIS ITSELF IF IT EVER SAW THE KEY, AND IT DOES NOT.**
    // a game's platform layer registers its handlers on the WINDOW with `EM_TRUE`, so TAB and the arrows are
    // preventDefault-ed before the overlay could act on them — which is deliberate and stays, because
    // it is what stops SPACE and the arrows scrolling the page out from under the game. So the move
    // has to be driven from here.
    //
    // ⚠️ **THIS IS THE ANALOGUE OF RmlUi's NAVIGATION, NOT A SECOND DESIGN.** Natively the toolkit
    // walks `tab-index` and the `nav-*` properties geometrically; here the browser's own focusability
    // rules and document order do the same job. Two toolkits, one seam — the shape `setInnerRml`
    // already has, where one call is RmlUi parsing markup and the other is `innerHTML`.
    //
    // ⚠️ **DOCUMENT ORDER RATHER THAN GEOMETRY, AND THAT IS A REAL SIMPLIFICATION.** RmlUi's
    // `nav: auto` picks the nearest box in the direction pressed; this picks the next one in the
    // markup. A single column of controls agrees on both legs — and where they would not, the fix is
    // to say `nav-*` explicitly in the RCSS rather than to grow a layout walker here. Said out loud
    // because a screen that ever lays controls out in a GRID will find this out on the web leg first.
    kama_ui_web_focus_held__deps: ['$KamaUi'],
    // Is the ring on something it could have been put on?
    //
    // ⚠️ **`document.activeElement` IS `<body>` WHEN NOTHING IS FOCUSED, NOT NULL** — so a bare
    // null-check would answer "yes" on every screen and suppress every screen-level verb.
    // Asking for membership of the navigable set answers the question that was actually asked, and it
    // is the same `indexOf` the navigation above already computes. This leg has always had the
    // answer; it simply never handed it back.
    kama_ui_web_focus_held: function () {
        if (!KamaUi.root) return 0;
        var items = KamaUi.navItems();
        if (!items.length) return 0;
        return items.indexOf(document.activeElement) >= 0 ? 1 : 0;
    },

    kama_ui_web_focus_document__deps: ['$KamaUi'],
    // ⚠️ **THE WEB'S ANSWER IS THE FIRST NAVIGABLE ITEM, NOT THE CONTAINER, AND THE TWO LEGS DIFFER
    // HERE ON PURPOSE.** RmlUi focuses a DOCUMENT and then lets TAB walk from it; a DOM container is
    // not focusable unless it carries a tabindex, and giving one to our root would put it in the
    // browser's own tab order alongside the page's real controls. Focusing the first navigable item
    // reaches the same end state — a ring the pad can move — by the route this leg already has.
    kama_ui_web_focus_document: function () {
        if (!KamaUi.root) return;
        if (document.activeElement && KamaUi.navItems().indexOf(document.activeElement) >= 0) return;
        var items = KamaUi.navItems();
        if (items.length) { items[0].focus(); }
    },

    kama_ui_web_key__deps: ['$KamaUi'],
    kama_ui_web_key: function (key, shift) {
        if (!KamaUi.root) return;

        // The UI_KEY_* codes (GLFW's numbers, src/types.kama) the native leg maps, and for the same reason:
        // the seam carries ONE set of codes so neither backend's key enum crosses it.
        var ENTER = 257, TAB = 258, RIGHT = 262, LEFT = 263, DOWN = 264, UP = 265;
        if (key !== ENTER && key !== TAB && key !== RIGHT && key !== LEFT && key !== DOWN && key !== UP) return;

        var items = KamaUi.navItems();
        if (!items.length) return;

        var at = items.indexOf(document.activeElement);

        // ⚠️ **A FOCUSED RANGE OWNS LEFT AND RIGHT, AND THE BROWSER CANNOT TELL US SO.** Natively
        // RmlUi's `WidgetSlider` takes those two keys and calls `StopPropagation`, which is why a
        // slider can carry `nav: auto` without the ring escaping the moment somebody adjusts it. In a
        // browser the range would do exactly the same — except a game's platform layer preventDefault-ed the
        // key before it ever reached the element, so **this is the only place that behaviour can
        // live on this leg.** Without it, RIGHT on a level moved the ring to the next row and changed
        // nothing, which is the opposite of what a settings screen does.
        //
        // ⚠️ UP and DOWN deliberately fall through to the navigation below: a control a pad can slide
        // but never leave is worse than one it cannot reach.
        var active = document.activeElement;
        if (active && active.tagName === 'INPUT' && active.type === 'range' && (key === LEFT || key === RIGHT)) {
            var step = parseFloat(active.step) || 1;
            var min = parseFloat(active.min); if (isNaN(min)) min = 0;
            var max = parseFloat(active.max); if (isNaN(max)) max = 100;
            var now = parseFloat(active.value); if (isNaN(now)) now = min;
            var want = key === RIGHT ? now + step : now - step;
            if (want < min) want = min;
            if (want > max) want = max;
            if (want !== now) {
                active.value = String(want);
                // `input`, not `change`: the seam listens for both and `input` is what a drag emits,
                // so a keyed adjustment reaches the program by the identical path a dragged one does.
                active.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }

        if (key === ENTER) {
            // Nothing focused yet means ENTER has nothing to press — it must NOT fall through to
            // "press the first thing", which would make a stray keypress start a round.
            if (at >= 0) items[at].click();
            return;
        }

        // ⚠️ **THE FIRST PRESS FOCUSES RATHER THAN MOVES**, which is what makes the ring discoverable:
        // with nothing focused, TAB or any arrow lands on the first control instead of the second.
        if (at < 0) { items[0].focus(); return; }

        var back = (key === TAB && shift) || key === UP || key === LEFT;
        var next = back ? at - 1 : at + 1;

        // Wrap, because a focus ring that stops at the end of a five-item menu reads as broken input
        // rather than as a boundary. RmlUi's `nav: auto` does not wrap; ⚠️ that is a per-leg
        // difference and it is the web leg that is nicer, which is worth knowing before anybody
        // "fixes" one to match the other.
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        items[next].focus();
    },

    kama_ui_web_poll_event__deps: ['$KamaUi'],
    kama_ui_web_poll_event: function (handlePtr) {
        if (KamaUi.head >= KamaUi.events.length) {
            // Drained: reset rather than letting the array grow for the life of the page. The native
            // shim does the same with its head index.
            KamaUi.events = [];
            KamaUi.head = 0;
            return 0;
        }
        var ev = KamaUi.events[KamaUi.head++];
        HEAP32[handlePtr >> 2] = ev.handle | 0;
        return ev.kind | 0;
    },

    kama_ui_web_set_viewport__deps: ['$KamaUi'],
    kama_ui_web_set_viewport: function (offsetX, offsetY, scale, visible) {
        if (!KamaUi.stage) return;
        var on = visible ? 1 : 0;
        // See $KamaUi.vt — writing an unchanged `display` would reset a document's scroll every frame.
        if (!on) {
            if (KamaUi.vv === 0) return;
            KamaUi.vv = 0;
            KamaUi.stage.style.display = 'none';
            return;
        }

        // ⚠️ ANCHORED TO THE CANVAS, NOT TO THE VIEWPORT ORIGIN. The offsets arrive relative to the
        // drawable, so a page that does not have the canvas at 0,0 — the shell centres it — would put
        // every screen in the wrong place. Reading the canvas's own box costs one call and makes the
        // overlay correct wherever the page decides to put it.
        //
        // ⚠️ AND THE RATIO IS THE CANVAS'S OWN, WHICH IS WHAT MAKES THIS ROBUST WHEN THE BACKING
        // STORE AND THE CSS SIZE DISAGREE. They can: a platform layer that resizes the backing store
        // only on the window's resize event leaves a canvas whose CSS size the stylesheet decided at
        // load with its initial backing store. The canvas is then drawn stretched — and the overlay
        // still lands exactly on it, because both numbers come from the same element.
        var c = document.getElementById('canvas');
        var b = c ? c.getBoundingClientRect() : { left: 0, top: 0 };
        var r = KamaUi.ratio();
        var t = 'translate(' + (b.left + offsetX / r) + 'px,' + (b.top + offsetY / r) + 'px)' +
                ' scale(' + (scale / r) + ')';
        if (KamaUi.vv === 1 && t === KamaUi.vt) return;
        KamaUi.vv = 1;
        KamaUi.vt = t;
        KamaUi.stage.style.display = 'block';
        KamaUi.stage.style.transform = t;
    },

    kama_ui_web_element_rect__deps: ['$KamaUi'],
    kama_ui_web_element_rect: function (handle, xPtr, yPtr, wPtr, hPtr) {
        // Every path writes all four, so a caller never reads a stale stack slot — the same totality
        // rule @kama/rmlui keeps natively.
        HEAPF32[xPtr >> 2] = 0;
        HEAPF32[yPtr >> 2] = 0;
        HEAPF32[wPtr >> 2] = 0;
        HEAPF32[hPtr >> 2] = 0;

        var el = KamaUi.els[handle - 1];
        if (!el || !KamaUi.stage) return 0;

        // getBoundingClientRect is in CSS pixels (relative to the viewport) and already carries the
        // stage's transform, so multiplying by the ratio lands in framebuffer pixels — which is what the
        // contract says this returns and what the native side measures in.
        var b = el.getBoundingClientRect();
        var r = KamaUi.ratio();
        HEAPF32[xPtr >> 2] = b.left * r;
        HEAPF32[yPtr >> 2] = b.top * r;
        HEAPF32[wPtr >> 2] = b.width * r;
        HEAPF32[hPtr >> 2] = b.height * r;
        return 1;
    },

    kama_ui_web_element_value__deps: ['$KamaUi'],
    kama_ui_web_element_value: function (handle) {
        var el = KamaUi.els[handle - 1];
        if (!el) return 0;
        // ⚠️ NaN IS THE REAL CASE HERE, not a defensive flourish: `value` is a STRING on every DOM
        // element, and a `<div>` bound by a caller has no `value` at all, so `parseFloat(undefined)`
        // is NaN — and the contract says 0 for an element that is not a form control.
        var v = parseFloat(el.value);
        return (v === v) ? v : 0;
    },

    // Setting `value` programmatically fires no `input`/`change` event, which is the native side's
    // behaviour too: writing state INTO a control is not a person moving it.
    kama_ui_web_set_value__deps: ['$KamaUi'],
    kama_ui_web_set_value: function (handle, value) {
        var el = KamaUi.els[handle - 1];
        if (!el || !('value' in el)) return;
        el.value = String(value);
    },

    kama_ui_web_set_class__deps: ['$KamaUi'],
    kama_ui_web_set_class: function (handle, name, on) {
        var el = KamaUi.els[handle - 1];
        if (!el || !name) return;
        el.classList.toggle(UTF8ToString(name), on !== 0);
    },

    kama_ui_web_shutdown__deps: ['$KamaUi'],
    kama_ui_web_shutdown: function () {
        KamaUi.clearBindings();
        if (KamaUi.root) KamaUi.root.innerHTML = '';
        if (KamaUi.stage) KamaUi.stage.style.display = 'none';
    },

    // ---- E7b: focus and text entry (kama_ui_web.h) ------------------------------------------------------

    kama_ui_web_focus_element__deps: ['$KamaUi'],
    kama_ui_web_focus_element: function (handle) {
        var el = KamaUi.els[handle - 1];
        if (!el || typeof el.focus !== 'function') return 0;
        el.focus();
        return document.activeElement === el ? 1 : 0;
    },

    kama_ui_web_focused__deps: ['$KamaUi'],
    kama_ui_web_focused: function () {
        var i = KamaUi.els.indexOf(document.activeElement);
        return i >= 0 ? i + 1 : 0;
    },

    // A text control has the focus: the DOM is typing into it, so a printable key is not a screen verb.
    kama_ui_web_text_focused__deps: ['$KamaUi'],
    kama_ui_web_text_focused: function () {
        var el = document.activeElement;
        if (!el || !KamaUi.root || !KamaUi.root.contains(el)) return 0;
        if (el.tagName === 'TEXTAREA') return 1;
        if (el.tagName !== 'INPUT') return 0;
        var t = (el.getAttribute('type') || 'text').toLowerCase();
        return (t === 'text' || t === 'password') ? 1 : 0;
    },

    // At most capacity - 1 bytes and a NUL, the FULL length returned (src/web.kama reads up to 512 bytes).
    kama_ui_web_element_text__deps: ['$KamaUi', '$stringToUTF8', '$lengthBytesUTF8'],
    kama_ui_web_element_text: function (handle, buf, capacity) {
        if (buf && capacity > 0) HEAPU8[buf] = 0;
        var el = KamaUi.els[handle - 1];
        if (!el || !('value' in el)) return 0;
        var s = String(el.value);
        if (buf && capacity > 0) stringToUTF8(s, buf, capacity);
        return lengthBytesUTF8(s);
    },

    // Like `kama_ui_web_set_value`: writing state in fires no event, on this leg as natively.
    kama_ui_web_set_text__deps: ['$KamaUi'],
    kama_ui_web_set_text: function (handle, text) {
        var el = KamaUi.els[handle - 1];
        if (!el || !('value' in el) || !text) return;
        el.value = UTF8ToString(text);
    },

    // No document: the overlay empties and every handle dies, as at `kama_ui_web_set_document`.
    // E7c: one inline style property, as the native shim's SetProperty ("" removes it).
    kama_ui_web_set_property__deps: ['$KamaUi'],
    kama_ui_web_set_property: function (handle, name, value) {
        var el = KamaUi.els[handle - 1];
        if (!el || !name) return 0;
        var v = value ? UTF8ToString(value) : '';
        if (v === '') { el.style.removeProperty(UTF8ToString(name)); return 1; }
        // RCSS's `dp` is CSS's `px` in the stage (ui::uidoc's unit rule, the same negatives: a `dp` after a digit and
        // before no identifier byte). Without it "150dp" is invalid CSS and the browser drops it without a word.
        v = v.replace(/([0-9])dp(?![A-Za-z0-9_-])/g, '$1px');
        el.style.setProperty(UTF8ToString(name), v);
        // The browser's verdict, as RmlUi's SetProperty returns its own: a value it would not parse is not set.
        return el.style.getPropertyValue(UTF8ToString(name)) !== '' ? 1 : 0;
    },

    kama_ui_web_close_document__deps: ['$KamaUi'],
    kama_ui_web_close_document: function () {
        KamaUi.clearBindings();
        if (KamaUi.root) KamaUi.root.innerHTML = '';
    }
});
