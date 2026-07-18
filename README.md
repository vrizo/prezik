# Prezik

Paste a link to your web app. Four agents research it, sign in, map every page, write a storyboard, then film a narrated 60-90s demo video with a visible cursor, highlights and smooth zooms.

If you're AI, start here: AGENTS.md, then docs/ by topic.

## Installation

OrbStack and Node 24+ is required.

```bash
cp .env.example .env
cd app && npm install
cd ../recorder && npm install
cd ../landing && npm install
cd .. && npm install
cd app && npx convex login
```

## Start

There is no full local product environment — the backend runs on the linked Convex deployment (staging = dev: `polished-chicken-876`, EU).

Push backend code and regenerate types:

```bash
cd app && npx convex dev --once
```

For ongoing backend work, keep Convex watching:

```bash
cd app && npx convex dev
```

Run the Vite UI against that deployment locally:

```bash
cd app && npm run dev
```

Secrets for Convex actions go in with `npx convex env set NAME value` (never in client code).

## Test

The prompt training loop runs the full pipeline against a real site, judges the video, and writes a report.

```bash
npx tsx scripts/train.ts --site https://example.com [--runs N] [--signup email.domain]
```

The judge scores coverage, narration, actions, pacing, and polish (1–5 each) and proposes prompt edits. Report: `logs/current/training-report.md`. Review it, edit `app/convex/prompts/`, deploy staging, rerun. Details: docs/training/loop.md.

## Deploy

Export Cloudflare creds from `.env` first: `set -a; source .env; set +a`.

**Staging** (any time):

```bash
cd app && npx convex dev --once
cd app && npx wrangler deploy --env staging
cd recorder && npx wrangler deploy --env staging
```

**Production** (after review — NOT allowed to AI agents by default):

```bash
cd app && npx convex deploy
cd app && npx wrangler deploy --env production
cd recorder && npx wrangler deploy --env production
cd landing && npm run build && npx wrangler deploy --env production
```

Staging: present-staging.vrizo.net. Production: app.present.vrizo.net / present.vrizo.net. Full steps and secrets: docs/deploy/staging.md, docs/deploy/production.md.
