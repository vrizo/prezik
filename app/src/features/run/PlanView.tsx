import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { Orb } from "../../components/ui/Orb";
import { SpinnerArc } from "./SubStepper";
import { pathOf } from "./runPhases";

type Storyboard = NonNullable<FunctionReturnType<typeof api.storyboards.get>>;
type Scene = Storyboard["scenes"][number];

const RECORD_BADGE = "flex-none rounded-md bg-[#fbe9db] px-2 py-[3px] text-[11px] font-bold text-[#b2551a]";
const SAY_BADGE = "flex-none rounded-md bg-[#e6ebfb] px-2 py-[3px] text-[11px] font-bold text-[#2a3a86]";
const FLOW_CHIP = "rounded-full border border-line2 px-[14px] py-[7px] text-[13px] font-semibold";

function firstGotoPath(scene: Scene): string | null {
  for (const action of scene.actions) {
    if (action.type === "goto") return pathOf(action.url);
  }
  return null;
}

type Props = {
  storyboard: Storyboard | null | undefined;
  live: boolean;
  stepper: ReactNode;
};

// The Plan sub-step: the storyboard, rendered read-only the moment the
// Director saves it, with the honest "writing" skeleton until then.
export function PlanView({ storyboard, live, stepper }: Props) {
  const hasStoryboard = storyboard != null;

  return (
    <>
      <div className="flex items-center gap-[14px]">
        <Orb theme="purple" className="h-[52px] w-[52px] flex-none" />
        <div className="flex-1">
          <div className="flex items-center gap-[10px]">
            <h2 className="whitespace-nowrap text-[26px] font-bold tracking-[-0.025em]">
              Planning the demo
            </h2>
            {live && <SpinnerArc size={20} strokeColor="#605c55" />}
          </div>
          <p className="mt-1 text-[15px] text-sub">
            Deciding <b className="text-ink">what to record</b> and <b className="text-ink">what to say</b>,
            scene by scene
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
            {storyboard.scenes.map((scene, index) => {
              const path = firstGotoPath(scene);
              return (
                <div
                  key={scene.id}
                  className="anim-rise grid grid-cols-[52px_1fr] gap-4 rounded-[14px] border border-line px-[18px] py-[16px]"
                  style={{ animationDelay: `${index * 0.08}s` }}
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
                        <code className="rounded-md bg-chip px-2 py-[2px] font-mono text-[12px]">
                          {path}
                        </code>
                      </div>
                    )}
                    <div className="mb-[6px] flex gap-[10px]">
                      <span className={RECORD_BADGE}>RECORD</span>
                      <span className="text-[14px] text-sub">{scene.title}</span>
                    </div>
                    <div className="flex gap-[10px]">
                      <span className={SAY_BADGE}>SAY</span>
                      <span className="text-[14px] text-ink">“{scene.narration}”</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="my-[22px] flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[12px] font-semibold text-faint">Flow</span>
            <span className="flex items-center gap-[6px] rounded-full border border-dashed border-line2 px-[14px] py-[7px] text-[13px] font-semibold text-faint">
              {live ? "writing…" : "no plan yet"}
            </span>
          </div>
          <div className="grid grid-cols-[52px_1fr] gap-4 rounded-[14px] border-[1.5px] border-ink bg-[#fbf6f2] px-[18px] py-[16px]">
            <div className="flex flex-col gap-[5px]">
              <span className="text-[11px] font-bold text-faint">SCENE</span>
              <span className="text-[24px] font-bold tracking-[-0.03em]">01</span>
            </div>
            <div className="flex flex-col justify-center gap-2">
              <span className="flex items-center gap-[6px] text-[12px] font-semibold text-sub">
                {live ? "writing" : "no plan was written"}
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
