import Ably, {
    type ConnectionStateChange,
    type PresenceMessage,
    type RealtimeChannel,
} from 'ably';
import {
    ref,
    shallowRef,
    computed,
    nextTick,
    watch,
    onMounted,
    onUnmounted,
    type Ref,
    provide,
    type InjectionKey,
    inject,
} from 'vue';
import type { KeyedTimerSettings } from './time';
import { useSessionStorage } from '@vueuse/core';
import createEmitter from 'mitt';

/* ------------------------------------------------------------------------- *
 * Shared types
 * ------------------------------------------------------------------------- */

export type AppMode = 'leadtimer' | 'followtimer' | 'remote';

export interface SyncMsg {
    timestamp: number;
    config?: KeyedTimerSettings[];
    state?: {
        ticking: boolean;
        time: number;
    };
}

export interface PresenceMsg {
    clientId: string;
    mode?: AppMode;
    action: 'enter' | 'leave' | 'update';
    prio?: boolean;
}

export interface RemoteSignalMsg {
    signal: 'resume' | 'pause' | 'reset';
}

/* ------------------------------------------------------------------------- *
 * Helper utilities
 * ------------------------------------------------------------------------- */

const DEFAULT_API_KEY =
    'MZODpw.PK_zLw:zdg8NkO2yO45DZvlry08KuHfzpkLkFOYm2UrYkjoZDg';

function createUUID() {
    return crypto.randomUUID();
}

function log(debug: boolean, ...args: unknown[]) {
    if (debug) console.log('[realtime]', ...args);
}

/* ------------------------------------------------------------------------- *
 * Low‑level factory – returns an isolated realtime client instance.
 * ------------------------------------------------------------------------- */

interface RtcOptions {
    sessionId?: string;
    clientId?: string;
    apiKey?: string;
    debug?: boolean;
    remote?: boolean;
}

type Events = {
    sync: SyncMsg;
    presence: PresenceMsg;
    remoteSignal: RemoteSignalMsg;
};

