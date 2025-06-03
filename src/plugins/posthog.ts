import posthog from "posthog-js";
import type { App } from "vue";

export default {
  install(app: App) {
    app.config.globalProperties.$posthog = posthog.init(
      'phc_RX8OVSakUGERbVKg2lo7bjSu19snDHcP4fjtzJL3Aru',
      {
        api_host: 'https://eu.i.posthog.com',
      }
    );
  }
};