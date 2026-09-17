import { defineConfig } from 'vite'
import { cpSync, existsSync } from 'node:fs'

const datasetPages = [
  'medtech-meta-index',
  'cms-doctors-clinicians',
  'cms-provider-services',
  'nppes-registry',
  'bls-oews-baltimore',
  'hrsa-ahrf',
  'maryland-medicaid-pvs',
  'maryland-medicaid-provider-finder',
  'medical-science-field-atlas',
  'clinical-code-systems',
  'clinical-semantic-systems',
  'strategy-field-metrics',
  'need-availability-distortions',
  'allied-care-teams',
]

const datasetInputs = Object.fromEntries(
  datasetPages.map((id) => [`dataset_${id.replaceAll('-', '_')}`, `datasets/${id}.html`]),
)

export default defineConfig({
  publicDir: 'assets/data',
  plugins: [{
    name: 'copy-medtech-static-images',
    closeBundle() {
      if (existsSync('assets/images')) {
        cpSync('assets/images', 'dist/assets/images', { recursive: true })
      }
    },
  }],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        start: 'start.html',
        calendar: 'calendar.html',
        map: 'map.html',
        taxonomy: 'taxonomy.html',
        needAvailabilityDistortions: 'need-availability-distortions.html',
        datasets: 'datasets.html',
        clickthrough: 'clickthrough.html',
        ...datasetInputs,
      },
    },
  },
})
