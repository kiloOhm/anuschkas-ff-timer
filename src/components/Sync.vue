<script lang="ts" setup>
import { computed } from 'vue';
import { useRealtimeClient } from '../util/realtime';

const { connected, mode, hasLead, negotiating, aloneInSession, offlineMode } = useRealtimeClient();

const hasLeadColor = computed(() => {
  return hasLead.value ? 'green' : 'red';
});
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
const aloneColor = computed(() => {
  return aloneInSession.value ? 'yellow' : 'green';
});
</script>

<template>
  <div v-if="!offlineMode" class="Sync z-10 fixed bottom-0 right-0 flex">
    <div class="connected h-1 w-4" :style="{
      backgroundColor: connectedColor
    }" />
    <div class="mode h-1 w-4" :class="{
      blinking: negotiating,
    }" :style="{
      backgroundColor: modeColor,
    }" />
    <div v-if="mode === 'remote'" class="hasLead h-1 w-4 " :style="{
      backgroundColor: hasLeadColor,
    }" />
    <div v-else class="alone h-1 w-4" :style="{
      backgroundColor: aloneColor,
    }" />
  </div>
</template>

<style scoped>
/* blink animation */
.blinking {
  animation: blink 1s infinite;
}
@keyframes blink {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}
</style>