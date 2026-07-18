Recording

CDP is the Chrome DevTools Protocol: the wire protocol Chrome exposes so external tools can control and observe the browser. Playwright itself drives Chrome over CDP. One CDP command, Page.startScreencast, makes Chrome push a JPEG image of every rendered frame to us.

Capture: we run our own screencast instead of Playwright's recordVideo. recordVideo uses the same screencast internally but re-encodes to VP8 at a fixed low bitrate (~1 Mbit/s), which looks muddy. We take the JPEG frames at quality 90 with their timestamps, acknowledge each frame (backpressure), and assemble them with ffmpeg at CRF 18 into h264 1080p. ffmpeg is used for assembly and audio muxing only, never for zooming.

Zoom: in-page CSS transform on the html element (smooth scale to the target with padding). Decided after an empirical comparison against browser-level zoom and pinch emulation — see recorder/README.md for why playwright-zoom (whole-tab zoom, no coordinates, extension does not load headless) could not do this. The page's own inline root transform is saved before zoom and restored on zoom-out.

Cursor and highlights: fixed-position elements injected into the page, so they scale with the zoom like everything else.

Audio: per-scene OpenAI TTS mp3s, durations measured with ffprobe, scenes padded so narration fits, tracks placed at scene offsets in the final mux. Captions are a WebVTT file built from the same narrations and offsets.

Storage: the container hands the finished mp4 and VTT to its own Worker, which writes them to an R2 bucket binding. Playback is a plain HTML5 video tag with a captions track, served from R2 with range support. No video service subscription.
