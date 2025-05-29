import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { useGlobalTime } from './util/time'

const app = createApp(App)

const { init } = useGlobalTime()
init(app);

app.mount('#app')
