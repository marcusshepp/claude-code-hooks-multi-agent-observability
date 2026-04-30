<template>
  <div class="rounded-md border border-[var(--border)] bg-[var(--surface-inset)] overflow-hidden">
    <!-- Panel header (28px) -->
    <button
      type="button"
      class="w-full flex items-center gap-1.5 px-2 h-7 hover:bg-[var(--surface)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
      :title="headerTitle"
      :aria-label="`Drill into ${headerLabel}`"
      @click="$emit('drill-down', agentId)"
    >
      <!-- Role icon (parent vs subagent) -->
      <component
        :is="isParent ? User : Bot"
        class="w-3 h-3 shrink-0"
        :class="isParent ? 'text-[var(--text-secondary)]' : 'text-[var(--accent)]'"
        :stroke-width="1.5"
        aria-hidden="true"
      />

      <!-- Status indicator dot -->
      <Circle
        class="w-2 h-2 shrink-0"
        :class="statusColorClass"
        fill="currentColor"
        :stroke-width="0"
        :title="statusTitle"
        aria-hidden="true"
      />

      <!-- Label area (parent vs subagent) -->
      <template v-if="isParent">
        <span class="text-[12px] text-[var(--text-primary)] font-medium shrink-0">
          Parent
        </span>
        <span class="font-mono text-[11px] text-[var(--text-tertiary)] shrink-0">
          {{ idShort }}
        </span>
        <span class="flex-1"></span>
      </template>
      <template v-else>
        <span
          v-if="subagentType"
          class="text-[12px] text-[var(--text-primary)] font-medium shrink-0"
        >
          {{ subagentType }}
        </span>
        <span
          v-else
          class="text-[12px] text-[var(--text-secondary)] font-medium shrink-0"
        >
          Subagent
        </span>
        <span
          v-if="description"
          class="text-[11px] text-[var(--text-secondary)] italic flex-1 min-w-0 truncate text-left"
          :title="description"
        >
          {{ description }}
        </span>
        <span v-else class="flex-1"></span>
        <span class="font-mono text-[11px] text-[var(--text-tertiary)] shrink-0">
          {{ idShort }}
        </span>
      </template>

      <!-- Tool count badge -->
      <span
        class="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--text-secondary)] shrink-0 tabular-nums"
        :title="`${toolCount} ${toolCount === 1 ? 'tool call' : 'tool calls'}`"
      >
        <Wrench class="w-3 h-3" :stroke-width="1.5" aria-hidden="true" />
        {{ toolCount }}
      </span>

      <!-- Drill-down icon affordance -->
      <Filter
        class="w-3 h-3 shrink-0 text-[var(--text-tertiary)]"
        :stroke-width="1.5"
        aria-hidden="true"
      />
    </button>

    <!-- Panel body -->
    <div class="flex flex-col gap-px p-1 border-t border-[var(--border)]">
      <!-- Empty state -->
      <div
        v-if="recentTools.length === 0"
        class="flex items-center gap-1.5 px-1.5 min-h-[24px]"
      >
        <Circle
          class="w-2 h-2 shrink-0 text-[var(--text-tertiary)]"
          fill="currentColor"
          :stroke-width="0"
          aria-hidden="true"
        />
        <span class="text-[11px] text-[var(--text-tertiary)] italic">
          Not running tools yet
        </span>
      </div>

      <!-- Tool rows -->
      <div
        v-for="event in recentTools"
        :key="`${event.id ?? event.timestamp}-${event.hook_event_type}`"
        class="flex items-center gap-1.5 px-1.5 rounded-sm min-h-[24px] hover:bg-[var(--surface)] transition-colors duration-150"
        :class="{
          'border-l-2 border-[var(--danger)] pl-1': isFailureEvent(event),
        }"
      >
        <component
          :is="iconForEvent(event)"
          class="w-3 h-3 shrink-0"
          :class="iconColorClass(event)"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        <span
          class="text-[12px] shrink-0"
          :class="isFailureEvent(event) ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'"
        >
          {{ toolLabelOf(event) }}
        </span>
        <span
          v-if="commandTextFor(event)"
          class="font-mono text-[11px] text-[var(--text-secondary)] flex-1 min-w-0 truncate"
          :title="commandTextFor(event)"
        >
          {{ commandTextFor(event) }}
        </span>
        <span v-else class="flex-1"></span>
        <span
          v-if="durationOf(event)"
          class="font-mono text-[11px] text-[var(--text-tertiary)] shrink-0 tabular-nums"
        >
          {{ durationOf(event) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Component } from 'vue';
import { Bot, Circle, Filter, User, Wrench } from 'lucide-vue-next';
import type { HookEvent } from '../types';
import { getEventIcon, getToolIcon } from '../composables/useEventIcons';

const props = defineProps<{
  // 'parent' for the session's main agent, otherwise the agent_id string.
  agentId: string;
  isParent: boolean;
  sessionId: string;
  subagentType?: string;
  description?: string;
  toolCount: number;
  recentTools: HookEvent[];
  lastActivity: number;
  now: number;
}>();

defineEmits<{
  // Emitted with the agent key ('parent' or an agent_id) so the card can
  // route the drill-down with agent-scoped intent.
  (e: 'drill-down', agentId: string): void;
}>();

const TOOL_EVENT_TYPES = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
]);

