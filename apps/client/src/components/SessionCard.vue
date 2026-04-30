<template>
  <div
    class="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
    :style="{ height: cardHeight + 'px' }"
  >
    <!-- Header row (32px, sticky top of card) -->
    <div
      class="flex items-center gap-2 px-3 h-8 shrink-0 border-b border-[var(--border)] bg-[var(--surface-inset)]"
    >
      <!-- Source app color dot -->
      <span
        class="inline-block w-2 h-2 rounded-full shrink-0"
        :style="{ backgroundColor: appHexColor }"
        :title="`Source app: ${session.source_app}`"
        aria-hidden="true"
      />

      <!-- Source app name -->
      <span
        class="font-mono text-[12px] text-[var(--text-primary)] shrink-0 truncate max-w-[100px]"
        :title="session.source_app"
      >
        {{ session.source_app }}
      </span>

      <!-- Session name / hash (clickable to rename, or input when editing) -->
      <div class="flex-1 min-w-0 flex items-center gap-1.5">
        <input
          v-if="isEditing"
          ref="editInputRef"
          v-model="editValue"
          type="text"
          class="flex-1 min-w-0 rounded-md bg-[var(--surface)] border border-[var(--accent)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--text-primary)] focus-visible:outline-none"
          :placeholder="sessionIdShort"
          aria-label="Rename session"
          maxlength="80"
          @keydown.enter.prevent="commitEdit"
          @keydown.esc.prevent="cancelEdit"
          @blur="commitEdit"
          @click.stop
        />
        <template v-else>
          <button
            type="button"
            class="flex-1 min-w-0 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-[var(--surface)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] group/rename"
            :title="customName ? `${customName} (${sessionIdShort}) — click to rename` : `${sessionIdShort} — click to rename`"
            :aria-label="`Rename session ${customName || sessionIdShort}`"
            @click.stop="startEdit"
          >
            <span
              v-if="customName"
              class="text-[12px] text-[var(--text-primary)] font-medium truncate"
            >
              {{ customName }}
            </span>
            <span
              class="font-mono text-[11px] text-[var(--text-secondary)] shrink-0"
              :class="{ 'text-[var(--text-tertiary)]': customName }"
            >
              {{ sessionIdShort }}
            </span>
            <Pencil
              class="w-3 h-3 shrink-0 text-[var(--text-tertiary)] opacity-0 group-hover/rename:opacity-100 transition-opacity duration-150"
              :stroke-width="1.5"
              aria-hidden="true"
            />
          </button>
        </template>
      </div>

      <!-- Total tool count across all agents (parent + subagents) -->
      <span
        v-if="session.toolCount > 0"
        class="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--text-secondary)] shrink-0 tabular-nums"
        :title="`${session.toolCount} total tool ${session.toolCount === 1 ? 'call' : 'calls'} across all agents`"
      >
        <Wrench class="w-3 h-3" :stroke-width="1.5" aria-hidden="true" />
        {{ session.toolCount }}
      </span>

      <!-- Subagent count pill (only when > 0) -->
      <span
        v-if="session.subagentCount > 0"
        class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] text-[var(--accent)] shrink-0"
        :style="subagentPillStyle"
        :title="`${session.subagentCount} subagent${session.subagentCount === 1 ? '' : 's'} spawned`"
      >
        <Users class="w-3 h-3" :stroke-width="1.5" aria-hidden="true" />
        {{ session.subagentCount }}
      </span>

      <!-- Last activity (live ticker) -->
      <span
        class="font-mono text-[11px] text-[var(--text-tertiary)] shrink-0 tabular-nums"
        :title="`Last activity: ${new Date(session.lastActivity).toLocaleTimeString()}`"
      >
        {{ relativeTime }}
      </span>
    </div>

    <!-- Metadata row (24px) -->
    <div
      class="flex items-center gap-2 px-3 h-6 shrink-0 border-b border-[var(--border)] text-[11px] text-[var(--text-secondary)]"
    >
      <span
        v-if="session.modelName"
        class="font-mono truncate min-w-0"
        :title="`Model: ${session.modelName}`"
      >
        {{ formatModelName(session.modelName) }}
      </span>
      <span v-else class="font-mono text-[var(--text-tertiary)]">no model</span>
      <span class="text-[var(--text-tertiary)] shrink-0">·</span>
      <span class="font-mono shrink-0 tabular-nums">
        {{ session.eventCount }} {{ session.eventCount === 1 ? 'event' : 'events' }}
      </span>
      <span class="text-[var(--text-tertiary)] shrink-0">·</span>
      <span class="font-mono shrink-0 tabular-nums">
        {{ agentGroups.length }} {{ agentGroups.length === 1 ? 'agent' : 'agents' }}
      </span>
    </div>

    <!-- Agent panels area (flex-grow, scrollable) -->
    <div
      class="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2"
    >
      <AgentPanel
        v-for="group in agentGroups"
        :key="group.key"
        :agent-id="group.key"
        :is-parent="group.isParent"
        :session-id="session.session_id"
        :subagent-type="group.subagentType"
        :description="group.description"
        :tool-count="group.toolCount"
        :recent-tools="group.recentTools"
        :last-activity="group.lastActivity"
        :now="now"
        @drill-down="onPanelDrillDown"
      />

      <div
        v-if="agentGroups.length === 0"
        class="flex-1 flex items-center justify-center"
      >
        <span class="text-[11px] text-[var(--text-tertiary)]">No events yet</span>
      </div>
    </div>

    <!-- Footer: drill-down filter button -->
    <div
      class="flex items-center px-2 h-7 shrink-0 border-t border-[var(--border)] bg-[var(--surface-inset)]"
    >
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        :title="`Filter Stream view to session ${customName || sessionIdShort}`"
        @click="emit('filter-to-session', session.session_id)"
      >
        <Filter class="w-3 h-3" :stroke-width="1.5" aria-hidden="true" />
        Filter to this session
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { Filter, Pencil, Users, Wrench } from 'lucide-vue-next';
import type { HookEvent } from '../types';
import AgentPanel from './AgentPanel.vue';

