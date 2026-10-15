// kama_ui_native.h — the C library declarations the native leg calls directly (native.kama's `extern "…h";`):
// a positioned seek for a read's slice, since std's `File` has none (KAMA_GAPS.md). Declarations only; kama emits every
// `extern "…h";` into one shared header, and gates this one with native.kama's file, so the web build never sees it.
#ifndef KAMA_UI_NATIVE_H
#define KAMA_UI_NATIVE_H
#ifdef _WIN32
#include <io.h>        // _lseeki64
#else
#include <unistd.h>    // lseek
#endif
#endif  // KAMA_UI_NATIVE_H
