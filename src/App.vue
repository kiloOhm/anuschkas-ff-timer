<script lang="ts" setup>
import { onBeforeUnmount } from 'vue';
import { useRealtime } from './util/realtime';
import { darkTheme, lightTheme } from 'naive-ui'
import { useLocalStorage } from '@vueuse/core';

const dark = useLocalStorage<boolean>("darkmode", false);

const { unload } = useRealtime();

onBeforeUnmount(() => {
  unload();
});
</script>

<template>
  <n-config-provider preflight-style-disabled :theme="dark ? darkTheme : lightTheme">
    <n-message-provider placement="bottom">
      <RouterView />
      <Sync />
    </n-message-provider>
    <n-global-style />
  </n-config-provider>
</template>
