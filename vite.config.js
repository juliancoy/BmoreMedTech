import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        calendar: 'calendar.html',
        map: 'map.html',
      },
    },
  },
})
