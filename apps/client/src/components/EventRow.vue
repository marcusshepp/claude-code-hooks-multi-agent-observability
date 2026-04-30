<template>
  <div>
    <!-- HITL prompt (extracted to a dedicated component) -->
    <HitlPromptForm
      v-if="event.humanInTheLoop"
      :event="event"
      :app-hex-color="appHexColor"
      @response-submitted="(r) => emit('response-submitted', r)"
    />

    <!-- Standard event row (single line, dense) -->
    <div
      v-if="!event.humanInTheLoop"
      class="group relative flex flex-col rounded-md border border-transparent transition-colors duration-150 cursor-pointer hover:border-[var(--border)] hover:bg-[var(--surface)]"
      :class="{ 'border-[var(--accent)] bg-[var(--surface)]': isExpanded }"
      :style="rowStyle"
      @click="toggleExpanded"
    >
      <div
        class="flex items-center gap-2 px-2 py-1.5 min-h-[32px]"
      >
        <!-- Indent affordance for any subagent-issued event -->
        <CornerDownRight
          v-if="indented"
          class="w-3 h-3 shrink-0 text-[var(--text-tertiary)]"
          :stroke-width="1.5"
        />

        <!-- Event/tool icon -->
        <component
          :is="primaryIcon"
          class="w-3.5 h-3.5 shrink-0"
          :class="iconColorClass"
          :stroke-width="1.5"
        />

        <!-- Time -->
        <span class="font-mono text-[11px] text-[var(--text-tertiary)] shrink-0 tabular-nums">
          {{ formatTime(event.timestamp) }}
        </span>

        <!-- Source app pill -->
        <span
          class="rounded-md px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-primary)] shrink-0"
          :style="{
            backgroundColor: appHexColor + '26',
            border: `1px solid ${appHexColor}66`,
          }"
          :title="event.source_app"
        >
          {{ event.source_app }}
        </span>

        <!-- Session id (6 chars) -->
        <span
          class="font-mono text-[11px] text-[var(--text-secondary)] shrink-0"
          :title="event.session_id"
        >
          {{ sessionIdShort }}
        </span>

        <!-- Model pill -->
        <span
          v-if="event.model_name"
          class="rounded-md border border-[var(--border)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-secondary)] shrink-0"
          :title="`Model: ${event.model_name}`"
        >
          {{ formatModelName(event.model_name) }}
        </span>

        <!-- Subagent type badge (accent) -->
        <span
          v-if="event.subagent_type"
          class="rounded-md px-1.5 py-0.5 font-mono text-[11px] shrink-0"
          :style="subagentBadgeStyle"
          :title="`Subagent: ${event.subagent_type}`"
        >
          {{ event.subagent_type }}
        </span>

        <!-- Tool / event-type label -->
        <span
          v-if="primaryLabel"
          class="text-[13px] text-[var(--text-primary)] font-medium shrink-0"
        >
          {{ primaryLabel }}
        </span>

        <!-- Description (subagent task description, truncated) -->
        <span
          v-if="event.description"
          class="text-[12px] text-[var(--text-secondary)] italic shrink min-w-0 truncate"
          :title="event.description"
        >
          {{ truncatedDescription }}
        </span>

        <!-- Command / input details — fills remaining width with CSS ellipsis -->
        <span
          v-if="commandText"
          class="font-mono text-[12px] text-[var(--text-secondary)] flex-1 min-w-0 truncate"
          :title="commandText"
        >
          {{ commandText }}
        </span>
        <div v-else class="flex-1"></div>

        <!-- Status badge for tool events that errored -->
        <span
          v-if="isFailure"
          class="rounded-md border border-[var(--danger)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--danger)] shrink-0"
          title="Tool call failed"
        >
          fail
        </span>

        <!-- Duration / right-aligned meta (only when known) -->
        <span
          v-if="durationText"
          class="font-mono text-[11px] text-[var(--text-tertiary)] shrink-0 tabular-nums"
          :title="durationText"
        >
          {{ durationText }}
        </span>
      </div>

      <!-- Inline expanded content (max 8rem, smooth) -->
      <div
        ref="expandedRef"
        class="overflow-hidden transition-[max-height] duration-200 ease-out"
        :style="{ maxHeight: isExpanded ? '8rem' : '0' }"
      >
        <div
          class="border-t border-[var(--border)] px-3 py-2 bg-[var(--surface-inset)]"
        >
          <div class="flex items-center justify-between mb-1.5">
            <span class="font-mono text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
              payload
            </span>
            <div class="flex items-center gap-1">
              <button
                v-if="event.chat && event.chat.length > 0 && !isMobile"
                type="button"
                @click.stop="showChatModal = true"
                class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors duration-150"
                :title="`View chat transcript (${event.chat.length} messages)`"
              >
                <MessageSquare class="w-3 h-3" :stroke-width="1.5" />
                {{ event.chat.length }}
              </button>
              <button
                type="button"
                @click.stop="copyPayload"
                class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)] transition-colors duration-150"
                :title="copyButtonText"
              >
                <Copy class="w-3 h-3" :stroke-width="1.5" />
                {{ copyButtonText }}
              </button>
            </div>
          </div>
          <pre
            class="overflow-auto font-mono text-[11px] leading-snug text-[var(--text-primary)] max-h-[5.5rem] whitespace-pre-wrap break-all"
          >{{ formattedPayload }}</pre>
        </div>
      </div>
    </div>

    <!-- Chat Modal -->
    <ChatTranscriptModal
      v-if="event.chat && event.chat.length > 0"
      :is-open="showChatModal"
      :chat="event.chat"
      @close="showChatModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Copy,
  CornerDownRight,
  MessageSquare,
} from 'lucide-vue-next';
import type { HookEvent, HumanInTheLoopResponse } from '../types';
import { useMediaQuery } from '../composables/useMediaQuery';
import { getEventIcon, getToolIcon } from '../composables/useEventIcons';
import ChatTranscriptModal from './ChatTranscriptModal.vue';
import HitlPromptForm from './HitlPromptForm.vue';

