<script setup lang="ts">
  import { darkTheme, lightTheme, useThemeVars } from 'naive-ui'
  import { useLocalStorage } from '@vueuse/core';
  import type { TimerSettings } from './components/Timer.vue';
  import { useGlobalTime } from './util/time';
  import { generateAudio } from './util/audioGenerator';
import { effect, ref } from 'vue';

  const dark = useLocalStorage<boolean>("darkmode", false);
  const toggleTheme = () => {
    dark.value = !dark.value;
  };

  const themeVars = useThemeVars();

  type KeyedTimerSettings = { id: string, settings: TimerSettings };

  const timers = useLocalStorage<KeyedTimerSettings[]>("timers", [
    {
      id: crypto.randomUUID(),
      settings: {
        name: "Team 1",
        offset: 10,
        onTime: 20 * 60,
        offTime: 10 * 60,
        rounds: 4,
        voice: "M1",
      }
    },
    {
      id: crypto.randomUUID(),
      settings: {
        name: "Team 2",
        offset: 10 + (10 * 60),
        onTime: 20 * 60,
        offTime: 10 * 60,
        rounds: 4,
        voice: "F1",
      }
    },
  ]);

  const { injectGlobalTimeRefs, toggle, reset } = useGlobalTime();
  const { formattedTime, ticking } = injectGlobalTimeRefs();

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
  effect(()=> {
    console.log("Encoding progress:", encodingProgress.value);
  })
  const generatingAudio = ref(false);
  function generateAudioFile() {
    if (generatingAudio.value) return;
    generatingAudio.value = true;
    encodingProgress.value = 0;
    generateAudio(timers.value.map((k) => k.settings), (progress) => encodingProgress.value = Math.ceil(progress*100)).then(() => {
      generatingAudio.value = false;
    }).catch((error) => {
      generatingAudio.value = false;
      console.error("Error generating audio file:", error);
      alert("Failed to generate audio file.");
    })
  }

</script>

<template>
  <n-config-provider preflight-style-disabled :theme="dark ? darkTheme : lightTheme">
    <div class="relative! w-screen h-screen">
      <header>
        <n-card class="rounded-none! border-t-0! border-l-0! border-r-0!">
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <div @click="toggle" class="w-[16ch] flex items-center cursor-pointer">
                <n-icon size="3em" :color="ticking ? themeVars.successColor : themeVars.errorColor">
                  <i-iconoir-play-solid v-if="ticking"/>
                  <i-iconoir-pause-solid v-else/>
                </n-icon>
                <span class="text-xl font-bold">{{ formattedTime }}</span>
              </div>
              <n-button @click="reset" ghost round class="relative! opacity-0 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block">
                <span>RESET</span>
              </n-button>
            </div>
            <n-button @click="toggleTheme" ghost circle class="relative! opacity-0 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block">
              <template #icon>
                <n-icon>
                  <i-iconoir-half-moon v-if="dark"/>
                  <i-iconoir-sun-light v-else/>
                </n-icon>
              </template>
            </n-button>
          </div>
        </n-card>
      </header>
      <div class="flex flex-col items-stretch p-20 pt-12 gap-4">
        <div v-for="({ id }, i) in timers" :key="id" class="relative flex items-center gap-4">
          <Timer class="flex-grow" v-model:settings="timers[i].settings" />
            <n-button size="small" @click="removeTimer(id)" ghost circle class="absolute! top-4! right-4! opacity-0 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block">
              <template #icon>
                <n-icon>
                  <i-iconoir-minus />
                </n-icon>
              </template>
            </n-button>
        </div>
        <n-button @click="addTimer()" ghost circle class="w-full! relative! opacity-0 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block">
          <template #icon>
            <n-icon>
              <i-iconoir-plus />
            </n-icon>
          </template>
        </n-button>
      </div>
    </div>
  <n-global-style />
  <n-button @click="generateAudioFile" :loading="generatingAudio" ghost circle class="absolute! bottom-4 left-4 hover:opacity-100 transition-opacity before:absolute before:-inset-4 before:block" :class="{'opacity-0': !generatingAudio}">
    <template #icon>
      <n-icon>
        <i-iconoir-download/>
      </n-icon>
    </template>
  </n-button>
  </n-config-provider>
</template>
