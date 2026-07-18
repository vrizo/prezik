Prompt training loop

Goal: agents improve the product prompts by running the whole pipeline against real sites and judging the result.

Setup once: npm install at the repo root (a small root package.json holds only this script's deps: ai, @ai-sdk/openai, zod, @prezik/shared, tsx).

Usage: npx tsx scripts/train.ts --site <url> [--base <url>] [--runs N] [--signup <emailDomain>]

- --site: required, the target web app.
- --base: the Convex HTTP actions URL, defaults to staging.
- --runs: repeat sequentially with a fresh session each time, default 1.
- --signup: request credentials mode "signup" with this email domain instead of the default "none".

It starts a run over the public HTTP API (docs/api/http.md), redeeming the tech-europe-hackathon coupon automatically if the session has no credits, polls until done or failed (15 min cap), and streams the live agent feed to the console and to logs/current/training.log.

If the run fails, that is itself a finding: the report gets the failure reason and the script exits 1. No storyboard read API exists yet, so a done run is judged from the brief, the full event log, the WebVTT captions, and 6 frames sampled evenly from the video — not the raw action list. The judge (gpt-5.6-sol, via the Vercel AI SDK) scores 1-5 with a one-sentence justification each: coverage of real features, narration accuracy (checked against the brief), action quality (did scenes interact, inferred from narration language and the frames, or just navigate), pacing, and visual polish. It also proposes concrete prompt edits. Malformed judge output gets one re-prompt with the validation error, then the script exits non-zero.

The report lands at logs/current/training-report.md (plain English, with the run id).

A coding agent reviews the report, edits app/convex/prompts/ (new version number), deploys staging, reruns. Two clean improvements in a row on different sites before a prompt version goes to production. Training sites list: docs/training/sites.md.
