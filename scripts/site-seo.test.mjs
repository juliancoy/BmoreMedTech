import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker.js'
import { importantPages, sitePageSeo } from '../lib/site-seo.js'
import { siteBrand } from '../lib/site-brand.js'
import { canonicalPath } from '../../OrgPortal/web/seo.mjs'

const brand = siteBrand('lifetech')
test('important LifeTech pages have unique metadata and consistent schema URLs', () => {
  const titles = new Set(), descriptions = new Set()
  for (const path of Object.keys(importantPages)) {
    const seo = sitePageSeo(path, brand)
    titles.add(seo.title); descriptions.add(seo.description)
    assert.equal(seo.canonicalUrl, `${brand.origin}${path}`)
    const graph = seo.jsonLd[0]['@graph']
    assert.equal(graph.find(entry => entry['@id'] === `${seo.canonicalUrl}#webpage`).url, seo.canonicalUrl)
    assert.equal(graph.find(entry => entry['@type'] === 'Organization').name, 'LifeTech')
  }
  assert.equal(titles.size, Object.keys(importantPages).length)
  assert.equal(descriptions.size, titles.size)
  assert.equal(canonicalPath('/ecosystem/index.html'), '/ecosystem')
  assert.equal(canonicalPath('/ecosystem/network.html'), '/ecosystem/network')
  assert.equal(canonicalPath('/index.html'), '/')
  assert.equal(sitePageSeo('/', siteBrand('medtech')), null)
})

test('LifeTech discovery endpoints list only the important public canonical pages', async () => {
  const sitemap = await worker.fetch(new Request(`${brand.origin}/sitemap.xml`), { SITE_BRAND: 'lifetech' })
  assert.equal(sitemap.status, 200)
  assert.match(sitemap.headers.get('content-type'), /application\/xml/)
  const xml = await sitemap.text()
  for (const path of Object.keys(importantPages)) assert.ok(xml.includes(`<loc>${brand.origin}${path}</loc>`))
  assert.doesNotMatch(xml, /\.html|users\/|search|chat|onboarding/)
  const robots = await worker.fetch(new Request(`${brand.origin}/robots.txt`), { SITE_BRAND: 'lifetech' })
  assert.match(await robots.text(), /Sitemap: https:\/\/lifetech.fyi\/sitemap.xml/)
  const head = await worker.fetch(new Request(`${brand.origin}/sitemap.xml`, { method: 'HEAD' }), { SITE_BRAND: 'lifetech' })
  assert.equal(await head.text(), '')
})

test('portal page SEO differentiates public events from login and search', async t => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('<html><head><title>Portal</title></head><body><div id="root"></div></body></html>', { headers: { 'content-type': 'text/html' } })
  t.after(() => { globalThis.fetch = originalFetch })
  for (const path of ['/org-events?utm_source=test', '/users/login?next=%2Fchat', '/search?q=health']) {
    const response = await worker.fetch(new Request(`${brand.origin}${path}`), { SITE_BRAND: 'lifetech', PORTAL_SITE_ORIGIN: 'https://portal.example' })
    const html = await response.text()
    assert.match(html, path.startsWith('/org-events') ? /name="robots" content="index,follow/ : /name="robots" content="noindex,follow"/)
    assert.match(html, new RegExp(`rel="canonical" href="https://lifetech.fyi${path.split('?')[0]}"`))
    if (path.startsWith('/org-events')) {
      assert.match(html, /Health, Medicine &amp; Biotech Meetups in Baltimore/)
      assert.match(html, /"@type":"CollectionPage"/)
    }
  }
})

test('missing navigation pages return 404 and cannot be indexed as the homepage', async () => {
  const env = { SITE_BRAND: 'lifetech', ASSETS: { fetch: async request => new URL(request.url).pathname === '/index.html' ? new Response('<html><head></head><body>LifeTech</body></html>') : new Response('Missing', { status: 404 }) } }
  const response = await worker.fetch(new Request(`${brand.origin}/not-a-real-page`, { headers: { accept: 'text/html' } }), env)
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('x-robots-tag'), 'noindex')
})
