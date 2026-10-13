// kama_ui_test.js — the web test's page-side helpers (kama_ui_test.h), an emcc --js-library from tests/kama.json.
mergeInto(LibraryManager.library, {
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
