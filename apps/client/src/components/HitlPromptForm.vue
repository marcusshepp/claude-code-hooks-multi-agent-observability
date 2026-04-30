<template>
  <div
    v-if="event.humanInTheLoop && (event.humanInTheLoopStatus?.status === 'pending' || hasSubmittedResponse)"
    class="mb-1 rounded-md border bg-[var(--surface)] px-3 py-2"
    :class="hitlBorderClass"
    @click.stop
  >
    <div class="flex items-center gap-2 mb-1.5">
      <component
        :is="hitlIcon"
        class="w-3.5 h-3.5 shrink-0"
        :class="hitlIconClass"
        :stroke-width="1.5"
      />
      <span class="text-xs font-semibold" :class="hitlIconClass">{{ hitlTypeLabel }}</span>
      <span
        v-if="permissionType"
        class="rounded-md border border-[var(--border)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]"
      >
        {{ permissionType }}
      </span>
      <span
        v-if="event.source_app"
        class="rounded-md px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-primary)]"
        :style="{ backgroundColor: appHexColor + '33', borderColor: appHexColor }"
      >
        {{ event.source_app }}
      </span>
      <span class="font-mono text-[11px] text-[var(--text-tertiary)]">{{ sessionIdShort }}</span>
      <span class="ml-auto font-mono text-[11px] text-[var(--text-tertiary)]">{{ formatTime(event.timestamp) }}</span>
    </div>

    <p class="mb-2 text-[13px] text-[var(--text-primary)]">
      {{ event.humanInTheLoop.question }}
    </p>

    <div
      v-if="localResponse || (event.humanInTheLoopStatus?.status === 'responded' && event.humanInTheLoopStatus.response)"
      class="mb-2 flex items-center gap-2 rounded-md border border-[var(--success)] bg-[var(--surface-inset)] px-2 py-1.5"
    >
      <Check class="w-3.5 h-3.5 shrink-0 text-[var(--success)]" :stroke-width="1.5" />
      <span class="text-xs text-[var(--text-primary)]">
        <template v-if="(localResponse?.response || event.humanInTheLoopStatus?.response?.response)">
          {{ localResponse?.response || event.humanInTheLoopStatus?.response?.response }}
        </template>
        <template v-else-if="(localResponse?.permission !== undefined || event.humanInTheLoopStatus?.response?.permission !== undefined)">
          {{ (localResponse?.permission ?? event.humanInTheLoopStatus?.response?.permission) ? 'Approved' : 'Denied' }}
        </template>
        <template v-else-if="(localResponse?.choice || event.humanInTheLoopStatus?.response?.choice)">
          {{ localResponse?.choice || event.humanInTheLoopStatus?.response?.choice }}
        </template>
      </span>
    </div>

    <div v-if="event.humanInTheLoop.type === 'question' && !hasSubmittedResponse">
      <textarea
        v-model="responseText"
        class="w-full rounded-md border border-[var(--border)] bg-[var(--surface-inset)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        rows="2"
        placeholder="Type a response..."
        @click.stop
      ></textarea>
      <div class="mt-1.5 flex justify-end">
        <button
          type="button"
          @click.stop="submitResponse"
          :disabled="!responseText.trim() || isSubmitting"
          class="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--background)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
        >
          {{ isSubmitting ? 'Sending...' : 'Submit' }}
        </button>
      </div>
    </div>

    <div v-else-if="event.humanInTheLoop.type === 'permission' && !hasSubmittedResponse" class="flex justify-end gap-1.5">
      <button
        type="button"
        @click.stop="submitPermission(false)"
        :disabled="isSubmitting"
        class="inline-flex items-center gap-1 rounded-md border border-[var(--danger)] px-2.5 py-1 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-50 transition-colors duration-150"
      >
        <X class="w-3 h-3" :stroke-width="1.5" /> Deny
      </button>
      <button
        type="button"
        @click.stop="submitPermission(true)"
        :disabled="isSubmitting"
        class="inline-flex items-center gap-1 rounded-md bg-[var(--success)] px-2.5 py-1 text-xs font-medium text-[var(--background)] disabled:opacity-50 transition-colors duration-150"
      >
        <Check class="w-3 h-3" :stroke-width="1.5" /> Approve
      </button>
    </div>

    <div v-else-if="event.humanInTheLoop.type === 'choice' && !hasSubmittedResponse" class="flex flex-wrap justify-end gap-1.5">
      <button
        v-for="choice in event.humanInTheLoop.choices"
        :key="choice"
        type="button"
        @click.stop="submitChoice(choice)"
        :disabled="isSubmitting"
        class="rounded-md border border-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50 transition-colors duration-150"
      >
        {{ choice }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Check, HelpCircle, ListChecks, Lock, X } from 'lucide-vue-next';
