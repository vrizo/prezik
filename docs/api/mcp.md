MCP

The product is drivable from a coding agent via MCP (streamable HTTP), so a builder can regenerate their demo right after a deploy.

Endpoint: /mcp on the app host (present-staging.vrizo.net/mcp on staging, app.present.vrizo.net/mcp in production). Stateless; implemented in the app Worker with @modelcontextprotocol/sdk, proxying to the Convex HTTP API.

Tools:
- create_run { url, options? } — start a video run. Returns runId and sessionId.
- get_run { runId } — status, and when done the playback URL and stream uid.
- list_events { runId, after? } — the live agent feed.

The HTTP surface behind it is described in app/public/openapi.json and docs/api/http.md. Connect example (Claude Code): claude mcp add prezik --transport http https://present-staging.vrizo.net/mcp
