<script setup lang="ts">
import { useMessage, useThemeVars } from 'naive-ui'
import { useLocalStorage } from '@vueuse/core';
import { generateDefaultConfig, useGlobalTime } from '../util/time';
import { generateAudio } from '../util/audioGenerator';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { provideRealtime } from '../util/realtime';
import { useRoute } from 'vue-router';
import { useSound } from '../util/sound';

const route = useRoute();
const sessionIdOverride = route.params.sessionid as string;

const rtc = provideRealtime({
  sessionId: sessionIdOverride
});
const { mode, takeover, sessionId, offlineMode } = rtc;

const dark = useLocalStorage<boolean>("darkmode", false);
const toggleTheme = () => {
  dark.value = !dark.value;
};

const themeVars = useThemeVars();

const { toggle, reset, isLeadTimer, timers, formattedTime, globalTimeTicking, setGlobalTime } = useGlobalTime(rtc);

function removeTimer(id: string) {
  const index = timers.value.findIndex(timer => timer.id === id);
  if (index !== -1) {
    timers.value.splice(index, 1);
  }
}
function addTimer() {
  timers.value.push(generateDefaultConfig()[0]);
}

function restoreDefaultConfig() {
  timers.value = generateDefaultConfig();
}

const encodingProgress = ref<number>(0);
watch(encodingProgress, (p) => {
  console.log("Encoding progress:", p);
})
const generatingAudio = ref(false);
function generateAudioFile() {
  if (generatingAudio.value) return;
  generatingAudio.value = true;
  encodingProgress.value = 0;
  generateAudio(timers.value.map((k) => k.settings), (progress) => encodingProgress.value = Math.ceil(progress * 100)).then(() => {
    generatingAudio.value = false;
  }).catch((error) => {
    generatingAudio.value = false;
    console.error("Error generating audio file:", error);
    alert("Failed to generate audio file.");
  })
}

const message = useMessage();

function copyToClipboard(str: string) {
  navigator.clipboard.writeText(str).then(() => {
    message.success("Copied to clipboard: " + str);
  }).catch((error) => {
    console.error("Failed to copy to clipboard:", error);
  });
}

const remoteUrl = computed(() => `${location.origin}/remote/${sessionId.value}`);
const followerUrl = computed(() => `${location.origin}/${sessionId.value}`);

const { soundLocked } = useSound();

const showButtons = ref(false);

function isInputFocused() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function handleKeyDown(event: KeyboardEvent) {
  if (isInputFocused()) return;
  if (event.key === 'Control') {
    showButtons.value = true;
  }
}
function handleKeyUp(event: KeyboardEvent) {
  if (isInputFocused()) return;
  if (event.key === 'Control') {
    showButtons.value = false;
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('keyup', handleKeyUp);
});
</script>

<template>

  <div class="h-screen w-screen overflow-x-hidden">
    <header class="relative!">
      <n-card class="rounded-none! border-t-0! border-l-0! border-r-0!">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-4">
            <div @click="isLeadTimer ? toggle() : undefined" class="flex items-center cursor-pointer">
              <n-icon size="3em" :color="globalTimeTicking ? themeVars.successColor : themeVars.errorColor">
                <i-iconoir-play-solid v-if="globalTimeTicking" />
                <i-iconoir-pause-solid v-else />
              </n-icon>
              <span class="text-xl font-bold font-mono">{{ formattedTime }}</span>
            </div>
            <n-button @click="isLeadTimer && reset()" ghost round
              class="relative! hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block"
              :class="{ 'opacity-0': !showButtons || !isLeadTimer, 'pointer-events-none': !isLeadTimer }">
              <span>RESET</span>
            </n-button>
          </div>
          <TimeLine :config="timers.map(t => t.settings)" @scrub="(t) => setGlobalTime(t)"
            class="flex-grow self-stretch" />
          <n-button @click="toggleTheme" ghost circle
            class="relative! hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block"
            :class="{ 'opacity-0': !showButtons }">
            <template #icon>
              <n-icon>
                <i-iconoir-half-moon v-if="dark" />
                <i-iconoir-sun-light v-else />
              </n-icon>
            </template>
          </n-button>
          <div
            class="fixed! inset-0 z-50 w-full h-full grid place-content-center backdrop-brightness-75 backdrop-blur-sm transition-opacity cursor-pointer opacity-0"
            :class="{
              'opacity-100': soundLocked,
              'pointer-events-none': !soundLocked
            }">
            <n-icon size="20em">
              <i-iconoir-sound-off />
            </n-icon>
            <span class="text-4xl font-bold text-white">Click to enable sound</span>
          </div>
        </div>
      </n-card>
    </header>
    <div class="flex flex-col items-stretch py-8 px-12 gap-4">
      <div v-for="({ id }, i) in timers" :key="id" class="relative flex items-center gap-4">
        <Timer class="flex-grow" v-model:settings="timers[i].settings" />
        <n-button v-if="isLeadTimer" size="small" @click="removeTimer(id)" ghost circle
          class="absolute! top-0 -right-10 h-full! hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block"
          :class="{ 'opacity-0': !showButtons }">
          <template #icon>
            <n-icon>
              <i-iconoir-minus />
            </n-icon>
          </template>
        </n-button>
      </div>
      <n-button v-if="isLeadTimer" @click="addTimer()" ghost circle
        class="w-full! relative! hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block"
        :class="{ 'opacity-0': !showButtons }">
        <template #icon>
          <n-icon>
            <i-iconoir-plus />
          </n-icon>
        </template>
      </n-button>
    </div>
  </div>
  <n-button v-if="isLeadTimer" @click="generateAudioFile" :loading="generatingAudio" ghost round
    class="fixed! bottom-4 left-4 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block"
    :class="{ 'opacity-0': !generatingAudio && !showButtons }">
    <template #icon>
      <n-icon>
        <i-iconoir-download />
      </n-icon>
    </template>
    <span>Generate mp3</span>
  </n-button>
  <n-button v-if="isLeadTimer" @click="restoreDefaultConfig" ghost round
    class="fixed! bottom-4 left-1/2 -translate-x-1/2 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block"
    :class="{ 'opacity-0': !showButtons }">
    <span>Restore default config</span>
  </n-button>
  <n-popover v-if="sessionId" trigger="click">
    <template #trigger>
      <n-button ghost round
        class="fixed! bottom-4 right-4 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block"
        :class="{ 'opacity-0': !showButtons }">
        <template #icon>
          <n-icon>
            <i-iconoir-cloud-sync />
          </n-icon>
        </template>
        <span>Sync</span>
      </n-button>
    </template>
    <div class="flex flex-col gap-2">
      <n-switch :value="!offlineMode" @update:value="(v) => offlineMode = !v">
        <template #checked>
          online
        </template>
        <template #unchecked>
          offline
        </template>
      </n-switch>
      <h3 class="text-lg font-semibold text-center">Session: {{ sessionId }}</h3>
      <n-button ghost round @click="takeover" v-if="mode === 'followtimer'">
        <span>take lead</span>
      </n-button>
      <QR :value="remoteUrl" :sizePx="200" />
      <div class="flex justify-evenly gap-2">
        <n-button quaternary round size="small" @click="copyToClipboard(remoteUrl)">
          <span>copy remote url</span>
        </n-button>
        <n-button quaternary round size="small" @click="copyToClipboard(followerUrl)">
          <span>copy follower url</span>
        </n-button>
      </div>
    </div>
  </n-popover>
  <Sync />
</template>

<style scoped>
:deep(.n-card__content) {
  padding: 1em !important;
}
</style>