export function createRealtimeClient(opts: RtcOptions = {}) {
    /* --------------------------------------------------------------------- */
    // 0.  Options & reactive state
    /* --------------------------------------------------------------------- */
    const debug = opts.debug || false;

    const sessionId = useSessionStorage('sessionId', opts.sessionId || createUUID());
    const clientId = useSessionStorage('clientId', opts.clientId ?? createUUID());

    // Exposed refs
    const connectedToPubSub = ref(false);
    const clientMode: Ref<AppMode> = ref(opts.remote ? 'remote' : 'followtimer');
    const currentLead = ref<string | null>(null);

    // Event emitter
    const emitter = createEmitter<Events>();

    /* --------------------------------------------------------------------- */
    // 1.  Ably connection (lazy because Vue SSR / tests)
    /* --------------------------------------------------------------------- */
    const ably = new Ably.Realtime({
        key: opts.apiKey ?? DEFAULT_API_KEY,
        clientId: clientId.value,
        echoMessages: false,
    });

    // Keep Vue ref in sync with Ably state
    ably.connection.on((stateChange: ConnectionStateChange) => {
        connectedToPubSub.value = stateChange.current === 'connected';
    });

    /* --------------------------------------------------------------------- */
    // 2.  Channel helpers
    /* --------------------------------------------------------------------- */
    const channel = computed(() =>
        connectedToPubSub.value ? ably.channels.get(sessionId.value) : null,
    );

    // (re)subscribe when channel changes
    watch(
        channel,
        (newChannel, oldChannel) => {
            if (oldChannel) {
                // clean listeners & presence from previous channel
                oldChannel.unsubscribe('message');
                oldChannel.presence.unsubscribe();
                oldChannel.presence.leave().catch(() => undefined);
            }
            if (newChannel) {
                wireChannel(newChannel);
            }
        },
        { immediate: true },
    );

    function wireChannel(ch: RealtimeChannel) {
        /* ---------------- sync messages ---------------- */
        ch.subscribe('message', (msg) => {
            if (msg.clientId === clientId.value) return; // ignore own messages
            if (msg.data.signal) {
                // Remote signal message
                const remoteSignal: RemoteSignalMsg = msg.data as RemoteSignalMsg;
                emitter.emit('remoteSignal', remoteSignal);
                return;
            } else {
                emitter.emit('sync', msg.data as SyncMsg);
            }
        });

        /* ---------------- presence messages ------------ */
        const presenceHandler = (
            p: PresenceMessage,
            action: PresenceMsg['action'],
        ) => {
            if (p.clientId === clientId.value) return;
            const mode = (p.data?.mode ?? undefined) as AppMode | undefined;
            const prio = p.data?.prio ?? false;
            // Lead left? renegotiate
            if (p.clientId === currentLead.value && mode !== 'leadtimer') {
                log(debug, 'Lead left, renegotiating');
                negotiateMode();
            }
            emitter.emit('presence', {
                clientId: p.clientId,
                action,
                mode,
                prio,
            });
        };

        ch.presence.subscribe('enter', (p) => presenceHandler(p, 'enter'));
        ch.presence.subscribe('leave', (p) => presenceHandler(p, 'leave'));
        ch.presence.subscribe('update', (p) => presenceHandler(p, 'update'));
    }

    /* --------------------------------------------------------------------- */
    // 3.  Presence helpers
    /* --------------------------------------------------------------------- */

    let disposing = false;
    async function ensurePresence(mode: AppMode, prio = false) {
        if (!channel.value) return;

        try {
            const presenceList = await channel.value.presence.get({ clientId: clientId.value });
            if (presenceList.length === 0) {
                await channel.value.presence.enter({ mode, prio });
            } else {
                await channel.value.presence.update({ mode, prio });
            }
        } catch (err) {
            log(debug, 'presence error', err);
        }
    }

    /* --------------------------------------------------------------------- */
    // 4.  Lead negotiation
    /* --------------------------------------------------------------------- */
    let negotiating = false;
    async function negotiateMode() {
        if (negotiating || disposing) return;
        negotiating = true;

        // Random delay 0‑200ms – larger window reduces collision chance
        await new Promise((r) => setTimeout(r, Math.random() * 200));

        try {
            if (!channel.value) return;

            // If already lead or remote, nothing to do
            if (clientMode.value === 'leadtimer' || clientMode.value === 'remote') {
                await ensurePresence(clientMode.value);
                return;
            }

            // Start as follower while we look around
            clientMode.value = 'followtimer';
            await ensurePresence('followtimer');

            // Who else is here?
            const others = (
                await channel.value.presence.get()
            ).filter((p) => p.clientId !== clientId.value);

            const lead = others.find((p) => p.data?.mode === 'leadtimer');
            if (lead) {
                currentLead.value = lead.clientId;
                log(debug, 'Following existing lead', lead.clientId);
                return;
            }

            // No lead – elect using Ably connectionId (guaranteed unique)
            const all = [ably.connection.id!, ...others.map((p) => p.connectionId!)];
            all.sort();
            const electedConnectionId = all[0];

            if (electedConnectionId === ably.connection.id) {
                log(debug, 'Elected as lead');
                clientMode.value = 'leadtimer';
                currentLead.value = clientId.value;
                await ensurePresence('leadtimer');
                // broadcast last sync if we have one
                if (lastSync) publishSync(lastSync);
            } else {
                log(debug, 'Another client elected as lead');
                currentLead.value = others.find((p) => p.connectionId === electedConnectionId)?.clientId ?? null;
            }
        } finally {
            negotiating = false;
        }
    }

    /* --------------------------------------------------------------------- */
    // 5.  Sync / presence public API
    /* --------------------------------------------------------------------- */

    let lastSync: SyncMsg | null = null;

    function publishSync(msg: SyncMsg) {
        if (!channel.value) return;
        lastSync = msg;
        channel.value.publish('message', msg).catch((e) => log(debug, 'publish error', e));
    }

    async function takeover() {
        if (clientMode.value !== 'followtimer') return;
        clientMode.value = 'leadtimer';
        currentLead.value = clientId.value;
        await ensurePresence('leadtimer', true);
        log(debug, 'Manual takeover');
        if (lastSync) publishSync(lastSync);
    }

    function publishRemoteSignal(signal: RemoteSignalMsg['signal']) {
        if (!channel.value) return;
        const msg: RemoteSignalMsg = { signal };
        channel.value.publish('message', msg).catch((e) => log(debug, 'publish error', e));
    }

    /* --------------------------------------------------------------------- */
    // 6.  Dispose / clean‑up
    /* --------------------------------------------------------------------- */

    async function dispose() {
        disposing = true;
        try {
            if (channel.value) {
                await channel.value.presence.leave();
                channel.value.unsubscribe();
                channel.value.presence.unsubscribe();
            }
            ably.close();
        } catch (err) {
            // ignore
        }
    }

    /* --------------------------------------------------------------------- */
    // 7.  Kick‑off once connected
    /* --------------------------------------------------------------------- */

    ably.connection.once('connected', () => {
        connectedToPubSub.value = true;
        nextTick(negotiateMode);
    });

    /* --------------------------------------------------------------------- */
    // 8.  Public surface of factory
    /* --------------------------------------------------------------------- */
    return {
        // refs
        connectedToPubSub,
        clientMode,
        currentLead,
        sessionId,

        // methods
        publishSync,
        takeover,
        publishRemoteSignal,
        emitter,
        dispose,
    } as const;
}