const props = defineProps<{
  event: HookEvent;
  appHexColor: string;
  isSubagent?: boolean;
  parentSessionId?: string;
}>();

const emit = defineEmits<{
  (e: 'response-submitted', response: HumanInTheLoopResponse): void;
}>();

const isExpanded = ref(false);
const showChatModal = ref(false);
const copyButtonText = ref('copy');
const expandedRef = ref<HTMLDivElement | null>(null);

const { isMobile } = useMediaQuery();

const TOOL_EVENT_TYPES = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
]);

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
};

const sessionIdShort = computed(() => props.event.session_id.slice(0, 6));

const toolName = computed<string | null>(() => {
  if (!TOOL_EVENT_TYPES.has(props.event.hook_event_type)) return null;
  const name = props.event.payload?.tool_name;
  return typeof name === 'string' ? name : null;
});

// Choose the most informative icon — tool icon if present, otherwise the
// event-type icon.
const primaryIcon = computed(() => {
  if (toolName.value) return getToolIcon(toolName.value);
  return getEventIcon(props.event.hook_event_type);
});

const isFailure = computed(() => props.event.hook_event_type === 'PostToolUseFailure');

const iconColorClass = computed(() => {
  if (isFailure.value) return 'text-[var(--danger)]';
  if (props.event.hook_event_type === 'PostToolUse') return 'text-[var(--success)]';
  if (props.event.hook_event_type === 'PermissionRequest') return 'text-[var(--warning)]';
  if (props.event.hook_event_type === 'SubagentStart' || props.event.hook_event_type === 'SubagentStop') {
    return 'text-[var(--accent)]';
  }
  return 'text-[var(--text-secondary)]';
});

// Primary label: tool name when known, else event type. Avoid showing
// the event-type *and* tool name simultaneously — the icon already keys
// the event type, and the tool name is the most useful text.
const primaryLabel = computed(() => {
  if (toolName.value) return toolName.value;
  return props.event.hook_event_type;
});

// Truncated description for inline display. Full text on hover via title.
const truncatedDescription = computed(() => {
  const d = props.event.description ?? '';
  if (d.length <= 60) return d;
  return d.slice(0, 60) + '...';
});

// Command / URL / query / prompt — pull whichever is most informative
// from the tool input. CSS handles ellipsis; we expose the full text so
// the title attr can show it on hover.
const commandText = computed<string>(() => {
  const payload = props.event.payload ?? {};
  const input = payload.tool_input ?? {};

  if (typeof input.command === 'string' && input.command) return input.command;
  if (typeof input.file_path === 'string' && input.file_path) return input.file_path;
  if (typeof input.notebook_path === 'string' && input.notebook_path) return input.notebook_path;
  if (typeof input.pattern === 'string' && input.pattern) return input.pattern;
  if (typeof input.query === 'string' && input.query) return input.query;
  if (typeof input.url === 'string' && input.url) return input.url;
  if (typeof input.prompt === 'string' && input.prompt) return input.prompt;

  if (props.event.hook_event_type === 'UserPromptSubmit' && typeof payload.prompt === 'string') {
    return payload.prompt;
  }

  if (props.event.summary) return props.event.summary;
  return '';
});

const durationText = computed<string>(() => {
  const payload = props.event.payload ?? {};
  if (typeof payload.duration_ms === 'number') {
    const ms = payload.duration_ms;
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return '';
});

const formattedPayload = computed(() => JSON.stringify(props.event.payload, null, 2));

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatModelName = (name: string | null | undefined): string => {
  if (!name) return '';
  const parts = name.split('-');
  if (parts.length >= 4) return `${parts[1]}-${parts[2]}-${parts[3]}`;
  return name;
};

const subagentBadgeStyle = computed(() => ({
  backgroundColor: 'rgba(0, 174, 239, 0.15)',
  border: '1px solid rgba(0, 174, 239, 0.5)',
  color: 'var(--accent)',
}));

// Indent any event that originated inside a subagent. Real Claude Code
// subagents share their parent's session_id and are flagged via agent_id;
// the forward-compat parent_session_id path still works for any event
// emitted with that field set.
const indented = computed(() => Boolean(props.isSubagent || props.parentSessionId));

const rowStyle = computed(() => ({
  marginLeft: indented.value ? '16px' : '0',
}));

const copyPayload = async () => {
  try {
    await navigator.clipboard.writeText(formattedPayload.value);
    copyButtonText.value = 'copied';
    setTimeout(() => {
      copyButtonText.value = 'copy';
    }, 1500);
  } catch (err) {
    console.error('Failed to copy:', err);
    copyButtonText.value = 'failed';
    setTimeout(() => {
      copyButtonText.value = 'copy';
    }, 1500);
  }
};
</script>
