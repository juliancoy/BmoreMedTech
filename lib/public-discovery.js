import { buildSitemap } from '../../OrgPortal/web/seo.mjs'
import { importantPages } from './site-seo.js'

const defaultApi = 'https://org-codecollective.jcloiacon.workers.dev'
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

async function publicRows(env, url, path, signal) {
  const response = await fetch(new Request(`${env.ORG_API_ORIGIN || defaultApi}${path}`, {
    headers: { 'x-forwarded-host': url.host, 'x-forwarded-proto': 'https' }, signal,
  }))
  if (!response.ok) throw new Error(`Public discovery returned ${response.status}`)
  const rows = await response.json()
  if (!Array.isArray(rows)) throw new Error('Invalid public discovery response')
  return rows
}

export function publicEvents(env, url, signal, upcoming = true) {
  return publicRows(env, url, `/api/network/orgs/public/lifetech/events?hosted_only=true&upcoming_only=${upcoming}&limit=200`, signal)
}

export async function discoveryResponse(request, env, brand) {
  const url = new URL(request.url)
  if (!['/sitemap.xml', '/sitemap-pages.xml', '/sitemap-events.xml', '/sitemap-organizations.xml'].includes(url.pathname)) return null
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  const headers = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' }
  if (request.method === 'HEAD') return new Response(null, { headers })
  const cache = globalThis.caches?.default
  const cacheKey = new Request(new URL(url.pathname, url.origin))
  const cached = cache ? await cache.match(cacheKey) : null
  if (cached) return cached
  try {
    let body
    if (url.pathname === '/sitemap.xml') {
      body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['pages', 'events', 'organizations'].map(kind => `<sitemap><loc>${brand.origin}/sitemap-${kind}.xml</loc></sitemap>`).join('')}</sitemapindex>`
    } else {
      let paths = Object.keys(importantPages)
      const signal = AbortSignal.timeout(8000)
      if (url.pathname === '/sitemap-events.xml') {
        paths = (await publicEvents(env, url, signal, false)).filter(row => row.slug).map(row => `/events/${encodeURIComponent(row.slug)}`)
      }
      if (url.pathname === '/sitemap-organizations.xml') {
        paths = []
        // Public directory only. Bound both the request duration and XML size;
        // never publish a truncated success if the directory outgrows this limit.
        for (let offset = 0; ; offset += 500) {
          const rows = await publicRows(env, url, `/api/network/orgs/public?limit=500&offset=${offset}`, signal)
          paths.push(...rows.filter(row => row.slug).map(row => `/orgs/${encodeURIComponent(row.slug)}`))
          if (rows.length < 500) break
          if (offset >= 44500) throw new Error('Organization sitemap needs partitioning')
        }
      }
      body = buildSitemap(brand.origin, paths)
    }
    const result = new Response(body, { headers })
    if (cache) await cache.put(cacheKey, result.clone())
    return result
  } catch {
    // Let crawlers retry instead of replacing a complete sitemap with an empty one.
    return new Response('Public sitemap temporarily unavailable', { status: 503, headers: { 'retry-after': '300', 'cache-control': 'no-store' } })
  }
}

export async function renderHomeEvent(response, env, url) {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return response
  let events
  try { events = await publicEvents(env, url, AbortSignal.timeout(1500)) } catch { return response }
  const now = Date.now()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
  const next = events.filter(event => {
    const start = Date.parse(event.starts_at || event.event_date)
    const end = Date.parse(event.ends_at || event.starts_at)
    const upcoming = event.starts_at ? Number.isFinite(end) && end >= now : /^\d{4}-\d{2}-\d{2}$/.test(event.event_date) && event.event_date >= today
    return event.slug && Number.isFinite(start) && upcoming
  }).sort((a, b) => Date.parse(a.starts_at || a.event_date) - Date.parse(b.starts_at || b.event_date))[0]
  if (!next) return response
  const start = next.starts_at || next.event_date
  const date = new Date(next.starts_at || `${next.event_date}T12:00:00-05:00`)
  const label = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', ...(next.starts_at ? { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } : {}) }).format(date)
  const venue = next.location || (next.venues || []).filter(venue => venue.event_status === 'confirmed').map(venue => [venue.name, venue.address].filter(Boolean).join(' · ')).join('; ')
  const card = `<a class="hero-event-card" href="/events/${encodeURIComponent(next.slug)}"><span class="hero-event-copy"><span class="hero-event-label">Next LifeTech event</span><span class="hero-event-title">${escape(next.title)}</span><span class="hero-event-meta"><time datetime="${escape(start)}">${escape(label)}</time>${venue ? ` | ${escape(venue)}` : ''}</span></span><span class="hero-event-cue">View event →</span></a>`
  const html = (await response.text()).replace(/(<article\b[^>]*id="next-medtech-event"[^>]*)(>)[\s\S]*?<\/article>/, (match, opening, closing) => `${opening} data-server-rendered="true"${closing}${card}</article>`)
  const headers = new Headers(response.headers)
  for (const key of ['content-length', 'content-encoding', 'etag']) headers.delete(key)
  headers.set('cache-control', 'no-store')
  return new Response(html, { status: response.status, headers })
}

export async function brandAssetResponse(request, env, brand) {
  const url = new URL(request.url)
  // Older favicon responses permanently redirected here; keep cached redirects
  // on this tenant's branding too.
  const iconPaths = ['/favicon.ico', '/favicon.png', '/apple-touch-icon.png', '/codecollective_logo.png']
  const manifestPaths = ['/manifest.webmanifest', '/orgportal.webmanifest', '/site.webmanifest']
  if (!iconPaths.includes(url.pathname) && !manifestPaths.includes(url.pathname)) return null
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
  if (manifestPaths.includes(url.pathname)) {
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ name: brand.name, short_name: brand.name, description: brand.home.description, id: '/', start_url: '/', scope: '/', display: 'standalone', background_color: '#061a26', theme_color: '#061a26', icons: [{ src: brand.logo, sizes: '1254x1254', type: 'image/png', purpose: 'any' }] }), { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' } })
  }
  const assetUrl = new URL(brand.logo, url)
  const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: request.method }))
  // Do not fall through to another tenant's icon when a local build is incomplete.
  if (!asset.ok) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })
  const headers = new Headers(asset.headers)
  headers.set('content-type', 'image/png')
  headers.set('cache-control', 'public, max-age=3600')
  return new Response(request.method === 'HEAD' ? null : asset.body, { headers })
}
