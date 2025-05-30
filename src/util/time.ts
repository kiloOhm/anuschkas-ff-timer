import { useLocalStorage } from "@vueuse/core";
import { computed, inject, nextTick, readonly, ref, watchEffect, type App, type Ref } from "vue";
import { useRealtime, type SyncMsg } from "./realtime";

let globalTimeInterval: number | null = null;

const isLeadTimer = ref(true);

const globalTime = useLocalStorage('globalTime', 0);
const globalTimeTicking = ref(false);

const { publish, subscribe, connectedToPubSub, clientMode, subscribePresenceEnter } = useRealtime();

const connectionWatcher = watchEffect(() => {
  if (!connectedToPubSub.value) {
    return;
  }
  if (clientMode.value === 'timer') {
    console.log("Connected to Ably Pub/Sub as timer, publishing initial sync");
    publishSyncMsg();
  }
  nextTick(() => {
    connectionWatcher.stop();
  });
});

subscribePresenceEnter(() => {
  if (clientMode.value === 'timer') {
    console.log("Other client connected, sending initial sync");
    publishSyncMsg();
  }
});

function publishSyncMsg() {
  const now = Math.floor(Date.now() / 1000);
  publish({
    time: globalTime.value,
    timestamp: now,
    ticking: globalTimeTicking.value,
  });
}

subscribe((msg: SyncMsg) => {
  if (clientMode.value === 'timer') {
    isLeadTimer.value = false;
  }
  if (msg.time !== undefined && msg.timestamp !== undefined) {
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - msg.timestamp;
    globalTime.value = msg.time + elapsed;
    if (msg.ticking) {
      resume(false);
    } else {
      pause(false);
    }
  }
});

function injectGlobalTimeRefs() {
  const time = readonly(inject('globalTime') as Ref<number>);
  const ticking = readonly(inject('globalTimeTicking') as Ref<boolean>);
  const formattedTime = computed(() => formatTime(time.value, true));
  return {
    time,
    ticking,
    formattedTime,
  };
}

function tick(reverse = false) {
  if (reverse) {
    if (globalTime.value <= 0) return; // Prevent going below zero
    globalTime.value -= 1;
  } else {
    if (globalTime.value >= Number.MAX_SAFE_INTEGER) return; // Prevent overflow
    if (globalTime.value < 0) globalTime.value = 0; // Ensure non-negative
    globalTime.value += 1;
  }
}

function resume(sync = true) {
  if (globalTimeInterval) return; // Already running
  globalTimeInterval = setInterval(tick, 1000);
  globalTimeTicking.value = true;
  tick();
  if (sync) {
    publishSyncMsg();
  }
}

function pause(sync = true) {
  if (!globalTimeInterval) return; // Not running
  clearInterval(globalTimeInterval);
  globalTimeTicking.value = false;
  globalTimeInterval = null;
  if (sync) {
    publishSyncMsg();
  }
}

function reset(sync = true) {
  globalTime.value = 0;
  pause();
  if (sync) {
    publishSyncMsg();
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

function init(app: App) {
  if (initialized) return;
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
      case 'ArrowLeft':
        tick(true);
        break;
      case 'ArrowRight':
        tick();
        break;
    }
  });
  app.provide('globalTime', globalTime);
  app.provide('globalTimeTicking', globalTimeTicking);
}

export function useGlobalTime() {
  return {
    init,
    injectGlobalTimeRefs,
    resume,
    pause,
    reset,
    toggle,
    isLeadTimer: readonly(isLeadTimer),
  }
}

export function formatTime(seconds: number, alwaysShowHours = false): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0 || alwaysShowHours) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}