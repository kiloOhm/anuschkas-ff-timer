import { useLocalStorage } from "@vueuse/core";
import { computed, inject, readonly, ref, type App, type Ref } from "vue";

let globalTimeInterval: number | null = null;

const globalTime = useLocalStorage('globalTime', 0);
const globalTimeTicking = ref(false);

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
  if(reverse) {
    if(globalTime.value <= 0) return; // Prevent going below zero
    globalTime.value -= 1;
  } else {
    if(globalTime.value >= Number.MAX_SAFE_INTEGER) return; // Prevent overflow
    if(globalTime.value < 0) globalTime.value = 0; // Ensure non-negative
    globalTime.value += 1;
  }
}

function resume() {
  if(globalTimeInterval) return; // Already running
  globalTimeInterval = setInterval(tick, 1000);
  globalTimeTicking.value = true;
  tick();
}

function pause() {
  if(!globalTimeInterval) return; // Not running
  clearInterval(globalTimeInterval);
  globalTimeTicking.value = false;
  globalTimeInterval = null;
}

function reset() {
  globalTime.value = 0;
  pause();
}

function toggle() {
  if(globalTimeInterval) {
    pause();
  } else {
    resume();
  }
}

let initialized = false; 

function init(app: App) {
  if(initialized) return;
  document.addEventListener('keydown', (event) => {
    switch(event.code) {
      case 'Space':
        event.preventDefault();
        toggle();
        break;
      case 'KeyR':
        if(!event.ctrlKey && !event.metaKey) {
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
  }
}

export function formatTime(seconds: number, alwaysShowHours = false): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if(hours > 0 || alwaysShowHours) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}