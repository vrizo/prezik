import { ConvexError } from "convex/values";

// Mirrors convex/lib/errors.ts. Convex mutations throw ConvexError for
// user-facing validation failures (not enough credits, bad coupon, etc.) so
// the message survives to the client untouched — read it back out here
// rather than err.message directly.
export function errorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    return typeof err.data === "string" ? err.data : JSON.stringify(err.data);
  }
  return err instanceof Error ? err.message : String(err);
}
