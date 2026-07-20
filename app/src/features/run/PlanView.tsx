import { useEffect, useRef, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { Orb } from "../../components/ui/Orb";
import { SpinnerArc } from "./SubStepper";
import { pathOf } from "./runPhases";
import { useTypeOut } from "./useTypeOut";

type Storyboard = NonNullable<FunctionReturnType<typeof api.storyboards.get>>;
type Scene = Storyboard["scenes"][number];
type PlanProgress = FunctionReturnType<typeof api.planProgress.get>;

const RECORD_BADGE = "flex-none rounded-md bg-[#fbe9db] px-2 py-[3px] text-[11px] font-bold text-[#b2551a]";
const SAY_BADGE = "flex-none rounded-md bg-[#e6ebfb] px-2 py-[3px] text-[11px] font-bold text-[#2a3a86]";
const FLOW_CHIP = "rounded-full border border-line2 px-[14px] py-[7px] text-[13px] font-semibold";

function firstGotoPath(scene: Scene): string | null {
  for (const action of scene.actions) {
    if (action.type === "goto") return pathOf(action.url);
  }
  return null;
}

// Drop the markdown the reasoning summary carries (run-in **bold** headers,
// *italics*, `code`, [links](url), leading # hashes) so the thinking box reads
// as plain prose. Client-side only — the stored row stays raw.
function stripMarkdown(text: string): string {
  return text
    .replace(/`+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(^|\s)_(?=\S)([^_]+?)_(?=\s|$)/g, "$1$2")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "");
}

// The green success check, same glyph and stroke as SubStepper's done chip,
// tinted with the app's "success" green (#1a7f37, as in ExploreView).
function DoneCheck() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1a7f37"
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// The live "Thinking" panel: fixed 168px box (~7 lines) that never grows/jumps,
// its reasoning typed out ChatGPT-style with a breathing dot at the cursor. The
// spinner beside the label flips to a green check once the model stops
// reasoning and starts the storyboard.
function ThinkingBox({ raw, live, thinkingDone }: { raw: string; live: boolean; thinkingDone: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const { text, typing } = useTypeOut(stripMarkdown(raw));

  // Keep pinned to the newest text as the typing advances.
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  const showCursor = typing || (live && !thinkingDone);

  return (
    <div className="mb-[22px] mt-[22px]">
      <div className="mb-2 flex items-center gap-[6px] text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
        Thinking
        {thinkingDone ? <DoneCheck /> : live && <SpinnerArc size={12} strokeColor="#a8a29a" />}
      </div>
      <div
        ref={boxRef}
        className="h-[168px] overflow-y-auto whitespace-pre-wrap rounded-[14px] border border-line bg-[#faf9f6] px-[16px] py-[12px] text-[13px] leading-[1.6] text-sub"
      >
        {text}
        {showCursor && (
          <span className="anim-breathe ml-[3px] inline-block h-[7px] w-[7px] translate-y-[-1px] rounded-full bg-[#a8a29a] align-middle" />
        )}
      </div>
    </div>
  );
}

// One drafted scene card, shown for both the streaming drafts and the finished
// storyboard's per-scene rows.
function SceneCard({ index, title, narration, path, animate }: {
  index: number;
  title: string;
  narration: string;
  path?: string | null;
  animate?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[52px_1fr] gap-4 rounded-[14px] border border-line px-[18px] py-[16px] ${animate ? "anim-rise" : ""}`}
      style={animate ? { animationDelay: `${index * 0.08}s` } : undefined}
    >
      <div className="flex flex-col gap-[5px]">
        <span className="text-[11px] font-bold text-faint">SCENE</span>
        <span className="text-[24px] font-bold tracking-[-0.03em]">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <div>
        {path && (
          <div className="mb-2 flex items-center gap-2">
            <code className="rounded-md bg-chip px-2 py-[2px] font-mono text-[12px]">{path}</code>
          </div>
        )}
        <div className="mb-[6px] flex gap-[10px]">
          <span className={RECORD_BADGE}>RECORD</span>
          <span className="text-[14px] text-sub">{title}</span>
        </div>
        <div className="flex gap-[10px]">
          <span className={SAY_BADGE}>SAY</span>
          <span className="text-[14px] text-ink">“{narration}”</span>
        </div>
      </div>
    </div>
  );
}

