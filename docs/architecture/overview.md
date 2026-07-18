Architecture

Flow: the app (prezik.vrizo.net) takes a URL, creates an anonymous session (cookie) and a run. Four product agents work the run:

1. Scout: Tavily search + reading the public site. Output: a short product brief.
2. Mapper: asks the recorder service to crawl with a real browser (map mode, signs up or logs in if credentials are set). Output: sitemap pages + up to 20 uniqueness-verified element selectors per page + live screenshots. The Director may only use selectors verbatim from that data.
3. Director: one strong-model call. Input: brief + sitemap + options + user guidance. Output: a Storyboard (shared/src/storyboard.ts) including every narration line.
4. Presenter: the recorder container executes the storyboard: fake cursor, highlight overlays, smooth in-page CSS zooms, per-scene OpenAI TTS, our own CDP screencast capture, ffmpeg assembly, upload to R2 via the recorder Worker, VTT captions. Details: docs/architecture/recording.md.

Convex is the source of truth and the live layer. Agents write run_events; the UI subscribes. Scout and Mapper run in parallel; Director waits for Mapper; Presenter waits for Director.

The recorder is one Node service with two endpoints (/map and /record), deployed as a Cloudflare Container behind a Worker. Convex actions call it with the run id and a random run token; the recorder calls back into Convex HTTP actions (Bearer run token). Convex actions cap at 10 minutes, which is why recording lives outside Convex.

Storyboard contract: shared/src/storyboard.ts. Change it only together with recorder/ and the Director prompt.

Status flow: created, exploring, planning, recording, uploading, done, failed. The Director can also end a run at needs_credentials — the product is behind a sign-in and no credentials were given, so the user must start a new run with test credentials. Errors are shown to the user as-is; no silent recovery.
