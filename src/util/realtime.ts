import { useLocalStorage } from "@vueuse/core";
import Ably from "ably";
import { effect, nextTick, ref, watch } from "vue";
import type { KeyedTimerSettings } from "./time";

let lastSyncMsg: SyncMsg | null = null;

export type SyncMsg = {
    from: AppMode;
    timestamp: number;
    config?: KeyedTimerSettings[];
    state?: {
        ticking: boolean;
        time: number;
    }
}

type PresenceAction = 'enter' | 'leave' | 'update';
export type PresenceMsg = {
    clientId: string;
    mode?: AppMode;
    action: PresenceAction;
    prio?: boolean // for manual takeover
}

export type AppMode = 'leadtimer' | 'followtimer' | 'remote';

const ablyAPIKey = "MZODpw.PK_zLw:zdg8NkO2yO45DZvlry08KuHfzpkLkFOYm2UrYkjoZDg";

const sessionId = useLocalStorage("sessionId", crypto.randomUUID());
const currentLead = ref<string | null>(null);
const clientMode = ref<AppMode>();
const clientId = useLocalStorage("clientId", crypto.randomUUID());
effect(() => {
    console.log("Client ID: ", clientId.value);
})

const ably = new Ably.Realtime({
    key: ablyAPIKey,
    clientId: clientId.value,
});

const connectedToPubSub = ref(false);
ably.connection.once("connected", () => {
    connectedToPubSub.value = true;
})

let syncSubCounter = 0;
const syncSubs = new Map<number, (msg: SyncMsg) => void>();

export function subscribeSync(listener: (msg: SyncMsg) => void) {
    const id = syncSubCounter++;
    syncSubs.set(id, listener);
    return () => {
        syncSubs.delete(id);
    };
}

export function publishSync(msg: SyncMsg) {
    if (!connectedToPubSub.value) {
        console.warn("Not connected to Ably Pub/Sub, cannot publish message");
        return;
    }
    const channel = ably.channels.get(sessionId.value);
    channel.publish("message", msg);
    lastSyncMsg = msg;
}

let presenceCounter = 0;
const presenceSubs = new Map<number, (msg: PresenceMsg) => void>();

function subscribePresence(listener: (msg: PresenceMsg) => void) {
    const id = presenceCounter++;
    presenceSubs.set(id, listener);
    return () => {
        presenceSubs.delete(id);
    };
}

function init() {
    if ((window as any)['realtimeInit'] === true) return;
    (window as any)['realtimeInit'] = true
    const channel = ably.channels.get(sessionId.value);
    channel.subscribe("message", (msg) => {
        if (msg.clientId === clientId.value) {
            return;
        }
        syncSubs.forEach((listener) => {
            listener(msg.data as SyncMsg);
        });
    });
    function presenceHandler(presenceMsg: Ably.PresenceMessage, action: PresenceAction) {
        if (presenceMsg.clientId === clientId.value) {
            return;
        }

        const mode = presenceMsg.data?.mode as AppMode;
        const prio = presenceMsg.data?.prio || false;

        if (presenceMsg.clientId === currentLead.value && mode !== 'leadtimer') {
            console.warn("Current lead timer left, negotiating new lead");
            negotiateMode();
            return;
        }

        if (clientMode.value === 'leadtimer' && mode === 'leadtimer') {
            if (prio === true) {
                console.warn("Another lead timer entered with priority, giving up lead");
                currentLead.value = presenceMsg.clientId;
                setMode('followtimer');
            } else {
                console.error("Another lead timer entered while I am in lead mode, this should not happen");
                setMode('followtimer');
                return;
            }
        }

        if (mode !== 'leadtimer' && clientMode.value === 'leadtimer') {
            console.log("Follower or remote entered, rebroadcasting last sync");
            if (lastSyncMsg) {
                publishSync(lastSyncMsg);
            } else {
                console.warn("No last sync message to rebroadcast");
            }
        }

        presenceSubs.forEach((listener) => {
            listener({
                clientId: presenceMsg.clientId,
                action,
                mode,
                prio,
            });
        });
    }
    channel.presence.subscribe("enter", (presenceMsg) => presenceHandler(presenceMsg, 'enter'));
    channel.presence.subscribe("leave", (presenceMsg) => presenceHandler(presenceMsg, 'leave'));
    channel.presence.subscribe("update", (presenceMsg) => presenceHandler(presenceMsg, 'update'));
}

