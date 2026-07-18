import { useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { Orb, type OrbTheme } from "../../components/ui/Orb";
import { Pup } from "../../components/ui/Pup";
import { latestEventUrl, pathOf, type Step } from "./runPhases";
import type { RunDoc } from "./RunScreen";

type Events = FunctionReturnType<typeof api.runs.events>;
type Frames = FunctionReturnType<typeof api.frames.list>;

const STEP_ORB: Record<Step, OrbTheme> = { explore: "blue", plan: "purple", record: "orange" };
const STEP_GERUND: Record<Step, string> = {
  explore: "Exploring",
  plan: "Planning",
  record: "Recording",
};

type Props = {
  run: RunDoc;
  events: Events;
  frames: Frames | undefined;
  step: Step;
  stepper: ReactNode;
  onRetry: () => void;
};

// The failed state, kept inside the Creating card on the step that broke.
export function ErrorPanel({ run, events, frames, step, stepper, onRetry }: Props) {
  const [copied, setCopied] = useState(false);

  const path = pathOf(latestEventUrl(events)) || "the app";
  const errorEvents = events.filter((event) => event.level === "error");
  const filmstrip = frames ?? [];

  // Credits are consumed at markRecording (the moment recording starts), not at
  // create or on success. So a failure before recording never charged the run;
  // a failure during recording already did.
  const wasCharged = step === "record";
  const chargeNote = wasCharged ? "we're on it" : "your run wasn't charged";

  async function copyError() {
    await navigator.clipboard.writeText(run.error ?? "unknown error");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <div className="flex items-center gap-[14px]">
        <Orb theme={STEP_ORB[step]} className="h-[52px] w-[52px] flex-none" />
        <div className="flex-1">
          <div className="flex items-center gap-[10px]">
            <h2 className="whitespace-nowrap text-[26px] font-bold tracking-[-0.025em]">
              {STEP_GERUND[step]} hit a snag
            </h2>
            <span className="inline-flex items-center gap-[6px] rounded-full bg-[#fdeede] px-[11px] py-[5px] text-[11px] font-bold tracking-[0.06em] text-[#9a6300]">
              PAUSED
            </span>
          </div>
          <p className="mt-1 text-[15px] text-sub">
            Stopped on <b className="text-ink">{path}</b> — {chargeNote}
          </p>
        </div>
        {stepper}
      </div>

      {filmstrip.length > 0 && (
        <>
          <div className="mb-3 mt-[26px] flex items-center justify-between">
            <span className="text-[13px] font-bold">Captured frames</span>
            <span className="text-[12px] text-faint">Stopped on {path}</span>
          </div>
          <div className="flex items-center gap-3 overflow-hidden rounded-[16px] border border-line bg-[#fafafa] p-3 opacity-55">
            {filmstrip.map((frame) => (
              <div
                key={frame.seq}
                className="aspect-video w-[150px] flex-none overflow-hidden rounded-lg border border-line"
              >
                <img src={frame.url} alt="Captured frame" className="h-full w-full object-cover" />
              </div>
            ))}
            <div className="grid aspect-video w-[60px] flex-none place-items-center rounded-lg border-[1.5px] border-dashed border-line2 text-center text-[11px] text-faint">
              {path}
            </div>
          </div>
        </>
      )}

      <div className="mt-[22px] flex items-start gap-4 rounded-[16px] border border-[#f3c9c1] bg-[#fdf1ef] p-5">
        <Pup pose="error" className="h-16 w-16 flex-none text-[#c0392b]" />
        <div className="flex-1">
          <h3 className="mb-1 text-[18px] font-bold text-[#a5301f]">
            {STEP_GERUND[step]} stopped on {path}
          </h3>
          <p className="mb-3 text-[14px] text-sub">{run.error ?? "The run stopped unexpectedly."}</p>
          <div className="rounded-[10px] bg-[#2a1614] px-[14px] py-3 font-mono text-[12px] leading-[1.7]">
            {errorEvents.length > 0 ? (
              errorEvents.map((event, index) => (
                <div key={index} className="text-[#ffb4a6]">
                  {event.message}
                </div>
              ))
            ) : (
              <div className="text-[#ffb4a6]">{run.error ?? "unknown error"}</div>
            )}
            <div className="text-[#f6d9d2] opacity-70">run {run._id.slice(0, 6)}</div>
          </div>
          <div className="mt-[14px] flex gap-[10px]">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-[7px] rounded-full bg-ink px-5 py-[11px] text-[14px] font-semibold text-white hover:bg-[#44403a]"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Retry
            </button>
            <button
              type="button"
              onClick={copyError}
              className="rounded-full px-[14px] py-[11px] text-[14px] font-semibold text-sub hover:bg-chip"
            >
              {copied ? "Copied" : "Copy error"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
