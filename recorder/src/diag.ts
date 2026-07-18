import { readFileSync, statfsSync } from "node:fs";
import type { Page } from "playwright";
import type { Logger } from "./log.js";

// Compact runtime diagnostics for the container: cgroup OOM-kill counters,
// memory peak, and free disk on the paths that matter. Appended to failure
// logs so a browser death in the Cloudflare runtime tells us why.
export function containerDiagnostics(): string {
  const parts: string[] = [];
  const read = (p: string) => {
    try {
      return readFileSync(p, "utf8").trim();
    } catch {
      return null; // file absent outside a cgroup-v2 container; report what exists
    }
  };
  const events = read("/sys/fs/cgroup/memory.events");
  if (events) {
    const oomKill = /oom_kill (\d+)/.exec(events)?.[1] ?? "?";
    const oom = /(^|\n)oom (\d+)/.exec(events)?.[2] ?? "?";
    parts.push(`oom=${oom} oom_kill=${oomKill}`);
  }
  const peak = read("/sys/fs/cgroup/memory.peak");
  if (peak) parts.push(`mem_peak=${(Number(peak) / 1048576).toFixed(0)}MiB`);
  const max = read("/sys/fs/cgroup/memory.max");
  if (max) parts.push(`mem_max=${max === "max" ? "max" : (Number(max) / 1048576).toFixed(0) + "MiB"}`);
  for (const p of ["/", "/tmp", "/dev/shm"]) {
    try {
      const s = statfsSync(p);
      parts.push(`free(${p})=${((s.bavail * s.bsize) / 1048576).toFixed(0)}MiB`);
    } catch {
      // path absent; skip
    }
  }
  return parts.length ? parts.join(" ") : "no cgroup/statfs data available";
}

// Loud telemetry on the events that precede a "Target ... closed" error, so
// container logs show the real first failure and when it happened. Call
// disarm() right before the intentional close so a normal shutdown does not
// log as a death.
export function attachBrowserTelemetry(page: Page, log: Logger): { disarm(): void } {
  let armed = true;
  page.on("crash", () => {
    if (armed) log.error(`page CRASHED (renderer died) [${containerDiagnostics()}]`);
  });
  page.context().browser()?.on("disconnected", () => {
    if (armed) log.error(`browser DISCONNECTED unexpectedly [${containerDiagnostics()}]`);
  });
  return { disarm: () => (armed = false) };
}
