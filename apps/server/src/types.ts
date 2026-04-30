// New interface for human-in-the-loop requests
export interface HumanInTheLoop {
  question: string;
  responseWebSocketUrl: string;
  type: 'question' | 'permission' | 'choice';
  choices?: string[]; // For multiple choice questions
  timeout?: number; // Optional timeout in seconds
  requiresResponse?: boolean; // Whether response is required or optional
}

// Response interface
export interface HumanInTheLoopResponse {
  response?: string;
  permission?: boolean;
  choice?: string; // Selected choice from options
  hookEvent: HookEvent;
  respondedAt: number;
  respondedBy?: string; // Optional user identifier
}

// Status tracking interface
export interface HumanInTheLoopStatus {
  status: 'pending' | 'responded' | 'timeout' | 'error';
  respondedAt?: number;
  response?: HumanInTheLoopResponse;
}

export interface HookEvent {
  id?: number;
  source_app: string;
  session_id: string;
  hook_event_type: string;
  payload: Record<string, any>;
  chat?: any[];
  summary?: string;
  timestamp?: number;
  model_name?: string;

  // Subagent attribution. `subagent_type` and `description` come from the
  // parent's PreToolUse `tool_name == "Agent"` event (`tool_input.subagent_type`
  // and `tool_input.description`); the server back-fills them onto the
  // matching SubagentStart and onto every downstream tool event fired from
  // inside the subagent (matched by `(session_id, agent_id)`).
  //
  // `agent_id` is Claude Code's per-subagent identifier — emitted at the top
  // level of the hook payload on SubagentStart/Stop and on every tool event
  // a subagent fires. It is NULL for the parent's own events.
  //
  // `parent_session_id` is forward-compatibility only: real Claude Code
  // subagents share the parent's session_id and are differentiated by
  // `agent_id`, so this column is normally NULL.
  subagent_type?: string;
  description?: string;
  parent_session_id?: string;
  agent_id?: string;

  // NEW: Optional HITL data
  humanInTheLoop?: HumanInTheLoop;
  humanInTheLoopStatus?: HumanInTheLoopStatus;
}

export interface FilterOptions {
  source_apps: string[];
  session_ids: string[];
  hook_event_types: string[];
}
