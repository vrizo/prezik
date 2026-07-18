import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// recorder/src -> recorder -> repo root
export const RECORDER_DIR = resolve(here, "..");
export const REPO_ROOT = resolve(here, "..", "..");
export const ENV_PATH = resolve(REPO_ROOT, ".env");

// Re-read .env from disk on every call so a variable that appears mid-session
// (e.g. OPENAI_API_KEY added just before the TTS test) is picked up. dotenv
// never overrides an already-set process.env value.
function loadEnv(): void {
  if (existsSync(ENV_PATH)) config({ path: ENV_PATH, quiet: true });
}

export function requireEnv(name: string): string {
  loadEnv();
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var ${name}. Set it in ${ENV_PATH}.`);
  }
  return v;
}

export function optionalEnv(name: string): string | undefined {
  loadEnv();
  const v = process.env[name];
  return v && v.trim() !== "" ? v : undefined;
}
