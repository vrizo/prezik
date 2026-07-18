Deploy to production (only after the change is reviewed)

Convex: cd app && npx convex deploy (targets the project's production deployment; use a production deploy key from the dashboard in CI contexts).
Web app: cd app && npx wrangler deploy --env production (app.present.vrizo.net).
Recorder: cd recorder && npx wrangler deploy --env production, then the two secrets with --env production. Bucket prezik-videos-production already exists.
Landing: cd landing && npm run build && npx wrangler deploy --env production (present.vrizo.net). Blocked until the owner's designs land.

Production Convex env vars are separate: repeat npx convex env set ... --prod (OPENAI_API_KEY, TAVILY_API_KEY, RECORDER_URL, RECORDER_SERVICE_TOKEN) before the first production run.

Never deploy production during an active demo. The demo target pain-tracker.app is not ours to touch at all.
