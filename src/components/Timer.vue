<script lang="ts" setup>
  import { useThemeVars } from 'naive-ui';
  import { computed, effect, ref, watch } from 'vue';
  import { formatTime, useGlobalTime } from '../util/time';
  import { useSound, type CueKey, type VoiceKey } from '../util/sound';
  import { executeWithMinDuration } from '../util/js';

  export type TimerSettings = {
    name: string;
    offset: number; // in seconds
    onTime: number; // in seconds
    offTime: number; // in seconds
    rounds: number; // number of work/rest cycles
    voice: VoiceKey;
  }

  const themeVars = useThemeVars();

  const settings = defineModel<TimerSettings>('settings', {
    type: Object as () => TimerSettings,
    required: true,
  });

  const { injectGlobalTimeRefs } = useGlobalTime();
  const { time, ticking } = injectGlobalTimeRefs();

  const { play } = useSound()

  async function cue(phrase: CueKey) {
    if(!ticking.value) {
      return;
    }
    return await play(settings.value.voice, phrase);
  }

  const state = computed<{
    state: "on" | "off";
    timeInPhase: number;
    currentRound: number;
    remainingSeconds: number;
  }>(() => {
    const cycleTime = settings.value.onTime + settings.value.offTime;
    const totalTime = settings.value.offset + settings.value.rounds * cycleTime;

    if (time.value < settings.value.offset) {
      return {
        state: "off",
        timeInPhase: time.value,
        currentRound: 0,
        remainingSeconds: Math.ceil(settings.value.offset - time.value),
      };
    }

    if (time.value >= totalTime) {
      return {
        state: "off",
        timeInPhase: 0,
        currentRound: settings.value.rounds + 1,
        remainingSeconds: 0,
      };
    }

    const timeSinceOffset = time.value - settings.value.offset;
    const cycleIndex = Math.floor(timeSinceOffset / cycleTime); // 0-based
    const timeInCycle = timeSinceOffset % cycleTime;

    const isOn = timeInCycle < settings.value.onTime;
    const phaseDuration = isOn ? settings.value.onTime : settings.value.offTime;
    const timeInPhase = isOn ? timeInCycle : timeInCycle - settings.value.onTime;

    return {
      state: isOn ? "on" : "off",
      timeInPhase,
      currentRound: cycleIndex + 1,
      remainingSeconds: Math.ceil(phaseDuration - timeInPhase),
    };
  });

  watch(state, async (newState, oldState) => {
    if (newState.state === "on" && oldState?.state === "off") {
      command.value = "Lift!";
      await executeWithMinDuration(async () => {
        await cue("Lift");
      }, 2000)
    } else if (newState.state === "off" && oldState?.state === "on") {
      command.value = "Rest!";
      await executeWithMinDuration(async () => {
        await cue("Rest");
      }, 2000)
    }
  }, { immediate: true });

  watch(() => state.value.remainingSeconds, (v) => {
    if ([3, 2, 1].includes(v) && state.value.state === "off") {
      cue(String(v) as CueKey);
    }
  });

  const hours = computed(() => Math.floor(state.value.timeInPhase / 3600));
  const formattedTimeInPhase = computed(() => formatTime(state.value.timeInPhase));

  const showSettings = ref(false);
  const showCommand = ref(true);
  const command = ref<string | null>(null);
  effect(() => {
    if(time.value < settings.value.offset) {
      showCommand.value = false;
    } else {
      showCommand.value = true;
    }
  })
</script>

<template>
  <n-card hoverable>
    <div @click="showSettings = !showSettings" class=" cursor-pointer Timer flex justify-between gap-8">
      <div class="flex flex-col justify-between">
        <h2 class="text-4xl font-bold">
          {{ settings.name }}
        </h2>
        <div class="flex-grow"/>
        <span class="text-6xl font-extrabold transition-opacity py-2 px-8" :style="{
          opacity: showCommand ? 1 : 0,
          backgroundColor: themeVars.textColor1,
          color: themeVars.baseColor,
          borderRadius: themeVars.borderRadius,
        }">
          {{ command }}
        </span>
      </div>
      <div class="flex items-center gap-8 text-9xl font-extrabold">
        <span class="border-4 px-8 font-mono" :style="{
          borderColor: themeVars.textColor1,
          borderRadius: themeVars.borderRadius
        }">{{ state.currentRound }}</span>
        <span class="block" :style="{
          width: hours > 0 ? '8ch' : '5.5ch',
          color: state.state === 'on' ? themeVars.successColor : themeVars.errorColor,
        }">
          {{ formattedTimeInPhase }}
        </span>
      </div>
    </div>
    <n-collapse-transition :show="showSettings">
      <n-divider/>
      <div class="flex gap-4">
        <n-form class="flex-grow">
          <n-form-item label="Name">
            <n-input v-model:value="settings.name" placeholder="Timer Name" />
          </n-form-item>
          <div class="flex gap-4 flex-wrap">
            <n-form-item label="Rounds">
              <n-input-number class="w-20" v-model:value="settings.rounds" :min="1" :step="1" placeholder="Number of rounds" />
            </n-form-item>
            <n-form-item label="Offset">
              <time-picker v-model:seconds="settings.offset" />
            </n-form-item>
            <n-form-item label="On Time">
              <time-picker v-model:seconds="settings.onTime" />
            </n-form-item>
            <n-form-item label="Off-Time ">
              <time-picker v-model:seconds="settings.offTime" />
            </n-form-item>
          </div>
        </n-form>
        <div>
          <span class="ml-2 text-xl">Choose a voice:</span>
          <voice-picker v-model:chosen-voice="settings.voice" />
        </div>
      </div>
    </n-collapse-transition>
  </n-card>
</template>