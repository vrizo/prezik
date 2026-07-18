# Prezik app

- `npm install`, then `npm run dev` (Vite) and `npx convex dev` (pushes convex/ + watches) in two terminals.
- Push functions once without watching: `npx convex dev --once`.
- Seed coupon + prompts: `npm run seed`.
- Typecheck / test / build: `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
- Deploy staging Worker: `npm run deploy:staging` (needs `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` in root `.env`, exported into the shell first).

Already logged in and linked to the `prezik` Convex project (deployment `polished-chicken-876`, EU). `OPENAI_API_KEY`/`TAVILY_API_KEY` are pushed to Convex env. Still needed from a human: set `RECORDER_URL` and `RECORDER_SERVICE_TOKEN` on Convex once recorder/ is deployed (`npx convex env set NAME value`).
