import { useEffect, useRef, useState } from "react";
import type { RunOptions } from "@prezik/shared";
import { Orb, type OrbTheme } from "../../components/ui/Orb";
import { Toggle } from "../../components/ui/Toggle";

// Everything the "Personalise the demo" card edits. Credentials live in
// their own card (CredentialsFields) with their own derivation, so this
// type deliberately excludes them.
export type PersonalisationOptions = Omit<RunOptions, "credentials">;

const LENGTHS: PersonalisationOptions["length"][] = ["short", "medium", "long"];
const LENGTH_LABELS: Record<PersonalisationOptions["length"], string> = {
  short: "Short",
  medium: "Medium",
  long: "Long",
};
const VOICE_LABELS: Record<PersonalisationOptions["voice"], string> = {
  neutral: "Neutral",
  male: "Male",
  female: "Female",
};
const VOICES: PersonalisationOptions["voice"][] = ["neutral", "male", "female"];
const VOICE_ORBS: Record<PersonalisationOptions["voice"], OrbTheme> = {
  neutral: "mono",
  male: "green",
  female: "orange",
};

type Props = {
  options: PersonalisationOptions;
  onChange: (options: PersonalisationOptions) => void;
};

export function OptionsFields({ options, onChange }: Props) {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const voiceRef = useRef<HTMLDivElement>(null);

  // Close the voice popover on outside click — a DOM event subscription,
  // not data fetching, so useEffect is the right tool here.
  useEffect(() => {
    if (!voiceOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (voiceRef.current && !voiceRef.current.contains(e.target as Node)) setVoiceOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [voiceOpen]);

  const lengthIndex = LENGTHS.indexOf(options.length);
  const lengthPct = (lengthIndex / (LENGTHS.length - 1)) * 100;

  return (
    <div className="rounded-[18px] border border-line bg-white p-[24px_26px]">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-chip text-[12px] font-bold">
          1
        </span>
        <span className="whitespace-nowrap text-[17px] font-bold">Personalise the demo</span>
      </div>

      {/* Mode — static, stores nothing */}
      <Row label="Mode">
        <div className="flex gap-2">
          <span className="rounded-full bg-ink px-[15px] py-2 text-[13px] font-semibold text-white">Full demo</span>
          <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-line px-[15px] py-2 text-[13px] font-semibold text-faint">
            Specific feature
            <span className="rounded-[5px] bg-chip px-1.5 py-px text-[10px] font-bold text-faint">soon</span>
          </span>
        </div>
      </Row>

      {/* Voice */}
      <Row label="Voice">
        <div ref={voiceRef} className="relative w-[230px]">
          <button
            type="button"
            aria-label="Voice"
            aria-haspopup="listbox"
            aria-expanded={voiceOpen}
            onClick={() => setVoiceOpen((v) => !v)}
            className="flex h-11 w-full items-center justify-between gap-2.5 rounded-full border border-line2 bg-white py-0 pl-3 pr-2"
          >
            <span className="flex items-center gap-2.5">
              <Orb theme={VOICE_ORBS[options.voice]} className="h-[22px] w-[22px] flex-none" />
              <span className="text-sm font-semibold">{VOICE_LABELS[options.voice]}</span>
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-none text-faint"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {voiceOpen && (
            <ul
              role="listbox"
              className="absolute right-0 top-[calc(100%+6px)] z-10 w-full overflow-hidden rounded-[14px] border border-line bg-white py-1 shadow-[0_16px_40px_rgba(0,0,0,.14)]"
            >
              {VOICES.map((voice) => (
                <li key={voice} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={voice === options.voice}
                    onClick={() => {
                      onChange({ ...options, voice });
                      setVoiceOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold hover:bg-chip ${
                      voice === options.voice ? "text-ink" : "text-sub"
                    }`}
                  >
                    <Orb theme={VOICE_ORBS[voice]} className="h-[22px] w-[22px] flex-none" />
                    {VOICE_LABELS[voice]}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Row>

      {/* Enable zooming */}
      <Row label="Enable zooming">
        <Toggle checked={options.zoom} onChange={(zoom) => onChange({ ...options, zoom })} label="Enable zooming" />
      </Row>

      {/* Length */}
      <Row label="Length">
        <div className="relative max-w-[300px] flex-1">
          <input
            type="range"
            min={0}
            max={LENGTHS.length - 1}
            step={1}
            value={lengthIndex}
            onChange={(e) => onChange({ ...options, length: LENGTHS[Number(e.target.value)] })}
            aria-label="Demo length"
            className="peer absolute inset-x-0 -top-2 h-6 w-full cursor-pointer opacity-0"
          />
          <div className="pointer-events-none relative h-1.5 rounded-full bg-chip">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-ink"
              style={{ width: `${lengthPct}%` }}
            />
            <span
              className="absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 -translate-x-1/2 rounded-full border-[3px] border-white bg-ink shadow-[0_1px_4px_rgba(0,0,0,.25)] peer-focus-visible:ring-2 peer-focus-visible:ring-ink/40"
              style={{ left: `${lengthPct}%` }}
            />
          </div>
          <div className="mt-[7px] flex justify-between text-[11px] text-faint">
            {LENGTHS.map((length) => (
              <span key={length} className={length === options.length ? "font-semibold text-ink" : undefined}>
                {LENGTH_LABELS[length]}
              </span>
            ))}
          </div>
        </div>
      </Row>

      {/* Captions */}
      <Row label="Captions">
        <Toggle checked={options.captions} onChange={(captions) => onChange({ ...options, captions })} label="Captions" />
      </Row>

      {/* Format */}
      <Row label="Format" last>
        <div className="flex gap-2">
          <FormatButton
            active={(options.format ?? "horizontal") === "horizontal"}
            onClick={() => onChange({ ...options, format: "horizontal" })}
            label="Horizontal 16:9"
            rect={{ x: 3, y: 6, width: 18, height: 12 }}
          />
          <FormatButton
            active={options.format === "vertical"}
            onClick={() => onChange({ ...options, format: "vertical" })}
            label="Vertical 9:16"
            rect={{ x: 6, y: 3, width: 12, height: 18 }}
          />
        </div>
      </Row>
    </div>
  );
}

function FormatButton({
  active,
  onClick,
  label,
  rect,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  rect: { x: number; y: number; width: number; height: number };
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-[15px] py-2 text-[13px] font-semibold ${
        active ? "bg-ink text-white" : "border border-line text-sub hover:bg-chip"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
        <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="2" />
      </svg>
      {label}
    </button>
  );
}

function Row({ label, children, last = false }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 border-t border-line py-4 ${last ? "pb-1" : ""}`}
    >
      <span className="whitespace-nowrap text-sm font-semibold">{label}</span>
      {children}
    </div>
  );
}
