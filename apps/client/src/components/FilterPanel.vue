<template>
  <div class="flex flex-col gap-2">
    <!-- Inline filter row -->
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-1.5 text-[11px]">
        <span class="font-mono text-[var(--text-tertiary)] uppercase tracking-wider">app</span>
        <select
          v-model="localFilters.sourceApp"
          @change="updateFilters"
          class="h-6 rounded-md border border-[var(--border)] bg-[var(--surface-inset)] px-1.5 text-[11px] text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          <option value="">all</option>
          <option v-for="app in filterOptions.source_apps" :key="app" :value="app">{{ app }}</option>
        </select>
      </label>

      <label class="flex items-center gap-1.5 text-[11px]">
        <span class="font-mono text-[var(--text-tertiary)] uppercase tracking-wider">session</span>
        <select
          v-model="localFilters.sessionId"
          @change="updateFilters"
          class="h-6 rounded-md border border-[var(--border)] bg-[var(--surface-inset)] px-1.5 text-[11px] text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          <option value="">all</option>
          <option v-for="session in filterOptions.session_ids" :key="session" :value="session">
            {{ session.slice(0, 8) }}
          </option>
        </select>
      </label>

      <label class="flex items-center gap-1.5 text-[11px]">
        <span class="font-mono text-[var(--text-tertiary)] uppercase tracking-wider">type</span>
        <select
          v-model="localFilters.eventType"
          @change="updateFilters"
          class="h-6 rounded-md border border-[var(--border)] bg-[var(--surface-inset)] px-1.5 text-[11px] text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        >
          <option value="">all</option>
          <option v-for="type in filterOptions.hook_event_types" :key="type" :value="type">{{ type }}</option>
        </select>
      </label>

      <button
        v-if="hasActiveFilters"
        type="button"
        @click="clearFilters"
        class="ml-auto inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-[var(--text-tertiary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] transition-colors duration-150"
      >
        <X class="w-3 h-3" :stroke-width="1.5" /> clear
      </button>
    </div>

    <!-- Agent chip list (moved from EventTimeline) -->
    <div v-if="displayedAgentIds.length > 0" class="flex flex-wrap gap-1 border-t border-[var(--border)] pt-2">
      <span class="font-mono text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider self-center mr-1">
        agents
      </span>
      <button
        v-for="agentId in displayedAgentIds"
        :key="agentId"
        type="button"
        @click="emit('selectAgent', agentId)"
        :class="[
          'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] transition-colors duration-150',
          isAgentActive(agentId)
            ? 'text-[var(--text-primary)]'
            : 'text-[var(--text-tertiary)] opacity-60 hover:opacity-100'
        ]"
        :style="{
          borderColor: getHexColorForApp(getAppNameFromAgentId(agentId)),
          backgroundColor: getHexColorForApp(getAppNameFromAgentId(agentId)) + (isAgentActive(agentId) ? '26' : '0d')
        }"
        :title="`${isAgentActive(agentId) ? 'Active' : 'Idle'} — ${agentId}`"
      >
        <Circle
          :size="6"
          :stroke-width="0"
          fill="currentColor"
          :class="isAgentActive(agentId) ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'"
        />
        {{ agentId }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { X, Circle } from 'lucide-vue-next';
import type { FilterOptions } from '../types';
import { API_BASE_URL } from '../config';
import { useEventColors } from '../composables/useEventColors';

const props = defineProps<{
  filters: {
    sourceApp: string;
    sessionId: string;
    eventType: string;
  };
  uniqueAppNames?: string[];
  allAppNames?: string[];
}>();

const emit = defineEmits<{
  'update:filters': [filters: typeof props.filters];
  selectAgent: [agentName: string];
}>();

const filterOptions = ref<FilterOptions>({
  source_apps: [],
  session_ids: [],
  hook_event_types: [],
});

const localFilters = ref({ ...props.filters });
const { getHexColorForApp } = useEventColors();

const hasActiveFilters = computed(() => {
  return Boolean(localFilters.value.sourceApp || localFilters.value.sessionId || localFilters.value.eventType);
});

const displayedAgentIds = computed(() => {
  return props.allAppNames?.length ? props.allAppNames : (props.uniqueAppNames ?? []);
});

const getAppNameFromAgentId = (agentId: string): string => agentId.split(':')[0] ?? agentId;

const isAgentActive = (agentId: string): boolean => {
  return (props.uniqueAppNames ?? []).includes(agentId);
};

const updateFilters = () => {
  emit('update:filters', { ...localFilters.value });
};

const clearFilters = () => {
  localFilters.value = { sourceApp: '', sessionId: '', eventType: '' };
  updateFilters();
};

let refreshInterval: number | null = null;

const fetchFilterOptions = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/events/filter-options`);
    if (response.ok) {
      filterOptions.value = await response.json();
    }
  } catch (error) {
    console.error('Failed to fetch filter options:', error);
  }
};

onMounted(() => {
  fetchFilterOptions();
  refreshInterval = window.setInterval(fetchFilterOptions, 10000);
});

onUnmounted(() => {
  if (refreshInterval !== null) {
    window.clearInterval(refreshInterval);
    refreshInterval = null;
  }
});
</script>