import type { HookEvent, HumanInTheLoopResponse } from '../types';
import { API_BASE_URL } from '../config';

const props = defineProps<{
  event: HookEvent;
  appHexColor: string;
}>();

const emit = defineEmits<{
  (e: 'response-submitted', response: HumanInTheLoopResponse): void;
}>();

const responseText = ref('');
const isSubmitting = ref(false);
const hasSubmittedResponse = ref(false);
const localResponse = ref<HumanInTheLoopResponse | null>(null);

const sessionIdShort = computed(() => props.event.session_id.slice(0, 6));

const hitlIcon = computed(() => {
  if (!props.event.humanInTheLoop) return HelpCircle;
  switch (props.event.humanInTheLoop.type) {
    case 'permission': return Lock;
    case 'choice': return ListChecks;
    case 'question':
    default: return HelpCircle;
  }
});

const hitlIconClass = computed(() => {
  if (hasSubmittedResponse.value || props.event.humanInTheLoopStatus?.status === 'responded') {
    return 'text-[var(--success)]';
  }
  return 'text-[var(--warning)]';
});

const hitlBorderClass = computed(() => {
  if (hasSubmittedResponse.value || props.event.humanInTheLoopStatus?.status === 'responded') {
    return 'border-[var(--success)]/60';
  }
  return 'border-[var(--warning)]/60';
});

const hitlTypeLabel = computed(() => {
  if (!props.event.humanInTheLoop) return '';
  switch (props.event.humanInTheLoop.type) {
    case 'permission': return 'Permission Request';
    case 'choice': return 'Choice Required';
    case 'question':
    default: return 'Agent Question';
  }
});

const permissionType = computed(() => props.event.payload?.permission_type ?? null);

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

async function postResponse(response: HumanInTheLoopResponse): Promise<boolean> {
  if (!props.event.id) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/events/${props.event.id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    emit('response-submitted', response);
    return true;
  } catch (error) {
    console.error('HITL response failed:', error);
    return false;
  }
}

const submitResponse = async () => {
  if (!responseText.value.trim()) return;
  const response: HumanInTheLoopResponse = {
    response: responseText.value.trim(),
    hookEvent: props.event,
    respondedAt: Date.now(),
  };
  const savedText = responseText.value;
  responseText.value = '';
  localResponse.value = response;
  hasSubmittedResponse.value = true;
  isSubmitting.value = true;
  const ok = await postResponse(response);
  if (!ok) {
    localResponse.value = null;
    hasSubmittedResponse.value = false;
    responseText.value = savedText;
  }
  isSubmitting.value = false;
};

const submitPermission = async (approved: boolean) => {
  const response: HumanInTheLoopResponse = {
    permission: approved,
    hookEvent: props.event,
    respondedAt: Date.now(),
  };
  localResponse.value = response;
  hasSubmittedResponse.value = true;
  isSubmitting.value = true;
  const ok = await postResponse(response);
  if (!ok) {
    localResponse.value = null;
    hasSubmittedResponse.value = false;
  }
  isSubmitting.value = false;
};

const submitChoice = async (choice: string) => {
  const response: HumanInTheLoopResponse = {
    choice,
    hookEvent: props.event,
    respondedAt: Date.now(),
  };
  localResponse.value = response;
  hasSubmittedResponse.value = true;
  isSubmitting.value = true;
  const ok = await postResponse(response);
  if (!ok) {
    localResponse.value = null;
    hasSubmittedResponse.value = false;
  }
  isSubmitting.value = false;
};
</script>
