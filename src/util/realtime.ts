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

    const offlineMode = ref(false); // ← 🆕 public toggle

    const sessionId = useSessionStorage('sessionId', opts.sessionId || createUUID());
    if(opts.sessionId && sessionId.value !== opts.sessionId) {
        log(debug, 'Session ID mismatch, resetting to new value', opts.sessionId);
        sessionId.value = opts.sessionId;
    }
    const clientId = useSessionStorage('clientId', opts.clientId ?? createUUID());
    if(opts.clientId && clientId.value !== opts.clientId) {
        log(debug, 'Client ID mismatch, resetting to new value', opts.clientId);
        clientId.value = opts.clientId;
    }

    const peers      = new Set<string>(); // other clientIds (never includes us)
    const peerCount   = ref(0);
    const aloneInSession = computed(() => peerCount.value === 0);
    
    // 💾  Persist the fact that THIS browser tab used to be leader and since when
    const wasLeader = useSessionStorage('wasLeader', false);
    const leaderSince = useSessionStorage<number>('leaderSince', 0);

    // Exposed refs
    const connectedToPubSub = ref(false);
        const clientMode: Ref<AppMode> = ref(
        opts.remote
            ? 'remote'
            : wasLeader.value
                ? 'leadtimer'
                : 'followtimer',
    );

    const currentLead = ref<string | null>(null);

    // Computed helper – leader present?
    const leaderPresent = computed(() => currentLead.value !== null);

    // Keep the persistence flags in sync with the runtime mode
    watch(clientMode, (v) => {
        wasLeader.value = v === 'leadtimer';
        if (v === 'leadtimer') {
            leaderSince.value = Date.now();
        }
    });

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

    /* ─── react to offline / online -------------------------------------- */
    watch(offlineMode, async (off) => {
        if (off) { // ⇢ OFFLINE
            log(debug, 'Switching *offline*');

            if (channel.value) {
                try {
                    await channel.value.presence.leave();
                    channel.value.unsubscribe();
                    channel.value.presence.unsubscribe();
                } catch (_) {/* ignore */}
            }
            peers.clear();
            peerCount.value   = 0;
            currentLead.value = null;
            connectedToPubSub.value = false; // severs the computed `channel`
            ably.close();                    // closes WebSocket & aborts retries
        } else {                             // ⇢ ONLINE
            log(debug, 'Reconnecting…');
            ably.connect();                  // re-opens the same Ably instance
        }
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

                /* wipe local caches so next channel starts with a clean slate */
                peers.clear();
                peerCount.value = 0;
                currentLead.value = null;
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

            /* keep peer list in sync */
            if (action === 'leave') {
                peers.delete(p.clientId);
            } else {                  // enter | update
                peers.add(p.clientId);
            }
            peerCount.value = peers.size;

            const mode = (p.data?.mode ?? undefined) as AppMode | undefined;
            const prio = p.data?.prio ?? false;

            // keep track of who the current lead is
            if (mode === 'leadtimer' && action !== 'leave') {
                currentLead.value = p.clientId;
            }
            if (action === 'leave' && p.clientId === currentLead.value) {
                currentLead.value = null;
                if (clientMode.value !== 'remote') {
                    log(debug, 'Lead left, renegotiating');
                    negotiateMode();
                }
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

        /* -------------------------------------------------------------- *
         * Initial snapshot – who is already here?
         * -------------------------------------------------------------- */
        (async () => {
            try {
                const list = await ch.presence.get();

                // step ① – build the peer set  (exclude ourselves)
                peers.clear();
                list.forEach((p) => {
                    if (p.clientId !== clientId.value) {
                        peers.add(p.clientId);
                    }
                });
                peerCount.value = peers.size;

                // step ② – discover an existing leader, if any
                const leads = list.filter(
                    (p) => (p.data as any)?.mode === 'leadtimer'
                );

                if (leads.length) {
                    /* prefer the one that claims priority,
                       otherwise fall back to lowest connectionId */
                    leads.sort((a, b) => {
                        const ap = (a.data as any)?.prio ? 0 : 1;
                        const bp = (b.data as any)?.prio ? 0 : 1;
                        if (ap !== bp) return ap - bp;
                        return a.connectionId!.localeCompare(b.connectionId!);
                    });
                    currentLead.value = leads[0].clientId;
                } else {
                    currentLead.value = null; // no leader yet
                }
            } catch (err) {
                log(debug, 'presence init error', err);
            }
        })();
    }

    /* --------------------------------------------------------------------- */
    // 3.  Presence helpers
    /* --------------------------------------------------------------------- */

    let disposing = false;
    async function ensurePresence(mode: AppMode, prio = false) {
        if (offlineMode.value || !channel.value) return;

        try {
            const presenceList = await channel.value.presence.get({ clientId: clientId.value });
            const data = { mode, prio, leaderSince: leaderSince.value };
            if (presenceList.length === 0) {
                await channel.value.presence.enter(data);
            } else {
                await channel.value.presence.update(data);
            }
        } catch (err) {
            log(debug, 'presence error', err);
        }
    }

    /* --------------------------------------------------------------------- */
    // 4.  Lead negotiation
    /* --------------------------------------------------------------------- */
    const negotiating = ref(false);

    async function promoteToLeader() {
        clientMode.value = 'leadtimer';
        currentLead.value = clientId.value;
        await ensurePresence('leadtimer', true);
        log(debug, 'Promoted to lead');
        if (lastSync) publishSync(lastSync);
    }


    async function negotiateMode() {
        if (negotiating.value || disposing) return;
        negotiating.value = true;

        // Random delay 0‑200 ms – reduces collision chance
        await new Promise((r) => setTimeout(r, Math.random() * 200));

        try {
            if (!channel.value) return;

            // If already lead or remote, just advertise our status & bail
            if (clientMode.value === 'leadtimer' || clientMode.value === 'remote') {
                await ensurePresence(clientMode.value, clientMode.value === 'leadtimer');
                return;
            }

            // Start as follower while we look around
            clientMode.value = 'followtimer';
            await ensurePresence('followtimer');

            // Who else is here?
            const others = (
                await channel.value.presence.get()
            ).filter((p) => p.clientId !== clientId.value);

            const leads = others.filter((p) => (p.data as any)?.mode === 'leadtimer');

            // Stage ① – any leader who thinks they have priority?
            const prioLeads = leads.filter((p) => (p.data as any)?.prio);

            if (prioLeads.length) {
                // Prefer the one running the longest (earliest leaderSince)
                prioLeads.sort((a, b) => {
                    const aSince = (a.data as any)?.leaderSince ?? Number.MAX_SAFE_INTEGER;
                    const bSince = (b.data as any)?.leaderSince ?? Number.MAX_SAFE_INTEGER;
                    if (aSince !== bSince) return aSince - bSince;
                    return a.connectionId!.localeCompare(b.connectionId!);
                });
                const elected = prioLeads[0];
                currentLead.value = elected.clientId;

                // If that elected one is us, step up
                if (elected.connectionId === ably.connection.id) {
                    await promoteToLeader();
                }
                return; // we have a leader – stop here
            }

            // Stage ② – fall back to old election rule based on connectionId
            if (leads.length) {
                // There are existing leaders (but none with prio). Pick the lowest connectionId
                leads.sort((a, b) => a.connectionId!.localeCompare(b.connectionId!));
                currentLead.value = leads[0].clientId;
                return;
            }

            // Stage ③ – No leader at all. Elect one deterministically.
            const allConnections = [ably.connection.id!, ...others.map((p) => p.connectionId!)];
            allConnections.sort();
            const electedConnectionId = allConnections[0];

            if (electedConnectionId === ably.connection.id) {
                await promoteToLeader();
            } else {
                currentLead.value = others.find((p) => p.connectionId === electedConnectionId)?.clientId ?? null;
            }
        } finally {
            negotiating.value = false;
        }
    }

    /* --------------------------------------------------------------------- */
    // 5.  Sync / presence public API
    /* --------------------------------------------------------------------- */

    let lastSync: SyncMsg | null = null;

    function publishSync(msg: SyncMsg) {
        if (offlineMode.value || !channel.value) return;
        lastSync = msg;
        if(aloneInSession.value) {
            log(debug, 'no need to publish sync, alone in session');
            return;
        }
        channel.value.publish('message', msg).catch((e) => log(debug, 'publish error', e));
    }

    async function takeover() {
        if (clientMode.value !== 'followtimer') return;
        leaderSince.value = Date.now();
        await promoteToLeader();
    }

    function publishRemoteSignal(signal: RemoteSignalMsg['signal']) {
        if (offlineMode.value || !channel.value) return;
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

    const onConnected = () => {
     if (offlineMode.value) return;   // ignore if user flipped offline mid-handshake
     connectedToPubSub.value = true;
     nextTick(async () => {
        await ensurePresence(clientMode.value, clientMode.value === 'leadtimer');
        negotiateMode();
        if(lastSync) {
            // If we have a last sync, publish it immediately
            publishSync(lastSync);
        }
     });
    };

    ably.connection.on('connected', onConnected);

    /* --------------------------------------------------------------------- */
    // 8.  Public surface of factory
    /* --------------------------------------------------------------------- */
    return {
        offlineMode,

        // refs
        connectedToPubSub,
        clientMode,
        currentLead,
        sessionId,
        leaderPresent,
        negotiating,
        peerCount,
        aloneInSession,
        peers,

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

    // Computed helper in composable scope
    const hasLead = computed(() => lead.value !== null);

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
    const negotiating = computed(() => instance.value?.negotiating.value ?? false);
    const aloneInSession = computed(() => instance.value?.aloneInSession.value ?? true);
    const offlineMode = computed({
        get: () => instance.value?.offlineMode.value ?? false,
        set: (v) => {
            if (instance.value) {
                instance.value.offlineMode.value = v;
            }
        },
    });

    return {
        offlineMode,

        // reactive values
        connected,
        mode,
        lead,
        sessionId,
        hasLead,
        negotiating,
        aloneInSession,

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