const connectionWatcher = watch(connectedToPubSub, (connected) => {
    if (!connected) {
        return;
    }
    console.log("Connected to Ably Pub/Sub");
    nextTick(() => {
        connectionWatcher.stop();
        negotiateMode();
    });
}, { immediate: true });

async function getOtherInstances(onlyTimers = false) {
    if (!connectedToPubSub.value) {
        console.warn("Not connected to Ably Pub/Sub, cannot get instances");
        return [];
    }
    const channel = ably.channels.get(sessionId.value);
    const presence = await channel.presence.get();
    const others = presence.filter(i => i.clientId !== clientId.value).map(p => ({
        clientId: p.clientId,
        mode: p.data?.mode as AppMode,
    }));
    if (onlyTimers) {
        return others.filter(i => i.mode !== 'remote');
    }
    return others;
}

let addedUnloadHook = false;
function unload() {
    if (!connectedToPubSub.value) {
        return;
    }
    if (!present) {
        return;
    }
    try {
        const channel = ably.channels.get(sessionId.value);
        channel.presence.leave();
        present = false;
        ably.close();
    } catch { }
}
if (!addedUnloadHook) {
    window.addEventListener("beforeunload", unload);
    addedUnloadHook = true;
}

let present = false;
async function setMode(mode: AppMode, prio = false) {
    if (!connectedToPubSub.value) {
        console.warn("Not connected to Ably Pub/Sub, cannot set mode");
        return;
    }
    clientMode.value = mode;
    const channel = ably.channels.get(sessionId.value);
    if (present) {
        await channel.presence.update({ mode, prio });
    } else {
        await channel.presence.enter({ mode, prio });
        present = true;
    }
}

let negotiatingMode = false;
async function negotiateMode() {
    if (negotiatingMode) return;
    negotiatingMode = true;
    // random delay to avoid deadlock
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    try {
        if (!connectedToPubSub.value) {
            console.warn("Not connected to Ably Pub/Sub, cannot negotiate mode");
            return;
        }
        if (clientMode.value === 'remote') {
            await setMode('remote');
            return;
        }
        if (clientMode.value === 'leadtimer') {
            console.warn("Already in lead timer mode, no negotiation needed");
            return;
        }
        console.log("starting negotiation for mode as followtimer");
        await setMode('followtimer');
        const otherTimers = await getOtherInstances(true);
        if (otherTimers.length === 0) {
            console.log("No other timers found, taking lead");
            await setMode('leadtimer');
            currentLead.value = clientId.value;
            return;
        }
        const leadTimer = otherTimers.find(i => i.mode === 'leadtimer');
        if (leadTimer) {
            console.log("Found lead timer, following ", leadTimer.clientId);
            currentLead.value = leadTimer.clientId;
            return;
        }
        console.log("No lead timer found, negotiating");
        const allClientIds = [...otherTimers.map(i => i.clientId), clientId.value];
        const leadClientId = allClientIds.sort().shift();
        if (!leadClientId) {
            throw new Error("No lead client ID found during negotiation");
        }
        if (leadClientId === clientId.value) {
            console.log("elected as lead timer");
            currentLead.value = clientId.value;
            await setMode('leadtimer');
        } else {
            console.log("following lead timer", leadClientId);
            currentLead.value = leadClientId;
        }
    } finally {
        negotiatingMode = false;
    }
}

function takeover() {
    if (clientMode.value !== 'followtimer') {
        console.warn("Cannot take over lead timer, not in follow timer mode");
        return;
    }
    if (currentLead.value === clientId.value) {
        console.warn("Already the lead timer, no need to take over");
        return;
    }
    console.log("Taking over lead timer");
    setMode('leadtimer', true).then(() => {
        currentLead.value = clientId.value;
    });
}

export function useRealtime(sessionIdOverride?: string, remote = false) {
    if (sessionIdOverride) {
        sessionId.value = sessionIdOverride;
    }
    if (remote) {
        clientMode.value = 'remote';
    }

    init();
    return {
        sessionId,
        clientMode,
        connectedToPubSub,
        subscribeSync,
        publishSync,
        subscribePresence,
        getOtherInstances,
        unload,
        takeover
    }
}