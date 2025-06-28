import {
  computed,
  readonly,
  ref,
  watch,
  onMounted,
  onUnmounted,
  inject,
  nextTick,
} from 'vue';
import { debounce } from 'lodash';
import { useLocalStorage } from '@vueuse/core';

import {
  RealtimeKey,
  useRealtimeClient,
  type PresenceMsg,
  type RemoteSignalMsg,
  type SyncMsg,
} from './realtime';
import type { TimerSettings } from '../components/Timer.vue';

export interface KeyedTimerSettings {
  id: string;
  settings: TimerSettings;
}

export function generateDefaultConfig(): KeyedTimerSettings[] {
  return [
    {
      id: crypto.randomUUID(),
      settings: {
        name: 'Team 1',
        offset: 10,
        onTime: 60,
        offTime: 30,
        rounds: 4,
        voice: 'M1',
        warningBeep: true,
      },
    },
    {
      id: crypto.randomUUID(),
      settings: {
        name: 'Team 2',
        offset: 30,
        onTime: 60,
        offTime: 30,
        rounds: 4,
        voice: 'F1',
        warningBeep: true,
      },
    },
  ];
}

/* ══════════════════════════════════════════════════════════════════════════════ *
 * 0.  Helper that *builds* the store once and only once
 * ══════════════════════════════════════════════════════════════════════════════ */

type Rtc = ReturnType<typeof useRealtimeClient>;

export const presetColors = ["#FF6B6B", "#4ECDC4", "#556270", "#C7F464", "#FF6F61", "#6A0572", "#D9BF77", "#ACD8AA"];

