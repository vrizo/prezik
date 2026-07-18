import { NoObjectGeneratedError } from "ai";

// Product rule (AGENTS.md): malformed AI output gets exactly one re-prompt
// with the validation error attached, then the run fails visibly. No
// default substitution, no silent recovery.
//
// `attempt` is called once with an empty retry note. If it throws, it is
// called a second time with a note describing what went wrong, appended to
// whatever prompt text `attempt` builds internally. If the second call also
// throws, this throws a single descriptive error.
export async function withOneRetry<T>(attempt: (retryNote: string) => Promise<T>): Promise<T> {
  try {
    return await attempt("");
  } catch (firstErr) {
    const note = describeError(firstErr);
    try {
      return await attempt(
        `\n\nYour previous response was invalid: ${note}\nFix this and answer again, following the instructions exactly.`,
      );
    } catch (secondErr) {
      throw new Error(`AI output still invalid after one retry: ${describeError(secondErr)}`);
    }
  }
}

function describeError(err: unknown): string {
  if (NoObjectGeneratedError.isInstance(err)) {
    const raw = err.text ? ` — raw output: ${err.text.slice(0, 500)}` : "";
    return `${err.message}${raw}`;
  }
  return err instanceof Error ? err.message : String(err);
}
