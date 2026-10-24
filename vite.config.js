import { isPortalPagePath } from '../OrgPortal/web/portalRoutes.mjs'
import { readFileSync, existsSync } from 'node:fs'
import { brandAssetResponse } from './lib/public-discovery.js'
import { sitePageSeo } from './lib/site-seo.js'
import { applySeo, canonicalPath } from '../OrgPortal/web/seo.mjs'
import { defineConfig } from 'vite'
import { prepareBuildAssets } from './scripts/prepare-build-assets.mjs'
import { siteBrand, renderSiteBrand } from './lib/site-brand.js'

const desktopDev = process.env.LIFETECH_DESKTOP_DEV === '1'
const localOrigin = process.env.LIFETECH_LOCAL_ORIGIN || 'https://localhost:8770'
if (desktopDev && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(localOrigin).hostname)) throw new Error('LIFETECH_LOCAL_ORIGIN must point to the local stack')
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
  server: desktopDev ? { proxy: { '/api': { target: localOrigin, changeOrigin: true, secure: false }, '/pidp': { target: localOrigin, changeOrigin: true, secure: false } } } : undefined,
  plugins: [{
    name: 'site-brand',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const path = new URL(req.url, 'http://localhost').pathname
          if (desktopDev && path !== '/' && path !== '/index.html' && isPortalPagePath(path) && !existsSync(new URL(`.${path}.html`, import.meta.url))) {
            res.writeHead(302, { location: new URL(req.url, localOrigin).href }); res.end(); return
          }
          if (path === '/ecosystem') req.url = req.url.replace('/ecosystem', '/ecosystem/index.html')
          const request = new Request(new URL(req.url, 'http://localhost'), { method: req.method })
          const response = await brandAssetResponse(request, {
            ASSETS: { fetch: async () => new Response(readFileSync(new URL(`.${brand.logo}`, import.meta.url))) },
          }, brand)
          if (!response) return next()
          res.writeHead(response.status, Object.fromEntries(response.headers))
          res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()))
        } catch (error) { next(error) }
      })
    },
    enforce: 'pre',
    transformIndexHtml: { order: 'pre', handler(html, context) {
      const rendered = renderSiteBrand(html, brand).replace(/href="(\/[^"?#]*\.html)([^"]*)"/g, (_, path, suffix) => `href="${canonicalPath(path)}${suffix}"`)
      const title = rendered.match(/<title>(.*?)<\/title>/s)?.[1] || brand.name
      const description = rendered.match(/<meta\s+name="description"\s+content="([^"]*)"/s)?.[1] || brand.home.description
      const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>')
      const pathname = canonicalPath(context.path)
      const seoHtml = applySeo(rendered, {
        title: decode(title), description: decode(description),
        canonicalUrl: new URL(pathname, brand.origin).href,
        ...(brand.name === 'LifeTech' ? { iconUrl: '/favicon.ico' } : {}),
        siteName: brand.name, imageUrl: new URL(brand.social, brand.origin).href,
        imageWidth: brand.socialWidth, imageHeight: brand.socialHeight,
        imageType: 'image/png', imageAlt: `${brand.name} — Health × Medicine × Biotech`,
        ...(sitePageSeo(pathname, brand) || {}),
      })
      return brand.name === 'LifeTech' ? seoHtml.replace('</head>', '<link rel="manifest" href="/manifest.webmanifest"></head>') : seoHtml
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
