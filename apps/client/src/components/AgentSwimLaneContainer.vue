<template>
  <div v-if="selectedAgents.length > 0" class="flex w-full flex-col gap-2">
    <AgentSwimLane
      v-for="agent in selectedAgents"
      :key="agent"
      :agent-name="agent"
      :events="events"
      :time-range="timeRange"
      @close="removeAgent(agent)"
    />
  </div>
</template>

<script setup lang="ts">
import type { HookEvent, TimeRange } from '../types';
import AgentSwimLane from './AgentSwimLane.vue';

const props = defineProps<{
  selectedAgents: string[];
  events: HookEvent[];
  timeRange: TimeRange;
}>();

const emit = defineEmits<{
  'update:selectedAgents': [agents: string[]];
}>();

function removeAgent(agent: string) {
  const updated = props.selectedAgents.filter(a => a !== agent);
  emit('update:selectedAgents', updated);
}
</script>
