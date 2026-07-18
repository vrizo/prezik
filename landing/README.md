# Prezik landing

Paste-a-link marketing page. Vanilla Vite + TypeScript, no framework, no staging env (staging traffic goes straight to the app).

Deploy: `npm install && npm run build && wrangler deploy --env production`
Needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (root `.env`). Serves present.vrizo.net.