// One row in the SessionsGrid — derived from raw events by SessionsGrid.vue.
export interface SessionSummary {
  session_id: string;
  source_app: string;
  events: HookEvent[]; // chronological (oldest first)
  lastActivity: number;
  eventCount: number;
  toolCount: number;
  subagentCount: number;
  modelName: string | undefined;
}

const props = defineProps<{
  session: SessionSummary;
  customName?: string;
  appHexColor: string;
  cardHeight?: number;
}>();

const emit = defineEmits<{
  (e: 'rename-session', payload: { session_id: string; source_app: string; custom_name: string }): void;
  (e: 'filter-to-session', session_id: string): void;
}>();

// Card height is bounded so the grid stays browsable even with many subagents.
// Inside the card, the panels area is the scroll region.
const cardHeight = computed(() => props.cardHeight ?? 480);

// ---------------------------------------------------------------------------
// Rename inline editor
// ---------------------------------------------------------------------------

const isEditing = ref(false);
const editValue = ref('');
const editInputRef = ref<HTMLInputElement | null>(null);
// Guard against double-fire when the input loses focus AS A RESULT of
// pressing Enter or Esc (both already commit/cancel).
let editingFinalized = false;

const startEdit = async () => {
  editValue.value = props.customName ?? '';
  editingFinalized = false;
  isEditing.value = true;
  await nextTick();
  editInputRef.value?.focus();
  editInputRef.value?.select();
};

const commitEdit = () => {
  if (!isEditing.value || editingFinalized) return;
  editingFinalized = true;
  const next = editValue.value.trim();
  // Only emit if the value changed — avoids burning a request on a no-op blur.
  if (next !== (props.customName ?? '')) {
    emit('rename-session', {
      session_id: props.session.session_id,
      source_app: props.session.source_app,
      custom_name: next,
    });
  }
  isEditing.value = false;
};

const cancelEdit = () => {
  if (!isEditing.value) return;
  editingFinalized = true;
  isEditing.value = false;
  editValue.value = '';
};

// ---------------------------------------------------------------------------
// Live "Xs ago" ticker — also drives per-agent status dots in AgentPanel.
// ---------------------------------------------------------------------------

const now = ref(Date.now());
let tickerHandle: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  tickerHandle = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (tickerHandle !== null) {
    clearInterval(tickerHandle);
    tickerHandle = null;
  }
});

