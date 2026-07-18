# recorder

The Prezik recorder service. Two jobs, one Node process:

- map: drive a real browser over a target site, post pages + screenshots + harvested elements back.
- record: execute a storyboard (fake cursor, highlights, zoom, per-scene TTS), capture our own CDP screencast, assemble + mux with ffmpeg, upload to R2 via the recorder's own Worker.

It runs as a Cloudflare Container behind a Worker. Convex calls it; it calls Convex back over HTTP with the run token. Capture details: docs/architecture/recording.md (JPEG frames quality 90 with timestamps, acknowledged for backpressure, assembled at CRF 18 variable-frame-rate; ffmpeg never zooms).

## Endpoints

- GET /healthz — returns {ok:true}.
- POST /map — Bearer RECORDER_SERVICE_TOKEN. Body { runId, callbackUrl, runToken, url, credentials }. Returns 202, crawls async.
- POST /record — Bearer RECORDER_SERVICE_TOKEN. Body { runId, callbackUrl, runToken, storyboard, options, credentials? }. The storyboard is validated with the shared Storyboard schema; a bad body is 400. Returns 202, records async.

Both post progress back to `${callbackUrl}` as RecorderCallback objects (Bearer runToken). Screenshots are posted binary to `${callbackUrl}/screenshot` (image/jpeg) which returns {screenshotId}. A callback that fails is logged and the job continues; a job that fails ends with a recorderFailed callback carrying the real error.

Example callbackUrl (staging Convex): https://polished-chicken-876.eu-west-1.convex.site/callbacks/runs/<runId>

## Env

Read from the repo-root .env in dev, from Worker vars/secrets in the container. Missing a required one for the operation you ask for is an immediate error naming the variable.

- RECORDER_SERVICE_TOKEN — auth for POST /map and /record, and for PUT /internal/videos on the Worker.
- OPENAI_API_KEY — TTS (gpt-4o-mini-tts).
- WORKER_PUBLIC_URL — base URL of the recorder Worker; uploads go to it and playback URLs are built from it.
- PORT — server port, default 8080.
- FFMPEG_PATH, FFPROBE_PATH — optional overrides. Otherwise /opt/homebrew/bin on this Mac, plain names on PATH in the container.

The container does not use CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID; only wrangler needs them at deploy time, in the deploy shell.

## Dev

Install once: `npm install` here, `npm install --no-save zod@4.4.3` in ../shared (gives the shared package its own zod so tsx can resolve it), then `npx playwright install chromium`.

- Demo (the vertical slice): `npm run demo` renders fixtures/pain-tracker.json to tmp/ and uploads to the Worker (needs WORKER_PUBLIC_URL).
  - `npm run demo -- --no-tts` renders silent with 4s per scene. This is not a real demo; it prints a loud warning.
  - `npm run demo -- --no-upload` keeps the mp4 local and prints its path.
- Server: `npm start` (tsx src/server.ts) on PORT.
- Tests: `npm test` (VTT builder, scene-offset math, screencast concat playlist).

Logs go to <repo>/logs/current/recorder.log via the shared logger.

## Zoom: why not playwright-zoom

The repo asked for https://github.com/dszendrei/playwright-zoom for zooms. We checked it and did not use it, on purpose. That library is a thin wrapper over Chrome's native tab zoom: setBrowserZoom(page, 125) calls chrome.tabs.setZoom on the whole tab through a bundled extension. It has no element targeting, no padding, and no animation — it snaps the entire page to a zoom percentage in one frame, and text reflows. Our storyboard zoom action needs a smooth animated push-in onto a specific element with padding that shows up in the recorded video. So zoom is implemented in src/browser.ts as an in-page CSS transform: scroll the target to center, then scale document.documentElement around the element's center with a 600ms ease-in-out transition (never ffmpeg). This gives element targeting, padding, and easing, and is captured natively by Playwright recordVideo. zoomOut animates the transform back to none.

## Video storage and playback

No video service. The Worker in front of the container owns an R2 bucket binding (VIDEOS: prezik-videos-staging / prezik-videos-production):

- PUT /internal/videos/<key> — Bearer RECORDER_SERVICE_TOKEN, body streamed to R2. Keys look like <runId>.mp4 / <runId>.vtt. The container calls this on its own Worker (WORKER_PUBLIC_URL) after the mux.
- GET /videos/<key> — public playback from R2 with Range support (video/mp4 or text/vtt, cache-control public max-age 3600).

The videoReady callback carries { playbackUrl, captionsUrl?, durationSec } pointing at those GET URLs.

## Container and deploy

Deploy is coordinated at integration; do not run it ad hoc. Needs Docker/OrbStack running.

Build image (from repo root, because of the file:../shared dependency):

    docker build -f recorder/Dockerfile -t prezik-recorder .

Create the buckets once per environment (needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID exported in the shell; fails with code 10042 until R2 is enabled on the account):

    npx wrangler r2 bucket create prezik-videos-staging
    npx wrangler r2 bucket create prezik-videos-production

Deploy (wrangler builds and pushes the image, then rolls the container):

    npx wrangler deploy --env staging
    npx wrangler deploy --env production

Set secrets per environment (Worker secrets are forwarded into the container by the Recorder class in src/worker.ts; WORKER_PUBLIC_URL is a plain var in wrangler.jsonc):

    npx wrangler secret put RECORDER_SERVICE_TOKEN --env staging
    npx wrangler secret put OPENAI_API_KEY --env staging

Local Worker dev (R2 and the container emulated locally; secrets from .dev.vars.staging):

    npx wrangler dev --env staging

Inspect:

    npx wrangler containers list
    npx wrangler r2 object get prezik-videos-staging/<key> --file /tmp/check.mp4

Chasing a browser death in the container: failed jobs already report cgroup OOM counters, memory peak and free disk in the recorderFailed error (src/diag.ts). For Chromium's own stderr, set the var DEBUG=pw:browser on the environment and redeploy.
