import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import icons from 'unplugin-icons/vite'
import components from 'unplugin-vue-components/vite'
import iconsResolver from 'unplugin-icons/resolver'
import {NaiveUiResolver} from 'unplugin-vue-components/resolvers';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    components({
      resolvers: [
        iconsResolver(),
        NaiveUiResolver(),
      ],
      dts: true,
      directoryAsNamespace: true,
      include: [/\.vue$/, /\.vue\?vue/],
      extensions: ['vue'],
      deep: true,
    }),
    icons({
      autoInstall: true,
      compiler: 'vue3',
    }),
  ],
})
