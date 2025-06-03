<script lang="ts" setup>
import { computed } from 'vue';
import { useRealtimeClient } from '../util/realtime';

const { connected, mode, hasLead, negotiating, aloneInSession, offlineMode, fetchingToken } = useRealtimeClient();

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
  <div v-if="!offlineMode" class="Sync z-10 fixed bottom-0 right-0 flex gap-0.5">
    <n-tooltip>
      <template #trigger>
        <div class="connected h-1 w-4" :class="{
          blinking: fetchingToken,
        }" :style="{
          backgroundColor: connectedColor
        }" />
      </template>
      <p>Connected: {{ connected }}</p>
    </n-tooltip>
    <n-tooltip>
      <template #trigger>
        <div class="mode h-1 w-4" :class="{
          blinking: negotiating,
        }" :style="{
          backgroundColor: modeColor,
        }" />
      </template>
      <p>Mode: {{ mode }}, negotiating: {{ negotiating }}</p>
    </n-tooltip>
    <n-tooltip v-if="mode === 'remote'">
      <template #trigger>
        <div class="hasLead h-1 w-4 " :style="{
          backgroundColor: hasLeadColor,
        }" />
      </template>
      <p>Has Lead: {{ hasLead }}</p>
    </n-tooltip>
    <n-tooltip v-else>
      <template #trigger>
        <div class="alone h-1 w-4" :style="{
          backgroundColor: aloneColor,
        }" />
      </template>
      <p>Alone in session: {{ aloneInSession }}</p>
    </n-tooltip>
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