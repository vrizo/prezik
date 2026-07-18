import type { AgentName } from "@prezik/shared";
import type { AgentUiState } from "./runState";

const LABELS: Record<AgentName, string> = {
  scout: "Scout",
  mapper: "Mapper",
  director: "Director",
  presenter: "Presenter",
};

const STATE_STYLES: Record<AgentUiState, string> = {
  idle: "border-ink/10 bg-white text-ink-soft",
  working: "border-accent bg-white text-ink",
  done: "border-ink/10 bg-cream text-ink-soft",
  error: "border-red-300 bg-red-50 text-red-700",
};

type Props = {
  agent: AgentName;
  state: AgentUiState;
  lastMessage: string | null;
};

export function AgentCard({ agent, state, lastMessage }: Props) {
  return (
    <div className={`flex flex-col gap-1 rounded-2xl border p-3 ${STATE_STYLES[state]}`}>
      <div className="flex items-center gap-2">
        <span className="font-medium">{LABELS[agent]}</span>
        {state === "working" && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-label="working" />
        )}
      </div>
      <p className="min-h-8 text-xs">{lastMessage ?? (state === "idle" ? "waiting…" : "")}</p>
    </div>
  );
}
