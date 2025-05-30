<script setup lang="ts">
import { useMessage, useThemeVars } from 'naive-ui'
import { useLocalStorage } from '@vueuse/core';
import { useGlobalTime } from '../util/time';
import { generateAudio } from '../util/audioGenerator';
import { computed, ref, watch } from 'vue';
import { useRealtime } from '../util/realtime';
import { useRoute } from 'vue-router';
import { useSound } from '../util/sound';

const route = useRoute();
const sessionIdOverride = route.params.sessionid as string;

const dark = useLocalStorage<boolean>("darkmode", false);
const toggleTheme = () => {
  dark.value = !dark.value;
};

const themeVars = useThemeVars();

const { toggle, reset, isLeadTimer, timers, formattedTime, globalTimeTicking } = useGlobalTime();

function removeTimer(id: string) {
  const index = timers.value.findIndex(timer => timer.id === id);
  if (index !== -1) {
    timers.value.splice(index, 1);
  }
}
function addTimer() {
  timers.value.push({
    id: crypto.randomUUID(),
    settings: {
      name: `new Team`,
      offset: 10,
      onTime: 20 * 60,
      offTime: 10 * 60,
      rounds: 4,
      voice: "M1",
    }
  });
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

const { sessionId, connectedToPubSub, clientMode, takeover } = useRealtime(sessionIdOverride);

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
</script>

<template>

  <div class="relative! w-screen h-screen">
    <header>
      <n-card class="rounded-none! border-t-0! border-l-0! border-r-0!">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <div @click="isLeadTimer ? toggle() : undefined" class="w-[18ch] flex items-center cursor-pointer">
              <n-icon size="3em" :color="globalTimeTicking ? themeVars.successColor : themeVars.errorColor">
                <i-iconoir-play-solid v-if="globalTimeTicking" />
                <i-iconoir-pause-solid v-else />
              </n-icon>
              <span class="text-xl font-bold">{{ formattedTime }}</span>
            </div>
            <n-button @click="isLeadTimer ? reset() : undefined" ghost round
              class="relative! opacity-0 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block">
              <span>RESET</span>
            </n-button>
          </div>
          <n-icon size="3em" v-if="soundLocked">
            <i-iconoir-sound-off />
          </n-icon>
          <n-button @click="toggleTheme" ghost circle
            class="relative! opacity-0 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block">
            <template #icon>
              <n-icon>
                <i-iconoir-half-moon v-if="dark" />
                <i-iconoir-sun-light v-else />
              </n-icon>
            </template>
          </n-button>
        </div>
      </n-card>
    </header>
    <div class="flex flex-col items-stretch p-20 pt-12 gap-4">
      <div v-for="({ id }, i) in timers" :key="id" class="relative flex items-center gap-4">
        <Timer class="flex-grow" v-model:settings="timers[i].settings" />
        <n-button v-if="isLeadTimer" size="small" @click="removeTimer(id)" ghost circle
          class="absolute! top-4! right-4! opacity-0 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block">
          <template #icon>
            <n-icon>
              <i-iconoir-minus />
            </n-icon>
          </template>
        </n-button>
      </div>
      <n-button v-if="isLeadTimer" @click="addTimer()" ghost circle
        class="w-full! relative! opacity-0 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block">
        <template #icon>
          <n-icon>
            <i-iconoir-plus />
          </n-icon>
        </template>
      </n-button>
    </div>
  </div>
  <n-button v-if="isLeadTimer" @click="generateAudioFile" :loading="generatingAudio" ghost circle
    class="absolute! bottom-4 left-4 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block"
    :class="{ 'opacity-0': !generatingAudio }">
    <template #icon>
      <n-icon>
        <i-iconoir-download />
      </n-icon>
    </template>
  </n-button>
  <n-popover v-if="connectedToPubSub && sessionId" trigger="click">
    <template #trigger>
      <n-button ghost circle
        class="absolute! bottom-4 right-4 opacity-0 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block">
        <template #icon>
          <n-icon>
            <i-iconoir-cloud-sync />
          </n-icon>
        </template>
      </n-button>
    </template>
    <div class="flex flex-col gap-2">
      <h3 class="text-lg font-semibold text-center">Session: {{ sessionId }}</h3>
      <n-button ghost round @click="takeover" v-if="clientMode === 'followtimer'">
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
</template>