const idShort = computed(() => {
  if (props.isParent) return props.sessionId.slice(0, 6);
  return props.agentId.slice(0, 6);
});

const headerLabel = computed(() => {
  if (props.isParent) return `Parent ${idShort.value}`;
  return `${props.subagentType ?? 'Subagent'} ${idShort.value}`;
});

const headerTitle = computed(() => {
  const base = props.isParent
    ? `Parent — session ${props.sessionId}`
    : `${props.subagentType ?? 'Subagent'} — agent ${props.agentId}`;
  if (props.description && !props.isParent) {
    return `${base}\n${props.description}`;
  }
  return `${base} — click to drill into Stream view`;
});

// Status: green (active) / amber (recent) / grey (idle).
const statusBucket = computed<'active' | 'recent' | 'idle'>(() => {
  const diff = Math.max(0, props.now - props.lastActivity);
  if (diff < 5_000) return 'active';
  if (diff < 60_000) return 'recent';
  return 'idle';
});

const statusColorClass = computed(() => {
  switch (statusBucket.value) {
    case 'active':
      return 'text-[var(--success)]';
    case 'recent':
      return 'text-[var(--warning)]';
    default:
      return 'text-[var(--text-tertiary)]';
  }
});

const statusTitle = computed(() => {
  switch (statusBucket.value) {
    case 'active':
      return 'Active (last event < 5s ago)';
    case 'recent':
      return 'Recent (last event < 60s ago)';
    default:
      return 'Idle';
  }
});

// ---------------------------------------------------------------------------
// Per-row helpers — mirror SessionCard's old inline helpers so the panel is
// self-contained and the card body stays a thin layout shell.
// ---------------------------------------------------------------------------

const toolNameOf = (event: HookEvent): string | null => {
  if (!TOOL_EVENT_TYPES.has(event.hook_event_type)) return null;
  const name = event.payload?.tool_name;
  return typeof name === 'string' ? name : null;
};

const iconForEvent = (event: HookEvent): Component => {
  const tool = toolNameOf(event);
  if (tool) return getToolIcon(tool);
  return getEventIcon(event.hook_event_type);
};

const iconColorClass = (event: HookEvent): string => {
  if (event.hook_event_type === 'PostToolUseFailure') return 'text-[var(--danger)]';
  if (event.hook_event_type === 'PostToolUse') return 'text-[var(--success)]';
  if (event.hook_event_type === 'PermissionRequest') return 'text-[var(--warning)]';
  return 'text-[var(--text-secondary)]';
};

const isFailureEvent = (event: HookEvent): boolean => {
  return event.hook_event_type === 'PostToolUseFailure';
};

const toolLabelOf = (event: HookEvent): string => {
  return toolNameOf(event) ?? event.hook_event_type;
};

const commandTextFor = (event: HookEvent): string => {
  const payload = event.payload ?? {};
  const input = payload.tool_input ?? {};
  let raw = '';
  if (typeof input.command === 'string' && input.command) raw = input.command;
  else if (typeof input.file_path === 'string' && input.file_path) raw = input.file_path;
  else if (typeof input.notebook_path === 'string' && input.notebook_path) raw = input.notebook_path;
  else if (typeof input.pattern === 'string' && input.pattern) raw = input.pattern;
  else if (typeof input.query === 'string' && input.query) raw = input.query;
  else if (typeof input.url === 'string' && input.url) raw = input.url;
  else if (typeof input.prompt === 'string' && input.prompt) raw = input.prompt;
  else if (event.summary) raw = event.summary;

  if (!raw) return '';
  // First 80 chars per spec — CSS ellipsis still kicks in on top of this for
  // narrow cards, but we cap upstream so the title attribute stays useful and
  // nothing nudges the duration off-screen on wide cards.
  return raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
};

const durationOf = (event: HookEvent): string => {
  const payload = event.payload ?? {};
  if (typeof payload.duration_ms === 'number') {
    const ms = payload.duration_ms;
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return '';
};
</script>
