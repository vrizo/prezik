Dependency rules

No package version younger than 72 hours: node scripts/check-dep-age.mjs <pkg>@<version> before adding anything. If it fails, pin the previous version.

Keep dependencies few. Current intentional set: convex, react, react-dom, vite, vitest, tailwindcss, zod, ai, @ai-sdk/openai, playwright, @modelcontextprotocol/sdk, wrangler, typescript, tsx, dotenv. The recorder http layer is plain node:http on purpose. playwright-zoom was evaluated and rejected (see recorder/README.md). Anything beyond this list needs a reason in the commit message.
