// Pure client-side mirror of the server's entitlement check
// (convex/runs.ts's startRun) so the button can disable instantly without a
// round trip. The server call is still what actually enforces this.
export function canStartRun(credits: number): boolean {
  return credits >= 1;
}
