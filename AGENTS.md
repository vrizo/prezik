# Prezik — instructions for AI agents

What this is: paste a URL, four product agents (Scout, Mapper, Director, Presenter) research a web app, map it, plan a storyboard, and film a narrated demo video.

Layout: landing/ (static page), app/ (Vite React SPA + convex/ backend), recorder/ (browser + video service, runs as a Cloudflare Container), shared/ (contracts: storyboard schema, event types, logger), docs/ (by topic), skills/, scripts/, logs/.

Read the matching docs/ folder before working in an area. Docs are plain English, short, minimal markdown. Keep them that way.

Environments. Staging: present-staging.vrizo.net + Convex staging deployment. Production: present.vrizo.net + Convex prod deployment. There is no local product environment. Deploy to staging any time without asking. Deploy to production only after the work is reviewed.

Rules:
- Do not build or restyle end-user UI. The owner provides designs separately; existing screens are functional plumbing only.
- The prompt training loop is run manually by the owner. Agents may verify scripts/train works, never iterate prompts on their own.
- Git: humans commit, with human-written titles. Agents never run git commit or git push. No Claude/AI authorship, Co-Authored-By lines, or AI attribution in commits, PRs, or anywhere else.
- Config: the root .env is the canonical local config (structure: Cloudflare, OpenAI, Tavily, Convex sections — keep .env.example in that exact structure). Convex URLs are named CONVEX_CLOUD_URL (client) and CONVEX_HTTP_ACTIONS_URL (HTTP actions); tooling maps them to whatever a framework expects at build time.
- The product is drivable by API and by MCP, not only the UI. Machine-readable docs live in the repo: app/public/openapi.json plus docs/api/. Keep them in sync with code in the same change.
- No dependency younger than 72 hours. Check before adding: node scripts/check-dep-age.mjs <pkg>@<version>.
- No hidden fallbacks, mocks, silent recovery, or piles of defensive guards. Errors fail loudly, land in logs and in the run UI.
- No legacy attributes, no backward compatibility. There are no users yet.
- Secrets live only in root .env (never committed) and in Convex env (npx convex env set). Never in client code. Follow docs/setup/start.md.
- Logs: logs/YYYY-MM-DD/run-N/<service>.log, newest run symlinked at logs/current. Never cat a whole log. tail -c 4000 or grep pattern | head -c 4000. See skills/reading-logs/SKILL.md.
- The demo target pain-tracker.app is someone's production product. Browse it as a visitor only. Never modify it or its infrastructure.
- Product AI calls go through the Vercel AI SDK only. Model choice per agent: docs/agents/models.md. Malformed model output: one re-prompt with the validation error attached, then fail the run visibly. Never substitute defaults.
- The public HTTP API is part of the product. When endpoints change, update docs/api/http.md and app/public/openapi.json in the same change.
- The storyboard schema in shared/src/storyboard.ts is the contract between Director and recorder. Change it only with a matching change on both sides.
