<script lang="ts" setup>
import { computed, ref } from 'vue';
import { formatTime, useGlobalTime } from '../util/time';
import type { TimerSettings } from './Timer.vue';
import { buildTimetable } from '../util/timeline';
import { useElementBounding } from '@vueuse/core';
import { throttle } from 'lodash';

const props = defineProps<{
  config?: TimerSettings[];
}>();

const { globalTime, getColor } = useGlobalTime();

const emit = defineEmits<{
  (e: 'scrub', time: number): void;
}>();

const timetable = computed(() => {
  if (!props.config || props.config.length === 0) return [];
  return props.config.map((timer) => {
    return {
      settings: timer,
      timetable: buildTimetable(timer)
    }
  });
});

const totalDuration = computed(() => {
  return Math.max(...timetable.value.map(line => line.timetable.totalDuration));
});

const incrementsNum = 5;
const increments = computed(() => {
  const total = totalDuration.value;
  return Array.from({ length: incrementsNum }, (_, i) => ({
    time: (i / incrementsNum) * total,
    label: formatTime(((i * 1000) / (incrementsNum - 1)) * total),
  }));
});

const rootRef = ref<HTMLElement | null>(null);
const { left, width } = useElementBounding(rootRef);

function scrub(posX: number) {
  if (!rootRef.value) return;
  const rect = rootRef.value.getBoundingClientRect();
  const x = posX - rect.left; // Get mouse position relative to the element
  const time = (x / width.value) * totalDuration.value * 1000; // Convert to milliseconds
  emit('scrub', time);
}

const scrubbing = ref<number | null>();
function handlePointerDown(e: PointerEvent) {
  if (e.button !== 0) return; // Only handle left mouse button
  scrubbing.value = e.clientX - left.value; // Store initial position for scrubbing
  scrub(e.clientX);
  document.body.style.cursor = 'ew-resize'; // Change cursor to indicate scrubbing
  document.body.style.userSelect = 'none'; // Prevent text selection
  document.addEventListener('pointermove', throttle(handlePointerMove, 30), { passive: true });
  document.addEventListener('pointerup', () => {
    document.removeEventListener('pointermove', handlePointerMove);
    document.body.style.cursor = ''; // Reset cursor
    document.body.style.userSelect = ''; // Reset user select
    scrubbing.value = null;
  }, { once: true });
}

function handlePointerMove(e: PointerEvent) {
  if (e.buttons === 0) return; // Only scrub when the button is pressed
  scrubbing.value = e.clientX - left.value; // Update scrubbing position
  scrub(e.clientX);
}

</script>

<template>
  <div @pointerdown="handlePointerDown" ref="rootRef" class="timeline relative cursor-ew-resize">
    <div class="line absolute inset-y-1 w-full" v-for="(line, i) of timetable" :key="i">
      <div class="absolute bottom-0 border-t-2 border-l-2 border-r-2" v-for="(phase, j) of line.timetable.phases"
        :key="j" :style="{
          borderColor: getColor(line.settings),
          width: `${phase.duration / totalDuration * 100}%`,
          height: phase.state === 'on' ? '100%' : '0%',
          left: `${(phase.timestamp) / totalDuration * 100}%`,
          transform: `translateY(-${i * 2}px)`,
        }" />
    </div>
    <div class="scrubber absolute w-[2px] h-full bg-white" :class="{
      'transition-transform': scrubbing === null,
    }" :style="{
      transform: `translateX(${Math.max(0,Math.min(width, scrubbing ?? globalTime / (totalDuration * 1000) * width))}px)`,
    }" />
    <div class="scale absolute -inset-4 flex justify-between items-end-safe">
      <div v-for="(increment, i) of increments" :key="i">
        <span class="text-xs">
          {{ increment.label }}
        </span>
      </div>
    </div>
  </div>
</template>