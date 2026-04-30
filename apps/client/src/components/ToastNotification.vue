<template>
  <Transition name="toast">
    <div
      v-if="isVisible"
      class="fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md border bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--text-primary)] shadow-lg transition-colors duration-200"
      :style="{
        top: `${20 + (index * 36)}px`,
        borderColor: agentColor,
      }"
    >
      <span
        class="inline-block h-2 w-2 rounded-full"
        :style="{ backgroundColor: agentColor }"
      ></span>
      <span class="font-mono">
        new agent
        <span class="text-[var(--text-primary)]">{{ agentName }}</span>
      </span>
      <button
        type="button"
        @click="dismiss"
        class="ml-1 inline-flex h-4 w-4 items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] transition-colors duration-150"
        aria-label="Dismiss notification"
      >
        <X :size="10" :stroke-width="1.5" />
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { X } from 'lucide-vue-next';

const props = defineProps<{
  agentName: string;
  agentColor: string;
  index: number;
  duration?: number;
}>();

const emit = defineEmits<{
  dismiss: [];
}>();

const isVisible = ref(false);
let dismissTimer: number | null = null;

const dismiss = () => {
  isVisible.value = false;
  if (dismissTimer !== null) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  setTimeout(() => emit('dismiss'), 200);
};

onMounted(() => {
  requestAnimationFrame(() => {
    isVisible.value = true;
  });

  const totalDuration = props.duration ?? 4000;
  dismissTimer = window.setTimeout(() => dismiss(), totalDuration);
});

onUnmounted(() => {
  if (dismissTimer !== null) clearTimeout(dismissTimer);
});
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}
</style>
