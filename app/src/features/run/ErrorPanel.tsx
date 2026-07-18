import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { Pup } from "../../components/ui/Pup";
import { latestEventUrl, pathOf, type Step } from "./runPhases";
import type { RunDoc } from "./RunScreen";

type Events = FunctionReturnType<typeof api.runs.events>;

const STEP_GERUND: Record<Step, string> = {
  explore: "Exploring",
  plan: "Planning",
  record: "Recording",
};

type Props = {
  run: RunDoc;
  events: Events;
  step: Step;
  onRetry: () => void;
};

// The critical-failure box, shown BELOW the step's normal view (the step UI
// stays visible; only a run that truly cannot continue gets this).
export function ErrorPanel({ run, events, step, onRetry }: Props) {
  const [copied, setCopied] = useState(false);

  const path = pathOf(latestEventUrl(events)) || "the app";
  const errorEvents = events.filter((event) => event.level === "error");

  // Credits are consumed at markRecording (the moment recording starts), not at
  // create or on success. So a failure before recording never charged the run;
  // a failure during recording already did.
  const chargeNote = step === "record" ? "we're on it" : "your run wasn't charged";

  async function copyError() {
    await navigator.clipboard.writeText(run.error ?? "unknown error");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-[22px] flex items-start gap-4 rounded-[16px] border border-[#f3c9c1] bg-[#fdf1ef] p-5">
      <Pup pose="error" className="h-16 w-16 flex-none text-[#c0392b]" />
      <div className="flex-1">
        <h3 className="mb-1 text-[18px] font-bold text-[#a5301f]">
          {STEP_GERUND[step]} stopped on {path}
        </h3>
        <p className="mb-3 text-[14px] text-sub">
          {run.error ?? "The run stopped unexpectedly."} — {chargeNote}
        </p>
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
  );
}

// Non-critical errors while the run keeps going: a quiet log under the step
// view, plus a note when we're being rate-limited.
export function ErrorNotes({ events }: { events: Events }) {
  const errorEvents = events.filter((event) => event.level === "error");
  if (errorEvents.length === 0) return null;
  const rateLimited = errorEvents.some((event) => /\b429\b/.test(event.message));

  return (
    <div className="mt-[22px] rounded-[14px] border border-[#f0dcc3] bg-[#fdf8ef] px-[16px] py-[12px]">
      <div className="mb-1 text-[12px] font-bold text-[#9a6300]">
        Some pages had hiccups — the run continues
        {rateLimited && " (rate limited, slowing down the crawl)"}
      </div>
      <div className="font-mono text-[12px] leading-[1.7] text-[#8a6a3a]">
        {errorEvents.map((event, index) => (
          <div key={index}>{event.message}</div>
        ))}
      </div>
    </div>
  );
}
