import { defineConfig } from 'vite'
import { cpSync, existsSync } from 'node:fs'
import { siteBrand, renderSiteBrand } from './lib/site-brand.js'

const brandId = process.env.SITE_BRAND || 'medtech'
const brand = siteBrand(brandId)
const outputDirectory = brandId === 'medtech' ? 'dist' : 'dist-lifetech'

const datasetPages = [
  'medtech-meta-index',
  'cms-doctors-clinicians',
  'cms-provider-services',
  'nppes-registry',
  'bls-oews-baltimore',
  'hrsa-ahrf',
  'maryland-medicaid-pvs',
  'maryland-medicaid-provider-finder',
  'service-delivery-source-catalog',
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
    name: 'site-brand',
    enforce: 'pre',
    transformIndexHtml: { order: 'pre', handler: html => renderSiteBrand(html, brand) },
    transform(code, id) {
      if (!id.includes('/node_modules/') && /\.[cm]?js(?:\?|$)/.test(id)) {
        return renderSiteBrand(code, brand)
      }
    },
  }, {
    name: 'copy-medtech-static-images',
    closeBundle() {
      if (existsSync('assets/images')) {
        cpSync('assets/images', `${outputDirectory}/assets/images`, { recursive: true })
      }
    },
  }],
  build: {
    outDir: outputDirectory,
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about.html',
        ecosystem: 'ecosystem/index.html',
        ecosystemNetwork: 'ecosystem/network.html',
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
