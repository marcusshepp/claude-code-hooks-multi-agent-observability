import { computed, type Ref } from 'vue';
import type { HookEvent } from '../types';

/**
 * Real Claude Code subagents share the parent's `session_id` and are
 * differentiated by `agent_id` (top-level on every subagent-issued tool
 * event, plus on SubagentStart / SubagentStop). The parent's own events
 * have `agent_id === undefined`.
 *
 * The visual indentation rule from the brief — "every event from that
 * child session must be visually grouped/indented under the parent's
 * row" — is therefore: indent any event with a non-empty `agent_id`.
 *
 * `useParentMap` exposes:
 *   - `isSubagentEvent(event)` — true when the event was emitted from
 *     inside a subagent (used for indentation + the `↳` affordance).
 *   - `getParentSessionId(sessionId)` — forward-compat fallback that
 *     honors `event.parent_session_id` when an upstream patch emits it.
 *     Returns undefined for the common case (real Claude Code).
 */
export function useParentMap(events: Ref<HookEvent[]>) {
  // Honor any explicit parent_session_id we see on the wire (forward-compat).
  const parentMap = computed<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const event of events.value) {
      if (event.parent_session_id && event.session_id) {
        map.set(event.session_id, event.parent_session_id);
      }
    }
    return map;
  });

  const getParentSessionId = (sessionId: string | undefined): string | undefined => {
    if (!sessionId) return undefined;
    return parentMap.value.get(sessionId);
  };

  const isSubagentEvent = (event: HookEvent): boolean => {
    return Boolean(event.agent_id);
  };

  return {
    parentMap,
    getParentSessionId,
    isSubagentEvent,
  };
}