const relativeTime = computed(() => {
  const diff = Math.max(0, now.value - props.session.lastActivity);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
});

// ---------------------------------------------------------------------------
// Agent grouping — split the session's flat event log into one bucket per
// agent (parent = events with no agent_id; one bucket per distinct agent_id).
// ---------------------------------------------------------------------------

const PARENT_KEY = 'parent';
const RECENT_TOOLS_PER_AGENT = 8;

const TOOL_EVENT_TYPES = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
]);

interface AgentGroup {
  key: string; // 'parent' or agent_id
  isParent: boolean;
  events: HookEvent[];
  subagentType?: string;
  description?: string;
  toolCount: number;
  recentTools: HookEvent[];
  lastActivity: number;
}

const agentGroups = computed<AgentGroup[]>(() => {
  // Bucket: insertion order is preserved, which matters for "first appeared"
  // tie-breaks below.
  const buckets = new Map<string, HookEvent[]>();

  for (const event of props.session.events) {
    const key = event.agent_id ?? PARENT_KEY;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(event);
  }

  const groups: AgentGroup[] = [];

  for (const [key, events] of buckets.entries()) {
    const isParent = key === PARENT_KEY;

    // Latest non-empty subagent_type / description. The server back-fills these
    // onto every subagent-issued event so any of them is fine; we sweep
    // backwards to grab the freshest value in case the spawn carried a
    // different label than later updates.
    let subagentType: string | undefined;
    let description: string | undefined;
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (!subagentType && ev.subagent_type) subagentType = ev.subagent_type;
      if (!description && ev.description) description = ev.description;
      if (subagentType && description) break;
    }

    // toolCount: count PreToolUse calls EXCEPT `tool_name === 'Agent'`, which
    // is the parent's "spawn a subagent" call — that's already represented
    // by the dedicated subagent panel; double-counting it inflates the parent.
    let toolCount = 0;
    for (const ev of events) {
      if (ev.hook_event_type !== 'PreToolUse') continue;
      const name = ev.payload?.tool_name;
      if (name === 'Agent') continue;
      toolCount += 1;
    }

    // Recent tools: last N tool-related events. We include PreToolUse,
    // PostToolUse, PostToolUseFailure, PermissionRequest — but again skip
    // the parent's Agent-spawn calls so the parent's tool list isn't
    // dominated by spawn rows.
    const toolish: HookEvent[] = [];
    for (const ev of events) {
      if (!TOOL_EVENT_TYPES.has(ev.hook_event_type)) continue;
      const name = ev.payload?.tool_name;
      if (name === 'Agent') continue;
      toolish.push(ev);
    }
    const recentTools = toolish.slice(-RECENT_TOOLS_PER_AGENT);

    let lastActivity = 0;
    for (const ev of events) {
      const ts = ev.timestamp ?? 0;
      if (ts > lastActivity) lastActivity = ts;
    }

    groups.push({
      key,
      isParent,
      events,
      subagentType,
      description,
      toolCount,
      recentTools,
      lastActivity,
    });
  }

  // Parent first, then subagents sorted by most-recent activity.
  groups.sort((a, b) => {
    if (a.isParent && !b.isParent) return -1;
    if (!a.isParent && b.isParent) return 1;
    return b.lastActivity - a.lastActivity;
  });

  return groups;
});

const onPanelDrillDown = (_agentId: string) => {
  // TODO agent-id filter — Stream view doesn't support agent_id scoping yet,
  // so for now any panel-header click drills to the full session. When agent
  // filtering lands, route the agent_id through here so subagent panels can
  // narrow further than the session.
  emit('filter-to-session', props.session.session_id);
};

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const sessionIdShort = computed(() => props.session.session_id.slice(0, 8));

const subagentPillStyle = computed(() => ({
  backgroundColor: 'rgba(0, 174, 239, 0.15)',
  border: '1px solid rgba(0, 174, 239, 0.5)',
}));

const formatModelName = (name: string | null | undefined): string => {
  if (!name) return '';
  const parts = name.split('-');
  if (parts.length >= 4) return `${parts[1]}-${parts[2]}-${parts[3]}`;
  return name;
};
</script>
