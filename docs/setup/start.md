Setup

Current state: everything below is already done for staging. Kept for re-setup.

Human, once:
1. npx convex login (browser opens).
2. Install OrbStack or Docker Desktop (wrangler builds the recorder container image with it).
3. Enable R2 once in the Cloudflare dashboard (free tier; videos live in R2).
4. Copy .env.example to .env at the repo root and fill it. The Cloudflare token needs Workers Scripts Edit, Workers R2 Storage Edit, and Workers Routes Edit on the vrizo.net zone. Keep the section structure (Cloudflare, OpenAI, Tavily, Convex, Recorder).

Agents, after that:
- The Convex project already exists: deployment polished-chicken-876 (EU) — it is both the dev and the staging backend. cd app && npx convex dev --once pushes and generates types.
- Secrets used by Convex actions go in via npx convex env set (OPENAI_API_KEY, TAVILY_API_KEY, RECORDER_URL, RECORDER_SERVICE_TOKEN). Never into client code.
- Deploys: docs/deploy.

Node 24 is installed. There is no local product environment; code runs in Convex deployments and Cloudflare. Running recorder/ directly with node during development iteration is fine, that is a dev loop, not an environment.
