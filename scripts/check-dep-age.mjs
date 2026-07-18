#!/usr/bin/env node
// Usage: node scripts/check-dep-age.mjs <package>[@version]
// Fails (exit 1) if the version was published less than 72 hours ago.
import { execSync } from "node:child_process";

const arg = process.argv[2];
if (!arg) {
  console.error("usage: check-dep-age.mjs <package>[@version]");
  process.exit(2);
}
const at = arg.lastIndexOf("@");
const name = at > 0 ? arg.slice(0, at) : arg;
const version = at > 0 ? arg.slice(at + 1) : null;

const times = JSON.parse(execSync(`npm view ${name} time --json`, { encoding: "utf8" }));
const v = version ?? JSON.parse(execSync(`npm view ${name} version --json`, { encoding: "utf8" }));
const published = times[v];
if (!published) {
  console.error(`version ${v} of ${name} not found in registry`);
  process.exit(1);
}
const ageHours = (Date.now() - new Date(published).getTime()) / 3.6e6;
console.log(`${name}@${v} published ${published} (${ageHours.toFixed(1)}h ago)`);
if (ageHours < 72) {
  console.error(`REJECTED: younger than 72 hours`);
  process.exit(1);
}
