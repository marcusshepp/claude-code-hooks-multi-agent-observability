<template>
  <div class="flex-1 overflow-y-auto px-3 py-3">
    <div
      v-if="sessions.length === 0"
      class="h-full min-h-[40vh] flex flex-col items-center justify-center text-center gap-2"
    >
      <LayoutGrid
        class="w-8 h-8 text-[var(--text-tertiary)]"
        :stroke-width="1.5"
        aria-hidden="true"
      />
      <p class="text-sm text-[var(--text-secondary)]">
        No sessions yet. Start a Claude Code session to begin.
      </p>
    </div>

    <div
      v-else
      class="grid gap-3"
      style="grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));"
    >
      <SessionCard
        v-for="session in sessions"
        :key="`${session.source_app}::${session.session_id}`"
        :session="session"
        :custom-name="getName(session.session_id, session.source_app)"
        :app-hex-color="getHexColorForApp(session.source_app)"
        @rename-session="onRename"
        @filter-to-session="onFilterToSession"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { LayoutGrid } from 'lucide-vue-next';
import type { HookEvent } from '../types';
import SessionCard, { type SessionSummary } from './SessionCard.vue';
import { useEventColors } from '../composables/useEventColors';

const props = defineProps<{
  events: HookEvent[];
  getName: (session_id: string, source_app: string) => string | undefined;
}>();

const emit = defineEmits<{
  (e: 'rename-session', payload: { session_id: string; source_app: string; custom_name: string }): void;
  (e: 'filter-to-session', session_id: string): void;
}>();

const { getHexColorForApp } = useEventColors();

// Group events by (session_id, source_app). The session_id alone could
// theoretically collide across machines, so we always namespace by source_app
// (matching the server-side `session_names` primary key).
const sessions = computed<SessionSummary[]>(() => {
  const map = new Map<string, SessionSummary>();

  for (const event of props.events) {
    const key = `${event.source_app}::${event.session_id}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        session_id: event.session_id,
        source_app: event.source_app,
        events: [],
        lastActivity: 0,
        eventCount: 0,
        toolCount: 0,
        subagentCount: 0,
        modelName: undefined,
      };
      map.set(key, entry);
    }

    entry.events.push(event);
    entry.eventCount += 1;

    const ts = event.timestamp ?? 0;
    if (ts > entry.lastActivity) entry.lastActivity = ts;

    // Tool calls — count one per PreToolUse so retries / failures don't
    // double-count vs the parallel PostToolUse / PostToolUseFailure pair.
    if (event.hook_event_type === 'PreToolUse') entry.toolCount += 1;

    // Subagents — Claude Code emits one SubagentStart per spawn.
    if (event.hook_event_type === 'SubagentStart') entry.subagentCount += 1;

    // Latest known model name wins. Most events don't set this, so we keep
    // the most recent non-null value.
    if (event.model_name) entry.modelName = event.model_name;
  }

  // Each per-session events array is already in arrival order (the
  // upstream feed pushes events to the end of the array). No re-sort
  // required.

  // Most recently active first.
  return Array.from(map.values()).sort((a, b) => b.lastActivity - a.lastActivity);
});

const onRename = (payload: { session_id: string; source_app: string; custom_name: string }) => {
  emit('rename-session', payload);
};

const onFilterToSession = (session_id: string) => {
  emit('filter-to-session', session_id);
};
</script>
