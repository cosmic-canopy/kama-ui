// kama_ui_web.js — the web UI backend, as an emcc `--js-library`. The DOM and CSS, and nothing else: no JS library.
//
// Two changes from the seam's earlier copies: the image rewrite (`kama_ui_web_set_image_rewrite`) and text controls in
// the focus ring (`navItems`). 0.2.0 added a page (`kama_ui_web_init`'s `page`), an event's target, attributes, the
// checked state, an uncapped `element_text`, and bindings that follow their id across rewrites (`$KamaUi.el`). 0.3.0
// added the page-level listeners (`install`: keys and claims, hover and the tooltip, drag and drop), more event kinds,
// titles held as `data-kama-ui-title`, children counted and removed, plain text, scrolling into view and the clipboard.
// 0.4.0 added drop zones (`droppable="true"`) and where a drop landed, and files: chosen (`<input type=file>`), dropped
// from outside, pasted, read in slices and offered as downloads — each a browser `File` held here, never copied into
// the program until a read asks. 0.5.0 added a `<video>` or `<audio>`'s playback — its time, length and pause, a seek,
// play and pause — and the `Media` event its own events raise, heard in the capture phase as focus is. 0.6.0 added the
// `Commit` event (`commit`): the person done with a control's value, after the Changes on the way, measured against
// what each control was last committed at (`__kamaUiCommitted`, beside the `__kamaUiDirty` of an edit pending).
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
        events: [],        // {kind, handle, target, current, source, key, mods}, drained by poll
        head: 0,
        loaded: false,     // a document is up: only then are the keys the document's
        installed: false,  // the page-level listeners are on (`install`)
        clock: 0,          // the PROGRAM's clock, from update/updateAt: the tooltip's delay is measured on it
        claims: {},        // claimKey: 'key:mods' -> true, prevented as the key goes down
        dragSource: null,  // the element being dragged, dragstart to dragend
        hover: null,       // the element under the pointer (mouseover), and the pointer in client pixels
        px: 0,
        py: 0,
        tip: null,         // the tooltip element (host.kama), and its state — the native leg's, field for field
        tipOwner: null,
        tipSince: 0,
        tipShown: false,
        tipQuiet: false,
        imageFrom: '',     // kama_ui_web_set_image_rewrite: `<img src` ending in this ...
        imageTo: '',       // ... is rewritten to end in this, before the browser parses the markup
        files: {},         // (0.4.0) a file list's handle -> {list: [File], accept, multiple, input}
        reads: {},         // (0.4.0) a read's handle -> {bytes: Uint8Array | null, error, done}
        nextFile: 1,       // the next list or read handle (one numbering, as natively)
        chooser: 0,        // the list a chooser that is open will fill, 0 for none (one at a time)
        chooserLeft: false,// the window lost the focus to the chooser's dialog (the cancel fallback, `onFocusBack`)

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

        // The events a binding hears. ⚠️ ONE LIST PER PHASE, BECAUSE THE DETACH MUST NAME EVERY EVENT THE ATTACH DID:
        // 0.1.0's `clearBindings` removed `click` alone, and left `change` and `input` on every control of every
        // document the page had shown — a detached field still queueing events for a handle that now named something
        // else. ⚠️ FOCUS IS HEARD IN THE CAPTURE PHASE (0.3.0) because RmlUi's does not bubble: natively a bound
        // container hears a child's focus on the way down, ancestors first, and so it does here. ⚠️ SO ARE A MEDIA
        // ELEMENT'S (0.5.0), FOR A SHARPER REASON: they do not bubble at all in the DOM, so a bound container listening
        // in the bubble phase would never hear its clip. `mediaEvents` is the set that raises a Media: the metadata
        // loaded, a play, a pause, a seek finished, the time moved.
        heard: ['click', 'change', 'input', 'mousedown', 'drop'],
        heardCapture: ['focusin', 'focusout', 'loadedmetadata', 'play', 'pause', 'seeked', 'timeupdate'],
        mediaEvents: { loadedmetadata: 1, play: 1, pause: 1, seeked: 1, timeupdate: 1 },

        // A form control: what has a value and a checked state on BOTH legs (RmlUi's ElementFormControl). A browser
        // gives `value` to more (an `<li>` has a numeric one), which natively has none.
        control: function (el) {
            return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
        },

        // (0.5.0) A `<video>` or `<audio>`: what the media entry points answer for, and what raises a Media.
        media: function (el) {
            return !!el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO');
        },

        // What a DOM event is to the seam: 1 a click, 2 a change, 3 a double click, 5 focus, 6 blur, 7 a drop, 11 a
        // media element's change (0.5.0), 12 a commit (0.6.0), 0 nothing (4, a key, comes from `onKey`, not from a
        // binding; 8 a chooser's answer, 9 a paste of files and 10 a finished read come from the package's own
        // listeners, 0.4.0).
        //
        // ⚠️ A DOUBLE CLICK IS THE SECOND PRESS (`mousedown` with `detail` 2), NOT THE BROWSER'S `dblclick`, which
        // arrives after the second click: RmlUi raises its own on the second press, before that click, and the legs
        // must deliver Click, DoubleClick, Click in one order.
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
        // ADDED (0.6.0): that `change` is a COMMIT (12) for a range and any other live control but a text one — a range
        // let go or stepped by a key — measured before it is raised (`commitOnce`). A text control's is not heard: a
        // browser fires it on ENTER and on the blur, but whether it does depends on its own record of the value, which
        // a script's writes move one way in Firefox and another in Chrome. So ENTER (`onKey`) and the blur (`focusout`,
        // `listen`) are read here, and measured the same way. A checkbox's, a radio's and a select's Commit follows
        // their Change (`listen`).
        kindOf: function (e) {
            if (!e) return 0;
            if (e.type === 'click') return 1;
            if (e.type === 'mousedown') return (e.detail === 2 && e.button === 0) ? 3 : 0;
            if (e.type === 'focusin') return KamaUi.focusable(e.target) ? 5 : 0;
            if (e.type === 'focusout') return KamaUi.focusable(e.target) ? 6 : 0;
            if (e.type === 'drop') return 7;
            if (KamaUi.mediaEvents[e.type]) return KamaUi.media(e.target) ? 11 : 0;
            var t = e.target;
            if (!KamaUi.live(t)) return e.type === 'change' ? 2 : 0;
            if (e.type === 'input') return 2;
            return (e.type === 'change' && !KamaUi.typesText(t)) ? 12 : 0;
        },

        // A control whose Change is its `input`: a textarea, an `<input>` but a checkbox or a radio (`kindOf`). (0.6.0)
        // Each is MEASURED for its Commit (host.kama, `pollEvent`).
        live: function (t) {
            return !!t && (t.tagName === 'TEXTAREA' ||
                           (t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'radio'));
        },

        // A control a person types into (host.kama, `textFocused`): a textarea, and an `<input>` whose `type` ATTRIBUTE
        // is absent or empty, text, password, number, search, email, url or tel, in any case — read as native.kama
        // reads it, not as `el.type`, which a browser normalises (an unknown type reads `text` there and not natively).
        typesText: function (el) {
            if (!el || el.nodeType !== 1) return false;
            if (el.tagName === 'TEXTAREA') return true;
            if (el.tagName !== 'INPUT') return false;
            var t = (el.getAttribute('type') || 'text').toLowerCase();
            var typing = { text: 1, password: 1, number: 1, search: 1, email: 1, url: 1, tel: 1 };
            return !!typing[t];
        },

        // ---- 0.6.0: commits (host.kama, `pollEvent`) ----
        //
        // A Commit is raised when a person is done with a control's value, and only when it changed since that
        // control's last Commit. For a live control that is MEASURED: `__kamaUiDirty` says an edit is pending (an
        // `input` heard, `listen`), and `__kamaUiCommitted` holds the value the next Commit is measured against — as
        // loaded (`measureFrom`), as last committed, or as the program last wrote it with no edit pending (`wrote`).
        // native.kama keeps the same two on the control as attributes, and the same rules.

        // A control as it was made — loaded, or inserted by a rewrite or an append — is what its first Commit is
        // measured against. Once: a control seen again keeps its own.
        measureFrom: function (node) {
            if (!node || node.nodeType !== 1) return;
            var list = (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') ? [node] : [];
            list = list.concat(Array.prototype.slice.call(node.querySelectorAll('input, textarea')));
            for (var k = 0; k < list.length; k++) {
                var el = list[k];
                if (KamaUi.live(el) && !('__kamaUiCommitted' in el)) el.__kamaUiCommitted = String(el.value);
            }
        },

        // The program wrote a control's value: with no edit pending, what it wrote is the measure — a value the program
        // put there is not one the person chose. With one pending, the edit stays pending (a field normalised as it is
        // typed still commits when it is left).
        wrote: function (el) {
            if (!KamaUi.live(el) || el.__kamaUiDirty) return;
            el.__kamaUiCommitted = String(el.value);
        },

        // Is a Commit due: an edit pending whose value differs from the last Commit's? Either way the edit is no longer
        // pending, and when it is due its value becomes the measure. Asked AT the event, so the value is the one there.
        commitDue: function (el) {
            if (!el || !el.__kamaUiDirty) return false;
            el.__kamaUiDirty = false;
            var v = String(el.value);
            if (('__kamaUiCommitted' in el) && el.__kamaUiCommitted === v) return false;
            el.__kamaUiCommitted = v;
            return true;
        },

        // The handle of a binding that listens on `n`, or -1 (an element only NAMED, as a target, hears nothing).
        hearer: function (n) {
            var i = KamaUi.els.indexOf(n);
            return (i >= 0 && KamaUi.listeners[i]) ? i : -1;
        },

        // One Commit for `el` per binding from it up, innermost first, as its Change bubbled — queued at once.
        commit: function (el) {
            for (var n = el; n && KamaUi.root && KamaUi.root.contains(n); n = n.parentElement) {
                var i = KamaUi.hearer(n);
                if (i >= 0) {
                    KamaUi.events.push({ kind: 12, handle: i + 1, target: el, current: n, source: null, key: 0, mods: 0,
                                         files: 0, x: 0, y: 0 });
                }
            }
        },

        // The first listener of one DOM event to ask measures it and queues every binding's Commit; the rest of that
        // event's listeners find it done. ⚠️ FOR A BLUR THE FIRST IS THE OUTERMOST BINDING (focus is heard in the capture
        // phase), so its Commits — innermost first — still all come before any Blur, as natively.
        commitOnce: function (e, el) {
            if (e.__kamaUiCommit) return;
            e.__kamaUiCommit = true;
            if (KamaUi.commitDue(el)) KamaUi.commit(el);
        },

        // No binding listens above `node`: its listener is the last to hear this event bubble.
        outermost: function (node) {
            for (var n = node.parentElement; n && KamaUi.root && KamaUi.root.contains(n); n = n.parentElement) {
                if (KamaUi.hearer(n) >= 0) return false;
            }
            return true;
        },

        // Give handle i + 1 a listener and put it on the element, once. ⚠️ NO stopPropagation (kama_ui_web_bind says
        // why). It hears `heard` and `heardCapture`; `kindOf` decides what each is. The event keeps WHERE it happened
        // (`target`) and who heard it (`current`); the poll walks between the two. A drop keeps what was dragged
        // (`source`), and is not heard by the dragged element or anything inside it — natively RmlUi never drops an
        // element on itself — and its target is what lies under the pointer beside the dragged element (`dropElement`).
        listen: function (i) {
            if (!KamaUi.listeners[i]) {
                var handle = i + 1;
                KamaUi.listeners[i] = function (e) {
                    var kind = KamaUi.kindOf(e);
                    if (!kind) return;
                    // (0.6.0) A range's `change` (a release, a key's step) is a Commit, for every binding at once; a live
                    // control's Change leaves an edit pending; a text control's blur commits that edit before any Blur.
                    if (kind === 12) { KamaUi.commitOnce(e, e.target); return; }
                    if (kind === 2 && e.type === 'input') e.target.__kamaUiDirty = true;
                    if (kind === 6 && KamaUi.typesText(e.target)) KamaUi.commitOnce(e, e.target);
                    // (0.5.0) ONE MEDIA EVENT WAITS AT A TIME for this binding and this clip (host.kama): the event says
                    // only that something changed, so a second before the poll would say nothing new — and a seek
                    // alone fires two (`timeupdate`, then `seeked`).
                    if (kind === 11) {
                        for (var q = KamaUi.head; q < KamaUi.events.length; q++) {
                            var w = KamaUi.events[q];
                            if (w.kind === 11 && w.handle === handle && w.target === e.target) return;
                        }
                    }
                    var rec = { kind: kind, handle: handle, target: e.target, current: e.currentTarget, source: null,
                                key: 0, mods: (kind === 1 || kind === 3 || kind === 7) ? KamaUi.modsOf(e) : 0,
                                files: 0, x: 0, y: 0 };
                    if (kind === 7) {
                        var src = KamaUi.dragSource;
                        rec.x = e.clientX;
                        rec.y = e.clientY;
                        if (src) {
                            if (src === e.currentTarget || src.contains(e.currentTarget)) return;
                            rec.target = KamaUi.dropElement(e);
                            rec.source = src;
                        } else {
                            // (0.4.0) Files from outside the page: one list for the whole drop, however many bound
                            // ancestors hear it. Anything else dragged in from outside (text, a link) is no drop.
                            var list = KamaUi.dropList(e);
                            if (!list) return;
                            rec.files = list;
                            if (rec.target && rec.target.nodeType !== 1) rec.target = rec.target.parentElement;
                        }
                    }
                    KamaUi.events.push(rec);
                    // (0.6.0) A checkbox's, a radio's or a select's edit is its own commit: once its Change has reached
                    // the last binding to hear it, every binding's Commit follows.
                    if (kind === 2 && e.type === 'change' && KamaUi.outermost(e.currentTarget)) KamaUi.commit(e.target);
                };
            }
            KamaUi.attach(i);
        },

        attach: function (i) {
            var el = KamaUi.els[i], fn = KamaUi.listeners[i];
            if (!el || !fn) return;
            for (var k = 0; k < KamaUi.heard.length; k++) el.addEventListener(KamaUi.heard[k], fn);
            for (var c = 0; c < KamaUi.heardCapture.length; c++) el.addEventListener(KamaUi.heardCapture[c], fn, true);
        },

        // Let go of handle i + 1's element and take its listener off it. The handle keeps its id and its listener, so
        // the next use that finds the id again (`el`) re-attaches — what @kama/rmlui's bindings do natively.
        release: function (i) {
            var el = KamaUi.els[i], fn = KamaUi.listeners[i];
            if (el && fn) {
                for (var k = 0; k < KamaUi.heard.length; k++) el.removeEventListener(KamaUi.heard[k], fn);
                for (var c = 0; c < KamaUi.heardCapture.length; c++) el.removeEventListener(KamaUi.heardCapture[c], fn, true);
            }
            KamaUi.els[i] = null;
        },

        // Release every binding to an element inside `node` (inclusive when `self`): what a rewrite or a removal took.
        releaseInside: function (node, self) {
            for (var i = 0; i < KamaUi.els.length; i++) {
                var b = KamaUi.els[i];
                if (b && (self || b !== node) && node.contains(b)) KamaUi.release(i);
            }
        },

        // ---- 0.3.0 --------------------------------------------------------------------------------------------------

        // UI_MOD_* (types.kama, GLFW's bits) from a DOM event; Cmd folds into Ctrl.
        modsOf: function (e) {
            return (e.shiftKey ? 1 : 0) | ((e.ctrlKey || e.metaKey) ? 2 : 0) | (e.altKey ? 4 : 0);
        },

        // UI_KEY_* from a keydown, or 0 outside types.kama's table. A letter or a digit by its KEY (`code`), as GLFW
        // names it, whatever the layout types there; the rest by name.
        keyOf: function (e) {
            var c = e.code || '';
            if (/^Key[A-Z]$/.test(c)) return c.charCodeAt(3);
            if (/^Digit[0-9]$/.test(c)) return c.charCodeAt(5);
            var named = { Escape: 256, Enter: 257, Tab: 258, Backspace: 259, Delete: 261, ArrowRight: 262,
                          ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265, PageUp: 266, PageDown: 267, Home: 268, End: 269 };
            if (named[e.key]) return named[e.key];
            var f = /^F([1-9]|1[0-2])$/.exec(e.key || '');
            return f ? 289 + parseInt(f[1], 10) : 0;
        },

        // Which keys are a `Key` event, as native.kama's `reported`: every key that types no character (all numbered
        // from 256), a letter or a digit only with Ctrl or Alt.
        reported: function (key, mods) {
            if (!key) return false;
            return key >= 256 || (mods & 6) !== 0;
        },

        // What reports Focus and Blur, as native.kama's `focusable`: a button, a form control, or a tab index.
        focusable: function (el) {
            if (!el || el.nodeType !== 1) return false;
            var t = el.tagName;
            if (t === 'BUTTON' || t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return true;
            return el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1';
        },

        // The nearest element at or above `el` with an id, inside the document; null for none.
        withId: function (el) {
            for (var n = el; n && KamaUi.root && n !== KamaUi.root; n = n.parentElement) {
                if (n.nodeType === 1 && n.id) return KamaUi.root.contains(n) ? n : null;
            }
            return null;
        },

        // `withId` as a handle (a Drop's source), 0 once it has left the document.
        nameOf: function (el) {
            if (!el || !KamaUi.root || !KamaUi.root.contains(el)) return 0;
            var w = KamaUi.withId(el);
            return w ? KamaUi.name(w.id, w) : 0;
        },

        // What a drop lands on: the element under the pointer, or — when that is the dragged element or inside it —
        // the first element beneath it, as RmlUi, which never hovers the element it drags.
        dropElement: function (e) {
            var src = KamaUi.dragSource, t = e.target;
            if (t && t.nodeType !== 1) t = t.parentElement;
            if (!src || !t || !src.contains(t)) return t;
            var all = document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [];
            for (var k = 0; k < all.length; k++) {
                if (!src.contains(all[k]) && KamaUi.root.contains(all[k])) return all[k];
            }
            return src.parentElement;
        },

        // ---- 0.4.0: drop zones and files ----

        // `droppable="true"` with an id: a zone (host.kama).
        isZone: function (n) {
            return n && n.nodeType === 1 && n.id && n.getAttribute('droppable') === 'true';
        },

        // What is highlighted under the pointer: the nearest zone at or above `el`, else the nearest element with an id.
        zoneOf: function (el) {
            if (el && el.nodeType !== 1) el = el.parentElement;
            for (var n = el; n && KamaUi.root && n !== KamaUi.root; n = n.parentElement) {
                if (KamaUi.isZone(n)) return KamaUi.root.contains(n) ? n : null;
            }
            return KamaUi.withId(el);
        },

        // A drop's zone, walked from where it landed up to the element that heard it (inclusive); null for none.
        zoneUpTo: function (el, stop) {
            for (var n = el; n && KamaUi.root && n !== KamaUi.root; n = n.parentElement) {
                if (KamaUi.isZone(n)) return n;
                if (n === stop) return null;
            }
            return null;
        },

        // Is this drag carrying files from outside the page (`dataTransfer.types` holds "Files")?
        carriesFiles: function (e) {
            var t = e && e.dataTransfer && e.dataTransfer.types;
            if (!t) return false;
            for (var k = 0; k < t.length; k++) if (t[k] === 'Files') return true;
            return false;
        },

        newList: function (list) {
            var h = KamaUi.nextFile++;
            KamaUi.files[h] = { list: Array.prototype.slice.call(list || []), accept: '', multiple: false, input: null };
            return h;
        },

        // The list a drop of files carries, made once per drop: every bound ancestor hearing it shares it. 0 for a drop
        // with no file in it.
        dropList: function (e) {
            if (e.__kamaUiFiles) return e.__kamaUiFiles;
            var f = e.dataTransfer && e.dataTransfer.files;
            if (!f || f.length === 0) return 0;
            e.__kamaUiFiles = KamaUi.newList(f);
            return e.__kamaUiFiles;
        },

        // Where a point lies in an element's border box, 0 to 1 on each axis (clamped), for a Drop's atX and atY.
        within: function (el, x, y) {
            if (!el) return [0, 0];
            var b = el.getBoundingClientRect();
            var fx = b.width > 0 ? (x - b.left) / b.width : 0;
            var fy = b.height > 0 ? (y - b.top) / b.height : 0;
            return [Math.max(0, Math.min(1, fx)), Math.max(0, Math.min(1, fy))];
        },

        // The chooser answered (its files, or none: cancelled). Ignored once its list was released.
        answer: function (h, list) {
            if (KamaUi.chooser !== h) return;
            KamaUi.chooser = 0;
            KamaUi.chooserLeft = false;
            var entry = KamaUi.files[h];
            if (!entry) return;
            if (entry.input && entry.input.parentNode) entry.input.parentNode.removeChild(entry.input);
            entry.input = null;
            entry.list = Array.prototype.slice.call(list || []);
            KamaUi.events.push({ kind: 8, handle: 0, target: null, current: null, source: null, key: 0, mods: 0,
                                 files: h, x: 0, y: 0 });
        },

        clearClass: function (name, except) {
            if (!KamaUi.root) return;
            var list = KamaUi.root.querySelectorAll('.' + name);
            for (var k = 0; k < list.length; k++) if (list[k] !== except) list[k].classList.remove(name);
        },

        // ⚠️ A `title` IS HELD AS `data-kama-ui-title` (host.kama): the browser would show its own popup over the
        // package's tooltip, and no CSS turns that off. Run over whatever markup is inserted.
        untitle: function (node) {
            if (!node || node.nodeType !== 1) return;
            var list = [node].concat(Array.prototype.slice.call(node.querySelectorAll('[title]')));
            for (var k = 0; k < list.length; k++) {
                var el = list[k];
                if (!el.hasAttribute('title')) continue;
                el.setAttribute('data-kama-ui-title', el.getAttribute('title'));
                el.removeAttribute('title');
            }
        },

        // (0.4.0) RmlUi gives every `<input>` its type as a class of its own (`range`, `checkbox`, `text`…), so a document
        // styles `input.range`; a browser gives none, and the same rule matched natively only. Each inserted input gets
        // it here too, as RmlUi names it: its type where RmlUi knows it, else `text`.
        inputClass: function (el) {
            var t = (el.getAttribute('type') || 'text').toLowerCase();
            var known = { password: 1, radio: 1, checkbox: 1, range: 1, submit: 1, button: 1 };
            return known[t] ? t : 'text';
        },
        typeClasses: function (node) {
            if (!node || node.nodeType !== 1) return;
            var list = node.tagName === 'INPUT' ? [node] : [];
            list = list.concat(Array.prototype.slice.call(node.querySelectorAll('input')));
            for (var k = 0; k < list.length; k++) {
                var el = list[k];
                if (el.__kamaUiType && el.__kamaUiType !== KamaUi.inputClass(el)) el.classList.remove(el.__kamaUiType);
                el.__kamaUiType = KamaUi.inputClass(el);
                el.classList.add(el.__kamaUiType);
            }
        },

        // The children `childCount` and `removeChildren` count: elements and runs of text, not blank text between tags
        // (RmlUi makes no element of it) nor comments.
        kids: function (el) {
            var list = [];
            for (var n = el.firstChild; n; n = n.nextSibling) {
                if (n.nodeType === 1 || (n.nodeType === 3 && /\S/.test(n.nodeValue))) list.push(n);
            }
            return list;
        },

        // The tooltip element, appended to the document's root (host.kama), unless it is there already.
        makeTip: function () {
            if (!KamaUi.root) return;
            if (KamaUi.tip && KamaUi.root.contains(KamaUi.tip)) return;
            var t = document.createElement('div');
            t.id = 'kama-ui-tooltip';
            t.className = 'ui-tooltip';
            t.style.position = 'absolute';
            t.style.pointerEvents = 'none';
            t.style.display = 'none';
            t.style.zIndex = '1000';
            KamaUi.root.appendChild(t);
            KamaUi.tip = t;
            KamaUi.tipOwner = null;
            KamaUi.tipShown = false;
            KamaUi.tipQuiet = false;
        },

        // Hidden, and emptied, as natively.
        hideTip: function () {
            if (KamaUi.tipShown && KamaUi.tip) {
                KamaUi.tip.style.display = 'none';
                KamaUi.tip.textContent = '';
            }
            KamaUi.tipShown = false;
        },

        // A press, the wheel or a scroll: hidden, and kept hidden while the same element is hovered.
        dismiss: function () {
            KamaUi.hideTip();
            KamaUi.tipQuiet = true;
        },

        // native.kama's `tooltips`, on the program's clock: the owner is the nearest hovered element with a non-empty
        // title; a new owner restarts the delay (types.kama's UI_TOOLTIP_DELAY, 0.5 s) and hides what was shown.
        tooltips: function () {
            if (!KamaUi.loaded || !KamaUi.root) return;
            KamaUi.makeTip();
            var owner = null;
            if (KamaUi.hover && KamaUi.root.contains(KamaUi.hover)) {
                for (var n = KamaUi.hover; n && n !== KamaUi.root; n = n.parentElement) {
                    if (n.nodeType === 1 && n.getAttribute('data-kama-ui-title')) { owner = n; break; }
                }
            }
            if (owner !== KamaUi.tipOwner) {
                KamaUi.hideTip();
                KamaUi.tipOwner = owner;
                KamaUi.tipSince = KamaUi.clock;
                KamaUi.tipQuiet = false;
                return;
            }
            if (!owner || KamaUi.tipShown || KamaUi.tipQuiet) return;
            if (KamaUi.clock - KamaUi.tipSince < 0.5) return;
            // 12 and 16 px from the pointer, in the stage's own pixels (native.kama's TIP_LEFT and TIP_TOP).
            var rr = KamaUi.root.getBoundingClientRect();
            var scale = KamaUi.root.offsetWidth > 0 ? rr.width / KamaUi.root.offsetWidth : 1;
            var t = KamaUi.tip;
            t.textContent = owner.getAttribute('data-kama-ui-title');
            t.style.left = ((KamaUi.px - rr.left) / scale + 12) + 'px';
            t.style.top = ((KamaUi.py - rr.top) / scale + 16) + 'px';
            t.style.display = 'block';
            KamaUi.tipShown = true;
        },

        // ---- the page-level listeners, put on once (`install`) and live while a document is up ----

        // ⚠️ ON THE WINDOW, IN THE CAPTURE PHASE, so the claim prevents the browser's default before anything else can
        // act on the key — Ctrl+S must never reach the save dialog — and so a key reaches the document whatever the
        // page's own handlers do with it later.
        onKey: function (e) {
            if (!KamaUi.loaded) return;
            var key = KamaUi.keyOf(e), mods = KamaUi.modsOf(e);
            if (!key) return;
            if (KamaUi.claims[key + ':' + mods]) e.preventDefault();
            if (!KamaUi.reported(key, mods)) return;
            KamaUi.events.push({ kind: 4, handle: 0, target: document.activeElement, current: null, source: null,
                                 key: key, mods: mods });
            // (0.6.0) ENTER commits a text field's pending edit, after its Key, whether or not the page prevents the
            // browser's own (natively RmlUi's field always sees it). Not a textarea's, whose ENTER types a line, and not
            // the ENTER that ends an input method's composition, which is still typing.
            var a = document.activeElement;
            if (key === 257 && !e.isComposing && a && a.tagName === 'INPUT' && KamaUi.typesText(a) &&
                KamaUi.root && KamaUi.root.contains(a)) {
                KamaUi.commitOnce(e, a);
            }
        },
        onPress: function () { if (KamaUi.loaded) KamaUi.dismiss(); },
        onOver: function (e) { KamaUi.hover = e.target; KamaUi.px = e.clientX; KamaUi.py = e.clientY; },
        onMove: function (e) { KamaUi.px = e.clientX; KamaUi.py = e.clientY; },
        onOut: function (e) {
            if (!e.relatedTarget || !KamaUi.root.contains(e.relatedTarget)) KamaUi.hover = null;
        },
        // A drag starts only from what the document marked `draggable="true"`: anything else a browser drags by itself
        // (an image, a selection) is cancelled, as natively nothing unmarked drags.
        onDragStart: function (e) {
            var t = e.target && e.target.nodeType !== 1 ? e.target.parentElement : e.target;
            var src = t ? t.closest('[draggable="true"]') : null;
            if (!src || !KamaUi.root.contains(src)) { e.preventDefault(); return; }
            KamaUi.dragSource = src;
            if (e.dataTransfer) {
                // Firefox starts no drag without data.
                try { e.dataTransfer.setData('text/plain', ''); e.dataTransfer.effectAllowed = 'move'; } catch (x) { }
            }
            src.classList.add('ui-dragging');
            KamaUi.dismiss();
        },
        // Every element of the document takes a drop, as natively: the default (refusing it) is prevented. CHANGED
        // (0.4.0): files dragged in from outside are taken too, and what is highlighted is the zone under the pointer.
        onDragOver: function (e) {
            var files = !KamaUi.dragSource && KamaUi.carriesFiles(e);
            if (!KamaUi.dragSource && !files) return;
            e.preventDefault();
            if (e.dataTransfer) { try { e.dataTransfer.dropEffect = files ? 'copy' : 'move'; } catch (x) { } }
            var over = KamaUi.zoneOf(files ? e.target : KamaUi.dropElement(e));
            KamaUi.clearClass('ui-drop-target', over);
            if (over) over.classList.add('ui-drop-target');
        },
        onDragLeave: function (e) {
            if (!KamaUi.dragSource && !KamaUi.carriesFiles(e)) return;
            if (!e.relatedTarget || !KamaUi.root.contains(e.relatedTarget)) KamaUi.clearClass('ui-drop-target', null);
        },
        // Firefox opens dropped text as a page unless the drop's default is prevented, and every browser opens a dropped
        // file: the page would be gone.
        onDropFirst: function (e) { if (KamaUi.dragSource || KamaUi.carriesFiles(e)) e.preventDefault(); },
        // (0.4.0) Outside the document too (the canvas, the page around it): a file dropped anywhere in the window is
        // never opened as a page while a document is up.
        onWindowDrag: function (e) {
            if (KamaUi.loaded && KamaUi.carriesFiles(e)) e.preventDefault();
        },
        // (0.4.0) Files on the clipboard as the person pastes: a Paste, the document's, as a key is.
        onPaste: function (e) {
            if (!KamaUi.loaded) return;
            var d = e.clipboardData;
            if (!d || !d.files || d.files.length === 0) return;
            var h = KamaUi.newList(d.files);
            KamaUi.events.push({ kind: 9, handle: 0, target: document.activeElement, current: null, source: null, key: 0,
                                 mods: 0, files: h, x: 0, y: 0 });
        },
        // (0.4.0) A browser with no `cancel` event on a file input says nothing when the chooser is closed unanswered.
        // Its dialog takes the window's focus, and gives it back when it closes: no answer a moment later is a cancel.
        onBlurAway: function () { if (KamaUi.chooser) KamaUi.chooserLeft = true; },
        onFocusBack: function () {
            var h = KamaUi.chooser;
            if (!h || !KamaUi.chooserLeft) return;
            setTimeout(function () { if (KamaUi.chooser === h) KamaUi.answer(h, []); }, 1000);
        },
        onDropLast: function () { KamaUi.clearClass('ui-drop-target', null); },
        onDragEnd: function () {
            KamaUi.clearClass('ui-dragging', null);
            KamaUi.clearClass('ui-drop-target', null);
            KamaUi.dragSource = null;
        },

        install: function () {
            if (KamaUi.installed || !KamaUi.root) return;
            KamaUi.installed = true;
            var r = KamaUi.root;
            window.addEventListener('keydown', KamaUi.onKey, true);
            window.addEventListener('mousedown', KamaUi.onPress, true);
            window.addEventListener('wheel', KamaUi.onPress, true);
            r.addEventListener('scroll', KamaUi.onPress, true);
            r.addEventListener('mouseover', KamaUi.onOver);
            r.addEventListener('mousemove', KamaUi.onMove);
            r.addEventListener('mouseout', KamaUi.onOut);
            r.addEventListener('dragstart', KamaUi.onDragStart, true);
            r.addEventListener('dragover', KamaUi.onDragOver, true);
            r.addEventListener('dragleave', KamaUi.onDragLeave, true);
            r.addEventListener('drop', KamaUi.onDropFirst, true);
            r.addEventListener('drop', KamaUi.onDropLast);
            r.addEventListener('dragend', KamaUi.onDragEnd, true);
            window.addEventListener('dragover', KamaUi.onWindowDrag);
            window.addEventListener('drop', KamaUi.onWindowDrag);
            window.addEventListener('paste', KamaUi.onPaste, true);
            window.addEventListener('blur', KamaUi.onBlurAway);
            window.addEventListener('focus', KamaUi.onFocusBack);
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
            // (0.4.0) A drop names its zone, when one lies between where it landed and the element that heard it.
            if (ev.kind === 7) {
                var z = KamaUi.zoneUpTo(n, ev.current);
                if (z) return KamaUi.name(z.id, z);
            }
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
        // CHANGED (0.4.0): a chooser's answer and a finished read stay queued — they answer the program, not the document.
        clearBindings: function () {
            for (var i = 0; i < KamaUi.els.length; i++) KamaUi.release(i);
            KamaUi.els = [];
            KamaUi.ids = [];
            KamaUi.listeners = [];
            KamaUi.events = KamaUi.events.slice(KamaUi.head).filter(function (ev) { return ev.kind === 8 || ev.kind === 10; });
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
        KamaUi.install();
        // (0.4.0) host.kama's bridge: another library on the page takes a listed file whole — a fetch's body — without
        // its bytes ever passing through wasm memory. null for an unknown list or index.
        Module['kamaUiFile'] = function (files, index) {
            var entry = KamaUi.files[files];
            return (entry && index >= 0 && index < entry.list.length) ? entry.list[index] : null;
        };
        return 1;
    },

    kama_ui_web_set_document__deps: ['$KamaUi'],
    kama_ui_web_set_document: function (htmlPtr) {
        if (!KamaUi.root) return 0;
        KamaUi.clearBindings();
        KamaUi.root.innerHTML = KamaUi.rewrite(UTF8ToString(htmlPtr));
        KamaUi.untitle(KamaUi.root);
        KamaUi.typeClasses(KamaUi.root);
        KamaUi.measureFrom(KamaUi.root);
        KamaUi.tip = null;
        KamaUi.makeTip();
        KamaUi.dragSource = null;
        KamaUi.hover = null;
        KamaUi.loaded = true;
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
        KamaUi.releaseInside(el, false);
        el.innerHTML = KamaUi.rewrite(UTF8ToString(htmlPtr));
        KamaUi.untitle(el);
        KamaUi.typeClasses(el);
        KamaUi.measureFrom(el);
        KamaUi.wrote(el);
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
                // (0.6.0) Then `change`, as a browser's own step fires it: the step's Commit (`kindOf`).
                active.dispatchEvent(new Event('input', { bubbles: true }));
                active.dispatchEvent(new Event('change', { bubbles: true }));
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
    kama_ui_web_poll_event: function (handlePtr, targetPtr, sourcePtr, keyPtr, modsPtr, filesPtr, atXPtr, atYPtr) {
        HEAP32[handlePtr >> 2] = 0;
        HEAP32[targetPtr >> 2] = 0;
        HEAP32[sourcePtr >> 2] = 0;
        HEAP32[keyPtr >> 2] = 0;
        HEAP32[modsPtr >> 2] = 0;
        HEAP32[filesPtr >> 2] = 0;
        HEAPF32[atXPtr >> 2] = 0;
        HEAPF32[atYPtr >> 2] = 0;
        if (KamaUi.head >= KamaUi.events.length) {
            // Drained: reset rather than letting the array grow for the life of the page. The native
            // shim does the same with its head index.
            KamaUi.events = [];
            KamaUi.head = 0;
            return 0;
        }
        var ev = KamaUi.events[KamaUi.head++];
        var target = KamaUi.targetOf(ev) | 0;
        HEAP32[handlePtr >> 2] = ev.handle | 0;
        HEAP32[targetPtr >> 2] = target;
        HEAP32[sourcePtr >> 2] = KamaUi.nameOf(ev.source) | 0;
        HEAP32[keyPtr >> 2] = ev.key | 0;
        HEAP32[modsPtr >> 2] = ev.mods | 0;
        HEAP32[filesPtr >> 2] = ev.files | 0;
        if (ev.kind === 7 && target) {
            var at = KamaUi.within(KamaUi.el(target), ev.x, ev.y);
            HEAPF32[atXPtr >> 2] = at[0];
            HEAPF32[atYPtr >> 2] = at[1];
        }
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
        KamaUi.wrote(el);
    },

    kama_ui_web_set_class__deps: ['$KamaUi'],
    kama_ui_web_set_class: function (handle, name, on) {
        var el = KamaUi.el(handle);
        if (!el || !name) return;
        el.classList.toggle(UTF8ToString(name), on !== 0);
    },

    kama_ui_web_shutdown__deps: ['$KamaUi'],
    kama_ui_web_shutdown: function () {
        KamaUi.loaded = false;
        KamaUi.dragSource = null;
        KamaUi.tip = null;
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

    // A text control has the focus: the DOM is typing into it, so a printable key is not a screen verb. CHANGED (0.5.0):
    // every type a person types into (host.kama), from the ATTRIBUTE as native.kama reads it, not `el.type`, which a
    // browser normalises (an unknown type reads `text` there and not natively).
    kama_ui_web_text_focused__deps: ['$KamaUi'],
    kama_ui_web_text_focused: function () {
        var el = document.activeElement;
        if (!el || !KamaUi.root || !KamaUi.root.contains(el)) return 0;
        return KamaUi.typesText(el) ? 1 : 0;
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
        KamaUi.wrote(el);
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
        KamaUi.loaded = false;
        KamaUi.dragSource = null;
        KamaUi.tip = null;
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

    // `findElement`: `kama_ui_web_bind` without the listener (`$KamaUi.name`). 0 when no element has the id NOW, named
    // before or not: a handle stays its id's (it names the element again once one has the id), but finding it
    // answers whether there is one (FIXED 0.5.1: an id named before answered its handle with its element gone).
    kama_ui_web_find__deps: ['$KamaUi'],
    kama_ui_web_find: function (idPtr) {
        if (!KamaUi.root) return 0;
        var id = UTF8ToString(idPtr);
        if (!id) return 0;
        var at = KamaUi.ids.indexOf(id);
        if (at < 0) {
            var el = KamaUi.root.querySelector('#' + CSS.escape(id));
            if (!el) return 0;
            return KamaUi.name(id, el);
        }
        return KamaUi.el(at + 1) ? at + 1 : 0;
    },

    // `scrollToEnd` (0.2.1): at once, because reading `scrollHeight` makes the browser lay out what was just written —
    // the native leg has to wait for its next update for the same number. The `scroll` event this raises is not one a
    // binding hears (`heard`).
    kama_ui_web_scroll_to_end__deps: ['$KamaUi'],
    kama_ui_web_scroll_to_end: function (handle) {
        var el = KamaUi.el(handle);
        if (el) el.scrollTop = el.scrollHeight;
    },

    kama_ui_web_is_scrolled_to_end__deps: ['$KamaUi'],
    kama_ui_web_is_scrolled_to_end: function (handle) {
        var el = KamaUi.el(handle);
        if (!el) return 0;
        return (el.scrollHeight - el.scrollTop - el.clientHeight <= 1) ? 1 : 0;
    },

    // `appendInnerRml` (0.2.2). ⚠️ `insertAdjacentHTML`, NEVER `innerHTML +=`: the second re-parses the whole content,
    // which replaces every node — the reader's selection collapses, the bindings inside point at detached nodes, and a
    // log costs O(its length) per line. This parses only the new markup.
    kama_ui_web_append_inner__deps: ['$KamaUi'],
    kama_ui_web_append_inner: function (handle, htmlPtr) {
        var el = KamaUi.el(handle);
        if (!el) return;
        var last = el.lastChild;
        el.insertAdjacentHTML('beforeend', KamaUi.rewrite(UTF8ToString(htmlPtr)));
        for (var n = last ? last.nextSibling : el.firstChild; n; n = n.nextSibling) {
            KamaUi.untitle(n);
            KamaUi.typeClasses(n);
            KamaUi.measureFrom(n);
        }
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
        if (n.toLowerCase() === 'title') { el.setAttribute('data-kama-ui-title', v); return; }   // see `untitle`
        try { el.setAttribute(n, v); } catch (e) { return; }   // a name the DOM refuses ("", a space) does nothing
        if ((n.toLowerCase() === 'type' || n.toLowerCase() === 'class') && el.tagName === 'INPUT') KamaUi.typeClasses(el);
        if (KamaUi.control(el)) {
            if (n === 'checked') el.checked = true;
            if (n === 'value') { el.value = v; KamaUi.wrote(el); }
        }
    },

    kama_ui_web_remove_attribute__deps: ['$KamaUi'],
    kama_ui_web_remove_attribute: function (handle, name) {
        var el = KamaUi.el(handle);
        if (!el || !name) return;
        var n = UTF8ToString(name);
        el.removeAttribute(n);
        if (n.toLowerCase() === 'title') el.removeAttribute('data-kama-ui-title');
        if (KamaUi.control(el)) {
            if (n === 'checked') el.checked = false;
            if (n === 'value') { el.value = ''; KamaUi.wrote(el); }
        }
    },

    // ---- 0.3.0 (kama_ui_web.h) --------------------------------------------------------------------------------------

    // The program's clock (host.kama): `seconds` is a step for `update`, the time itself for `updateAt`.
    kama_ui_web_update__deps: ['$KamaUi'],
    kama_ui_web_update: function (seconds, absolute) {
        KamaUi.clock = absolute ? seconds : KamaUi.clock + seconds;
        KamaUi.tooltips();
    },

    kama_ui_web_child_count__deps: ['$KamaUi'],
    kama_ui_web_child_count: function (handle) {
        var el = KamaUi.el(handle);
        return el ? KamaUi.kids(el).length : 0;
    },

    // Clamped to what is there, as natively; what goes is released first, as a rewrite's is.
    kama_ui_web_remove_children__deps: ['$KamaUi'],
    kama_ui_web_remove_children: function (handle, from, count) {
        var el = KamaUi.el(handle);
        if (!el || count <= 0) return 0;
        var kids = KamaUi.kids(el);
        if (from < 0) from = 0;
        var end = Math.min(kids.length, from + count);
        for (var k = from; k < end; k++) {
            if (kids[k].nodeType === 1) KamaUi.releaseInside(kids[k], true);
            el.removeChild(kids[k]);
        }
        return Math.max(0, end - from);
    },

    // Every non-blank text run inside, in order, as RmlUi's text elements are; "" for a control.
    kama_ui_web_element_content__deps: ['$KamaUi', '$stringToUTF8', '$lengthBytesUTF8'],
    kama_ui_web_element_content: function (handle, buf, capacity) {
        if (buf && capacity > 0) HEAPU8[buf] = 0;
        var el = KamaUi.el(handle);
        if (!el || KamaUi.control(el)) return 0;
        var s = '';
        var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (var n = walk.nextNode(); n; n = walk.nextNode()) if (/\S/.test(n.nodeValue)) s += n.nodeValue;
        if (buf && capacity > 0) stringToUTF8(s, buf, capacity);
        return lengthBytesUTF8(s);
    },

    // `textContent`: never parsed. What it replaces is released, as a rewrite's is.
    kama_ui_web_set_content__deps: ['$KamaUi'],
    kama_ui_web_set_content: function (handle, text) {
        var el = KamaUi.el(handle);
        if (!el || KamaUi.control(el)) return;
        KamaUi.releaseInside(el, false);
        el.textContent = text ? UTF8ToString(text) : '';
    },

    // RmlUi's `ScrollIntoView(true)`: the element's top at its scrollable ancestors' tops, as near as they allow.
    kama_ui_web_scroll_into_view__deps: ['$KamaUi'],
    kama_ui_web_scroll_into_view: function (handle) {
        var el = KamaUi.el(handle);
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', inline: 'nearest' });
    },

    kama_ui_web_claim_key__deps: ['$KamaUi'],
    kama_ui_web_claim_key: function (key, mods) {
        KamaUi.claims[key + ':' + mods] = true;
    },

    // ⚠️ `navigator.clipboard` IS ASYNCHRONOUS AND MAY REFUSE (no permission, no person's gesture, an insecure page):
    // the refusal is swallowed, as a native write to an OS clipboard nobody bridged is. `execCommand('copy')` is the
    // fallback where there is no `navigator.clipboard` at all.
    kama_ui_web_copy_text: function (text) {
        var s = text ? UTF8ToString(text) : '';
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(s).catch(function () { });
                return;
            }
            var area = document.createElement('textarea');
            area.value = s;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            document.body.removeChild(area);
        } catch (e) { }
    },

    // `.checked`, which is the box's live state (the attribute is only its default). An `<input>` only, as natively.
    kama_ui_web_element_checked__deps: ['$KamaUi'],
    kama_ui_web_element_checked: function (handle) {
        var el = KamaUi.el(handle);
        return (el && el.tagName === 'INPUT' && el.checked === true) ? 1 : 0;
    },

    // ---- 0.4.0: files (kama_ui_web.h) ------------------------------------------------------------------------------

    // ⚠️ A BROWSER OPENS A CHOOSER ONLY FOR A PERSON'S GESTURE (its "transient activation", a few seconds after a click
    // or a key), and refuses silently otherwise — so this answers 0 rather than leave a chooser waiting for an answer
    // that cannot come. The input is clicked at once, inside the call, and listens for its answer: `change` with the
    // files, `cancel` without (and `onFocusBack` where a browser has no `cancel`).
    kama_ui_web_choose_files__deps: ['$KamaUi'],
    kama_ui_web_choose_files: function (acceptPtr, multiple) {
        if (!KamaUi.root || !KamaUi.loaded || KamaUi.chooser) return 0;
        var ua = navigator.userActivation;
        if (ua && !ua.isActive) return 0;
        var accept = acceptPtr ? UTF8ToString(acceptPtr) : '';
        var input = document.createElement('input');
        input.type = 'file';
        if (accept) input.accept = accept;
        input.multiple = multiple !== 0;
        input.style.display = 'none';
        var h = KamaUi.newList([]);
        var entry = KamaUi.files[h];
        entry.accept = accept;
        entry.multiple = multiple !== 0;
        entry.input = input;
        KamaUi.chooser = h;
        KamaUi.chooserLeft = false;
        input.addEventListener('change', function () { KamaUi.answer(h, input.files); });
        input.addEventListener('cancel', function () { KamaUi.answer(h, []); });
        document.body.appendChild(input);
        try { input.click(); } catch (e) { KamaUi.answer(h, []); }
        return h;
    },

    kama_ui_web_file_count__deps: ['$KamaUi'],
    kama_ui_web_file_count: function (files) {
        var entry = KamaUi.files[files];
        return entry ? entry.list.length : 0;
    },

    kama_ui_web_file_name__deps: ['$KamaUi', '$stringToUTF8', '$lengthBytesUTF8'],
    kama_ui_web_file_name: function (files, index, buf, capacity) {
        if (buf && capacity > 0) HEAPU8[buf] = 0;
        var entry = KamaUi.files[files];
        if (!entry || !(index >= 0 && index < entry.list.length)) return 0;
        var s = String(entry.list[index].name || '');
        if (buf && capacity > 0) stringToUTF8(s, buf, capacity);
        return lengthBytesUTF8(s);
    },

    kama_ui_web_file_size__deps: ['$KamaUi'],
    kama_ui_web_file_size: function (files, index) {
        var entry = KamaUi.files[files];
        if (!entry || !(index >= 0 && index < entry.list.length)) return -1;
        return entry.list[index].size;
    },

    // Releasing the list a chooser waits on closes nothing (a page cannot), but its answer is then ignored.
    kama_ui_web_release_files__deps: ['$KamaUi'],
    kama_ui_web_release_files: function (files) {
        delete KamaUi.files[files];
    },

    kama_ui_web_read_file__deps: ['$KamaUi'],
    kama_ui_web_read_file: function (files, index, offset, count) {
        var entry = KamaUi.files[files];
        if (!entry || !(index >= 0 && index < entry.list.length) || count < 0 || offset < 0) return 0;
        var r = KamaUi.nextFile++;
        KamaUi.reads[r] = { bytes: null, error: '', done: false };
        var blob = entry.list[index].slice(offset, offset + count);
        var finish = function (bytes, error) {
            var rd = KamaUi.reads[r];
            if (!rd) return;
            rd.bytes = bytes;
            rd.error = error;
            rd.done = true;
            KamaUi.events.push({ kind: 10, handle: 0, target: null, current: null, source: null, key: 0, mods: 0,
                                 files: r, x: 0, y: 0 });
        };
        var p = blob.arrayBuffer ? blob.arrayBuffer() : new Promise(function (ok, no) {
            var fr = new FileReader();
            fr.onload = function () { ok(fr.result); };
            fr.onerror = function () { no(fr.error); };
            fr.readAsArrayBuffer(blob);
        });
        p.then(function (buf) { finish(new Uint8Array(buf), ''); },
               function (err) { finish(null, String((err && err.message) || err || 'the file could not be read')); });
        return r;
    },

    // -2 while it waits, -1 when it failed or is unknown, else its length.
    kama_ui_web_read_length__deps: ['$KamaUi'],
    kama_ui_web_read_length: function (read) {
        var rd = KamaUi.reads[read];
        if (!rd) return -1;
        if (!rd.done) return -2;
        return rd.bytes ? rd.bytes.length : -1;
    },

    kama_ui_web_read_take__deps: ['$KamaUi'],
    kama_ui_web_read_take: function (read, buf) {
        var rd = KamaUi.reads[read];
        if (rd && rd.bytes && buf) HEAPU8.set(rd.bytes, buf);
        delete KamaUi.reads[read];
    },

    kama_ui_web_read_error__deps: ['$KamaUi', '$stringToUTF8', '$lengthBytesUTF8'],
    kama_ui_web_read_error: function (read, buf, capacity) {
        if (buf && capacity > 0) HEAPU8[buf] = 0;
        var rd = KamaUi.reads[read];
        var s = rd ? String(rd.error || '') : '';
        if (buf && capacity > 0) stringToUTF8(s, buf, capacity);
        return lengthBytesUTF8(s);
    },

    kama_ui_web_read_release__deps: ['$KamaUi'],
    kama_ui_web_read_release: function (read) {
        delete KamaUi.reads[read];
    },

    // A copy of the bytes (the program's buffer may move), a Blob of them, and a hidden `<a download>` clicked. The URL
    // is let go a minute later: a download that has not started by then never will.
    kama_ui_web_save_file__deps: ['$KamaUi'],
    kama_ui_web_save_file: function (namePtr, typePtr, bytesPtr, count) {
        try {
            var bytes = HEAPU8.slice(bytesPtr, bytesPtr + count);
            var blob = new Blob([bytes], { type: typePtr ? UTF8ToString(typePtr) : 'application/octet-stream' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = namePtr ? UTF8ToString(namePtr) : 'download';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
            return 1;
        } catch (e) {
            return 0;
        }
    },

    // ---- 0.5.0: media (kama_ui_web.h) ------------------------------------------------------------------------------

    // -1 is None on the way out: a time or a length is never negative. `duration` is NaN until the metadata has loaded
    // and +Infinity for a stream with no end, and neither is a length.
    kama_ui_web_media_time__deps: ['$KamaUi'],
    kama_ui_web_media_time: function (handle) {
        var el = KamaUi.el(handle);
        if (!KamaUi.media(el)) return -1;
        var t = el.currentTime;
        return (isFinite(t) && t >= 0) ? t : -1;
    },

    kama_ui_web_media_duration__deps: ['$KamaUi'],
    kama_ui_web_media_duration: function (handle) {
        var el = KamaUi.el(handle);
        if (!KamaUi.media(el)) return -1;
        var d = el.duration;
        return (isFinite(d) && d >= 0) ? d : -1;
    },

    kama_ui_web_media_paused__deps: ['$KamaUi'],
    kama_ui_web_media_paused: function (handle) {
        var el = KamaUi.el(handle);
        if (!KamaUi.media(el)) return -1;
        return el.paused ? 1 : 0;
    },

    // `currentTime` written, which reads back at once (the browser clamps it to the clip once the length is known) and
    // fires `seeked` once the frame there is decoded. Before the metadata it sets where the clip will start.
    kama_ui_web_seek_media__deps: ['$KamaUi'],
    kama_ui_web_seek_media: function (handle, seconds) {
        var el = KamaUi.el(handle);
        if (!KamaUi.media(el) || !isFinite(seconds) || !(seconds >= 0)) return 0;
        try { el.currentTime = seconds; } catch (e) { return 0; }
        return 1;
    },

    // ⚠️ `play()` RETURNS A PROMISE A BROWSER MAY REJECT (a clip with sound and no person's gesture), and an unhandled
    // rejection is an error in the console: it is caught and dropped. `paused` is what says whether it played.
    kama_ui_web_play_media__deps: ['$KamaUi'],
    kama_ui_web_play_media: function (handle) {
        var el = KamaUi.el(handle);
        if (!KamaUi.media(el)) return 0;
        try {
            var p = el.play();
            if (p && typeof p.catch === 'function') p.catch(function () { });
        } catch (e) { }
        return 1;
    },

    kama_ui_web_pause_media__deps: ['$KamaUi'],
    kama_ui_web_pause_media: function (handle) {
        var el = KamaUi.el(handle);
        if (!KamaUi.media(el)) return 0;
        el.pause();
        return 1;
    }
});
