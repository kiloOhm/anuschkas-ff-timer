import { useLocalStorage } from "@vueuse/core";
import { computed, readonly, ref, watch } from "vue";
import type { TimerSettings } from "../components/Timer.vue";
import { useRealtime } from "./realtime";
import { debounce } from "lodash";

const { subscribeSync, publishSync, clientMode } = useRealtime();

const isLeadTimer = computed(() => clientMode.value === 'leadtimer');
const isRemote = computed(() => clientMode.value === 'remote');

let globalTimeInterval: any = null;

export type KeyedTimerSettings = { id: string, settings: TimerSettings };

const timers = useLocalStorage<KeyedTimerSettings[]>("timers", [
  {
    id: crypto.randomUUID(),
    settings: {
      name: "Team 1",
      offset: 10,
      onTime: 60,
      offTime: 30,
      rounds: 4,
      voice: "M1",
    }
  },
  {
    id: crypto.randomUUID(),
    settings: {
      name: "Team 2",
      offset: 110,
      onTime: 60,
      offTime: 30,
      rounds: 4,
      voice: "F1",
    }
  },
]);

watch([timers, isLeadTimer], debounce(([newTimers, newIsLead]) => {
  if (newIsLead && newTimers !== undefined) {
    publishSync({
      timestamp: lastState.value.timestamp ?? Date.now(),
      config: newTimers,
      state: {
        ticking: globalTimeTicking.value,
        time: globalTime.value,
      }
    })
  }
}, 1000), { immediate: true, deep: true });

const leadGlobalTime = useLocalStorage('globalTime', 0);
const followerGlobalTime = ref(0);

const lastState = ref<{
  timestamp: number;
  time: number;
}>({
  timestamp: Date.now(),
  time: 0,
});

const globalTime = computed({
  get: () => isLeadTimer.value ? leadGlobalTime.value : followerGlobalTime.value,
  set: (value: number) => {
    if (isLeadTimer.value) {
      leadGlobalTime.value = value;
    } else {
      followerGlobalTime.value = value;
    }
  }
})
const globalTimeTicking = ref(false);

watch([globalTimeTicking, lastState, isLeadTimer, isRemote], ([newTicking, newLastState, newIsLead, isRemote]) => {
  if (!newIsLead && !isRemote) return;
  publishSync({
    timestamp: newLastState.timestamp,
    state: {
      ticking: newTicking,
      time: newLastState.time,
    }
  })
}, { immediate: true, deep: true });

const formattedTime = computed(() => formatTime(globalTime.value, true));

function tick() {
  const delta = Date.now() - lastState.value.timestamp;
  globalTime.value = lastState.value.time + delta;
}

function resume(dontSetLastState = false) {
  if (globalTimeInterval) return; // Already running
  globalTimeInterval = setInterval(tick, 500);
  globalTimeTicking.value = true;
  if (!dontSetLastState) {
    lastState.value = {
      timestamp: Date.now(),
      time: globalTime.value,
    };
  }
  tick();
}

function pause(dontSetLastState = false) {
  if (!globalTimeInterval) return; // Not running
  clearInterval(globalTimeInterval);
  globalTimeTicking.value = false;
  globalTimeInterval = null;
  if (!dontSetLastState) {
    lastState.value = {
      timestamp: Date.now(),
      time: globalTime.value,
    };
  }
}

function reset(dontSetLastState = false) {
  pause();
  globalTime.value = 0;
    if (!dontSetLastState) {
    console.log("reset timer, setting last state", lastState.value);
    lastState.value = {
      timestamp: Date.now(),
      time: globalTime.value,
    };
  }
}

function toggle() {
  if (globalTimeInterval) {
    pause();
  } else {
    resume();
  }
}

let initialized = false;

function init() {
  if (initialized) return;
  subscribeSync((msg) => {
    if (isLeadTimer.value) return;
    if (timers && msg.config) {
      timers.value = msg.config;
    }
    if (msg.state) {
      lastState.value = {
        timestamp: msg.timestamp,
        time: msg.state.time,
      }
      globalTimeTicking.value = msg.state.ticking;
      globalTime.value = msg.state.time;
      if (msg.state.ticking) {
        resume(true);
      } else {
        pause(true);
      }
    }
  })
  document.addEventListener('keydown', (event) => {
    switch (event.code) {
      case 'Space':
        event.preventDefault();
        toggle();
        break;
      case 'KeyR':
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          reset();
        }
        break;
      case 'KeyP':
        event.preventDefault();
        pause();
        break;
    }
  });
}

export function useGlobalTime() {
  return {
    init,
    resume,
    pause,
    reset,
    toggle,
    isLeadTimer: readonly(isLeadTimer),
    timers,
    globalTime: readonly(globalTime),
    globalTimeTicking: readonly(globalTimeTicking),
    formattedTime: readonly(formattedTime),
  }
}

export function formatTime(ms: number, alwaysShowHours = false): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0 || alwaysShowHours) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}