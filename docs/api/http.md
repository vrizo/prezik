Public HTTP API

Everything the UI can do is available over HTTP on the Convex deployment (its .convex.site URL). Machine-readable spec: app/public/openapi.json, served by the app at /openapi.json.

- POST /api/runs — body: { url, options? (RunOptions from shared), sessionId? }. Returns { runId, sessionId, runToken? }. Starts the pipeline.
- GET /api/runs/:id — status, current agent activity, and when done { playbackUrl, captionsUrl?, durationSec }. Status "needs_credentials" means the site requires sign-in and no credentials were provided; start a new run with credentials.
- GET /api/runs/:id/events?after=n — the live feed as JSON, for polling clients.
- POST /api/sessions/:id/coupon — body { code }. tech-europe-hackathon grants 100 percent off.

Internal (not in the spec): /callbacks/runs/:id — recorder callbacks, Bearer run token, body RecorderCallback from shared.

Keep this file and openapi.json in sync with the router in the same change.
