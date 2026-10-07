import { sitePageSeo } from './lib/site-seo.js'
import { applySeo, canonicalPath } from '../OrgPortal/web/seo.mjs'
import { defineConfig } from 'vite'
import { prepareBuildAssets } from './scripts/prepare-build-assets.mjs'
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
    transformIndexHtml: { order: 'pre', handler(html, context) {
      const rendered = renderSiteBrand(html, brand).replace(/href="(\/[^"?#]*\.html)([^"]*)"/g, (_, path, suffix) => `href="${canonicalPath(path)}${suffix}"`)
      const title = rendered.match(/<title>(.*?)<\/title>/s)?.[1] || brand.name
      const description = rendered.match(/<meta\s+name="description"\s+content="([^"]*)"/s)?.[1] || brand.home.description
      const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>')
      const pathname = canonicalPath(context.path)
      return applySeo(rendered, {
        title: decode(title), description: decode(description),
        canonicalUrl: new URL(pathname, brand.origin).href,
        siteName: brand.name, imageUrl: new URL(brand.social, brand.origin).href,
        imageWidth: brand.socialWidth, imageHeight: brand.socialHeight,
        imageType: 'image/png', imageAlt: `${brand.name} — Health × Medicine × Biotech`,
        ...(sitePageSeo(pathname, brand) || {}),
      })
    } },
    transform(code, id) {
      if (!id.includes('/node_modules/') && /\.[cm]?js(?:\?|$)/.test(id)) {
        return renderSiteBrand(code, brand)
      }
    },
  }, {
    name: 'prepare-site-public-assets',
    closeBundle() {
      prepareBuildAssets(outputDirectory, brand)
    },
  }],
  build: {
    outDir: outputDirectory,
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about.html',
        ecosystem: 'ecosystem/index.html',
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
