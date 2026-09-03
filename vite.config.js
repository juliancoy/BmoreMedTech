import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: 'assets/data',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        calendar: 'calendar.html',
        map: 'map.html',
        taxonomy: 'taxonomy.html',
        needAvailabilityDistortions: 'need-availability-distortions.html',
      },
    },
  },
})
