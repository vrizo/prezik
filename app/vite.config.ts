import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The repo root .env is the canonical config file (see AGENTS.md) — read it
// directly so the Convex client URL doesn't depend on app/.env.local
// existing (that file is machine-local, gitignored, and only written by
// `npx convex dev`).
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, new URL("..", import.meta.url).pathname, "");
  const convexUrl = rootEnv.CONVEX_CLOUD_URL;
  if (!convexUrl) throw new Error("CONVEX_CLOUD_URL is not set in the repo root .env");

  return {
    plugins: [react(), tailwindcss()],
    define: {
      "import.meta.env.VITE_CONVEX_URL": JSON.stringify(convexUrl),
    },
  };
});
