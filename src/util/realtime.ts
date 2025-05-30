import { useLocalStorage } from "@vueuse/core";
import Ably from "ably";
import { computed, nextTick, ref, watch } from "vue";

export type SyncMsg = {
    ticking?: boolean;
    time?: number;
    timestamp?: number;
}

export type AppMode = 'timer' | 'remote';

const ablyAPIKey = "MZODpw.PK_zLw:zdg8NkO2yO45DZvlry08KuHfzpkLkFOYm2UrYkjoZDg";

const sessionId = useLocalStorage("sessionId", crypto.randomUUID());
const clientMode = ref<AppMode>();
const uid = crypto.randomUUID();
const clientId = computed(() => `${clientMode.value}:${uid}`);

const ably = new Ably.Realtime(ablyAPIKey);

const connectedToPubSub = ref(false);
ably.connection.once("connected", () => {
    connectedToPubSub.value = true;
})

let counter = 0;
const subs = new Map<number, (msg: SyncMsg) => void>();

let presenceCounter = 0;
const presenceEnterSubs = new Map<number, (mode: AppMode) => void>();

function subscribePresenceEnter(listener: (mode: AppMode) => void) {
    const id = presenceCounter++;
    presenceEnterSubs.set(id, listener);
    return () => {
        presenceEnterSubs.delete(id);
    };
}

const connectionWatcher = watch(connectedToPubSub, (connected) => {
    if (!connected) {
        return;
    }
    console.log("Connected to Ably Pub/Sub");
    const channel = ably.channels.get(sessionId.value);
    channel.subscribe("message", (msg) => {
        if (msg.clientId === clientId.value) {
            // Ignore messages sent by this client to avoid echoing
            return;
        }
        subs.forEach((listener) => {
            listener(msg.data as SyncMsg);
        });
    });
    channel.presence.subscribe("enter", (presenceMsg) => {
        if (presenceMsg.clientId === clientId.value) {
            // Ignore presence messages from this client
            return;
        }
        const mode = presenceMsg.data?.mode;
        console.log(`Remote client entered with mode: ${mode}`);
        presenceEnterSubs.forEach((listener) => {
            listener(mode);
        });
    })
    nextTick(() => {
        connectionWatcher.stop();
    });
}, { immediate: true });

export function subscribe(listener: (msg: SyncMsg) => void) {
    const id = counter++;
    subs.set(id, listener);
    return () => {
        subs.delete(id);
    };
}

export function publish(msg: SyncMsg) {
    if (!connectedToPubSub.value) {
        console.warn("Not connected to Ably Pub/Sub, cannot publish message");
        return;
    }
    const channel = ably.channels.get(sessionId.value);
    channel.publish("message", msg);
}

function setMode(mode: 'timer' | 'remote') {
    if (clientMode.value === mode) {
        return;
    }
    clientMode.value = mode;
    console.log(`Client mode set to: ${mode}`);
    const channel = ably.channels.get(sessionId.value);
    channel.presence.enterClient(clientId.value, { mode });
    console.log(`Entered presence with mode: ${mode}`);
}

export function useRealtime(sessionIdOverride?: string) {
    if (sessionIdOverride) {
        sessionId.value = sessionIdOverride;
    }
    return {
        sessionId,
        clientMode,
        connectedToPubSub,
        subscribe,
        publish,
        setMode,
        subscribePresenceEnter,
    }
}