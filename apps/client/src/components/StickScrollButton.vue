<template>
  <button
    type="button"
    @click="$emit('toggle')"
    class="fixed bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors duration-150"
    :class="stickToBottom
      ? 'bg-[var(--accent)] text-[var(--background)] border-[var(--accent)]'
      : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]'"
    :title="stickToBottom ? 'Auto-scroll on — click to pause' : 'Auto-scroll off — click to resume'"
    :aria-label="stickToBottom ? 'Disable auto-scroll' : 'Enable auto-scroll'"
  >
    <component
      :is="stickToBottom ? ChevronsDown : ChevronUp"
      class="w-4 h-4"
      :stroke-width="1.5"
    />
  </button>
</template>

<script setup lang="ts">
import { ChevronsDown, ChevronUp } from 'lucide-vue-next';

defineProps<{
  stickToBottom: boolean;
}>();

defineEmits<{
  toggle: [];
}>();
</script>
