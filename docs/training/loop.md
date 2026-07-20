Training loop, v2: Claude as the judge

Goal: Claude Code improves the whole product — prompts, agent logic, pipeline flow, model choices, tools — by running the real pipeline locally against a real site, judging the result itself, shipping a fix, and rerunning until the demo videos get better.

What "better" means (the target, in order):
- The final demo is interesting and dynamic — paced and structured like a real product presentation made by a person, not a screen recording with a voice on top.
- It presents the product and the idea: what it is, who it is for, why it matters — grounded only in what the brief and mapped pages actually show.
- No dead time on camera: loading states, navigation and page transitions that carry no meaning are skipped or cut; the video moves scene to scene, and unrelated navigation between scenes is removed rather than shown.
- Scenes interact — click, fill, highlight, zoom on the things the narration talks about, ending on visible outcomes.
- The narration language is English unless the user asked otherwise, even when the target site is not (e.g. kleinanzeigen.de).
- Agent instructions stay GENERIC: every prompt or logic change must make sense for the majority of products, never a special case for one training site. If a fix only works for pain-tracker, it is not a fix.

How a session starts: a human gives Claude a target site in the prompt. Run options default to exactly what the UI sends (voice neutral, zoom on, length short, captions on, horizontal, credentials none); the human can override any of them. Training sites, their credentials and their golden checklists: docs/training/sites.md.

Step 1 — run the pipeline locally, no UI

npx tsx scripts/train.ts --site <url> --local [--email <e> --password <p> | --signup <domain>] [--length medium] [--format vertical] [--guidance "<text>"] [--label <name>]

--local runs the actual product code from this working tree: Scout and Director are the same modules the Convex actions call (app/convex/agents/scoutCore.ts, directorCore.ts — same prompts from app/convex/prompts/, same models per docs/agents/models.md), Mapper and Presenter are the same recorder code the container ships (recorder/src/map.ts, record.ts) with real Chromium, TTS and ffmpeg. The OpenAI requests are byte-for-byte what production makes. Needs OPENAI_API_KEY and TAVILY_API_KEY in the root .env.

Everything lands in logs/current/training/<runId>/: storyboard.json (the raw scenes/actions/narration), events.json, map-shots/ (what the agents saw of the site), director-thinking.txt, video.mp4, captions.vtt, frames/ (sampled near the scene beats — at ~35% and ~85% of each scene's narration window, where the highlights and zooms fire — not evenly), and run-meta.json with phase timings and the exact cost per run (scout + director token spend at models.md rates, TTS estimated from audio minutes).

Without --local, train.ts drives a deployed Convex backend over the HTTP API as before — that path is the smoke test for what is actually deployed and must keep working. The legacy gpt-5.6-sol judge is disabled by default everywhere; Claude is the judge. (--judge re-enables it in remote mode only — do not use it for now.)

Step 2 — read the evidence

Follow skills/reading-logs (tail/grep, never cat whole files). Read in this order: the brief (accurate?), storyboard.json (the judge sees the exact scenes, selectors, actions and narration — action quality is checked directly, not inferred), events.json and training.log (errors, skipped actions, timing per phase from run-meta.json), captions.vtt, and the images. Look at the images visually with the Read tool: map-shots/ shows what the agents saw; frames/ shows what the customer gets, captured where the beats fire. If a frame looks broken, trace it back through the storyboard to the prompt or code that caused it.

Step 3 — analyse with a subagent, then judge

Spawn one analysis subagent (model Fable 5, medium reasoning effort) with the brief, the storyboard, events, captions, the frames, and the site's checklist from sites.md. It scores 1-5 with one evidence-based sentence each — coverage of real features (against the brief AND the checklist, counting checklist hits), narration accuracy (name any invented claim), action quality (from the storyboard: did scenes interact and end on outcomes, or just goto), pacing (scene count vs LENGTH_TO_SCENES, dead time, dynamics), visual polish (from the frames) — and proposes concrete changes, each naming a real file and one specific edit. Claude reviews the subagent's output against the raw evidence, drops anything the logs don't support, then appends one row to docs/training/scoreboard.md (columns documented there; cost and prompt versions from run-meta.json).

Step 4 — improve

Claude decides what to change. The full surface is in scope, not just prompt text:
- Prompts: app/convex/prompts/ (new version number + changelog line, rules in docs/agents/prompts.md) and recorder-owned behavior in recorder/src/.
- Agent logic and flow: reorder or add steps, add tool calls, tighten what the Mapper extracts, extend what the recorder can execute.
- Models: switching is allowed but must be justified against docs/agents/models.md pricing and the measured cost in run-meta.json — a quality win at gpt-5.6-sol prices needs to show up in the scores; a downgrade needs a run proving quality held.
- Templates: if a class of products keeps producing the same storyboard shape, extract it as a template the Director starts from.
- Contract changes: shared/src/storyboard.ts only changes together with recorder/ and the Director prompt.
Product rules hold during training: no silent fallbacks, malformed AI output gets exactly one re-prompt then fails visibly, selectors only verbatim from mapper data, and every change generic (see the goals above).

Step 5 — A/B, verify, promote

Test one variable at a time: run the baseline and the change against the SAME site in the same session, labeled (--label director-v8-baseline vs --label director-v9), and compare rows in the scoreboard — not a days-old memory of how it used to look. An improvement means higher where it was weak and no regression elsewhere, at a cost that is still well under a dollar per video. Two clean improvements in a row on two DIFFERENT sites (per the scoreboard) before a change deploys to staging (npx convex dev --once + docs/deploy/staging.md), and staging gets one remote train.ts run as a smoke test before production.
