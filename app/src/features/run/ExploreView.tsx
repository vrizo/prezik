import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { Orb } from "../../components/ui/Orb";
import { SpinnerArc } from "./SubStepper";
import { hostnameOf, pageEstimate, pathOf } from "./runPhases";
import type { RunDoc } from "./RunScreen";

type SitePages = FunctionReturnType<typeof api.sitePages.list>;
type Events = FunctionReturnType<typeof api.runs.events>;

const ROW = "grid grid-cols-[200px_150px_1fr_110px] gap-[14px] items-center";

type Props = {
  run: RunDoc;
  sitePages: SitePages | undefined;
  events: Events;
  live: boolean;
  stepper: ReactNode;
};

// The Explore sub-step: a genuinely live "Discovered pages" table that grows
// as the Mapper streams site_pages rows in.
export function ExploreView({ run, sitePages, events, live, stepper }: Props) {
  const pages = sitePages ?? [];
  const read = pages.length;
  const estimate = Math.max(pageEstimate(pages), read);

  // While crawling, surface the page the Mapper is reading right now: the
  // latest scout/mapper event whose path isn't in the table yet.
  const knownPaths = new Set(pages.map((p) => pathOf(p.url)));
  let inProgress: string | null = null;
  if (live) {
    for (const event of events) {
      if ((event.agent === "scout" || event.agent === "mapper") && event.url) {
        const path = pathOf(event.url);
        inProgress = knownPaths.has(path) ? null : path;
      }
    }
  }

  return (
    <>
      <div className="flex items-center gap-[14px]">
        <Orb theme="blue" className="h-[52px] w-[52px] flex-none" />
        <div className="flex-1">
          <div className="flex items-center gap-[10px]">
            <h2 className="whitespace-nowrap text-[26px] font-bold tracking-[-0.025em]">
              Exploring your app
            </h2>
            {live && <SpinnerArc size={20} strokeColor="#605c55" />}
          </div>
          <p className="mt-1 text-[15px] text-sub">
            Crawling <b className="text-ink">{hostnameOf(run.url)}</b> — reading pages, links and copy
          </p>
        </div>
        {stepper}
      </div>

      <div className="mb-3 mt-[26px] flex items-center justify-between">
        <span className="text-[13px] font-bold">Discovered pages</span>
        <span className="text-[12px] text-faint">
          {live ? `${read} of ~${estimate} pages` : `${read} pages`}
        </span>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-line">
        <div
          className={`${ROW} border-b border-line bg-[#faf9f6] px-[18px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.06em] text-faint`}
        >
          <span>URL</span>
          <span>Page</span>
          <span>What's here</span>
          <span className="text-right">Status</span>
        </div>

        {pages.map((page) => (
          <div key={page.url} className={`${ROW} border-b border-line px-[18px] py-[13px]`}>
            <code className="font-mono text-[13px]">{pathOf(page.url)}</code>
            <span className="text-[14px] font-semibold">{page.title}</span>
            <span className="text-[13px] text-sub">{page.purpose}</span>
            <span className="text-right text-[12px] font-semibold text-[#1a7f37]">read</span>
          </div>
        ))}

        {inProgress && (
          <div className={`${ROW} anim-rise bg-[#fbf6f2] px-[18px] py-[13px]`}>
            <code className="font-mono text-[13px]">{inProgress}</code>
            <span className="text-[14px] font-semibold text-faint">—</span>
            <span className="flex items-center gap-[6px] text-[13px] text-sub">
              reading this page
              <span className="anim-pulse-soft inline-block h-[9px] w-[9px] rounded-full bg-ink" />
            </span>
            <span className="flex items-center justify-end gap-[6px] text-[12px] font-semibold text-sub">
              <SpinnerArc size={13} />
              reading
            </span>
          </div>
        )}

        {live && read === 0 && !inProgress && (
          <div className="px-[18px] py-[16px] text-[13px] text-faint">starting the crawl…</div>
        )}
      </div>
    </>
  );
}
