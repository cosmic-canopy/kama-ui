#!/usr/bin/env python3
"""make-test-clip.py — write tests/fixtures/clip.webm, the web suite's media clip.

    python3 -I tools/make-test-clip.py tests/fixtures/clip.webm

Two seconds of 64x48 VP8 in WebM at 10 frames a second, no audio track (so a browser lets it play without a person's
gesture), key frames at most five frames apart so a seek decodes little. Each frame is one grey, lighter frame by
frame. Run once; the clip is committed (1,253 bytes). Needs PyAV (`av`) with libvpx, and numpy: PyAV 19 wrote it.
"""
import sys

import av
import numpy as np

FPS = 10
FRAMES = 20
WIDTH, HEIGHT = 64, 48

out = sys.argv[1]
with av.open(out, mode="w", format="webm") as box:
    stream = box.add_stream("libvpx", rate=FPS)
    stream.width = WIDTH
    stream.height = HEIGHT
    stream.pix_fmt = "yuv420p"
    stream.codec_context.gop_size = 5
    stream.codec_context.bit_rate = 64_000
    for i in range(FRAMES):
        grey = 16 + i * 10
        rgb = np.full((HEIGHT, WIDTH, 3), grey, dtype=np.uint8)
        frame = av.VideoFrame.from_ndarray(rgb, format="rgb24").reformat(format="yuv420p")
        frame.pts = i
        for packet in stream.encode(frame):
            box.mux(packet)
    for packet in stream.encode():
        box.mux(packet)
