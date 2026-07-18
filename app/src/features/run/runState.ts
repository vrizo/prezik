import type { AgentName, RunStatus } from "@prezik/shared";

export type AgentUiState = "idle" | "working" | "done" | "error";

export type AgentCardState = {
  agent: AgentName;
  state: AgentUiState;
  lastMessage: string | null;
};

export type RunEventLike = {
  agent: AgentName;
  level: "info" | "error";
  message: string;
};

const AGENT_ORDER: AgentName[] = ["scout", "mapper", "director", "presenter"];

const STAGE_ORDER: RunStatus[] = [
  "created",
  "exploring",
  "planning",
  "needs_credentials",
  "recording",
  "uploading",
  "done",
  "failed",
];

function stageIndex(status: RunStatus): number {
  const i = STAGE_ORDER.indexOf(status);
  return i === -1 ? 0 : i;
}

// The run status that marks each agent as finished (Scout and Mapper run in
// parallel during "exploring" and both finish by the time status reaches
// "planning").
const AGENT_DONE_AT: Record<AgentName, RunStatus> = {
  scout: "planning",
  mapper: "planning",
  director: "recording",
  presenter: "done",
};

// Pure reducer: run_events (assumed ascending by seq) + the run's overall
// status -> one card state per agent. No I/O, easy to unit test.
export function deriveAgentStates(events: RunEventLike[], runStatus: RunStatus): AgentCardState[] {
  return AGENT_ORDER.map((agent) => {
    const agentEvents = events.filter((e) => e.agent === agent);
    const last = agentEvents.at(-1) ?? null;

    if (last?.level === "error") return { agent, state: "error", lastMessage: last.message };
    if (!last) return { agent, state: "idle", lastMessage: null };
    if (runStatus === "done" || stageIndex(runStatus) >= stageIndex(AGENT_DONE_AT[agent])) {
      return { agent, state: "done", lastMessage: last.message };
    }
    return { agent, state: "working", lastMessage: last.message };
  });
}

// Latest url an agent reported working on, for the live-panel breadcrumb.
export function latestUrl(events: { url?: string }[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const url = events[i].url;
    if (url) return url;
  }
  return null;
}
