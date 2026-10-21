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

test('LifeTech sitemap index links its public page, event, and organization maps', async () => {
  const sitemap = await worker.fetch(new Request(`${brand.origin}/sitemap.xml`), { SITE_BRAND: 'lifetech' })
  assert.equal(sitemap.status, 200)
  assert.match(sitemap.headers.get('content-type'), /application\/xml/)
  const xml = await sitemap.text()
  for (const kind of ['pages', 'events', 'organizations']) assert.ok(xml.includes(`<loc>${brand.origin}/sitemap-${kind}.xml</loc>`))
  const pages = await worker.fetch(new Request(`${brand.origin}/sitemap-pages.xml`), { SITE_BRAND: 'lifetech' })
  const pagesXml = await pages.text()
  for (const path of Object.keys(importantPages)) assert.ok(pagesXml.includes(`<loc>${brand.origin}${path}</loc>`))
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

test('LifeTech identity assets cannot fall back to Code Collective', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Shared fallback must not run') })
  const env = { SITE_BRAND: 'lifetech', ASSETS: { fetch: async request => {
    assert.equal(new URL(request.url).pathname, brand.logo)
    return new Response('lifetech-image', { headers: { 'content-type': 'image/png' } })
  } } }
  const icon = await worker.fetch(new Request(`${brand.origin}/favicon.ico`), env)
  assert.equal(await icon.text(), 'lifetech-image')
  assert.equal(icon.headers.get('content-type'), 'image/png')
  const legacy = await worker.fetch(new Request(`${brand.origin}/codecollective_logo.png`), env)
  assert.equal(await legacy.text(), 'lifetech-image')
  for (const path of ['/manifest.webmanifest', '/orgportal.webmanifest']) {
    const manifest = await worker.fetch(new Request(`${brand.origin}${path}`), env)
    const body = await manifest.json()
    assert.equal(body.name, 'LifeTech')
    assert.equal(body.icons[0].src, brand.logo)
    assert.doesNotMatch(JSON.stringify(body), /Code Collective|codecollective/)
  }
  const missing = await worker.fetch(new Request(`${brand.origin}/favicon.ico`), { ...env, ASSETS: { fetch: async () => new Response(null, { status: 404 }) } })
  assert.equal(missing.status, 404)
})

test('public sitemaps paginate live organizations and include event URLs', async t => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async request => {
    const url = new URL(request.url)
    requests.push(url)
    assert.equal(request.headers.get('authorization'), null)
    assert.equal(request.headers.get('cookie'), null)
    if (url.pathname.endsWith('/events')) return Response.json([{ slug: 'demo-day' }])
    return Response.json(url.searchParams.get('offset') === '0'
      ? Array.from({ length: 500 }, (_, i) => ({ slug: `company-${i}` }))
      : [{ slug: 'formedinsight' }])
  })
  const env = { SITE_BRAND: 'lifetech', ORG_API_ORIGIN: 'https://api.example' }
  const organizations = await worker.fetch(new Request(`${brand.origin}/sitemap-organizations.xml`), env)
  assert.equal(organizations.status, 200)
  const xml = await organizations.text()
  assert.equal((xml.match(/<url>/g) || []).length, 501)
  assert.match(xml, /https:\/\/lifetech.fyi\/orgs\/formedinsight/)
  assert.deepEqual(requests.map(url => url.searchParams.get('offset')), ['0', '500'])
  const events = await worker.fetch(new Request(`${brand.origin}/sitemap-events.xml`), env)
  assert.match(await events.text(), /https:\/\/lifetech.fyi\/events\/demo-day/)
})

test('sitemap API failures return a retryable error rather than an empty success', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Unavailable', { status: 503 }))
  const result = await worker.fetch(new Request(`${brand.origin}/sitemap-organizations.xml`), { SITE_BRAND: 'lifetech' })
  assert.equal(result.status, 503)
  assert.equal(result.headers.get('retry-after'), '300')
})

test('homepage serves a safe upcoming event before JavaScript runs and survives API failure', async t => {
  const template = '<html><head></head><body><article id="next-medtech-event" class="hero-event"><a href="/org-events">Browse events</a></article></body></html>'
  const env = { SITE_BRAND: 'lifetech', ASSETS: { fetch: async () => new Response(template, { headers: { 'content-type': 'text/html' } }) } }
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json([
    { slug: 'old-event', title: 'Old event', starts_at: '2000-01-01T12:00:00Z' },
    { slug: 'demo-day', title: 'Demo <script> & $&', starts_at: '2099-11-17T23:00:00Z', venues: [{ name: 'Baltimore & beyond' }] },
  ]))
  const result = await worker.fetch(new Request(`${brand.origin}/`), env)
  const html = await result.text()
  assert.match(html, /data-server-rendered="true"/)
  assert.match(html, /href="\/events\/demo-day"/)
  assert.match(html, /Demo &lt;script&gt; &amp; \$&amp;/)
  assert.match(html, /<time datetime="2099-11-17T23:00:00Z">/)
  assert.doesNotMatch(html, /old-event|<script>/)
  mock.mock.mockImplementation(async () => { throw new Error('timeout') })
  const fallback = await worker.fetch(new Request(`${brand.origin}/`), env)
  assert.equal(await fallback.text(), template)
})
