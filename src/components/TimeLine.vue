<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useGlobalTime } from '../util/time';
import type { TimerSettings } from './Timer.vue';
import { buildTimetable } from '../util/timeline';
import { useElementBounding } from '@vueuse/core';

const props = defineProps<{
  config?: TimerSettings[];
}>();

const { globalTime, getColor } = useGlobalTime();

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

const rootRef = ref<HTMLElement | null>(null);
const { width } = useElementBounding(rootRef);

</script>

<template>
  <div ref="rootRef" class="timeline relative pointer-events-none">
    <div class="line absolute inset-y-1 w-full" v-for="(line, i) of timetable" :key="i">
      <div class="absolute bottom-0 border-t-2 border-l-2 border-r-2" v-for="(phase, j) of line.timetable.phases"
        :key="j" :style="{
          borderColor: getColor(line.settings),
          width: `${phase.duration / totalDuration * 100}%`,
          height: phase.state === 'on' ? '100%' : '0%',
          left: `${(phase.timestamp) / totalDuration * 100}%`,
          transform: `translateY(${i * 2}px)`,
        }" />
    </div>
    <div class="scrubber absolute w-[2px] h-full bg-white transition-transform" :style="{
      transform: `translateX(${(globalTime / 1000) / totalDuration * width}px)`,
    }" />
  </div>
</template>