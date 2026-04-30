<template>
  <div class="h-screen flex flex-col bg-[var(--background)] text-[var(--text-primary)]">
    <!-- Sticky 24px header: status dot, events count, clear, filters -->
    <header
      class="sticky top-0 z-30 flex h-6 items-center gap-2 px-3 border-b border-[var(--border)] bg-[var(--background)]"
    >
      <!-- Connection status dot -->
      <Circle
        :size="10"
        :stroke-width="0"
        fill="currentColor"
        :class="[
          'shrink-0',
          isConnected ? 'text-[var(--success)]' : 'text-[var(--danger)]'
        ]"
        :title="isConnected ? 'Connected' : 'Disconnected'"
      />

      <!-- Events count -->
      <span class="font-mono text-xs text-[var(--text-secondary)]">
        {{ events.length }}
      </span>

      <div class="flex-1"></div>

      <!-- Clear events (icon-only ghost button) -->
      <button
        type="button"
        @click="handleClearClick"
        class="inline-flex h-5 w-5 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)] transition-colors duration-150"
        title="Clear events"
        aria-label="Clear events"
      >
        <Trash2 :size="12" :stroke-width="1.5" />
      </button>

      <!-- Filters chevron (popover trigger) -->
      <div ref="filtersWrapperRef" class="relative">
        <button
          ref="filtersTriggerRef"
          type="button"
          @click="showFilters = !showFilters"
          :class="[
            'inline-flex h-5 w-5 items-center justify-center rounded-md transition-colors duration-150',
            showFilters
              ? 'bg-[var(--surface)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
          ]"
          :title="showFilters ? 'Hide filters' : 'Show filters'"
          aria-label="Toggle filters"
        >
          <SlidersHorizontal :size="12" :stroke-width="1.5" />
        </button>

        <!-- Filters popover (horizontal, dense) -->
        <div
          v-if="showFilters"
          class="absolute right-0 top-full mt-1 min-w-[420px] max-w-[640px] rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg"
          role="dialog"
          aria-label="Filters"
        >
          <FilterPanel
            :filters="filters"
            :unique-app-names="uniqueAppNames"
            :all-app-names="allAppNames"
            @update:filters="filters = $event"
            @select-agent="toggleAgentLane"
          />
        </div>
      </div>
    </header>

    <!-- Live Pulse Chart -->
    <LivePulseChart
      :events="events"
      :filters="filters"
      @update-unique-apps="uniqueAppNames = $event"
      @update-all-apps="allAppNames = $event"
      @update-time-range="currentTimeRange = $event"
    />

    <!-- Agent Swim Lane Container (below pulse chart, full width, hidden when empty) -->
    <div
      v-if="selectedAgentLanes.length > 0"
      class="w-full bg-[var(--background)] px-3 py-2 overflow-hidden"
    >
      <AgentSwimLaneContainer
        :selected-agents="selectedAgentLanes"
        :events="events"
        :time-range="currentTimeRange"
        @update:selected-agents="selectedAgentLanes = $event"
      />
    </div>

    <!-- Timeline -->
    <div class="flex flex-col flex-1 overflow-hidden">
      <EventTimeline
        :events="events"
        :filters="filters"
        v-model:stick-to-bottom="stickToBottom"
      />
    </div>

    <!-- Stick to bottom button -->
    <StickScrollButton
      :stick-to-bottom="stickToBottom"
      @toggle="stickToBottom = !stickToBottom"
    />

    <!-- Error message -->
    <div
      v-if="error"
      class="fixed bottom-3 left-3 rounded-md border border-[var(--danger)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--danger)]"
    >
      {{ error }}
    </div>

    <!-- Toast Notifications -->
    <ToastNotification
      v-for="(toast, index) in toasts"
      :key="toast.id"
      :index="index"
      :agent-name="toast.agentName"
      :agent-color="toast.agentColor"
      @dismiss="dismissToast(toast.id)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { Circle, Trash2, SlidersHorizontal } from 'lucide-vue-next';
import type { TimeRange } from './types';
import { useWebSocket } from './composables/useWebSocket';
import { useEventColors } from './composables/useEventColors';
import EventTimeline from './components/EventTimeline.vue';
import FilterPanel from './components/FilterPanel.vue';
import StickScrollButton from './components/StickScrollButton.vue';
import LivePulseChart from './components/LivePulseChart.vue';
import ToastNotification from './components/ToastNotification.vue';
import AgentSwimLaneContainer from './components/AgentSwimLaneContainer.vue';
import { WS_URL } from './config';

// WebSocket connection
const { events, isConnected, error, clearEvents } = useWebSocket(WS_URL);

// Event colors
const { getHexColorForApp } = useEventColors();

// Filters
const filters = ref({
  sourceApp: '',
  sessionId: '',
  eventType: ''
});

// UI state
const stickToBottom = ref(true);
const showFilters = ref(false);
const filtersTriggerRef = ref<HTMLButtonElement | null>(null);
const filtersWrapperRef = ref<HTMLDivElement | null>(null);
const uniqueAppNames = ref<string[]>([]); // Apps active in current time window
const allAppNames = ref<string[]>([]); // All apps ever seen in session
const selectedAgentLanes = ref<string[]>([]);
const currentTimeRange = ref<TimeRange>('1m'); // Current time range from LivePulseChart

// Toast notifications
interface Toast {
  id: number;
  agentName: string;
  agentColor: string;
}
const toasts = ref<Toast[]>([]);
let toastIdCounter = 0;
const seenAgents = new Set<string>();

// Watch for new agents and show toast
watch(uniqueAppNames, (newAppNames) => {
  newAppNames.forEach(appName => {
    if (!seenAgents.has(appName)) {
      seenAgents.add(appName);
      const toast: Toast = {
        id: toastIdCounter++,
        agentName: appName,
        agentColor: getHexColorForApp(appName)
      };
      toasts.value.push(toast);
    }
  });
}, { deep: true });

const dismissToast = (id: number) => {
  const index = toasts.value.findIndex(t => t.id === id);
  if (index !== -1) {
    toasts.value.splice(index, 1);
  }
};

// Handle agent tag clicks for swim lanes
const toggleAgentLane = (agentName: string) => {
  const index = selectedAgentLanes.value.indexOf(agentName);
  if (index >= 0) {
    selectedAgentLanes.value.splice(index, 1);
  } else {
    selectedAgentLanes.value.push(agentName);
  }
  // Selecting an agent is a terminal action for the popover — close it so
  // the user can immediately see the swim lane that just appeared.
  showFilters.value = false;
};

// Handle clear button click
const handleClearClick = () => {
  clearEvents();
  selectedAgentLanes.value = [];
};

// Filters popover: close on outside click + Escape. Without this, a stray
// click anywhere on the dashboard pins the popover open until the chevron
// is clicked again — a real annoyance on a 24/7 monitor.
const handleDocumentMouseDown = (event: MouseEvent) => {
  if (!showFilters.value) return;
  const target = event.target as Node | null;
  if (!target) return;
  if (filtersWrapperRef.value && filtersWrapperRef.value.contains(target)) return;
  showFilters.value = false;
};

const handleDocumentKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && showFilters.value) {
    showFilters.value = false;
    filtersTriggerRef.value?.focus();
  }
};

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentMouseDown);
  document.addEventListener('keydown', handleDocumentKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown);
  document.removeEventListener('keydown', handleDocumentKeyDown);
});
</script>
