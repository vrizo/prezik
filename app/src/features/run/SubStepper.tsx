import type { Step, StepState } from "./runPhases";

// The little arc spinner used all over the Creating phase (design uses an SVG
// arc + CSS spin). Shared so the header spinners and chip spinners match.
export function SpinnerArc({
  size = 12,
  strokeColor = "currentColor",
  className = "",
}: {
  size?: number;
  strokeColor?: string;
  className?: string;
}) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={strokeColor}
      strokeWidth={size >= 18 ? 2.6 : 3}
      strokeLinecap="round"
      style={{ flex: "none" }}
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function AlertIcon() {
  // Tight viewBox — the glyph fills the box instead of floating in the 24px
  // grid's padding, so the "!" reads at chip size.
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 1.5v6M6 10.5v.01" />
    </svg>
  );
}

const LABELS: Record<Step, string> = { explore: "Explore", plan: "Plan", record: "Record" };
const ORDER: readonly Step[] = ["explore", "plan", "record"];

const CHIP_BASE =
  "inline-flex items-center gap-[6px] rounded-full px-[13px] py-[6px] text-[12px] font-semibold";

type Props = {
  states: Record<Step, StepState>;
  // When set, this chip renders in the red "failed" style instead of active.
  failed?: Step | null;
  onSelect: (step: Step) => void;
};

// The Explore / Plan / Record chips. Done chips are clickable (jump back to a
// completed step); the active chip is clickable (return to the live view);
// locked chips are inert.
export function SubStepper({ states, failed = null, onSelect }: Props) {
  return (
    <div className="flex items-center gap-[7px]">
      {ORDER.map((step) => {
        if (failed === step) {
          return (
            <span key={step} className={`${CHIP_BASE} bg-[#fbe4e0] text-[#c0392b]`}>
              <AlertIcon />
              {LABELS[step]}
            </span>
          );
        }

        const state = states[step];
        if (state === "active") {
          return (
            <button
              key={step}
              type="button"
              onClick={() => onSelect(step)}
              className={`${CHIP_BASE} bg-ink text-white`}
            >
              <SpinnerArc strokeColor="#fff" />
              {LABELS[step]}
            </button>
          );
        }
        if (state === "done") {
          return (
            <button
              key={step}
              type="button"
              onClick={() => onSelect(step)}
              className={`${CHIP_BASE} border border-line2 text-ink hover:bg-chip`}
            >
              <CheckIcon />
              {LABELS[step]}
            </button>
          );
        }
        return (
          <span
            key={step}
            aria-disabled="true"
            className={`${CHIP_BASE} cursor-not-allowed bg-chip text-faint`}
          >
            <LockIcon />
            {LABELS[step]}
          </span>
        );
      })}
    </div>
  );
}
