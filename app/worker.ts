// Cloudflare Worker serving the built SPA as static assets, plus a
// stateless streamable-HTTP MCP server at /mcp so a coding agent can drive
// Prezik directly. See docs/api/mcp.md. Everything the MCP tools do is a
// thin proxy to the public HTTP API described in docs/api/http.md — no
// business logic lives here.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { RunOptions } from "@prezik/shared";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  CONVEX_HTTP_ACTIONS_URL: string;
}

async function proxyToConvex(res: Response): Promise<{ content: [{ type: "text"; text: string }]; isError?: boolean }> {
  const text = await res.text();
  return res.ok ? { content: [{ type: "text", text }] } : { content: [{ type: "text", text }], isError: true };
}

function buildServer(convexHttpUrl: string): McpServer {
  const server = new McpServer({ name: "prezik", version: "0.1.0" });

  server.registerTool(
    "create_run",
    {
      title: "Create a demo video run",
      description:
        "Start a Prezik run: four agents research the given web app, map it, write a storyboard, and film a narrated demo video.",
      inputSchema: { url: z.string().min(1), options: RunOptions.optional() },
    },
    async ({ url, options }) => proxyToConvex(
      await fetch(`${convexHttpUrl}/api/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, options }),
      }),
    ),
  );

  server.registerTool(
    "get_run",
    {
      title: "Get run status",
      description: "Get a run's status and current agent activity, and — once done — the playback URL, captions URL, and duration.",
      inputSchema: { runId: z.string().min(1) },
    },
    async ({ runId }) => proxyToConvex(await fetch(`${convexHttpUrl}/api/runs/${encodeURIComponent(runId)}`)),
  );

  server.registerTool(
    "list_events",
    {
      title: "List run events",
      description: "The live agent feed for a run (Scout/Mapper/Director/Presenter activity), optionally only events after a seq cursor.",
      inputSchema: { runId: z.string().min(1), after: z.number().int().optional() },
    },
    async ({ runId, after }) => {
      const url = new URL(`${convexHttpUrl}/api/runs/${encodeURIComponent(runId)}/events`);
      if (after !== undefined) url.searchParams.set("after", String(after));
      return proxyToConvex(await fetch(url));
    },
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/mcp" || pathname.startsWith("/mcp/")) {
      if (!env.CONVEX_HTTP_ACTIONS_URL) {
        return new Response("CONVEX_HTTP_ACTIONS_URL is not configured on this Worker", { status: 500 });
      }
      // Stateless: a fresh server+transport per request, matching the MCP
      // SDK's stateless mode (sessionIdGenerator: undefined) and Workers'
      // per-request isolate model.
      const server = buildServer(env.CONVEX_HTTP_ACTIONS_URL);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      return transport.handleRequest(request);
    }
    return env.ASSETS.fetch(request);
  },
};
