import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { Orb } from "../../components/ui/Orb";
import { SpinnerArc } from "./SubStepper";
import { latestEventUrl, pathOf } from "./runPhases";

type Storyboard = NonNullable<FunctionReturnType<typeof api.storyboards.get>>;
type Events = FunctionReturnType<typeof api.runs.events>;
type Frames = FunctionReturnType<typeof api.frames.list>;

const NARRATING_BADGE = "flex-none rounded-md bg-[#e6ebfb] px-2 py-[3px] text-[11px] font-bold text-[#2a3a86]";

function formatTimer(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

type Props = {
  events: Events;
  storyboard: Storyboard | null | undefined;
  frames: Frames | undefined;
  sceneIndex: number | null;
  live: boolean; // status === "recording"
  uploading: boolean; // status === "uploading"
  stepper: ReactNode;
};

// The Record sub-step: the live filmstrip of captured frames plus the
// narration bar for the scene being recorded.
export function RecordView({ events, storyboard, frames, sceneIndex, live, uploading, stepper }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const list = frames ?? [];

  // Keep the newest frame in view: both strips follow the right edge as
  // frames stream in (the paths row is overflow-hidden but still scrollable
  // programmatically, so it stays aligned with the filmstrip).
  const stripRef = useRef<HTMLDivElement>(null);
  const pathsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.scrollTo({ left: stripRef.current.scrollWidth, behavior: "smooth" });
    pathsRef.current?.scrollTo({ left: pathsRef.current.scrollWidth, behavior: "smooth" });
  }, [list.length]);

  const lastFrame = list.length > 0 ? list[list.length - 1] : null;
  const currentPath = pathOf(lastFrame?.pageUrl ?? latestEventUrl(events));

  let firstPresenterTs: number | null = null;
  for (const event of events) {
    if (event.agent === "presenter") {
      firstPresenterTs = event._creationTime;
      break;
    }
  }
  const timer = firstPresenterTs !== null ? formatTimer(now - firstPresenterTs) : "0:00";

  const sceneCount = storyboard?.scenes.length ?? 0;
  const narration =
    sceneIndex !== null && storyboard ? storyboard.scenes[sceneIndex]?.narration : undefined;

  return (
    <>
      <div className="flex items-center gap-[14px]">
        <Orb theme="orange" className="h-[52px] w-[52px] flex-none" />
        <div className="flex-1">
          <div className="flex items-center gap-[10px]">
            <h2 className="whitespace-nowrap text-[26px] font-bold tracking-[-0.025em]">
              {uploading ? "Finishing your video" : "Recording the\u00A0demo"}
            </h2>
            {uploading ? (
              <SpinnerArc size={20} strokeColor="#605c55" />
            ) : live ? (
              <span className="inline-flex items-center gap-[6px] rounded-full bg-[#111] px-[11px] py-[5px]">
                <span className="anim-blink h-[7px] w-[7px] rounded-full bg-[#ff5436]" />
                <span className="text-[11px] font-bold tracking-[0.08em] text-white">REC</span>
              </span>
            ) : null}
          </div>
          {!uploading && (
            <p className="mt-1 text-[15px] text-sub">
              Now capturing <b className="text-ink">{currentPath}</b> — following the&nbsp;storyboard — {timer}
            </p>
          )}
        </div>
        {stepper}
      </div>

      <div className="mb-3 mt-[26px] flex items-center justify-between">
        <span className="text-[13px] font-bold">Captured frames</span>
        {sceneIndex !== null && sceneCount > 0 && (
          <span className="text-[12px] text-faint">
            Scene {sceneIndex + 1} of&nbsp;{sceneCount}
          </span>
        )}
      </div>

      <div
        ref={stripRef}
        onScroll={() => {
          if (pathsRef.current && stripRef.current)
            pathsRef.current.scrollLeft = stripRef.current.scrollLeft;
        }}
        className="scrollbar-none flex items-center gap-3 overflow-x-auto rounded-[16px] border-2 border-ink bg-[#fafafa] p-3"
      >
        {list.length === 0 ? (
          live ? (
            <div className="grid aspect-video w-[150px] flex-none place-items-center rounded-lg border border-dashed border-line2 text-faint">
              <span className="flex items-center gap-[6px] text-[12px]">
                <SpinnerArc size={13} />
                warming up
              </span>
            </div>
          ) : (
            <div className="px-2 py-4 text-[13px] text-faint">No frames captured yet.</div>
          )
        ) : (
          list.map((frame, index) => {
            const isLast = index === list.length - 1;
            const opacity = list.length === 1 ? 1 : 0.55 + (0.45 * index) / (list.length - 1);
            if (isLast) {
              return (
                <div
                  key={frame.seq}
                  className="anim-pop relative aspect-video w-[184px] flex-none overflow-hidden rounded-lg border-[2.5px] border-[#d43410] shadow-[0_6px_18px_rgba(212,52,16,.22)]"
                >
                  <img src={frame.url} alt="Latest captured frame" className="h-full w-full object-cover" />
                  {live && (
                    <div className="absolute right-[6px] top-[6px] flex items-center gap-[5px] rounded-md bg-[#111] px-[7px] py-[3px]">
                      <span className="anim-blink h-[5px] w-[5px] rounded-full bg-[#ff5436]" />
                      <span className="text-[8.5px] font-bold tracking-[0.05em] text-white">CAPTURING</span>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div
                key={frame.seq}
                className="aspect-video w-[150px] flex-none overflow-hidden rounded-lg border border-line"
                style={{ opacity }}
              >
                <img src={frame.url} alt="Captured frame" className="h-full w-full object-cover" />
              </div>
            );
          })
        )}
      </div>

      {list.length > 0 && (
        <div ref={pathsRef} className="mt-[9px] flex gap-3 overflow-hidden text-[11px] text-faint">
          {list.map((frame, index) => {
            const isLast = index === list.length - 1;
            return (
              <span
                key={frame.seq}
                className={`flex-none ${isLast ? "w-[184px] font-bold text-[#d43410]" : "w-[150px]"}`}
              >
                {pathOf(frame.pageUrl)}
              </span>
            );
          })}
        </div>
      )}

      {narration && (
        <div className="mt-[22px] flex items-center gap-3 rounded-[14px] border border-line bg-[#f7f6f3] px-[18px] py-[16px]">
          <span className={NARRATING_BADGE}>NARRATING</span>
          <span className="flex items-center text-[14px] text-ink">
            “{narration}”
            <span className="anim-pulse-soft ml-[6px] inline-block h-[9px] w-[9px] rounded-full bg-ink" />
          </span>
        </div>
      )}
    </>
  );
}