// The skeleton scene card shown below the Thinking box until real drafted
// scenes start streaming in.
function SkeletonSceneCard() {
  return (
    <div className="grid grid-cols-[52px_1fr] gap-4 rounded-[14px] border-[1.5px] border-ink bg-[#fbf6f2] px-[18px] py-[16px]">
      <div className="flex flex-col gap-[5px]">
        <span className="text-[11px] font-bold text-faint">SCENE</span>
        <span className="text-[24px] font-bold tracking-[-0.03em]">01</span>
      </div>
      <div className="flex flex-col justify-center gap-2">
        <span className="flex items-center gap-[6px] text-[12px] font-semibold text-sub">writing</span>
        <span className="anim-pulse-soft h-3 w-3/4 rounded bg-chip" />
        <span className="anim-pulse-soft h-3 w-1/2 rounded bg-chip" />
      </div>
    </div>
  );
}

type Props = {
  storyboard: Storyboard | null | undefined;
  progress: PlanProgress | undefined;
  live: boolean;
  stepper: ReactNode;
};

// The Plan sub-step: the storyboard, rendered read-only the moment the
// Director saves it. While the Director streams, the Thinking box shows its
// live reasoning and a skeleton stands in for the scenes until drafts arrive.
// If the run died planning without a storyboard, an honest "no plan" skeleton.
export function PlanView({ storyboard, progress, live, stepper }: Props) {
  const hasStoryboard = storyboard != null;
  const thinking = progress?.thinking ?? "";
  const thinkingDone = progress?.thinkingDone ?? false;
  const draftScenes = progress?.scenes ?? [];

  return (
    <>
      <div className="flex items-center gap-[14px]">
        <Orb theme="purple" className="h-[52px] w-[52px] flex-none" />
        <div className="flex-1">
          <div className="flex items-center gap-[10px]">
            <h2 className="whitespace-nowrap text-[26px] font-bold tracking-[-0.025em]">
              Planning the&nbsp;demo
            </h2>
            {live && <SpinnerArc size={20} strokeColor="#605c55" className="relative top-[1px]" />}
          </div>
          <p className="text-[15px] text-sub">
            Deciding <b className="text-ink">what to&nbsp;record</b> and <b className="text-ink">what to&nbsp;say</b>,
            scene by&nbsp;scene
          </p>
        </div>
        {stepper}
      </div>

      {hasStoryboard ? (
        <>
          <div className="my-[22px] flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[12px] font-semibold text-faint">Flow</span>
            <span className={FLOW_CHIP}>Intro</span>
            {storyboard.scenes.map((scene) => (
              <span key={scene.id} className="flex items-center gap-2">
                <span className="text-faint">→</span>
                <span className={FLOW_CHIP}>{scene.title}</span>
              </span>
            ))}
            <span className="text-faint">→</span>
            <span className="rounded-full border border-dashed border-line2 px-[14px] py-[7px] text-[13px] font-semibold text-faint">
              Recap
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {storyboard.scenes.map((scene, index) => (
              <SceneCard
                key={scene.id}
                index={index}
                title={scene.title}
                narration={scene.narration}
                path={firstGotoPath(scene)}
                animate
              />
            ))}
          </div>
        </>
      ) : live ? (
        <>
          <ThinkingBox raw={thinking} live={live} thinkingDone={thinkingDone} />

          {draftScenes.length > 0 ? (
            <div className="flex flex-col gap-3">
              {draftScenes.map((scene, index) => (
                <SceneCard key={index} index={index} title={scene.title} narration={scene.narration} />
              ))}
              <div className="flex items-center gap-[6px] px-[18px] text-[12px] font-semibold text-faint">
                <SpinnerArc size={13} />
                drafting the next scene…
              </div>
            </div>
          ) : (
            <SkeletonSceneCard />
          )}
        </>
      ) : (
        <>
          <div className="my-[22px] flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[12px] font-semibold text-faint">Flow</span>
            <span className="flex items-center gap-[6px] rounded-full border border-dashed border-line2 px-[14px] py-[7px] text-[13px] font-semibold text-faint">
              no plan yet
            </span>
          </div>
          <div className="grid grid-cols-[52px_1fr] gap-4 rounded-[14px] border-[1.5px] border-ink bg-[#fbf6f2] px-[18px] py-[16px]">
            <div className="flex flex-col gap-[5px]">
              <span className="text-[11px] font-bold text-faint">SCENE</span>
              <span className="text-[24px] font-bold tracking-[-0.03em]">01</span>
            </div>
            <div className="flex flex-col justify-center gap-2">
              <span className="flex items-center gap-[6px] text-[12px] font-semibold text-sub">
                no plan was written
              </span>
              <span className="anim-pulse-soft h-3 w-3/4 rounded bg-chip" />
              <span className="anim-pulse-soft h-3 w-1/2 rounded bg-chip" />
            </div>
          </div>
        </>
      )}
    </>
  );
}
