<script lang="ts" setup>
    import { useRoute } from "vue-router";
    import { useRealtime } from "../util/realtime";
    import { useGlobalTime } from "../util/time";

    const route = useRoute();
    const sessionId = route.params.sessionid as string;

    const { } = useRealtime(sessionId, true);

    const { toggle, reset, injectGlobalTimeRefs } = useGlobalTime();
    const { formattedTime, ticking } = injectGlobalTimeRefs();
</script>

<template>
    <div class="Remote h-screen w-screen relative! bg-black text-white grid place-content-center gap-24">
            <div @click="toggle" class="w-[18ch] flex flex-col items-center cursor-pointer">
                <n-icon size="8em" :color="ticking ? 'green' : 'red'">
                    <i-iconoir-play-solid v-if="ticking"/>
                    <i-iconoir-pause-solid v-else/>
                </n-icon>
                <span class="text-4xl font-bold">{{ formattedTime }}</span>
            </div>
            <button @click="reset()" class="bg-white text-black rounded-full px-8 py-4 hover:bg-gray-200 transition-colors cursor-pointer">
                <span class="text-2xl font-bold">
                    RESET
                </span>
            </button>
    </div>
</template>