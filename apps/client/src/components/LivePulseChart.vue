<template>
  <div
    class="border-b border-[var(--border)] bg-[var(--background)] px-3 py-1"
  >
    <!-- Inline metrics + time range row -->
    <div class="flex items-center justify-between gap-3 text-[11px]">
      <div class="flex items-center gap-3 font-mono text-[var(--text-secondary)]">
        <span class="flex items-center gap-1">
          <span class="text-[var(--text-primary)] tabular-nums">{{ uniqueAgentCount }}</span>
          <span class="text-[var(--text-tertiary)]">active</span>
        </span>
        <span class="flex items-center gap-1">
          <span class="text-[var(--text-primary)] tabular-nums">{{ totalEventCount }}</span>
          <span class="text-[var(--text-tertiary)]">events</span>
        </span>
        <span class="flex items-center gap-1">
          <span class="text-[var(--text-primary)] tabular-nums">{{ toolCallCount }}</span>
          <span class="text-[var(--text-tertiary)]">tools</span>
        </span>
        <span class="flex items-center gap-1">
          <span class="text-[var(--text-tertiary)]">avg</span>
          <span class="text-[var(--text-primary)] tabular-nums">{{ formatGap(eventTimingMetrics.avgGap) }}</span>
        </span>
      </div>

      <div class="flex items-center gap-0.5" role="tablist" aria-label="Time range">
        <button
          v-for="(range, index) in timeRanges"
          :key="range"
          type="button"
          @click="setTimeRange(range)"
          @keydown="handleTimeRangeKeyDown($event, index)"
          :class="[
            'inline-flex h-5 min-w-[28px] items-center justify-center rounded px-1.5 font-mono text-[11px] transition-colors duration-150',
            timeRange === range
              ? 'bg-[var(--surface)] text-[var(--text-primary)]'
              : 'text-[var(--text-tertiary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
          ]"
          role="tab"
          :aria-selected="timeRange === range"
          :tabindex="timeRange === range ? 0 : -1"
          :aria-label="`Show ${range}`"
        >
          {{ range }}
        </button>
      </div>
    </div>

    <!-- 64px sparkline strip -->
    <div ref="chartContainer" class="relative mt-1">
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
        <span class="font-mono text-[11px] text-[var(--text-tertiary)]">waiting for events...</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import type { HookEvent, TimeRange, ChartConfig } from '../types';
import { useChartData } from '../composables/useChartData';
import { createChartRenderer, type ChartDimensions } from '../utils/chartRenderer';
import { useEventColors } from '../composables/useEventColors';
import { cssVar } from '../utils/cssVar';

const props = defineProps<{
  events: HookEvent[];
  filters: {
    sourceApp: string;
    sessionId: string;
    eventType: string;
  };
}>();

const emit = defineEmits<{
  updateUniqueApps: [appNames: string[]];
  updateAllApps: [appNames: string[]];
  updateTimeRange: [timeRange: TimeRange];
}>();

const canvas = ref<HTMLCanvasElement>();
const chartContainer = ref<HTMLDivElement>();
const chartHeight = 64;

// 3-button compact set per the brief.
const timeRanges: TimeRange[] = ['1m', '5m', '15m'];

const {
  timeRange,
  dataPoints,
  addEvent,
  getChartData,
  setTimeRange,
  cleanup: cleanupChartData,
  clearData,
  uniqueAgentCount,
  uniqueAgentIdsInWindow,
  allUniqueAgentIds,
  toolCallCount,
  eventTimingMetrics,
} = useChartData();

const formatGap = (gapMs: number): string => {
  if (gapMs === 0) return '—';
  if (gapMs < 1000) return `${Math.round(gapMs)}ms`;
  return `${(gapMs / 1000).toFixed(1)}s`;
};

watch(uniqueAgentIdsInWindow, (agentIds) => {
  emit('updateUniqueApps', agentIds);
}, { immediate: true });

watch(allUniqueAgentIds, (agentIds) => {
  emit('updateAllApps', agentIds);
}, { immediate: true });

watch(timeRange, (range) => {
  emit('updateTimeRange', range);
}, { immediate: true });

let renderer: ReturnType<typeof createChartRenderer> | null = null;
let resizeObserver: ResizeObserver | null = null;
let animationFrame: number | null = null;
const processedEventIds = new Set<string>();

const { getHexColorForSession } = useEventColors();

const hasData = computed(() => dataPoints.value.some(dp => dp.count > 0));

const totalEventCount = computed(() => {
  return dataPoints.value.reduce((sum, dp) => sum + dp.count, 0);
});

const chartAriaLabel = computed(() => {
  return `Activity chart showing ${totalEventCount.value} events over the last ${timeRange.value}`;
});

const tooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  text: '',
});

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
      bottom: 14,
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
  renderer.drawTimeLabels(timeRange.value);
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

const isEventFiltered = (event: HookEvent): boolean => {
  if (props.filters.sourceApp && event.source_app !== props.filters.sourceApp) return false;
  if (props.filters.sessionId && event.session_id !== props.filters.sessionId) return false;
  if (props.filters.eventType && event.hook_event_type !== props.filters.eventType) return false;
  return true;
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

  newEventsToProcess.forEach(event => {
    if (event.hook_event_type !== 'refresh' && event.hook_event_type !== 'initial' && isEventFiltered(event)) {
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

watch(() => props.events, (newEvents) => {
  if (newEvents.length === 0) {
    clearData();
    processedEventIds.clear();
    render();
    return;
  }
  processNewEvents();
}, { deep: true });

watch(() => props.filters, () => {
  dataPoints.value = [];
  processedEventIds.clear();
  processNewEvents();
}, { deep: true });

watch(timeRange, () => {
  render();
});

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

const handleTimeRangeKeyDown = (event: KeyboardEvent, currentIndex: number) => {
  let newIndex = currentIndex;

  switch (event.key) {
    case 'ArrowLeft': newIndex = Math.max(0, currentIndex - 1); break;
    case 'ArrowRight': newIndex = Math.min(timeRanges.length - 1, currentIndex + 1); break;
    case 'Home': newIndex = 0; break;
    case 'End': newIndex = timeRanges.length - 1; break;
    default: return;
  }

  if (newIndex !== currentIndex) {
    event.preventDefault();
    setTimeRange(timeRanges[newIndex]);
    const buttons = (event.currentTarget as HTMLElement)?.parentElement?.querySelectorAll('button');
    if (buttons && buttons[newIndex]) {
      (buttons[newIndex] as HTMLButtonElement).focus();
    }
  }
};

onMounted(() => {
  if (!canvas.value || !chartContainer.value) return;

  const dimensions = getDimensions();
  const config = getActiveConfig();

  renderer = createChartRenderer(canvas.value, dimensions, config);

  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(chartContainer.value);

  // Initial paint. After this the canvas is event-driven only — every
  // render is triggered by a watcher (props.events / filters / timeRange)
  // or the per-event pulse animation. The previous 30-FPS rAF loop kept
  // the chart redrawing forever even on an idle dashboard; on a 24/7
  // monitor that's ~108k frames/hour of pure waste. See punch list #3 + #7.
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
