<script lang="ts" setup>
import { computed } from 'vue';
import { useRealtime } from '../util/realtime';
const { connectedToPubSub, clientMode } = useRealtime();

const connectedColor = computed(() => {
  return connectedToPubSub.value ? 'green' : 'red';
});
const clientModeColor = computed(() => {
  switch (clientMode.value) {
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
      backgroundColor: clientModeColor,
    }" />
  </div>
</template>