import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { runPath } from "../../lib/paths";
import { deriveAgentStates, latestUrl } from "./runState";
import { AgentCard } from "./AgentCard";
import { EventFeed } from "./EventFeed";
import { LivePanel } from "./LivePanel";
import { Player } from "./Player";
import { ErrorState } from "./ErrorState";

// The exact shape api.runs.get returns (run doc minus runTokenHash),
// derived from the query itself so it can never drift from reality.
export type RunDoc = NonNullable<FunctionReturnType<typeof api.runs.get>>;

type Props = { runId: string; navigate: (path: string) => void };

export function RunScreen({ runId, navigate }: Props) {
  const id = runId as Id<"runs">;
  const run = useQuery(api.runs.get, { runId: id });
  const events = useQuery(api.runs.events, { runId: id }) ?? [];
  const screenshot = useQuery(api.runs.latestScreenshot, { runId: id });
  const setGuidance = useMutation(api.runs.setGuidance);
  const rerecord = useMutation(api.runs.rerecord);

  const [guidance, setGuidanceInput] = useState("");
  const [guidanceSaved, setGuidanceSaved] = useState(false);

  async function handleSaveGuidance() {
    await setGuidance({ runId: id, guidance });
    setGuidanceSaved(true);
    setTimeout(() => setGuidanceSaved(false), 2000);
  }

  async function handleRerecord() {
    const result = await rerecord({ runId: id });
    navigate(runPath(result.runId));
  }

  if (run === undefined) {
    return <main className="p-8 text-ink-soft">Loading…</main>;
  }
  if (run === null) {
    return <main className="p-8 text-ink-soft">Run not found.</main>;
  }
  if (run.status === "done") {
    return <Player run={run} onRerecord={handleRerecord} />;
  }
  if (run.status === "failed") {
    return <ErrorState error={run.error ?? "unknown error"} onRerecord={handleRerecord} />;
  }

  const agentStates = deriveAgentStates(events, run.status);
  const currentUrl = latestUrl(events);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold text-ink">Building your demo</h1>

      <section className="flex flex-col gap-2 rounded-2xl border border-ink/10 bg-white p-4">
        <label htmlFor="guidance" className="text-sm font-medium text-ink">
          Anything the agents should know? The agents already started — this steers what happens next.
        </label>
        <textarea
          id="guidance"
          value={guidance}
          onChange={(e) => setGuidanceInput(e.target.value)}
          rows={2}
          className="rounded-xl border border-ink/10 px-3 py-2 outline-none focus:border-accent"
          placeholder="e.g. focus on the dashboard, skip the settings page"
        />
        <button
          type="button"
          onClick={handleSaveGuidance}
          className="self-start rounded-xl border border-ink/20 px-4 py-2 text-sm font-medium text-ink hover:border-accent"
        >
          {guidanceSaved ? "Saved" : "Save"}
        </button>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {agentStates.map((s) => (
          <AgentCard key={s.agent} {...s} />
        ))}
      </section>

      <LivePanel screenshotUrl={screenshot?.url} currentUrl={currentUrl} />

      <EventFeed events={events} />
    </main>
  );
}
