import { appendFileSync, lstatSync, mkdirSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// File logger for Node processes (recorder, scripts). Convex functions cannot
// write files; they log to console (visible in dashboard + npx convex logs)
// and mirror errors to the run_events table instead.
// Layout: <repo>/logs/YYYY-MM-DD/run-N/<service>.log, newest at logs/current.

let runDir: string | null = null;

export function initRunDir(logsRoot: string, meta: Record<string, unknown> = {}): string {
  if (runDir) return runDir;
  if (process.env.LOG_RUN_DIR) {
    runDir = process.env.LOG_RUN_DIR;
    mkdirSync(runDir, { recursive: true });
    return runDir;
  }
  const day = new Date().toISOString().slice(0, 10);
  const dayDir = join(logsRoot, day);
  mkdirSync(dayDir, { recursive: true });
  const runs = readdirSync(dayDir).filter((d) => d.startsWith("run-"));
  const next = runs.length ? Math.max(...runs.map((d) => Number(d.slice(4)) || 0)) + 1 : 1;
  runDir = join(dayDir, `run-${next}`);
  mkdirSync(runDir);
  writeFileSync(join(runDir, "run.json"), JSON.stringify({ startedAt: new Date().toISOString(), ...meta }, null, 2));
  const current = join(logsRoot, "current");
  try {
    lstatSync(current);
    unlinkSync(current); // it's a symlink; unlink works where rmSync throws EISDIR
  } catch {
    // no existing symlink
  }
  symlinkSync(runDir, current);
  return runDir;
}

export function createLogger(service: string, logsRoot: string) {
  const dir = initRunDir(logsRoot);
  const file = join(dir, `${service}.log`);
  const write = (level: "info" | "error", msg: string, extra?: unknown) => {
    const line = `${new Date().toISOString()} ${level} [${service}] ${msg}${extra !== undefined ? " " + JSON.stringify(extra) : ""}\n`;
    appendFileSync(file, line);
    (level === "error" ? console.error : console.log)(line.trimEnd());
  };
  return {
    info: (msg: string, extra?: unknown) => write("info", msg, extra),
    error: (msg: string, extra?: unknown) => write("error", msg, extra),
  };
}
