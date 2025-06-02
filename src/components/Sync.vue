<script lang="ts" setup>
import { computed } from 'vue';
import { useRealtimeClient } from '../util/realtime';
const { connected, mode } = useRealtimeClient();

const connectedColor = computed(() => {
  return connected.value ? 'green' : 'red';
});
const modeColor = computed(() => {
  switch (mode.value) {
    case 'followtimer':
      return 'yellow';
    case 'leadtimer':
      return 'green';
    case 'remote':
      return 'blue';
  }
});
</script>

<template>
  <div class="Sync z-10 fixed bottom-0 right-0 flex">
    <div class="connected h-1 w-4" :style="{
      backgroundColor: connectedColor
    }" />
    <div class="mode h-1 w-4 " :style="{
      backgroundColor: modeColor,
    }" />
  </div>
</template>