/* ------------------------------------------------------------------------- *
 * Vue composable – handles mount / unmount automatically
 * ------------------------------------------------------------------------- */

interface UseRealtimeOpts extends Omit<RtcOptions, 'clientId'> { }

export function useRealtime(opts: UseRealtimeOpts = {}) {
    const instance = shallowRef<ReturnType<typeof createRealtimeClient> | null>(null);

    // Mirror refs for template‑friendly consumption
    const connected = ref(false);
    const mode: Ref<AppMode> = ref('followtimer');
    const lead = ref<string | null>(null);

    onMounted(() => {
        instance.value = createRealtimeClient(opts);

        // bind refs
        connected.value = instance.value.connectedToPubSub.value;
        mode.value = instance.value.clientMode.value;
        lead.value = instance.value.currentLead.value;

        // keep them reactive
        watch(instance.value.connectedToPubSub, (v) => (connected.value = v));
        watch(instance.value.clientMode, (v) => (mode.value = v));
        watch(instance.value.currentLead, (v) => (lead.value = v));
    });

    onUnmounted(() => {
        instance.value?.dispose();
        instance.value = null;
    });

    // Helper wrappers that proxy to instance once available
    const publishSync = (msg: SyncMsg) => instance.value?.publishSync(msg);
    const publishRemoteSignal = (signal: RemoteSignalMsg['signal']) => instance.value?.publishRemoteSignal(signal);
    const takeover = () => instance.value?.takeover();
    const sessionId = computed(() => instance.value?.sessionId.value ?? '');
    const emitter = computed(() => instance.value?.emitter);

    return {
        // reactive values
        connected,
        mode,
        lead,
        sessionId,

        // methods
        publishSync,
        publishRemoteSignal,
        takeover,
        emitter
    } as const;
}

export const RealtimeKey: InjectionKey<ReturnType<typeof useRealtime>> =
    Symbol('Realtime-client');

export function provideRealtime(opts: UseRealtimeOpts = {}) {
    // create the singleton for this branch of the component tree
    const realtime = useRealtime(opts);

    // make it available to descendants
    provide(RealtimeKey, realtime);

    // return it in case the provider component also wants to use it locally
    return realtime;
}

export function useRealtimeClient() {
    const rtc = inject(RealtimeKey);
    if (!rtc) {
        throw new Error('useRealtimeClient() must be used after provideRealtime().');
    }
    return rtc;
}