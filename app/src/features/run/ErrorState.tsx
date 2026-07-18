type Props = { error: string; onRerecord: () => void };

export function ErrorState({ error, onRerecord }: Props) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <DogWithTiltedHead />
      <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
      <p className="rounded-xl border border-ink/10 bg-white p-4 text-sm text-ink-soft">{error}</p>
      <button
        type="button"
        onClick={onRerecord}
        className="rounded-xl bg-accent px-4 py-2 font-medium text-white hover:opacity-90"
      >
        Re-record
      </button>
    </main>
  );
}

// Small inline placeholder illustration until real art arrives.
function DogWithTiltedHead() {
  return (
    <svg viewBox="0 0 120 120" width="96" height="96" role="img" aria-label="Confused dog">
      <g transform="rotate(-12 60 60)">
        <ellipse cx="40" cy="34" rx="10" ry="16" fill="#e8d9c6" />
        <ellipse cx="80" cy="34" rx="10" ry="16" fill="#e8d9c6" />
        <circle cx="60" cy="60" r="34" fill="#e8d9c6" />
        <circle cx="48" cy="58" r="4" fill="#362f2a" />
        <circle cx="72" cy="58" r="4" fill="#362f2a" />
        <ellipse cx="60" cy="72" rx="6" ry="4" fill="#362f2a" />
        <path d="M52 80 Q60 86 68 80" stroke="#362f2a" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