function initGlobalTime(rtc: Rtc) {
  /* ─────────────── 0a. Realtime shortcuts ─────────────── */
  const { publishSync, takeover, emitter, mode } = rtc;
  const isLead = computed(() => mode.value === 'leadtimer');

  /* ─────────────── 1. Persistent timer configuration ─────────────── */

  const timers = useLocalStorage<KeyedTimerSettings[]>('timerconfig', generateDefaultConfig());

  function getColor(settings: TimerSettings) {
    if (settings.color) {
      return settings.color;
    }
    return presetColors.filter(c => !timers.value.some(t => t.settings.color === c))[(timers.value.map(t => t.settings).indexOf(settings)) % presetColors.length];
  }

  /* When the *lead* edits the config, broadcast debounced full sync */
  watch(
    [timers, isLead],
    debounce(([cfg, lead]) => {
      if (!lead) return;
      publishSync({
        timestamp: Date.now(),
        config: cfg,
        state: {
          ticking: ticking.value,
          time: now.value,
        },
      });
    }, 1_000),
    { immediate: true, deep: true },
  );

  /* ─────────────── 2. Global timer state ─────────────── */
  const leadTime = useLocalStorage('leadtime', 0);
  const followerTime = ref(0);

  const now = computed({
    get: () => (isLead.value ? leadTime.value : followerTime.value),
    set: v => {
      leadTime.value = v;
      followerTime.value = v;
    },
  });

  const formattedTime = computed(() => formatTime(now.value));

  const ticking = ref(false);
  let ticker: number | null = null;

  function _tick() {
    const dt = Date.now() - lastSnapshot.value.timestamp;
    now.value = lastSnapshot.value.time + dt;
  }

  function resume(quiet = false) {
    if (ticker) return;                        // already running
    ticker = window.setInterval(_tick, 300);
    ticking.value = true;
    if (!quiet) snapshot();                    // broadcast change
    _tick();
  }

  function pause(quiet = false) {
    if (!ticker) return;                       // already paused
    clearInterval(ticker);
    ticker = null;
    ticking.value = false;
    if (!quiet) snapshot();
  }

  function reset(quiet = false) {
    pause(true);
    now.value = 0;
    if (!quiet) snapshot();
  }

  function toggle() {
    ticker ? pause() : resume();
  }

  const lastSnapshot = ref({ timestamp: Date.now(), time: 0 });

  function snapshot() {
    lastSnapshot.value = { timestamp: Date.now(), time: now.value };
    /* If we’re the lead, push an immediate state update */
    if (isLead.value) {
      publishSync({
        timestamp: lastSnapshot.value.timestamp,
        state: {
          ticking: ticking.value,
          time: lastSnapshot.value.time,
        },
      });
    }
  }

  const debouncedSnapshot = debounce(snapshot, 1_000, {
    leading: true,
    trailing: true,
  });

  const unWatchEmitter = watch(emitter, (newEmitter) => {
    if (!newEmitter) return;
    /* ─────────────── 3. React to incoming realtime traffic ─────────────── */
    newEmitter.on('sync', (raw) => {
      const msg = raw as SyncMsg;
      console.log('sync', msg);
      if (isLead.value) return; // ignore own syncs
      if (msg.config) timers.value = msg.config;

      if (msg.state) {
        /*
         * Use the local clock as the baseline for follower mode to
         * avoid drift when the leader's and follower's system clocks
         * are out of sync. Only the "time" from the leader matters for
         * the follower, not the leader's timestamp
         *
         * However, we still want to compensate for network latency. The
         * timestamp included with the sync message tells us when the
         * leader sent it. By adding the message age to `time`, the
         * follower starts closer to the leader's current time.
         */
        const receivedAt = Date.now();
        // Clamp the age to 0 because our clock might be behind the leader's
        // clock, which would otherwise yield a negative latency.
        const msgAge = Math.max(0, receivedAt - msg.timestamp);
        lastSnapshot.value = {
          timestamp: receivedAt,
          time: msg.state.time + msgAge,
        };
        ticking.value = msg.state.ticking;
        now.value = msg.state.time + msgAge;
        msg.state.ticking ? resume(true) : pause(true);
      }
    });

    newEmitter.on('remoteSignal', (raw) => {
      const msg = raw as RemoteSignalMsg;
      console.log('remoteSignal', msg);
      if (!isLead.value) return; // only lead obeys
      switch (msg.signal) {
        case 'resume': resume(); break;
        case 'pause': pause(); break;
        case 'reset': reset(); break;
      }
    });

    // when new follower connects, send them the current state
    newEmitter.on('presence', (raw) => {
      console.log('presence', raw);
      const msg = raw as PresenceMsg;
      if (isLead.value && msg.action !== 'leave') {
        publishSync({
          timestamp: Date.now(),
          config: timers.value,
          state: {
            ticking: ticking.value,
            time: now.value,
          },
        })
      }
    });

    nextTick(() => {
      unWatchEmitter();
    })
  }, { immediate: true });

  /* ─────────────── 4. Keyboard shortcuts (lead only) ─────────────── */
  function isInputFocused() {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  function handleKey(e: KeyboardEvent) {
    if (!isLead.value || isInputFocused()) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        toggle();
        break;
      case 'KeyR':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          reset();
        }
        break;
      case 'KeyP':
        e.preventDefault();
        pause();
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault();
        /*   ← / →  = ±1 s,  ⇧← / ⇧→  = ±10 s   */
        const step = (e.shiftKey ? 10_000 : 1_000) * (e.code === 'ArrowLeft' ? -1 : 1);

        /* clamp at 0 so we never go negative */
        now.value = Math.max(0, now.value + step);

        /* keep the ticking baseline in sync so _tick() stays accurate */
        lastSnapshot.value.time += step;

        /* batch the remote syncs */
        debouncedSnapshot();
        break;
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (!isLead.value || isInputFocused()) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      debouncedSnapshot.flush();    // send final sync right away
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKey);
    document.addEventListener('keyup', handleKeyUp);
  });
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKey);
    document.removeEventListener('keyup', handleKeyUp);
  });

  function setGlobalTime(time: number) {
    if (isLead.value) {
      now.value = time;
      snapshot();
    }
  }

  /* ─────────────── 5. Public API ─────────────── */
  return {
    // commands
    resume,
    pause,
    reset,
    toggle,
    takeover,
    setGlobalTime,

    // reactive state
    isLeadTimer: readonly(isLead),
    timers,
    globalTime: readonly(now),
    globalTimeTicking: readonly(ticking),
    formattedTime: readonly(formattedTime),

    //helpers
    getColor,
  } as const;
}

/* ══════════════════════════════════════════════════════════════════════════════ *
 * 1.  Singleton wrapper that can accept / inject / create an RTC instance
 * ══════════════════════════════════════════════════════════════════════════════ */

let singleton: ReturnType<typeof initGlobalTime> | null = null;

/**
 * Returns the (single) global-time store.
 *
 * @param rtc — (optional) an existing realtime client.  
 *              If omitted, the function tries `inject(RealtimeKey)` and,
 *              failing that, calls `useRealtimeClient()` to create its own.
 */
export function useGlobalTime(rtc?: Rtc) {
  if (!singleton) {
    const instance =
      rtc ??
      inject(RealtimeKey, null) ??
      useRealtimeClient();

    singleton = initGlobalTime(instance);
  }
  return singleton;
}

/* ══════════════════════════════════════════════════════════════════════════════ *
 * 2.  Utility: ms → hh:mm:ss or mm:ss
 * ══════════════════════════════════════════════════════════════════════════════ */
export function formatTime(ms: number, alwaysHours = false) {
  const s = Math.floor(ms / 1_000);
  const h = Math.floor(s / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;

  return h > 0 || alwaysHours
    ? `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec
      .toString()
      .padStart(2, '0')}`
    : `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
