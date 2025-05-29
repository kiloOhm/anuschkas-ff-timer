<script lang="ts" setup>
import { useThemeVars } from 'naive-ui';
import { computed } from 'vue';

const seconds = defineModel<number>('seconds', {
  type: Number,
  default: 0,
});

const hours = computed(() => Math.floor(seconds.value / 3600));
const minutes = computed(() => Math.floor((seconds.value % 3600) / 60));
const remainingSeconds = computed(() => seconds.value % 60);

function setHours(newHours: number) {
  seconds.value = newHours * 3600 + minutes.value * 60 + remainingSeconds.value;
}
function setMinutes(newMinutes: number) {
  seconds.value = hours.value * 3600 + newMinutes * 60 + remainingSeconds.value;
}
function setSeconds(newSeconds: number) {
  seconds.value = hours.value * 3600 + minutes.value * 60 + newSeconds;
}

const themeVars = useThemeVars();
</script>

<template>
  <div class="TimePicker flex items-center gap-1" :style="{
    backgroundColor: themeVars.inputColor
  }">
    <n-input-number
      v-model:value="hours"
      :min="0"
      :max="23"
      @update:value="(v) => setHours(v ?? 0)"
      class="w-8"
      :show-button="false"
      :format="(v) => v?.toString().padStart(2, '0') ?? '00'"
      />
      <span>:</span>
    <n-input-number
      v-model:value="minutes"
      :min="0"
      :max="59"
      @update:value="(v) => setMinutes(v ?? 0)"
      class="w-8"
      :show-button="false"
      :format="(v) => v?.toString().padStart(2, '0') ?? '00'"
      />
      <span>:</span>
    <n-input-number
      v-model:value="remainingSeconds"
      :min="0"
      :max="59"
      @update:value="(v) => setSeconds(v ?? 0)"
      class="w-8"
      :show-button="false"
      :format="(v) => v?.toString().padStart(2, '0') ?? '00'"
      />
  </div>
</template>

<style scoped>
:deep(.n-card__content) {
  padding: 0 !important;
}

:deep(.n-input) {
  background-color: transparent !important;
}

:deep(.n-input-wrapper) {
  padding-left: .5em !important;
  padding-right: .5em !important;
}
</style>