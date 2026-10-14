// kama_ui_test.js — the web test's page-side helpers (kama_ui_test.h), an emcc --js-library from tests/kama.json.
mergeInto(LibraryManager.library, {
    $KamaUiTest: {
        held: null,   // kama_ui_test_hold
        // The same ratio kama_ui_web.js reads: framebuffer pixels -> CSS pixels.
        ratio: function () {
            var c = document.getElementById('canvas');
            return (c && c.clientWidth > 0) ? (c.width / c.clientWidth) : 1;
        }
    },

    kama_ui_test_scroll_at__deps: ['$KamaUiTest'],
    kama_ui_test_scroll_at: function (x, y, notches) {
        var r = KamaUiTest.ratio();
        for (var el = document.elementFromPoint(x / r, y / r); el; el = el.parentElement) {
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

    kama_ui_test_click_at: function (x, y) {
        // The same ratio kama_ui_web.js reads: framebuffer pixels -> CSS pixels.
        var c = document.getElementById('canvas');
        var r = (c && c.clientWidth > 0) ? (c.width / c.clientWidth) : 1;
        var cx = x / r, cy = y / r;
        var el = document.elementFromPoint(cx, cy);
        if (!el) return 0;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
        return 1;
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
    }
});
