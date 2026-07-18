// Tiny hand-rolled router — no router library. Screens: "/" (Landing),
// "/new" (Link step: options + credentials), "/run/:id" (Run), 404 otherwise.
export type Route =
  | { screen: "start" }
  | { screen: "new" }
  | { screen: "run"; runId: string }
  | { screen: "notfound" };

export function parseRoute(pathname: string): Route {
  const match = pathname.match(/^\/run\/([^/]+)\/?$/);
  if (match) return { screen: "run", runId: match[1] };
  if (/^\/new\/?$/.test(pathname)) return { screen: "new" };
  if (pathname === "/" || pathname === "") return { screen: "start" };
  return { screen: "notfound" };
}

export function runPath(runId: string): string {
  return `/run/${runId}`;
}

export function newPath(url: string): string {
  return `/new?url=${encodeURIComponent(url)}`;
}
