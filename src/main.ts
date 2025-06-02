import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { router } from './routes'

const bcId = crypto.randomUUID();
const bc = new BroadcastChannel("timer-sync");
bc.onmessage = (event) => {
  const [bcid, msg] = event.data.split(':');
  if (bcid === bcId) return; // ignore own messages
  if (msg === 'sync') {
    // there is already a tab, show error
    app.unmount();
  }
}
setTimeout(() => {
  if (router.currentRoute.value.path !== '/multitaberror') {
    // send sync message to other tabs
    bc.postMessage(`${bcId}:sync`);
  }
}, Math.random() * 500);

const app = createApp(App)

app.use(router);

app.mount('#app')