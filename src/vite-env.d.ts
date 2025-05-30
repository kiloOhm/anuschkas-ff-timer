/// <reference types="vite/client" />

declare module global {
  interface Window {
    realtimeInit: boolean;
  }
}