<template>
  <div class="flex w-full flex-col gap-0.5">
    <!-- 28px header line -->
    <div class="flex h-7 items-center gap-2 px-1 text-[11px]">
      <Activity
        class="w-3.5 h-3.5 shrink-0"
        :stroke-width="1.5"
        :style="{ color: getHexColorForApp(appName) }"
      />

      <!-- app:session, mono -->
      <span class="font-mono text-[var(--text-primary)]" :title="agentName">
        <span :style="{ color: getHexColorForApp(appName) }">{{ appName }}</span>
        <span class="text-[var(--text-tertiary)]">:</span>
        <span class="text-[var(--text-secondary)]">{{ sessionId }}</span>
      </span>

      <!-- Subagent type pill (accent) -->
      <span
        v-if="subagentType"
        class="rounded-md px-1.5 py-0.5 font-mono text-[11px]"
        style="background-color: rgba(0, 174, 239, 0.15); border: 1px solid rgba(0, 174, 239, 0.5); color: var(--accent);"
        :title="`Subagent: ${subagentType}`"
      >
        {{ subagentType }}
      </span>

      <!-- Model muted -->
      <span
        v-if="modelName"
        class="font-mono text-[var(--text-tertiary)]"
        :title="`Model: ${modelName}`"
      >
        {{ formatModelName(modelName) }}
      </span>

      <!-- Inline summary metrics (mono, dot-separated) -->
      <span class="ml-2 font-mono text-[var(--text-tertiary)]">
        <span class="text-[var(--text-primary)] tabular-nums">{{ totalEventCount }}</span> events
        <span class="mx-0.5">·</span>
        <span class="text-[var(--text-primary)] tabular-nums">{{ toolCallCount }}</span> tools
        <span class="mx-0.5">·</span>
        <span class="text-[var(--text-tertiary)]">avg</span>
        <span class="ml-1 text-[var(--text-primary)] tabular-nums">{{ formatGap(agentEventTimingMetrics.avgGap) }}</span>
      </span>

      <button
        type="button"
        @click="emit('close')"
        class="ml-auto inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)] transition-colors duration-150"
        title="Remove this swim lane"
        aria-label="Remove this swim lane"
      >
        <X :size="12" :stroke-width="1.5" />
      </button>
    </div>

    <div ref="chartContainer" class="relative w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface-inset)]">
      <canvas
        ref="canvas"
        class="w-full cursor-crosshair"
        :style="{ height: chartHeight + 'px' }"
        @mousemove="handleMouseMove"
        @mouseleave="handleMouseLeave"
        role="img"
        :aria-label="chartAriaLabel"
      ></canvas>
      <div
        v-if="tooltip.visible"
        class="absolute z-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 font-mono text-[11px] text-[var(--text-primary)] pointer-events-none whitespace-nowrap"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      >
        {{ tooltip.text }}
      </div>
      <div
        v-if="!hasData"
        class="absolute inset-0 flex items-center justify-center"
      >
        <span class="font-mono text-[11px] text-[var(--text-tertiary)]">waiting...</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { Activity, X } from 'lucide-vue-next';
import type { HookEvent, TimeRange, ChartConfig } from '../types';
import { useAgentChartData } from '../composables/useAgentChartData';
import { createChartRenderer, type ChartDimensions } from '../utils/chartRenderer';
import { useEventColors } from '../composables/useEventColors';
import { cssVar } from '../utils/cssVar';

const props = defineProps<{
  agentName: string; // Format: "app:session" (e.g. "claude-code:a1b2c3d4")
  events: HookEvent[];
  timeRange: TimeRange;
}>();

const emit = defineEmits<{
  close: [];
}>();

const canvas = ref<HTMLCanvasElement>();
const chartContainer = ref<HTMLDivElement>();
const chartHeight = 48;

const formatGap = (gapMs: number): string => {
  if (gapMs === 0) return '—';
  if (gapMs < 1000) return `${Math.round(gapMs)}ms`;
  return `${(gapMs / 1000).toFixed(1)}s`;
};

const appName = computed(() => props.agentName.split(':')[0] ?? props.agentName);
const sessionId = computed(() => props.agentName.split(':')[1] ?? '');

// Get the most recent event for this agent (for model_name + subagent_type)
const matchedEvents = computed(() => {
  const targetApp = appName.value;
  const targetSession = sessionId.value;
  return props.events.filter(e => e.source_app === targetApp && e.session_id.slice(0, 8) === targetSession);
});

const modelName = computed(() => {
  const events = matchedEvents.value.filter(e => e.model_name);
  if (events.length === 0) return null;
  return events[events.length - 1].model_name;
});

const subagentType = computed(() => {
  const events = matchedEvents.value.filter(e => e.subagent_type);
  if (events.length === 0) return null;
  return events[events.length - 1].subagent_type;
});

const formatModelName = (name: string | null | undefined): string => {
  if (!name) return '';
  const parts = name.split('-');
  if (parts.length >= 4) return `${parts[1]}-${parts[2]}-${parts[3]}`;
  return name;
};

const {
  dataPoints,
  addEvent,
  getChartData,
  setTimeRange,
  cleanup: cleanupChartData,
  eventTimingMetrics: agentEventTimingMetrics,
} = useAgentChartData(props.agentName);

let renderer: ReturnType<typeof createChartRenderer> | null = null;
let resizeObserver: ResizeObserver | null = null;
let animationFrame: number | null = null;
const processedEventIds = new Set<string>();

const { getHexColorForApp, getHexColorForSession } = useEventColors();

