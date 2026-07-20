Product model choices (OpenAI via Vercel AI SDK, verified July 2026)

- Scout: gpt-5.4-nano, reasoning effort low. $0.20/$1.25 per 1M tokens.
- Mapper page understanding (vision on screenshots + DOM): gpt-5.4-nano, reasoning none.
- Director storyboard (the call that matters, writes all narration): gpt-5.6-sol, reasoning high. $5/$30.
- Presenter runtime verification (vision): gpt-5.4-nano. Recovery narration lines: gpt-5.4-mini.
- Voice: gpt-4o-mini-tts, about $0.015 per minute. Voice map in shared/src/storyboard.ts (male cedar, female marin, neutral alloy). Steer delivery with the instructions parameter, language follows storyboard.language.
- Training-loop judge: Claude (the coding agent) — see docs/training/loop.md. The legacy gpt-5.6-sol judge is kept behind train.ts --judge (remote mode only) and is not used for now.

All calls go through the Vercel AI SDK (ai v7 + @ai-sdk/openai v4) with zod schemas. On NoObjectGeneratedError: one re-prompt with the raw text and validation error attached, then fail the run visibly. maxRetries handles transport only.

Cost per video is well under one dollar; keep it that way. If a model choice changes, update this file in the same change.
