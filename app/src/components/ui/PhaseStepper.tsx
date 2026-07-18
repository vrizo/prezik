import { Fragment } from "react";

// The 3-dot Link / Creating / Ready stepper. Sizes copied verbatim from the
// design: 22px circles, 40px connectors, 13px labels.
export type Phase = "link" | "creating" | "ready";

const PHASES: { key: Phase; label: string }[] = [
  { key: "link", label: "Link" },
  { key: "creating", label: "Creating" },
  { key: "ready", label: "Ready" },
];

type StepState = "completed" | "current" | "upcoming";

const CHECK_PATH = "M20 6 9 17l-5-5";

type Props = {
  phase: Phase;
  className?: string;
};

export function PhaseStepper({ phase, className = "" }: Props) {
  const currentIndex = PHASES.findIndex((p) => p.key === phase);

  return (
    <div className={`flex items-center justify-center gap-[10px] ${className}`}>
      {PHASES.map((step, index) => {
        const state: StepState =
          index < currentIndex ? "completed" : index === currentIndex ? "current" : "upcoming";

        return (
          <Fragment key={step.key}>
            <div
              className={`flex items-center gap-2 ${
                state === "completed" ? "text-sub" : state === "upcoming" ? "text-faint" : "text-ink"
              }`}
            >
              <span
                className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full text-[12px] font-bold ${
                  state === "upcoming" ? "border-[1.5px] border-line2" : "bg-ink text-white"
                }`}
              >
                {state === "completed" ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={CHECK_PATH} />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`text-[13px] ${
                  state === "current" ? "font-bold" : state === "completed" ? "font-semibold" : ""
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < PHASES.length - 1 && (
              <span className={`h-[1.5px] w-10 ${index < currentIndex ? "bg-ink" : "bg-line2"}`} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
