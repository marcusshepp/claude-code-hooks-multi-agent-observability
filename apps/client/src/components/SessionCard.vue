<template>
  <div
    class="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
    :style="{ height: cardHeight + 'px' }"
  >
    <!-- Header row (32px, sticky in card scroll context) -->
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
        {{ session.toolCount }} {{ session.toolCount === 1 ? 'tool' : 'tools' }}
      </span>
    </div>

    <!-- Mini event log -->
    <div
      ref="logRef"
      class="flex-1 min-h-0 overflow-y-auto px-2 py-1 flex flex-col gap-px"
      @scroll="handleScroll"
    >
      <div
        v-for="event in displayedEvents"
        :key="`${event.id}-${event.timestamp}`"
        class="flex items-center gap-1.5 px-1.5 rounded-sm min-h-[24px] hover:bg-[var(--surface-inset)] transition-colors duration-150"
      >
        <component
          :is="iconForEvent(event)"
          class="w-3 h-3 shrink-0"
          :class="iconColorClass(event)"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        <span class="font-mono text-[10px] text-[var(--text-tertiary)] shrink-0 tabular-nums">
          {{ formatTime(event.timestamp) }}
        </span>
        <span
          v-if="primaryLabel(event)"
          class="text-[12px] text-[var(--text-primary)] shrink-0"
        >
          {{ primaryLabel(event) }}
        </span>
        <span
          v-if="commandTextFor(event)"
          class="font-mono text-[11px] text-[var(--text-secondary)] flex-1 min-w-0 truncate"
          :title="commandTextFor(event)"
        >
          {{ commandTextFor(event) }}
        </span>
        <span v-else class="flex-1"></span>
      </div>

      <div
        v-if="displayedEvents.length === 0"
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
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import type { Component } from 'vue';
import { Filter, Pencil, Users } from 'lucide-vue-next';
import type { HookEvent } from '../types';
import { getEventIcon, getToolIcon } from '../composables/useEventIcons';

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

const cardHeight = computed(() => props.cardHeight ?? 360);

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
// Mini event log — show last 30 events of THIS session, auto-scroll to bottom
// ---------------------------------------------------------------------------

const MAX_DISPLAYED = 30;

const displayedEvents = computed<HookEvent[]>(() => {
  const all = props.session.events;
  if (all.length <= MAX_DISPLAYED) return all;
  return all.slice(all.length - MAX_DISPLAYED);
});

const logRef = ref<HTMLDivElement | null>(null);
const stickToBottom = ref(true);

const handleScroll = () => {
  const el = logRef.value;
  if (!el) return;
  const { scrollTop, scrollHeight, clientHeight } = el;
  // Within 24px of the bottom counts as "at the bottom".
  stickToBottom.value = scrollHeight - scrollTop - clientHeight < 24;
};

const scrollLogToBottom = () => {
  const el = logRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
};

watch(
  () => props.session.events.length,
  async () => {
    if (!stickToBottom.value) return;
    await nextTick();
    scrollLogToBottom();
  }
);

onMounted(async () => {
  await nextTick();
  scrollLogToBottom();
});

// ---------------------------------------------------------------------------
// Live "Xs ago" ticker
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
// Display helpers
// ---------------------------------------------------------------------------

const sessionIdShort = computed(() => props.session.session_id.slice(0, 8));

const subagentPillStyle = computed(() => ({
  backgroundColor: 'rgba(0, 174, 239, 0.15)',
  border: '1px solid rgba(0, 174, 239, 0.5)',
}));

const TOOL_EVENT_TYPES = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
]);

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
  if (event.hook_event_type === 'SubagentStart' || event.hook_event_type === 'SubagentStop') {
    return 'text-[var(--accent)]';
  }
  return 'text-[var(--text-secondary)]';
};

const primaryLabel = (event: HookEvent): string => {
  const tool = toolNameOf(event);
  if (tool) return tool;
  return event.hook_event_type;
};

const commandTextFor = (event: HookEvent): string => {
  const payload = event.payload ?? {};
  const input = payload.tool_input ?? {};
  if (typeof input.command === 'string' && input.command) return input.command;
  if (typeof input.file_path === 'string' && input.file_path) return input.file_path;
  if (typeof input.notebook_path === 'string' && input.notebook_path) return input.notebook_path;
  if (typeof input.pattern === 'string' && input.pattern) return input.pattern;
  if (typeof input.query === 'string' && input.query) return input.query;
  if (typeof input.url === 'string' && input.url) return input.url;
  if (typeof input.prompt === 'string' && input.prompt) return input.prompt;
  if (event.hook_event_type === 'UserPromptSubmit' && typeof payload.prompt === 'string') {
    return payload.prompt;
  }
  if (event.summary) return event.summary;
  return '';
};

const formatTime = (timestamp?: number): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatModelName = (name: string | null | undefined): string => {
  if (!name) return '';
  const parts = name.split('-');
  if (parts.length >= 4) return `${parts[1]}-${parts[2]}-${parts[3]}`;
  return name;
};
</script>
