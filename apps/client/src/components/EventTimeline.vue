<template>
  <div class="flex-1 overflow-hidden flex flex-col">
    <!-- Sticky 28px filter row: search box only. Filter chevron lives in
         App.vue header; agent tag list lives in FilterPanel popover. -->
    <div
      class="sticky top-0 z-10 flex h-7 items-center gap-2 border-b border-[var(--border)] bg-[var(--background)] px-2"
    >
      <Search class="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" :stroke-width="1.5" />
      <input
        type="text"
        :value="searchPattern"
        @input="updateSearchPattern(($event.target as HTMLInputElement).value)"
        placeholder="Search events (regex)..."
        :class="[
          'flex-1 bg-transparent font-mono text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-none',
          searchError ? 'text-[var(--danger)]' : ''
        ]"
        aria-label="Search events with regex pattern"
      />
      <button
        v-if="searchPattern"
        type="button"
        @click="clearSearch"
        class="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)] transition-colors duration-150"
        title="Clear search"
        aria-label="Clear search"
      >
        <X :size="12" :stroke-width="1.5" />
      </button>
      <span
        v-if="searchError"
        class="font-mono text-[11px] text-[var(--danger)] shrink-0"
        role="alert"
        :title="searchError"
      >
        regex error
      </span>
    </div>

    <!-- Scrollable event list -->
    <div
      ref="scrollContainer"
      class="flex-1 overflow-y-auto px-2 py-1"
      @scroll="handleScroll"
    >
      <TransitionGroup name="event" tag="div" class="flex flex-col gap-0.5">
        <EventRow
          v-for="event in filteredEvents"
          :key="`${event.id}-${event.timestamp}`"
          :event="event"
          :app-hex-color="getHexColorForApp(event.source_app)"
          :is-subagent="isSubagentEvent(event)"
          :parent-session-id="getParentSessionId(event.session_id)"
        />
      </TransitionGroup>

      <div v-if="filteredEvents.length === 0" class="py-12 text-center">
        <CircleSlash class="mx-auto mb-2 w-6 h-6 text-[var(--text-tertiary)]" :stroke-width="1.5" />
        <p class="text-sm text-[var(--text-secondary)]">No events to display</p>
        <p class="text-xs text-[var(--text-tertiary)]">Events will appear here as they arrive</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, toRef } from 'vue';
import { Search, X, CircleSlash } from 'lucide-vue-next';
import type { HookEvent } from '../types';
import EventRow from './EventRow.vue';
import { useEventColors } from '../composables/useEventColors';
import { useEventSearch } from '../composables/useEventSearch';
import { useParentMap } from '../composables/useParentMap';

const props = defineProps<{
  events: HookEvent[];
  filters: {
    sourceApp: string;
    sessionId: string;
    eventType: string;
  };
  stickToBottom: boolean;
}>();

const emit = defineEmits<{
  'update:stickToBottom': [value: boolean];
}>();

const scrollContainer = ref<HTMLElement>();
const { getHexColorForApp } = useEventColors();
const { searchPattern, searchError, searchEvents, updateSearchPattern, clearSearch } = useEventSearch();

// Parent linkage. The server back-fills subagent_type + description onto
// every subagent-issued event using session_id + agent_id, so we mostly
// just need the indentation predicate from this composable.
const eventsRef = toRef(props, 'events');
const { isSubagentEvent, getParentSessionId } = useParentMap(eventsRef);

const filteredEvents = computed(() => {
  let filtered = props.events.filter(event => {
    if (props.filters.sourceApp && event.source_app !== props.filters.sourceApp) return false;
    if (props.filters.sessionId && event.session_id !== props.filters.sessionId) return false;
    if (props.filters.eventType && event.hook_event_type !== props.filters.eventType) return false;
    return true;
  });

  if (searchPattern.value) {
    filtered = searchEvents(filtered, searchPattern.value);
  }

  return filtered;
});

const scrollToBottom = () => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
  }
};

const handleScroll = () => {
  if (!scrollContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value;
  const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
  if (isAtBottom !== props.stickToBottom) {
    emit('update:stickToBottom', isAtBottom);
  }
};

watch(() => props.events.length, async () => {
  if (props.stickToBottom) {
    await nextTick();
    scrollToBottom();
  }
});

watch(() => props.stickToBottom, (shouldStick) => {
  if (shouldStick) scrollToBottom();
});
</script>

<style scoped>
.event-enter-active,
.event-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.event-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.event-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
