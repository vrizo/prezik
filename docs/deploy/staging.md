Deploy to staging (allowed any time, no confirmation needed)

Export CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from root .env in the shell first (set -a; source .env; set +a).

Convex: the staging backend IS the linked dev deployment polished-chicken-876 (EU). Push with: cd app && npx convex dev --once. Env vars: npx convex env set NAME value.
Web app: cd app && npx wrangler deploy --env staging (serves present-staging.vrizo.net, includes /mcp).
Recorder: cd recorder && npx wrangler deploy --env staging (builds the container image, needs OrbStack/Docker running). Secrets after first deploy: wrangler secret put RECORDER_SERVICE_TOKEN --env staging and OPENAI_API_KEY the same way.
Landing: no staging env (production-only page); verify with npm run build locally.

After a recorder deploy, the new container image takes a few minutes to roll out. Check whether a fresh instance is on the new image with: curl "https://recorder-staging.vitalii-rizo.workers.dev/healthz?runId=probe-$(date +%s)" — the build field is the image build time. Careful: every fresh runId starts a container instance that counts against max_instances (8 on staging) for its 20-minute sleepAfter, so probe at most once every 2-3 minutes or you exhaust the pool and runs fail with "no Container instance available".

After any staging deploy, run a smoke run against the API and check logs/current plus npx convex data run_events --limit 20 (from app/).
