// kama_ui_test.js — the web test's page-side helpers (kama_ui_test.h), an emcc --js-library from tests/kama.json.
mergeInto(LibraryManager.library, {
    $KamaUiTest: {
        held: null,   // kama_ui_test_hold
        saved: null,  // kama_ui_test_spy_saves: the last download stopped, "name size type"
        spying: false,
        blob: null,
        // The two test files, fresh each time (a File is consumed by nothing, but a drop's list must be its own).
        twoFiles: function () {
            var dt = new DataTransfer();
            dt.items.add(new File(['alpha'], 'a.txt', { type: 'text/plain' }));
            dt.items.add(new File([new Uint8Array([80, 78, 71, 33])], 'b.png', { type: 'image/png' }));
            return dt;
        },
        drag: null,   // kama_ui_test_drag_begin, for drag_end
        copied: null, // kama_ui_test_spy_clipboard
        // What a browser does with a press it was not told to skip: it focuses the nearest focusable element at or
        // above what was pressed, or, when there is none, takes the focus off whatever had it.
        focusOnPress: function (el) {
            var f = el.closest ? el.closest('button, input, select, textarea, [tabindex]') : null;
            if (f && typeof f.focus === 'function') { f.focus(); return; }
            var a = document.activeElement;
            if (a && a !== document.body && typeof a.blur === 'function') a.blur();
        },
        // The same ratio kama_ui_web.js reads: framebuffer pixels -> CSS pixels.
        ratio: function () {
            var c = document.getElementById('canvas');
            return (c && c.clientWidth > 0) ? (c.width / c.clientWidth) : 1;
        }
    },

    kama_ui_test_scroll_at__deps: ['$KamaUiTest'],
    kama_ui_test_scroll_at: function (x, y, notches) {
        var r = KamaUiTest.ratio();
        // The wheel event first, as a browser fires it before it scrolls anything.
        var hit = document.elementFromPoint(x / r, y / r);
        if (hit) {
            hit.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, view: window, clientX: x / r,
                                                        clientY: y / r, deltaY: notches * 40 }));
        }
        for (var el = hit; el; el = el.parentElement) {
            var oy = getComputedStyle(el).overflowY;
            if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
                var was = el.scrollTop;
                el.scrollTop = was + notches * 40;
                return el.scrollTop !== was ? 1 : 0;
            }
        }
        return 0;
    },

    kama_ui_test_hold__deps: ['$KamaUiTest'],
    kama_ui_test_hold: function (idPtr) {
        KamaUiTest.held = document.getElementById(UTF8ToString(idPtr));
        return KamaUiTest.held ? 1 : 0;
    },

    kama_ui_test_fire_held__deps: ['$KamaUiTest'],
    kama_ui_test_fire_held: function () {
        var el = KamaUiTest.held;
        if (!el) return 0;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 1;
    },

    kama_ui_test_window__deps: ['$KamaUiTest'],
    kama_ui_test_window: function (wPtr, hPtr) {
        var r = KamaUiTest.ratio();
        HEAPF32[wPtr >> 2] = document.documentElement.clientWidth * r;
        HEAPF32[hPtr >> 2] = document.documentElement.clientHeight * r;
    },

    kama_ui_test_stage_is_page: function () {
        var st = document.getElementById('ui-stage');
        if (!st) return 0;
        var s = st.style, cs = getComputedStyle(st), b = st.getBoundingClientRect();
        var de = document.documentElement;
        return (cs.position === 'fixed' && s.left === '0px' && s.top === '0px' && s.right === '0px' && s.bottom === '0px' &&
                s.width === 'auto' && s.height === 'auto' && cs.transform === 'none' && cs.display !== 'none' &&
                b.left === 0 && b.top === 0 && b.width === de.clientWidth && b.height === de.clientHeight) ? 1 : 0;
    },

    kama_ui_test_type: function (idPtr, textPtr) {
        var el = document.getElementById(UTF8ToString(idPtr));
        if (!el) return 0;
        var chars = Array.from(UTF8ToString(textPtr));
        for (var i = 0; i < chars.length; i++) {
            el.value += chars[i];
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 1;
    },

    kama_ui_test_pick: function (selectPtr, optionPtr) {
        var sel = document.getElementById(UTF8ToString(selectPtr));
        var opt = document.getElementById(UTF8ToString(optionPtr));
        if (!sel || !opt) return 0;
        opt.selected = true;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return 1;
    },

    kama_ui_test_drag: function (idPtr, steps) {
        var el = document.getElementById(UTF8ToString(idPtr));
        if (!el) return 0;
        for (var i = 0; i < steps; i++) {
            el.stepDown();
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 1;
    },

    kama_ui_test_select: function (idPtr) {
        var el = document.getElementById(UTF8ToString(idPtr));
        if (!el) return 0;
        var range = document.createRange();
        range.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return sel.toString() === el.textContent ? 1 : 0;
    },

    kama_ui_test_selection_holds: function (idPtr) {
        var el = document.getElementById(UTF8ToString(idPtr));
        var sel = window.getSelection();
        if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return 0;
        var r = sel.getRangeAt(0);
        return (r.startContainer.isConnected && el.contains(r.startContainer) && sel.toString() === el.textContent) ? 1 : 0;
    },

    kama_ui_test_press_at__deps: ['$KamaUiTest'],
    kama_ui_test_press_at: function (x, y, mods, clicks) {
        var r = KamaUiTest.ratio();
        var cx = x / r, cy = y / r;
        var el = document.elementFromPoint(cx, cy);
        if (!el) return 0;
        var init = function (detail) {
            return { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, detail: detail,
                     shiftKey: (mods & 1) !== 0, ctrlKey: (mods & 2) !== 0, altKey: (mods & 4) !== 0 };
        };
        for (var k = 1; k <= clicks; k++) {
            if (el.dispatchEvent(new MouseEvent('mousedown', init(k)))) KamaUiTest.focusOnPress(el);
            el.dispatchEvent(new MouseEvent('mouseup', init(k)));
            el.dispatchEvent(new MouseEvent('click', init(k)));
        }
        if (clicks === 2) el.dispatchEvent(new MouseEvent('dblclick', init(2)));
        return 1;
    },

    kama_ui_test_key: function (code, mods, meta) {
        var named = { 256: 'Escape', 257: 'Enter', 258: 'Tab', 259: 'Backspace', 261: 'Delete', 262: 'ArrowRight',
                      263: 'ArrowLeft', 264: 'ArrowDown', 265: 'ArrowUp', 266: 'PageUp', 267: 'PageDown', 268: 'Home',
                      269: 'End' };
        var key = '', name = '';
        if (code >= 65 && code <= 90) {
            name = 'Key' + String.fromCharCode(code);
            key = (mods & 1) ? String.fromCharCode(code) : String.fromCharCode(code + 32);
        } else if (code >= 48 && code <= 57) {
            name = 'Digit' + (code - 48);
            key = String(code - 48);
        } else if (code >= 290 && code <= 301) {
            name = key = 'F' + (code - 289);
        } else {
            name = key = named[code] || '';
        }
        var init = { key: key, code: name, bubbles: true, cancelable: true, shiftKey: (mods & 1) !== 0,
                     ctrlKey: (mods & 2) !== 0, altKey: (mods & 4) !== 0, metaKey: meta !== 0 };
        var target = document.activeElement || document.body;
        var allowed = target.dispatchEvent(new KeyboardEvent('keydown', init));
        target.dispatchEvent(new KeyboardEvent('keyup', init));
        return allowed ? 0 : 1;
    },

    kama_ui_test_hover_at__deps: ['$KamaUiTest'],
    kama_ui_test_hover_at: function (x, y) {
        var r = KamaUiTest.ratio();
        var el = document.elementFromPoint(x / r, y / r);
        if (!el) return 0;
        var init = { bubbles: true, cancelable: true, view: window, clientX: x / r, clientY: y / r };
        el.dispatchEvent(new MouseEvent('mouseover', init));
        el.dispatchEvent(new MouseEvent('mousemove', init));
        return 1;
    },

    kama_ui_test_drag_begin__deps: ['$KamaUiTest'],
    kama_ui_test_drag_begin: function (fx, fy, tx, ty) {
        var r = KamaUiTest.ratio();
        var src = document.elementFromPoint(fx / r, fy / r), dst = document.elementFromPoint(tx / r, ty / r);
        if (!src || !dst) return 0;
        var dt = new DataTransfer();
        KamaUiTest.drag = { src: src, dst: dst, x: tx / r, y: ty / r, dt: dt };
        var at = function (px, py) {
            return { bubbles: true, cancelable: true, view: window, clientX: px, clientY: py, button: 0, detail: 1,
                     dataTransfer: dt };
        };
        if (src.dispatchEvent(new MouseEvent('mousedown', at(fx / r, fy / r)))) KamaUiTest.focusOnPress(src);
        src.dispatchEvent(new DragEvent('dragstart', at(fx / r, fy / r)));
        dst.dispatchEvent(new DragEvent('dragenter', at(tx / r, ty / r)));
        dst.dispatchEvent(new DragEvent('dragover', at(tx / r, ty / r)));
        return 1;
    },

    kama_ui_test_drag_end__deps: ['$KamaUiTest'],
    kama_ui_test_drag_end: function () {
        var d = KamaUiTest.drag;
        if (!d) return 0;
        var init = { bubbles: true, cancelable: true, view: window, clientX: d.x, clientY: d.y, dataTransfer: d.dt };
        d.dst.dispatchEvent(new DragEvent('drop', init));
        d.src.dispatchEvent(new DragEvent('dragend', init));
        KamaUiTest.drag = null;
        return 1;
    },

    kama_ui_test_spy_clipboard__deps: ['$KamaUiTest'],
    kama_ui_test_spy_clipboard: function () {
        KamaUiTest.copied = null;
        var spy = { writeText: function (s) { KamaUiTest.copied = s; return Promise.resolve(); } };
        try { Object.defineProperty(navigator, 'clipboard', { value: spy, configurable: true }); } catch (e) { }
    },

    kama_ui_test_copied_is__deps: ['$KamaUiTest'],
    kama_ui_test_copied_is: function (textPtr) {
        return KamaUiTest.copied === UTF8ToString(textPtr) ? 1 : 0;
    },

    kama_ui_test_has_attr: function (idPtr, attrPtr) {
        var el = document.getElementById(UTF8ToString(idPtr));
        return (el && el.hasAttribute(UTF8ToString(attrPtr))) ? 1 : 0;
    },

    kama_ui_test_attr_ends: function (idPtr, attrPtr, suffixPtr) {
        var el = document.getElementById(UTF8ToString(idPtr));
        if (!el) return 0;
        var v = el.getAttribute(UTF8ToString(attrPtr));
        var suffix = UTF8ToString(suffixPtr);
        return (v !== null && v.length >= suffix.length && v.slice(v.length - suffix.length) === suffix) ? 1 : 0;
    },

    kama_ui_test_report: function (run, failed) {
        var verdict = failed === 0 ? ('kama-ui web: PASS ' + run) : ('kama-ui web: FAIL ' + failed + '/' + run);
        document.title = verdict;
        var pre = document.getElementById('kama-ui-test-result');
        if (!pre) {
            pre = document.createElement('pre');
            pre.id = 'kama-ui-test-result';
            document.body.appendChild(pre);
        }
        pre.textContent = verdict;
        console.log(verdict);
        // And to the server that served the page (tools/web-test-server.py), so a headless browser needs no DOM dump
        // and no screenshot: the verdict and everything the program printed (emscripten's default shell keeps it in
        // #output) go back as one POST. A page opened by hand just gets a 404 here, harmlessly.
        var out = document.getElementById('output');
        var printed = out ? out.value : '';
        // Then close the window, which ends a headless browser whose profile lets a script do that (tools/test-web.sh
        // writes Firefox's `dom.allow_scripts_to_close_windows`); anywhere else the close is refused, harmlessly.
        try {
            fetch('/report', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                               body: JSON.stringify({ run: run, failed: failed, verdict: verdict, output: printed }) })
                .then(function () { window.close(); }, function () { });
        } catch (e) { }
    },

    // ---- 0.4.0: files ----

    kama_ui_test_drop_files__deps: ['$KamaUiTest'],
    kama_ui_test_drop_files: function (x, y, how) {
        var r = KamaUiTest.ratio();
        var cx = x / r, cy = y / r;
        var el = document.elementFromPoint(cx, cy);
        if (!el) return 0;
        var dt;
        if (how === 4) {
            dt = new DataTransfer();
            dt.setData('text/plain', 'just text');
        } else {
            dt = KamaUiTest.twoFiles();
        }
        var init = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, dataTransfer: dt };
        if (how === 3) {
            el.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, view: window, clientX: cx,
                                                           clientY: cy, dataTransfer: dt, relatedTarget: null }));
            return 1;
        }
        el.dispatchEvent(new DragEvent('dragenter', init));
        el.dispatchEvent(new DragEvent('dragover', init));
        if (how === 2 || how === 4) el.dispatchEvent(new DragEvent('drop', init));
        return 1;
    },

    kama_ui_test_allow_chooser: function () {
        try {
            Object.defineProperty(navigator, 'userActivation', { value: { isActive: true, hasBeenActive: true },
                                                                configurable: true });
        } catch (e) { }
    },

    kama_ui_test_chooser_is__deps: ['$KamaUi'],
    kama_ui_test_chooser_is: function (acceptPtr, multiple) {
        var h = KamaUi.chooser;
        var entry = h && KamaUi.files[h];
        var input = entry && entry.input;
        if (!input || !input.isConnected || input.type !== 'file') return 0;
        return (input.accept === UTF8ToString(acceptPtr) && input.multiple === (multiple !== 0)) ? 1 : 0;
    },

    // As the browser answers: the files on the input, then its `change`; or its `cancel`.
    kama_ui_test_answer_chooser__deps: ['$KamaUi', '$KamaUiTest'],
    kama_ui_test_answer_chooser: function (cancel) {
        var h = KamaUi.chooser;
        var input = h && KamaUi.files[h] && KamaUi.files[h].input;
        if (!input) return 0;
        if (cancel) {
            input.dispatchEvent(new Event('cancel'));
            return 1;
        }
        input.files = KamaUiTest.twoFiles().files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return 1;
    },

    kama_ui_test_paste_files: function () {
        var dt = new DataTransfer();
        dt.items.add(new File(['alpha'], 'a.txt', { type: 'text/plain' }));
        var target = document.activeElement || document.body;
        // ⚠️ Firefox keeps none of a script's files in a ClipboardEvent's own `clipboardData` (it takes strings only), so
        // the event is given the transfer a real paste carries, on the event itself.
        var ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'clipboardData', { value: dt });
        target.dispatchEvent(ev);
        return 1;
    },

    // A download is a click on an `<a download>`: stopped here, in the capture phase, with what it would have saved.
    kama_ui_test_spy_saves__deps: ['$KamaUiTest'],
    kama_ui_test_spy_saves: function () {
        KamaUiTest.saved = null;
        if (KamaUiTest.spying) return;
        KamaUiTest.spying = true;
        var make = URL.createObjectURL;
        URL.createObjectURL = function (blob) { KamaUiTest.blob = blob; return make.call(URL, blob); };
        document.addEventListener('click', function (e) {
            var a = e.target;
            if (!a || a.tagName !== 'A' || !a.hasAttribute('download')) return;
            e.preventDefault();
            var b = KamaUiTest.blob;
            KamaUiTest.saved = a.download + ' ' + (b ? b.size : -1) + ' ' + (b ? b.type : '');
        }, true);
    },

    kama_ui_test_saved__deps: ['$KamaUiTest', '$stringToUTF8', '$lengthBytesUTF8'],
    kama_ui_test_saved: function (buf, capacity) {
        var s = KamaUiTest.saved || '';
        if (buf && capacity > 0) stringToUTF8(s, buf, capacity);
        return lengthBytesUTF8(s);
    },

    kama_ui_test_bridge_is: function (files, index, namePtr) {
        var f = Module['kamaUiFile'] ? Module['kamaUiFile'](files, index) : undefined;
        var want = UTF8ToString(namePtr);
        if (want === '') return f === null ? 1 : 0;
        return (f instanceof File && f.name === want) ? 1 : 0;
    }
});
