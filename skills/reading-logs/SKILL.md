---
name: reading-logs
description: How to read Prezik logs without flooding context
---

Logs live in logs/YYYY-MM-DD/run-N/, one file per service: node.log, scout.log, mapper.log, director.log, presenter.log, recorder.log. run.json holds git commit and start time. logs/current is a symlink to the newest run.

Never cat a whole log file. Allowed patterns:
- tail -c 4000 logs/current/recorder.log
- grep runId logs/current/mapper.log | head -c 4000
- ls logs/2026-07-18/ to list runs first.

Errors are also mirrored to the Convex run_events table, easiest to query with npx convex data run_events --limit 20.
