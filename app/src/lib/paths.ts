// Tiny hand-rolled router for 3 screens — no router library. Screens: "/"
// (Start) and "/run/:id" (Run).
export type Route = { screen: "start" } | { screen: "run"; runId: string };

export function parseRoute(pathname: string): Route {
  const match = pathname.match(/^\/run\/([^/]+)\/?$/);
  if (match) return { screen: "run", runId: match[1] };
  return { screen: "start" };
}

export function runPath(runId: string): string {
  return `/run/${runId}`;
}
