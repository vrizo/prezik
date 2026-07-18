Prompts

System prompts for Scout, Mapper, Director and Presenter live in app/convex/prompts/ as TypeScript strings, one file per agent, with a version number and a short changelog comment at the top.

The training loop (docs/training/loop.md) proposes new versions. A new version lands as an ordinary reviewed change; nothing edits prompts at runtime.

Rules for prompt edits: keep narration instructions concrete (spoken words only, no stage directions), keep selector guidance strict (plain CSS, prefer ids and stable attributes, never invented selectors — only ones present in the sitemap data), and keep scene counts inside LENGTH_TO_SCENES from shared.
