type Props = { screenshotUrl: string | null | undefined; currentUrl: string | null };

export function LivePanel({ screenshotUrl, currentUrl }: Props) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-ink/10 bg-white p-4">
      <h2 className="text-sm font-medium text-ink">Live view</h2>
      {currentUrl && <p className="truncate text-xs text-ink-soft">{currentUrl}</p>}
      {screenshotUrl ? (
        <img src={screenshotUrl} alt="Latest agent screenshot" className="w-full rounded-xl border border-ink/10" />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-ink/20 text-sm text-ink-soft">
          waiting for the first screenshot…
        </div>
      )}
    </section>
  );
}
