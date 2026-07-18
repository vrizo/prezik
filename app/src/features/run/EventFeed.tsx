import { useEffect, useRef } from "react";
import type { AgentName } from "@prezik/shared";

type Event = {
  seq: number;
  agent: AgentName;
  level: "info" | "error";
  message: string;
};

type Props = { events: Event[] };

// Last ~30 events, auto-scrolled to the newest. The useEffect here is DOM
// scroll management, not data fetching — the events themselves come from
// useQuery in the parent.
export function EventFeed({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);

  const visible = events.slice(-30);

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-ink/10 bg-white p-4">
      <h2 className="text-sm font-medium text-ink">Activity</h2>
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto text-xs">
        {visible.length === 0 && <p className="text-ink-soft">Nothing yet…</p>}
        {visible.map((e) => (
          <div key={e.seq} className={e.level === "error" ? "text-red-700" : "text-ink-soft"}>
            <span className="font-medium text-ink">{e.agent}</span> — {e.message}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
