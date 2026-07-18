import { useState } from "react";
import type { RunDoc } from "./RunScreen";

type Props = {
  run: RunDoc;
  onRerecord: () => void;
};

export function Player({ run, onRerecord }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold text-ink">Your demo is ready</h1>

      {run.playbackUrl ? (
        <video
          controls
          preload="metadata"
          src={run.playbackUrl}
          crossOrigin="anonymous"
          className="aspect-video w-full rounded-2xl border border-ink/10 bg-black"
        >
          {run.captionsUrl && <track kind="captions" src={run.captionsUrl} label="Captions" default />}
        </video>
      ) : (
        <p className="rounded-xl border border-dashed border-ink/20 p-4 text-sm text-ink-soft">
          The run finished but no playback URL was recorded — this should not happen; re-record below.
        </p>
      )}

      {run.credentialsUsed && (
        <p className="text-sm text-ink-soft">
          The agent registered as <span className="font-mono">{run.credentialsUsed.email}</span>.
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleCopyLink}
          className="rounded-xl border border-ink/20 px-4 py-2 font-medium text-ink hover:border-accent"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        {run.playbackUrl && (
          <a
            href={run.playbackUrl}
            download
            className="rounded-xl border border-ink/20 px-4 py-2 font-medium text-ink hover:border-accent"
          >
            Download
          </a>
        )}
        <button
          type="button"
          onClick={onRerecord}
          className="rounded-xl bg-accent px-4 py-2 font-medium text-white hover:opacity-90"
        >
          Re-record
        </button>
      </div>
    </main>
  );
}
