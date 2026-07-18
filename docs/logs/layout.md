Logs

Disk layout: logs/YYYY-MM-DD/run-N/, newest symlinked at logs/current. Files per service: node.log (scripts and dev loops), recorder.log, plus one file per product agent: scout.log, mapper.log, director.log, presenter.log. run.json records start time and git commit.

Writers: Node processes use createLogger from @prezik/shared/logger. Convex functions cannot write files; they console.log (visible via npx convex logs and the dashboard) and write errors to the run_events table. scripts/pull-run-logs.mjs copies a run's Convex events into the run folder so everything for one run sits together.

Reading rule for agents: never cat a whole file. tail -c 4000 or grep pattern | head -c 4000. See skills/reading-logs/SKILL.md.
