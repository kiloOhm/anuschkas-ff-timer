import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { useGlobalTime } from './util/time'
import { router } from './routes'

const app = createApp(App)

app.use(router);

const { init } = useGlobalTime()
init(app);

app.mount('#app')
