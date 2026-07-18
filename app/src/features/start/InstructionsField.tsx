import { useEffect, useRef, useState } from "react";

// Mirrors GUIDANCE_MAX_LENGTH in app/convex/lib/validators.ts, the server-side
// cap enforced on options.guidance — keep both in sync by hand.
export const INSTRUCTIONS_MAX = 2000;

// Rotating placeholder suggestions, typed out character by character.
const SUGGESTIONS = [
  "Focus on the dashboard and analytics — that's where the wow is",
  "Skip the blog and docs, demo the core product only",
  "Spend extra time on the onboarding flow and the export feature",
  "Use a calm, confident tone — this demo is for enterprise buyers",
  "Mention that the free plan includes three projects",
];

function useTypingPlaceholder(active: boolean): string {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!active) return;
    let index = 0;
    let pos = 0;
    let deleting = false;
    let timer: number;
    function tick() {
      const full = SUGGESTIONS[index];
      pos += deleting ? -2 : 1;
      if (pos < 0) pos = 0;
      setText(full.slice(0, pos));
      let delay = deleting ? 14 : 34;
      if (!deleting && pos >= full.length) {
        deleting = true;
        delay = 2400; // linger on the finished sentence
      } else if (deleting && pos === 0) {
        deleting = false;
        index = (index + 1) % SUGGESTIONS.length;
        delay = 400;
      }
      timer = window.setTimeout(tick, delay);
    }
    timer = window.setTimeout(tick, 500);
    return () => clearTimeout(timer);
  }, [active]);
  return active ? text : "";
}

type Props = {
  value: string;
  onChange: (value: string) => void;
};

// The "Custom instructions" card: free-form guidance for the agents. The
// backend stores it as options.guidance.
export function InstructionsField({ value, onChange }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const placeholder = useTypingPlaceholder(value === "");

  // Grow with the content (3 lines by default, expands while typing).
  function autosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }
  useEffect(autosize, [value]);

  return (
    <div className="rounded-[18px] border border-line bg-white p-[24px_26px]">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-chip text-[12px] font-bold">
          3
        </span>
        <span className="whitespace-nowrap text-[17px] font-bold">Custom instructions</span>
      </div>
      <p className="m-0 mb-4 ml-[30px] text-[13px] text-sub">
        Anything the&nbsp;agents should know — what to&nbsp;show, what to&nbsp;skip, how to&nbsp;sound
      </p>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, INSTRUCTIONS_MAX))}
        rows={3}
        maxLength={INSTRUCTIONS_MAX}
        placeholder={placeholder}
        aria-label="Custom instructions"
        className="block w-full resize-none overflow-hidden rounded-[14px] border border-line2 bg-white px-4 py-3 text-sm leading-[1.55] text-ink outline-none placeholder:text-faint focus:border-ink"
      />
      <div className="mt-1.5 text-right text-[11px] text-faint">
        {value.length}/{INSTRUCTIONS_MAX}
      </div>
    </div>
  );
}
