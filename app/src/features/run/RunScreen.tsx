import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { newPath, runPath } from "../../lib/paths";
import { NotFoundScreen } from "../../components/NotFoundScreen";
import { GradientBackdrop } from "../../components/ui/GradientBackdrop";
import { PhaseStepper } from "../../components/ui/PhaseStepper";
import { SubStepper } from "./SubStepper";
import { ExploreView } from "./ExploreView";
import { PlanView } from "./PlanView";
import { RecordView } from "./RecordView";
import { ErrorPanel } from "./ErrorPanel";
import { NeedsCredentials } from "./NeedsCredentials";
import { ReadyView } from "./ReadyView";
import { currentSceneIndex, failedStep, stepOf, stepStates, type Step } from "./runPhases";

// The exact shape api.runs.get returns (run doc minus runTokenHash),
// derived from the query itself so it can never drift from reality.
export type RunDoc = NonNullable<FunctionReturnType<typeof api.runs.get>>;

type Props = { runId: string; navigate: (path: string, opts?: { freshRun?: boolean }) => void };

export function RunScreen({ runId, navigate }: Props) {
  const id = runId as Id<"runs">;

  const [viewedStep, setViewedStep] = useState<Step>("explore");
  const [revealed] = useState(() => window.history.state?.freshRun === true);
  const prevLiveRef = useRef<Step | null>(null);

  const run = useQuery(api.runs.get, { runId: id });
  const events = useQuery(api.runs.events, { runId: id }) ?? [];
  // Only subscribe to what the step in view actually needs.
  const sitePages = useQuery(api.sitePages.list, viewedStep === "explore" ? { runId: id } : "skip");
  // Also needed while failed: storyboard presence tells failedStep which
  // sub-step the run actually died on.
  const storyboard = useQuery(
    api.storyboards.get,
    viewedStep === "plan" || viewedStep === "record" || run?.status === "failed"
      ? { runId: id }
      : "skip",
  );
  const frames = useQuery(api.frames.list, viewedStep === "record" ? { runId: id } : "skip");

  const rerecord = useMutation(api.runs.rerecord);

  async function handleRerecord() {
    const result = await rerecord({ runId: id });
    navigate(runPath(result.runId), { freshRun: true });
  }

  if (run === undefined) {
    return (
      <main className="grid place-items-center bg-page py-40 text-[15px] text-sub">Loading…</main>
    );
  }
  if (run === null) {
    return <NotFoundScreen navigate={navigate} />;
  }
  if (run.status === "done") {
    // Re-record returns to the landing with the URL pre-filled rather than
    // silently starting a new charged run.
    return (
      <ReadyView run={run} onRerecord={() => navigate(`/?url=${encodeURIComponent(run.url)}`)} />
    );
  }

  // The director determines needs_credentials while planning; failures map to
  // the agent that raised the last error.
  const failedStepValue: Step =
    run.status === "needs_credentials" ? "plan" : failedStep(events, storyboard != null);
  const liveStep = stepOf(run.status, failedStepValue);

  // Keep the viewed step pinned to the live step, but snap forward whenever the
  // live step advances (a done chip the user is reviewing stays put otherwise).
  if (prevLiveRef.current !== liveStep) {
    prevLiveRef.current = liveStep;
    if (viewedStep !== liveStep) setViewedStep(liveStep);
  }

  const states = stepStates(liveStep);
  const failedChip = run.status === "failed" ? failedStepValue : null;
  const stepper = <SubStepper states={states} failed={failedChip} onSelect={setViewedStep} />;

  const isErrorView = run.status === "failed" && viewedStep === failedStepValue;
  const sceneIndex = currentSceneIndex(events, storyboard ?? null);

  return (
    <main className="relative w-full">
      <GradientBackdrop
        variant="creating"
        attachment="fixed"
        className={revealed ? "anim-reveal-in" : ""}
      />

      <div className="relative mx-auto my-8 max-w-[1050px] rounded-[22px] bg-white px-10 py-8 shadow-[0_30px_70px_rgba(0,0,0,.22)]">
        <PhaseStepper phase="creating" className="mb-[26px]" />

        {/* The step view always renders — a failure adds the error box below
            it instead of hiding the run's progress. */}
        <div className="flex flex-col">
          {viewedStep === "explore" ? (
            <ExploreView
              run={run}
              sitePages={sitePages}
              events={events}
              live={run.status === "exploring"}
              stepper={stepper}
            />
          ) : viewedStep === "plan" ? (
            <PlanView storyboard={storyboard} live={run.status === "planning"} stepper={stepper} />
          ) : (
            <RecordView
              events={events}
              storyboard={storyboard}
              frames={frames}
              sceneIndex={sceneIndex}
              live={run.status === "recording"}
              uploading={run.status === "uploading"}
              stepper={stepper}
            />
          )}
        </div>

        {isErrorView && (
          <ErrorPanel run={run} events={events} step={failedStepValue} onRetry={handleRerecord} />
        )}
      </div>

      {run.status === "needs_credentials" && (
        <NeedsCredentials
          open
          reason={run.needsCredentialsReason}
          onAddCredentials={() => navigate(newPath(run.url))}
          onBackToStart={() => navigate("/")}
        />
      )}
    </main>
  );
}
