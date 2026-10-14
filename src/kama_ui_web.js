// kama_ui_web.js — the web UI backend, as an emcc `--js-library`. The DOM and CSS, and nothing else: no JS library.
//
// Two changes from the seam's earlier copies: the image rewrite (`kama_ui_web_set_image_rewrite`) and text controls in
// the focus ring (`navItems`). 0.2.0 added a page (`kama_ui_web_init`'s `page`), an event's target, attributes, the
// checked state, an uncapped `element_text`, and bindings that follow their id across rewrites (`$KamaUi.el`).
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
        stage: null,       // the fixed virtual-resolution box that carries the letterbox transform — or, for a page, the window
        root: null,        // the document's own <body>, inside it
        page: false,       // opened as a page (host.kama): no letterbox, no scale, shown from the start
        els: [],           // handle N -> els[N - 1]; dense and 1-based, matching the native shim. null once released
        ids: [],           // parallel to els: the id each handle was bound to
        listeners: [],     // parallel to els: the binding's listener, or null for a handle an event only NAMED (a target)
        events: [],        // {kind, handle, target, current}, drained by poll
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
        // ⚠️ TEXT CONTROLS ARE IN THE RING (CHANGED from the earlier copy, which had buttons and [tabindex]
        // only): RmlUi reaches an `<input>` through the `tab-index: auto` its RCSS gives it, but a browser
        // reads no RCSS, so a form whose name and address fields carry no `tabindex` attribute walked
        // straight past them on the web while the native ring stopped on both.
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

        // The events a binding hears. ⚠️ ONE LIST, BECAUSE THE DETACH MUST NAME EVERY EVENT THE ATTACH DID: 0.1.0's
        // `clearBindings` removed `click` alone, and left `change` and `input` on every control of every document the
        // page had shown — a detached field still queueing events for a handle that now named something else.
        heard: ['click', 'change', 'input'],

        // A form control: what has a value and a checked state on BOTH legs (RmlUi's ElementFormControl). A browser
        // gives `value` to more (an `<li>` has a numeric one), which natively has none.
        control: function (el) {
            return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
        },

        // What a DOM event is to the seam: 1 a click, 2 a change, 0 nothing.
        //
        // ⚠️ **ONE CHANGE PER EDIT, AS RmlUi COUNTS THEM** (CHANGED in 0.2.0, which mapped both `input` and `change` to
        // a change, so a checkbox, a radio or a `<select>` delivered two per edit here and one natively). A browser
        // fires BOTH for most edits, so which one counts is chosen by the control:
        //   - a text field, a textarea, a range: `input`, which fires on every edit. ⚠️ THIS IS WHAT MAKES A SLIDER
        //     BEHAVE THE SAME ON BOTH LEGS. RmlUi's range fires its Change on every movement of the bar; a browser's
        //     `change` fires only when the drag is RELEASED. Counting `change` would give a volume dial that previews
        //     live natively and jumps at the end in a browser — a divergence a structural check cannot see and an ear
        //     can. Their `change` is a commit (a release, a field losing focus, ENTER), and natively there is none.
        //   - a checkbox, a radio, a `<select>`, anything else: `change`, once per toggle or choice. Their `input`
        //     fires at the same moment, so counting both was the double.
        kindOf: function (e) {
            if (!e) return 0;
            if (e.type === 'click') return 1;
            var t = e.target;
            var live = !!t && (t.tagName === 'TEXTAREA' ||
                               (t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'radio'));
            return e.type === (live ? 'input' : 'change') ? 2 : 0;
        },

        // Give handle i + 1 a listener and put it on the element, once. ⚠️ NO stopPropagation (kama_ui_web_bind says
        // why). It hears `click`, `input` and `change` (`heard`); `kindOf` decides what each is. The event keeps WHERE
        // it happened (`target`) and who heard it (`current`); the poll walks between the two.
        listen: function (i) {
            if (!KamaUi.listeners[i]) {
                var handle = i + 1;
                KamaUi.listeners[i] = function (e) {
                    var kind = KamaUi.kindOf(e);
                    if (!kind) return;
                    KamaUi.events.push({ kind: kind, handle: handle, target: e.target, current: e.currentTarget });
                };
            }
            KamaUi.attach(i);
        },

        attach: function (i) {
            var el = KamaUi.els[i], fn = KamaUi.listeners[i];
            if (!el || !fn) return;
            for (var k = 0; k < KamaUi.heard.length; k++) el.addEventListener(KamaUi.heard[k], fn);
        },

        // Let go of handle i + 1's element and take its listener off it. The handle keeps its id and its listener, so
        // the next use that finds the id again (`el`) re-attaches — what @kama/rmlui's bindings do natively.
        release: function (i) {
            var el = KamaUi.els[i], fn = KamaUi.listeners[i];
            if (el && fn) {
                for (var k = 0; k < KamaUi.heard.length; k++) el.removeEventListener(KamaUi.heard[k], fn);
            }
            KamaUi.els[i] = null;
        },

        // The element a handle names NOW, or null. ⚠️ EVERY ENTRY POINT GOES THROUGH THIS, never `els[h - 1]` directly:
        // a handle whose element a rewrite released (or the page detached some other way) is re-found by its id here —
        // listeners and all — or answers null, so a stale handle is a no-op rather than a write into a node nobody
        // sees. That is the native leg's binding, re-finding lazily on use, and it is why the two legs agree on what a
        // handle names after a rewrite without either being told.
        el: function (handle) {
            if (!KamaUi.root || !(handle >= 1 && handle <= KamaUi.ids.length)) return null;
            var i = handle - 1;
            var el = KamaUi.els[i];
            if (el && KamaUi.root.contains(el)) return el;
            if (el) KamaUi.release(i);
            var again = KamaUi.root.querySelector('#' + CSS.escape(KamaUi.ids[i]));
            if (!again) return null;
            KamaUi.els[i] = again;
            KamaUi.attach(i);
            return again;
        },

        // The handle for an id, minted WITHOUT a listener if nobody bound it — natively `Document.bind` with no `listen`.
        // An event's target and `kama_ui_web_find` both come here. A later `kama_ui_web_bind` of the same id finds it
        // and starts listening.
        name: function (id, el) {
            var at = KamaUi.ids.indexOf(id);
            if (at >= 0) {
                KamaUi.el(at + 1);
                return at + 1;
            }
            KamaUi.els.push(el);
            KamaUi.ids.push(id);
            KamaUi.listeners.push(null);
            return KamaUi.els.length;
        },

        // An event's target as a handle: the nearest element with an id from where it happened up to the element
        // that heard it (inclusive). Walked at the POLL, not in the listener, because that is when the native leg
        // walks it: a target a rewrite detached in between is 0 on both.
        targetOf: function (ev) {
            var n = ev.target;
            if (n && n.nodeType !== 1) n = n.parentElement;
            if (!n || !KamaUi.root || !KamaUi.root.contains(n)) return 0;
            for (; n && n !== KamaUi.root; n = n.parentElement) {
                if (n.id) return KamaUi.name(n.id, n);
                if (n === ev.current) return 0;
            }
            return 0;
        },

        // Drop every binding. Called when the document is replaced — the native shim detaches its
        // RmlUi listeners here too, and for a sharper reason: over there a listener outliving its
        // element is a use-after-free one frame later. Ours would merely leak, which is exactly why
        // it is worth doing deliberately rather than relying on the difference.
        clearBindings: function () {
            for (var i = 0; i < KamaUi.els.length; i++) KamaUi.release(i);
            KamaUi.els = [];
            KamaUi.ids = [];
            KamaUi.listeners = [];
            KamaUi.events = [];
            KamaUi.head = 0;
        }
    },

    kama_ui_web_init__deps: ['$KamaUi'],
    kama_ui_web_init: function (width, height, page) {
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

        var s = KamaUi.stage.style;
        s.position = 'fixed';
        s.left = '0';
        s.top = '0';
        s.transform = '';
        KamaUi.vt = '';
        KamaUi.page = page !== 0;
        if (KamaUi.page) {
            // A PAGE: the stage is pinned to the window's four edges, so CSS sizes it and follows every resize with no
            // call from the program, and it is shown now — there is no letterbox for `setViewport` to place. `auto`
            // and `none` rather than '' so a shell's own stylesheet cannot put a fixed size or a scale back. The
            // document scrolls in its own `overflow: auto` elements; the stage itself never does.
            s.right = '0';
            s.bottom = '0';
            s.width = 'auto';
            s.height = 'auto';
            s.transform = 'none';
            s.transformOrigin = '';
            s.overflow = 'hidden';
            s.display = 'block';
            KamaUi.vv = 1;
        } else {
            // The stage is the VIRTUAL resolution in CSS pixels and is scaled as a whole, which is what
            // makes a document identical at every window size.
            s.right = 'auto';
            s.bottom = 'auto';
            s.width = width + 'px';
            s.height = height + 'px';
            s.transformOrigin = '0 0';
            s.overflow = '';
            s.display = 'none';
            KamaUi.vv = 0;
        }
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
        // is done here, by hand, to keep the two legs' rings starting in the same place (ADDED; the earlier copy
        // started the web ring on nothing).
        var af = KamaUi.root.querySelector('[autofocus]');
        if (af && typeof af.focus === 'function') af.focus();
        return 1;
    },

    // ⚠️ THE BINDINGS INSIDE ARE RELEASED FIRST (host.kama): `innerHTML` detaches the old children but does not free
    // them while something holds them, and a binding did — with three listeners still on — so a list rewritten every
    // frame kept every row it had ever shown. The element itself keeps its binding.
    kama_ui_web_set_inner__deps: ['$KamaUi'],
    kama_ui_web_set_inner: function (handle, htmlPtr) {
        var el = KamaUi.el(handle);
        if (!el) return;
        for (var i = 0; i < KamaUi.els.length; i++) {
            var b = KamaUi.els[i];
            if (b && b !== el && el.contains(b)) KamaUi.release(i);
        }
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
        if (!id) return 0;   // natively too; and `querySelector('#')` throws
        var at = KamaUi.ids.indexOf(id);
        if (at >= 0) {
            // Already bound (or named by an event's target). ⚠️ RE-RESOLVE IF A `set_inner` REPLACED THE ELEMENT —
            // `el` does, with the same handle. Keeping the HANDLE stable is what matters to a caller (dispatch is a
            // chain of `==` against integers), so re-pointing it changes nothing about the contract.
            //
            // ✅ **THE NATIVE LEG DOES THE SAME**, through @kama/rmlui's bindings, which track each element
            // with RmlUi's ObserverPtr. ⚠️ It could not use this leg's `contains` test on a raw pointer: a
            // destroyed element's memory is commonly reused by its replacement, so the pointers compare
            // equal — the earlier shims found that the hard way. A detached DOM node stays detached.
            KamaUi.el(at + 1);
            KamaUi.listen(at);
            return at + 1;
        }

        var el = KamaUi.root.querySelector('#' + CSS.escape(id));
        if (!el) return 0;

        // ⚠️ NO stopPropagation. RmlUi bubbles, so natively a bound container receives its children's
        // clicks and one press on a button inside it delivers TWO events. Swallowing the bubble here
        // would make the two legs count differently, which is the kind of divergence nothing would catch.
        KamaUi.els.push(el);
        KamaUi.ids.push(id);
        KamaUi.listeners.push(null);
        KamaUi.listen(KamaUi.els.length - 1);
        return KamaUi.els.length;
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
                // `input`, not `change`: `input` is what a drag emits and what a range's change is counted from
                // (`kindOf`), so a keyed adjustment reaches the program by the identical path a dragged one does.
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
    kama_ui_web_poll_event: function (handlePtr, targetPtr) {
        HEAP32[handlePtr >> 2] = 0;
        HEAP32[targetPtr >> 2] = 0;
        if (KamaUi.head >= KamaUi.events.length) {
            // Drained: reset rather than letting the array grow for the life of the page. The native
            // shim does the same with its head index.
            KamaUi.events = [];
            KamaUi.head = 0;
            return 0;
        }
        var ev = KamaUi.events[KamaUi.head++];
        HEAP32[handlePtr >> 2] = ev.handle | 0;
        HEAP32[targetPtr >> 2] = KamaUi.targetOf(ev) | 0;
        return ev.kind | 0;
    },

    kama_ui_web_set_viewport__deps: ['$KamaUi'],
    kama_ui_web_set_viewport: function (offsetX, offsetY, scale, visible) {
        if (!KamaUi.stage) return;
        var on = visible ? 1 : 0;
        // A PAGE has no letterbox to place: only `visible` means anything, memoised for the reason below.
        if (KamaUi.page) {
            if (KamaUi.vv === on) return;
            KamaUi.vv = on;
            KamaUi.stage.style.display = on ? 'block' : 'none';
            return;
        }
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

        var el = KamaUi.el(handle);
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
        var el = KamaUi.el(handle);
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
        var el = KamaUi.el(handle);
        if (!el || !('value' in el)) return;
        el.value = String(value);
    },

    kama_ui_web_set_class__deps: ['$KamaUi'],
    kama_ui_web_set_class: function (handle, name, on) {
        var el = KamaUi.el(handle);
        if (!el || !name) return;
        el.classList.toggle(UTF8ToString(name), on !== 0);
    },

    kama_ui_web_shutdown__deps: ['$KamaUi'],
    kama_ui_web_shutdown: function () {
        KamaUi.clearBindings();
        if (KamaUi.root) KamaUi.root.innerHTML = '';
        if (KamaUi.stage) KamaUi.stage.style.display = 'none';
        // What is on screen now, so a later `open` and `setViewport` write their transform rather than skip it.
        KamaUi.vv = 0;
        KamaUi.vt = '';
    },

    // ---- focus and text entry (kama_ui_web.h) -----------------------------------------------------------

    kama_ui_web_focus_element__deps: ['$KamaUi'],
    kama_ui_web_focus_element: function (handle) {
        var el = KamaUi.el(handle);
        if (!el || typeof el.focus !== 'function') return 0;
        el.focus();
        return document.activeElement === el ? 1 : 0;
    },

    kama_ui_web_focused__deps: ['$KamaUi'],
    // Through `el`, so a handle a rewrite released and whose id is back answers for the new element — as natively,
    // where `bindingOf` resolves every binding of the document.
    kama_ui_web_focused: function () {
        var a = document.activeElement;
        if (!a || !KamaUi.root || !KamaUi.root.contains(a)) return 0;
        for (var i = 0; i < KamaUi.ids.length; i++) {
            if (KamaUi.el(i + 1) === a) return i + 1;
        }
        return 0;
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

    // At most capacity - 1 bytes and a NUL, and ALWAYS the full length: src/web.kama asks once with no buffer to learn
    // it, then again with a buffer that size (CHANGED in 0.2.0; it read up to 512 bytes). A control's value only, as
    // natively.
    kama_ui_web_element_text__deps: ['$KamaUi', '$stringToUTF8', '$lengthBytesUTF8'],
    kama_ui_web_element_text: function (handle, buf, capacity) {
        if (buf && capacity > 0) HEAPU8[buf] = 0;
        var el = KamaUi.el(handle);
        if (!KamaUi.control(el)) return 0;
        var s = String(el.value);
        if (buf && capacity > 0) stringToUTF8(s, buf, capacity);
        return lengthBytesUTF8(s);
    },

    // Like `kama_ui_web_set_value`: writing state in fires no event, on this leg as natively.
    kama_ui_web_set_text__deps: ['$KamaUi'],
    kama_ui_web_set_text: function (handle, text) {
        var el = KamaUi.el(handle);
        if (!KamaUi.control(el) || !text) return;
        el.value = UTF8ToString(text);
    },

    // No document: the overlay empties and every handle dies, as at `kama_ui_web_set_document`.
    // One inline style property, as the native shim's SetProperty ("" removes it).
    kama_ui_web_set_property__deps: ['$KamaUi'],
    kama_ui_web_set_property: function (handle, name, value) {
        var el = KamaUi.el(handle);
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
    },

    // ---- 0.2.0 (kama_ui_web.h) ------------------------------------------------------------------------------------------

    // As `kama_ui_web_element_text`: the full length always, the bytes when there is room.
    kama_ui_web_element_id__deps: ['$KamaUi', '$stringToUTF8', '$lengthBytesUTF8'],
    kama_ui_web_element_id: function (handle, buf, capacity) {
        if (buf && capacity > 0) HEAPU8[buf] = 0;
        if (!KamaUi.root || !(handle >= 1 && handle <= KamaUi.ids.length)) return 0;
        var s = KamaUi.ids[handle - 1];
        if (buf && capacity > 0) stringToUTF8(s, buf, capacity);
        return lengthBytesUTF8(s);
    },

    // `findElement`: `kama_ui_web_bind` without the listener (`$KamaUi.name`).
    kama_ui_web_find__deps: ['$KamaUi'],
    kama_ui_web_find: function (idPtr) {
        if (!KamaUi.root) return 0;
        var id = UTF8ToString(idPtr);
        if (!id) return 0;
        if (KamaUi.ids.indexOf(id) < 0) {
            var el = KamaUi.root.querySelector('#' + CSS.escape(id));
            if (!el) return 0;
            return KamaUi.name(id, el);
        }
        return KamaUi.name(id, null);
    },

    // ⚠️ TWO ATTRIBUTES ARE STATE NATIVELY AND ONLY A DEFAULT HERE. RmlUi keeps a checkbox's state in `checked` and a
    // control's in `value`; a browser reads either attribute only until a person touches the control (its "dirty"
    // flag), after which writing the attribute changes nothing on screen. So both also write the property — quietly,
    // as every write is. An `<img src>` gets the image rewrite, as markup does, before the browser fetches it.
    kama_ui_web_set_attribute__deps: ['$KamaUi'],
    kama_ui_web_set_attribute: function (handle, name, value) {
        var el = KamaUi.el(handle);
        if (!el || !name) return;
        var n = UTF8ToString(name);
        var v = value ? UTF8ToString(value) : '';
        if (n.toLowerCase() === 'src' && KamaUi.imageFrom && KamaUi.imageTo &&
            v.slice(-KamaUi.imageFrom.length) === KamaUi.imageFrom) {
            v = v.slice(0, v.length - KamaUi.imageFrom.length) + KamaUi.imageTo;
        }
        try { el.setAttribute(n, v); } catch (e) { return; }   // a name the DOM refuses ("", a space) does nothing
        if (KamaUi.control(el)) {
            if (n === 'checked') el.checked = true;
            if (n === 'value') el.value = v;
        }
    },

    kama_ui_web_remove_attribute__deps: ['$KamaUi'],
    kama_ui_web_remove_attribute: function (handle, name) {
        var el = KamaUi.el(handle);
        if (!el || !name) return;
        var n = UTF8ToString(name);
        el.removeAttribute(n);
        if (KamaUi.control(el)) {
            if (n === 'checked') el.checked = false;
            if (n === 'value') el.value = '';
        }
    },

    // `.checked`, which is the box's live state (the attribute is only its default). An `<input>` only, as natively.
    kama_ui_web_element_checked__deps: ['$KamaUi'],
    kama_ui_web_element_checked: function (handle) {
        var el = KamaUi.el(handle);
        return (el && el.tagName === 'INPUT' && el.checked === true) ? 1 : 0;
    }
});
