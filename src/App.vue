<script lang="ts" setup>
import { darkTheme, lightTheme } from 'naive-ui'
import { useLocalStorage } from '@vueuse/core';

const dark = useLocalStorage<boolean>("darkmode", false);

</script>

<template>
  <n-config-provider preflight-style-disabled :theme="dark ? darkTheme : lightTheme">
    <n-message-provider placement="bottom">
      <RouterView />
    </n-message-provider>
    <n-global-style />
  </n-config-provider>
</template>
