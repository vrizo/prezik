#!/usr/bin/env node
// Copies a run's Convex events into the current log run folder so everything
// about one product run sits together on disk.
// Usage: node scripts/pull-run-logs.mjs <convexRunId> [--deployment <name>]
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runId = process.argv[2];
if (!runId) {
  console.error("usage: pull-run-logs.mjs <convexRunId>");
  process.exit(2);
}
const extra = process.argv.slice(3).join(" ");

const out = execSync(
  `npx convex run runs:events '${JSON.stringify({ runId, after: 0 })}' ${extra}`,
  { cwd: join(repo, "app"), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);

const current = join(repo, "logs", "current");
const dir = existsSync(current) ? current : join(repo, "logs");
mkdirSync(dir, { recursive: true });
const file = join(dir, `convex-run-${runId}.json`);
writeFileSync(file, out);
console.log(`wrote ${file} (${out.length} bytes). Read it with tail/grep, not cat.`);
