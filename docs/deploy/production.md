Deploy to production (only after the change is reviewed)

Production is fully separate from staging. Staging = the Convex dev deployment
polished-chicken-876; production = the Convex prod deployment fabulous-bird-522
(both EU). Nothing production shares state with staging.

Export CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from root .env first
(set -a; source .env; set +a).

Convex (fabulous-bird-522):
- Env vars, set once with --prod: OPENAI_API_KEY, TAVILY_API_KEY,
  RECORDER_SERVICE_TOKEN, and RECORDER_URL=https://recorder-production.vitalii-rizo.workers.dev
  (npx convex env set NAME value --prod).
- Deploy functions: cd app && npx convex deploy. It prompts to confirm the prod
  push; in a non-interactive shell wrap it in a pty, e.g.
  expect -c 'spawn npx convex deploy; expect "push your code to your prod" {send "y\r"}; expect eof'.
- Seed once (coupon + active prompts): npx convex run seed:run --prod.

Web app (prezik.vrizo.net):
- Build with the PRODUCTION Convex URL baked in — vite reads CONVEX_CLOUD_URL
  from root .env (staging), so override it:
  CONVEX_CLOUD_URL=https://fabulous-bird-522.eu-west-1.convex.cloud npm run build
  (verify: grep fabulous-bird-522 dist/assets/*.js).
- The production env in wrangler.jsonc sets CONVEX_HTTP_ACTIONS_URL to the
  fabulous-bird-522 .site URL (used by the /mcp worker).
- Deploy: npx wrangler deploy --env production.

Recorder (recorder-production, R2 bucket prezik-videos-production):
- cd recorder && npx wrangler deploy --env production (builds the container
  image, needs OrbStack/Docker running).
- Secrets after first deploy: RECORDER_SERVICE_TOKEN and OPENAI_API_KEY via
  wrangler secret put NAME --env production.

DNS: no manual step. The vrizo.net zone is on Cloudflare and the API token has
zone access, so the custom_domain route auto-creates its DNS record + edge cert.
A brand-new hostname can take a few minutes for the cert to issue — curl returns
error 35 / HTTP 000 until it does.

Never deploy production during an active demo. The demo target pain-tracker.app
is not ours to touch at all.
