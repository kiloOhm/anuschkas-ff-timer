<script lang="ts" setup>
import { useThemeVars } from 'naive-ui';
import { computed, ref, watch } from 'vue';

import { formatTime, presetColors, useGlobalTime } from '../util/time';
import { cueKeys, useSound, type CueKey, type VoiceKey } from '../util/sound';

import { buildTimetable, getRuntimeStatus } from '../util/timeline';

export type TimerSettings = {
  name: string;
  offset: number;   // sec
  onTime: number;   // sec
  offTime: number;  // sec
  rounds: number;   // work / rest cycles
  voice?: VoiceKey;
  color?: string;
};

const settings = defineModel<TimerSettings>('settings', {
  type: Object as () => TimerSettings,
  required: true,
});

const themeVars = useThemeVars();
const { globalTime, globalTimeTicking, isLeadTimer, getColor } = useGlobalTime();
const { play, beep } = useSound();

async function cue(phrase: CueKey, force = false) {
  if (!globalTimeTicking.value && !force) return;
  if (settings.value.voice) {
    await play(settings.value.voice, phrase);
  } else {
    switch (phrase) {
      case 'Lift':
        await beep(1000, 600);
        break;
      case 'Rest':
        await beep(1000, 180);
        await beep(1000, 180);
        break;
      case '3':
        beep(700, 180)
        break;
      case '2':
        beep(700, 180)
        break;
      case '1':
        beep(700, 180);
        break;
      default:
        console.warn(`Unknown cue phrase: ${phrase}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 1️⃣  Build a static timetable every time the user tweaks settings   */
/* ------------------------------------------------------------------ */
const timetable = computed(() =>
  buildTimetable(settings.value),
);

/* ------------------------------------------------------------------ */
/* 2️⃣  At every clock tick ask “where are we now?”                    */
/* ------------------------------------------------------------------ */
const state = computed(() => {
  const t = Math.floor(globalTime.value / 1000); // sec since 0
  return getRuntimeStatus(timetable.value, t);
});

/* ------------------------------------------------------------------ */
/* 3️⃣  SIDE-EFFECTS: voice cues & UI commands                         */
/* ------------------------------------------------------------------ */
const command = ref<string | null>(null);

/* Lift! / Rest! ---------------------------------------------------- */
watch(state, async (n, o) => {
  command.value = n.state === 'on' ? 'Lift!' : 'Rest!';
  if (n.state === 'on' && o?.state === 'off') {
    cue('Lift')
  } else if (n.state === 'off' && o?.state === 'on') {
    cue('Rest');
  }
}, { immediate: true });

/* 3-2-1 countdown -------------------------------------------------- */
watch(() => state.value.remainingSeconds, sec => {
  if (state.value.state === 'off' && [3, 2, 1].includes(sec)) {
    cue(String(sec) as CueKey);
  }
});

const formattedTimeInPhase = computed(() => formatTime(state.value.timeInPhase * 1000));

const showSettings = ref(false);

</script>

<template>
  <n-card hoverable class="box-border border-2!" :style="{
    borderColor: getColor(settings),
  }">
    <div @click="showSettings = !showSettings" class="cursor-pointer Timer flex justify-between flex-wrap gap-8">
      <div class="flex items-center flex-wrap gap-8 text-9xl font-extrabold">
        <span class="border-4 px-4 font-mono" :style="{
          borderColor: themeVars.textColor1,
          borderRadius: themeVars.borderRadius
        }">{{ state.currentRound }}</span>
        <span class="block font-mono" :style="{
          color: state.state === 'on' ? themeVars.successColor : themeVars.errorColor,
        }">
          {{ formattedTimeInPhase }}
        </span>
      </div>
      <div class="flex flex-col justify-between">
        <h2 class="text-4xl font-bold text-end">
          {{ settings.name }}
        </h2>
        <div class="flex-grow" />
        <span class="text-6xl font-extrabold py-2 px-8" :style="{
          backgroundColor: themeVars.textColor1,
          color: themeVars.baseColor,
          borderRadius: themeVars.borderRadius,
        }">
          {{ command }}
        </span>
      </div>
    </div>
    <n-collapse-transition v-if="isLeadTimer" :show="showSettings">
      <n-divider />
      <div class="flex gap-4">
        <n-form class="flex-1">
          <n-form-item label="Name">
            <n-input v-model:value="settings.name" placeholder="Timer Name" />
          </n-form-item>
          <div class="flex gap-4 flex-wrap">
            <n-form-item label="Rounds">
              <n-input-number class="w-20" v-model:value="settings.rounds" :min="1" :step="1"
                placeholder="Number of rounds" />
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
          <n-form-item label="Color">
            <n-color-picker :value="settings.color ?? getColor(settings)" @update:value="(v) => settings.color = v"
              :swatches="presetColors" />
          </n-form-item>
        </n-form>
        <div class="flex-1 flex flex-col gap-2">
          <div class="flex items-center gap-4">
            <span class="text-xl">Cues:</span>
            <n-switch :value="settings.voice !== undefined"
              @update:value="(v) => v ? settings.voice = 'F1' : settings.voice = undefined">
              <template #checked>
                Voice
              </template>
              <template #unchecked>
                Beep
              </template>
            </n-switch>
          </div>
          <voice-picker v-if="settings.voice" v-model:chosen-voice="settings.voice" />
          <div v-else class="flex items-center gap-2">
            <n-button v-for="cueKey in cueKeys" :key="cueKey" size="small" ghost @click="cue(cueKey, true)">
              {{ cueKey }}
            </n-button>
          </div>
        </div>
      </div>
    </n-collapse-transition>
  </n-card>
</template>