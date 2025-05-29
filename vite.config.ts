import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import icons from 'unplugin-icons/vite'
import components from 'unplugin-vue-components/vite'
import iconsResolver from 'unplugin-icons/resolver'
import {NaiveUiResolver} from 'unplugin-vue-components/resolvers';
import { VitePWA } from 'vite-plugin-pwa';

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
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Fitness Timer',
        short_name: 'Timer',
        start_url: '/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#0f172a',
        icons: [
          {
            src: 'pwa-48x48.png',
            sizes: '48x48',
            type: 'image/png'
          },
          {
            src: 'pwa-72x72.png',
            sizes: '72x72',
            type: 'image/png'
          },
          {
            src: 'pwa-96x96.png',
            sizes: '96x96',
            type: 'image/png'
          },
          {
            src: 'pwa-128x128.png',
            sizes: '128x128',
            type: 'image/png'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },

          {
            src: 'pwa-384x384.png',
            sizes: '384x384',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
