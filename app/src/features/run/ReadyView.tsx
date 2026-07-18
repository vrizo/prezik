import { useState } from "react";
import type { RunDoc } from "./RunScreen";
import { PhaseStepper } from "../../components/ui/PhaseStepper";
import { Confetti } from "../../components/ui/Confetti";
import { TopUpPanel } from "./TopUpPanel";

type Props = {
  run: RunDoc;
  onRerecord: () => void;
};

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// "{M} min {S} sec — narrated" — real data only, so undefined durationSec
// means we omit the whole line rather than showing a fake number.
function formatMeta(durationSec: number | undefined): string | null {
  if (durationSec === undefined) return null;
  const minutes = Math.floor(durationSec / 60);
  const seconds = Math.round(durationSec % 60);
  const duration = minutes > 0 ? `${minutes} min ${seconds} sec` : `${seconds} sec`;
  return `${duration} — narrated`;
}

export function ReadyView({ run, onRerecord }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const meta = formatMeta(run.durationSec);

  return (
    <main className="relative flex justify-center px-4 pt-10 pb-8">
      <Confetti />

      <div className="relative w-full max-w-[1050px] rounded-[30px] border border-line bg-bg px-10 py-9">
        <PhaseStepper phase="ready" className="relative z-10 mb-[30px]" />

        <h2 className="relative z-10 m-0 mb-5 text-[36px] font-bold tracking-[-0.035em]">
          Your demo is ready
        </h2>

        <div className="relative z-10 grid grid-cols-[1.4fr_1fr] items-start gap-[30px]">
          <div>
            {run.playbackUrl ? (
              <div className="relative aspect-video overflow-hidden rounded-[20px] shadow-[0_20px_50px_rgba(0,0,0,0.16)]">
                <video
                  controls
                  preload="metadata"
                  src={run.playbackUrl}
                  className="h-full w-full bg-black"
                >
                  {run.captionsUrl && (
                    <track kind="captions" src={run.captionsUrl} label="Captions" default />
                  )}
                </video>
                <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/35 px-[13px] py-[6px] text-xs font-semibold text-white backdrop-blur-[6px]">
                  {hostname(run.url)}
                </div>
              </div>
            ) : (
              <p className="rounded-[20px] border border-dashed border-line2 p-4 text-sm text-sub">
                The&nbsp;run finished but no playback URL was recorded — this should not happen; re-record
                below.
              </p>
            )}

            {meta && <div className="mt-3 text-sm text-sub">{meta}</div>}

            <div className="mt-[18px] flex gap-[10px]">
              {run.playbackUrl && (
                <a
                  href={run.playbackUrl}
                  download
                  className="inline-flex items-center gap-[7px] rounded-full bg-ink px-[22px] py-3 text-[15px] font-semibold text-white hover:bg-[#44403a]"
                >
                  <DownloadIcon />
                  Download
                </a>
              )}
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-[7px] rounded-full border border-line2 bg-white px-5 py-3 text-[15px] font-semibold text-ink hover:bg-chip"
              >
                <LinkIcon />
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={onRerecord}
                className="inline-flex items-center gap-[7px] rounded-full border border-line2 bg-white px-5 py-3 text-[15px] font-semibold text-ink hover:bg-chip"
              >
                <RerecordIcon />
                Re-record
              </button>
            </div>
          </div>

          <TopUpPanel />
        </div>
      </div>
    </main>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}

function RerecordIcon() {
  return (
    <svg
      width="17"
      height="17"
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
  );
}
