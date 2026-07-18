import { ConvexError } from "convex/values";

// Convex wraps a plain Error's message with server-side stack info when it
// crosses a ctx.runMutation/runQuery call boundary (action -> mutation),
// and redacts it entirely for browser clients on production deployments.
// ConvexError's `data` survives both untouched, so user-facing validation
// failures should `throw new ConvexError("clear message")`, and callers
// should read messages back out through this helper rather than
// `err.message` directly.
export function errorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    return typeof err.data === "string" ? err.data : JSON.stringify(err.data);
  }
  return err instanceof Error ? err.message : String(err);
}
