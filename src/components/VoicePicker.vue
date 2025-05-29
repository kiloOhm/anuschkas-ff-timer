<script lang="ts" setup>
  import { computed } from "vue";
import { useSound, voiceKeys, cueKeys, type VoiceKey } from "../util/sound"

  const { play } = useSound();

  const chosenVoice = defineModel<string>('chosenVoice', {
    default: voiceKeys[0],
    type: String,
  });

  const chunkSize = 4;
  const voiceChunks = computed(() => {
    const chunks: VoiceKey[][] = [];
    for (let i = 0; i < voiceKeys.length; i += chunkSize) {
      chunks.push(voiceKeys.slice(i, i + chunkSize));
    }
    return chunks;
  });
</script>

<template>
  <div class="VoicePicker max-w-max flex flex-wrap gap-4">
    <div v-for="(chunk, index) in voiceChunks" :key="index" class="flex flex-col gap-4 p-2">
        <div v-for="voice in chunk" :key="voice" class="flex items-center gap-1">
          <n-radio class="items-center!" :value="voice" :checked="chosenVoice === voice" @update:checked="chosenVoice = voice">
            <span class="text-lg font-semibold text-nowrap">
              {{ voice }}
            </span>
          </n-radio>
          <n-button ghost size="small" v-for="phrase in cueKeys" :key="phrase" @click="play(voice, phrase)">
            {{ phrase }}
          </n-button>
        </div>
    </div>
  </div>
</template>