const hasData = computed(() => dataPoints.value.some(dp => dp.count > 0));

const totalEventCount = computed(() => {
  return dataPoints.value.reduce((sum, dp) => sum + dp.count, 0);
});

const toolCallCount = computed(() => {
  return dataPoints.value.reduce((sum, dp) => sum + (dp.eventTypes?.['PreToolUse'] || 0), 0);
});

const chartAriaLabel = computed(() => {
  return `Activity chart for ${appName.value} (${sessionId.value}) — ${totalEventCount.value} events`;
});

const tooltip = ref({ visible: false, x: 0, y: 0, text: '' });

const getActiveConfig = (): ChartConfig => {
  return {
    maxDataPoints: 60,
    animationDuration: 200,
    barWidth: 3,
    barGap: 1,
    colors: {
      primary: cssVar('--accent', '#00aeef'),
      glow: cssVar('--accent', '#00aeef'),
      axis: cssVar('--border', '#1f1f1f'),
      text: cssVar('--text-tertiary', '#64748b'),
    },
  };
};

const getDimensions = (): ChartDimensions => {
  const width = chartContainer.value?.offsetWidth || 800;
  return {
    width,
    height: chartHeight,
    padding: {
      top: 4,
      right: 4,
      bottom: 12,
      left: 4,
    },
  };
};

const render = () => {
  if (!renderer || !canvas.value) return;
  const data = getChartData();
  const maxValue = Math.max(...data.map(d => d.count), 1);
  renderer.clear();
  renderer.drawBackground();
  renderer.drawAxes();
  renderer.drawTimeLabels(props.timeRange);
  renderer.drawBars(data, maxValue, 1, undefined, getHexColorForSession);
};

const animateNewEvent = (x: number, y: number) => {
  let radius = 0;
  let opacity = 0.8;

  const animate = () => {
    if (!renderer) return;
    render();
    renderer.drawPulseEffect(x, y, radius, opacity);
    radius += 2;
    opacity -= 0.02;
    if (opacity > 0) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      animationFrame = null;
    }
  };

  animate();
};

const handleResize = () => {
  if (!renderer || !canvas.value) return;
  const dimensions = getDimensions();
  renderer.resize(dimensions);
  render();
};

const processNewEvents = () => {
  const currentEvents = props.events;
  const newEventsToProcess: HookEvent[] = [];

  currentEvents.forEach(event => {
    const eventKey = `${event.id}-${event.timestamp}`;
    if (!processedEventIds.has(eventKey)) {
      processedEventIds.add(eventKey);
      newEventsToProcess.push(event);
    }
  });

  const targetApp = appName.value;
  const targetSession = sessionId.value;

  newEventsToProcess.forEach(event => {
    if (
      event.hook_event_type !== 'refresh' &&
      event.hook_event_type !== 'initial' &&
      event.source_app === targetApp &&
      event.session_id.slice(0, 8) === targetSession
    ) {
      addEvent(event);

      if (renderer && canvas.value) {
        const chartArea = getDimensions();
        const x = chartArea.width - chartArea.padding.right - 10;
        const y = chartArea.height / 2;
        animateNewEvent(x, y);
      }
    }
  });

  const currentEventIds = new Set(currentEvents.map(e => `${e.id}-${e.timestamp}`));
  processedEventIds.forEach(id => {
    if (!currentEventIds.has(id)) processedEventIds.delete(id);
  });

  render();
};

watch(() => props.events, processNewEvents, { deep: true, immediate: true });

watch(() => props.timeRange, (newRange) => {
  setTimeRange(newRange);
  render();
}, { immediate: true });

const handleMouseMove = (event: MouseEvent) => {
  if (!canvas.value || !chartContainer.value) return;

  const rect = canvas.value.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const data = getChartData();
  const dimensions = getDimensions();
  const chartArea = {
    x: dimensions.padding.left,
    y: dimensions.padding.top,
    width: dimensions.width - dimensions.padding.left - dimensions.padding.right,
    height: dimensions.height - dimensions.padding.top - dimensions.padding.bottom,
  };

  const barWidth = chartArea.width / data.length;
  const barIndex = Math.floor((x - chartArea.x) / barWidth);

  if (barIndex >= 0 && barIndex < data.length && y >= chartArea.y && y <= chartArea.y + chartArea.height) {
    const point = data[barIndex];
    if (point.count > 0) {
      const eventTypesText = Object.entries(point.eventTypes || {})
        .map(([type, count]) => `${type}:${count}`)
        .join(' ');

      tooltip.value = {
        visible: true,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top - 28,
        text: `${point.count}${eventTypesText ? ` (${eventTypesText})` : ''}`,
      };
      return;
    }
  }

  tooltip.value.visible = false;
};

const handleMouseLeave = () => {
  tooltip.value.visible = false;
};

onMounted(() => {
  if (!canvas.value || !chartContainer.value) return;

  const dimensions = getDimensions();
  const config = getActiveConfig();

  renderer = createChartRenderer(canvas.value, dimensions, config);

  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(chartContainer.value);

  // Initial paint. After this the canvas is event-driven only — every
  // render is triggered by a watcher (props.events / timeRange) or the
  // per-event pulse animation. See punch list #3 + #7 — the previous
  // 30-FPS rAF loop kept the chart redrawing forever even on an idle
  // dashboard.
  render();
});

onUnmounted(() => {
  cleanupChartData();
  if (renderer) renderer.stopAnimation();
  if (resizeObserver && chartContainer.value) resizeObserver.disconnect();
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
});
</script>
