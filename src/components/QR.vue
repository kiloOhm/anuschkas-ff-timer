<script lang="ts" setup>
import { effect, ref, toRefs } from 'vue';
import QrCreator from 'qr-creator';
import { useThemeVars } from 'naive-ui';

const props = defineProps<{
  value: string;
  sizePx?: number; // Optional size prop, not used in this example
}>();
const { value, sizePx } = toRefs(props);

const elRef = ref<HTMLElement | null>(null);

const themeVars = useThemeVars();

effect(() => {
  if(value.value && elRef.value) {
    QrCreator.render({
      text: value.value,
      size: sizePx.value || 200,
      fill: 'black',
      background: null,
      ecLevel: 'L',
      radius: 0,
    }, elRef.value);
  }
})
</script>

<template>
  <div ref="elRef" class="qr-code p-4 bg-white grid place-content-center" :style="{
    borderRadius: themeVars.borderRadius,
  }"/>
</template>