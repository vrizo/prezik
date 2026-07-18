import { createLogger } from "@prezik/shared/logger";
import { lstatSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { REPO_ROOT } from "./env.js";

export type Logger = ReturnType<typeof createLogger>;

// Dev logging goes to <repo>/logs/current/recorder.log via the shared logger.
export function makeLogger(): Logger {
  const logsRoot = resolve(REPO_ROOT, "logs");
  // The shared logger removes an existing logs/current with rmSync, which throws
  // ERR_FS_EISDIR on a symlink under Node 24 and breaks every second run of the
  // day. Pre-clear the symlink with unlinkSync (which does not follow it) so its
  // fresh symlinkSync succeeds. NOTE for repo owner: fix is rmSync -> unlinkSync
  // in shared/src/logger.ts.
  const current = join(logsRoot, "current");
  try {
    if (lstatSync(current).isSymbolicLink()) unlinkSync(current);
  } catch {
    // no logs/current yet; nothing to clear
  }
  return createLogger("recorder", logsRoot);
}
