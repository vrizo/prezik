Training scoreboard

Persistent record of every judged training run, newest last. The Claude judge appends one row per judged run (docs/training/loop.md, step 3); the run's own facts (cost, prompt versions) come from its run-meta.json. Never rewrite old rows — regressions must stay visible. "Two clean improvements in a row on two different sites" is checked against this table, not memory.

Columns: date, site, run id, mode (local/remote), label, prompt versions (scout/director), options if not default, scores 1-5 (coverage / narration / actions / pacing / polish), checklist hits (from the site's checklist in sites.md, e.g. 4/5), cost USD, one-line verdict.

| date | site | run | mode | label | prompts | options | cov | nar | act | pace | pol | checklist | cost | verdict |
|------|------|-----|------|-------|---------|---------|-----|-----|-----|------|-----|-----------|------|---------|
