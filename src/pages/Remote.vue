<script lang="ts" setup>
    import { useRoute } from "vue-router";
    import { useRealtime } from "../util/realtime";
    import { useGlobalTime } from "../util/time";
    import { nextTick, watch } from "vue";

    const route = useRoute();
    const sessionId = route.params.sessionid as string;

    const { connectedToPubSub, setMode } = useRealtime(sessionId);
    const connectionWatcher = watch(connectedToPubSub, (connected) => {
        if (connected) {
        setMode("remote");
        nextTick(() => {
            connectionWatcher.stop();
        })
        }
    }, { immediate: true });

    const { toggle, reset, injectGlobalTimeRefs } = useGlobalTime();
    const { formattedTime, ticking } = injectGlobalTimeRefs();
</script>

<template>
    <div class="Remote h-screen w-screen relative! bg-black text-white grid place-content-center gap-24">
        <div class="absolute top-4 right-4 rounded-full w-4 h-4" :style="{
            backgroundColor: connectedToPubSub ? 'green' : 'red',
        }" />
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