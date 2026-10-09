import { withEventSourcePreview } from '../OrgPortal/web/eventSourcePreview.mjs'
import { eventListingPreview } from '../OrgPortal/web/eventListingPreview.mjs'
import { deploymentResponse, deploymentCachePolicy, isDeploymentAssetRequest } from '../OrgPortal/web/deployment.mjs'
import { importantPages, sitePageSeo } from './lib/site-seo.js'
import { isPortalPagePath, notFoundResponse, missingPortalResource } from '../OrgPortal/web/portalRoutes.mjs'
import { applySeo, canonicalPath, buildSitemap } from '../OrgPortal/web/seo.mjs'
import { handleDatasetApi } from './worker/datasets.js'
import { siteBrand } from './lib/site-brand.js'

const ALLOWED_CORS_ORIGINS = new Set([
  'https://baltimore-medtech.jcloiacon.workers.dev',
  'https://lifetech.fyi',
  'https://medtech.social',
  'https://baltimoremedtech.org',
  'https://www.baltimoremedtech.org',
  'https://bmoremedtech.org',
  'https://www.bmoremedtech.org',
  'https://codecollective.us',
])

const DEFAULT_ORG_API_ORIGIN = 'https://org-codecollective.jcloiacon.workers.dev'
const DEFAULT_CHAT_API_ORIGIN = 'https://chat-codecollective.jcloiacon.workers.dev'
const DEFAULT_PIDP_API_ORIGIN = 'https://pidp-codecollective.jcloiacon.workers.dev'
const DEFAULT_PORTAL_SITE_ORIGIN = 'https://codecollective.us'


function allowedCorsOrigin(request) {
  const origin = request.headers.get('origin')
  if (!origin) return null
  if (ALLOWED_CORS_ORIGINS.has(origin)) return origin
  try {
    const url = new URL(origin)
    if (['localhost', '127.0.0.1', 'host.docker.internal'].includes(url.hostname)) return origin
  } catch {
    return null
  }
  return null
}

function applyCorsHeaders(request, headers) {
  const origin = allowedCorsOrigin(request)
  if (!origin) return headers
  headers.set('access-control-allow-origin', origin)
  headers.set('access-control-allow-methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS')
  headers.set('access-control-allow-headers', request.headers.get('access-control-request-headers') || 'authorization,content-type,x-requested-with')
  headers.set('access-control-max-age', '86400')
  headers.append('vary', 'Origin')
  return headers
}

function preflightResponse(request) {
  if (request.headers.has('origin') && !allowedCorsOrigin(request)) {
    return new Response(null, { status: 403 })
  }
  const headers = applyCorsHeaders(request, new Headers({ allow: 'GET, HEAD, OPTIONS' }))
  return new Response(null, { status: 204, headers })
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function splitSetCookieHeader(value) {
  if (!value) return []
  return value
    .split(/,(?=\s*[^;,\s]+=)/g)
    .map((cookie) => cookie.trim())
    .filter(Boolean)
}

function responseSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    const cookies = headers.getSetCookie()
    if (cookies.length) return cookies
  }
  return splitSetCookieHeader(headers.get('set-cookie'))
}

function stripCookieDomains(responseHeaders, cookies) {
  responseHeaders.delete('set-cookie')
  for (const cookie of cookies) {
    responseHeaders.append('set-cookie', cookie.replace(/;\s*Domain=[^;]+/gi, ''))
  }
}

function prefixProxyLocation(location, prefix) {
  if (!prefix || !location || !location.startsWith('/')) return location
  if (location === prefix || location.startsWith(`${prefix}/`)) return location
  return `${prefix}${location}`
}

function tenantPortalPageTitle(pathname, brand) {
  if (pathname === '/branding') return `Brand Guide | ${brand.name}`
  if (pathname === '/org-events' || pathname.startsWith('/org-events/')) return `Events | ${brand.name}`
  if (pathname === '/resources' || pathname.startsWith('/resources/')) return `Resources | ${brand.name}`
  if (pathname === '/search') return `Search | ${brand.name}`
  if (pathname === '/users/login') return `Login | ${brand.name}`
  if (pathname === '/users/register') return `Register | ${brand.name}`
  return `${brand.name} Portal`
}

function tenantPortalMetadata(url, brand) {
  const image = new URL(brand.social, url.origin).toString()
  const canonical = new URL(canonicalPath(url.pathname), url.origin).toString()
  const title = tenantPortalPageTitle(url.pathname, brand)
  return {
    title,
    description: brand.home.description,
    canonicalUrl: canonical,
    imageUrl: image,
    imageWidth: brand.socialWidth,
    imageHeight: brand.socialHeight,
    imageType: 'image/png',
    iconUrl: new URL(brand.logo, url.origin).toString(),
    themeColor: '#061a26',
    robots: /^(?:\/(?:users|chat|onboarding|availability|auth|admin|email|create|people|search|profile|settings|tools))(?:\/|$)/.test(url.pathname) ? 'noindex,follow' : 'index,follow,max-image-preview:large',
    imageAlt: `${brand.name} — Health × Medicine × Biotech`,
    siteName: brand.name,
    ...(sitePageSeo(url.pathname, brand) || {}),
  }
}

async function applyTenantPortalMetadata(request, response, url, env) {
  const brand = siteBrand(env.SITE_BRAND)
  if (!response.ok || request.method === 'HEAD') return response
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) return response

  const metadata = tenantPortalMetadata(url, brand)
  const eventMatch = /^\/events\/([^/]+)\/?$/.exec(url.pathname)
  if (eventMatch) {
    try {
      const eventResponse = await fetch(new Request(`${env.ORG_API_ORIGIN || DEFAULT_ORG_API_ORIGIN}/api/network/events/public/${encodeURIComponent(decodeURIComponent(eventMatch[1]))}`, {
        headers: { 'x-forwarded-host': url.host, 'x-forwarded-proto': url.protocol.slice(0, -1) },
        signal: AbortSignal.timeout(5000),
      }))
      if (eventResponse.ok) {
        const event = await withEventSourcePreview(await eventResponse.json())
        const preview = eventListingPreview(event, url.origin)
        if (preview.title) metadata.title = preview.title
        if (preview.description) metadata.description = preview.description
        if (preview.image) {
          metadata.imageUrl = new URL(preview.image, url.origin).href
          metadata.imageAlt = preview.title || metadata.title
          delete metadata.imageWidth
          delete metadata.imageHeight
          delete metadata.imageType
        }
      }
    } catch { /* Preserve tenant metadata if the authoritative event API is unavailable. */ }
  }
  const html = applySeo(await response.text(), metadata)

  const headers = new Headers(response.headers)
  headers.set('content-type', 'text/html; charset=utf-8')
  headers.set('cache-control', 'no-store')
  headers.set('referrer-policy', 'no-referrer')
  headers.delete('content-length')
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function proxyResponse(request, targetOriginValue, url, { stripPrefix = '', rewriteCookieDomain = false, forwardedPrefix = '' } = {}) {
  const targetUrl = new URL(url)
  const targetOrigin = new URL(trimTrailingSlash(targetOriginValue))
  targetUrl.protocol = targetOrigin.protocol
  targetUrl.hostname = targetOrigin.hostname
  targetUrl.port = targetOrigin.port
  if (stripPrefix && (url.pathname === stripPrefix || url.pathname.startsWith(`${stripPrefix}/`))) {
    targetUrl.pathname = url.pathname.slice(stripPrefix.length) || '/'
  }

  const headers = new Headers(request.headers)
  headers.set('x-forwarded-host', url.host)
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''))
  if (forwardedPrefix) headers.set('x-forwarded-prefix', forwardedPrefix)
  headers.delete('host')

  const proxiedInit = {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  }
  if (proxiedInit.body) proxiedInit.duplex = 'half'

  return fetch(new Request(targetUrl.toString(), proxiedInit)).then((response) => {
    if (response.status === 101) return response
    const responseHeaders = new Headers(response.headers)
    if (forwardedPrefix && responseHeaders.has('location')) {
      responseHeaders.set('location', prefixProxyLocation(responseHeaders.get('location') || '', forwardedPrefix))
    }
    if (rewriteCookieDomain) {
      const cookies = responseSetCookies(response.headers)
      if (cookies.length) {
        stripCookieDomains(responseHeaders, cookies)
      }
      const publicAvatar = /^\/avatars\//.test(targetUrl.pathname)
        && ['GET', 'HEAD'].includes(request.method)
        && [200, 304].includes(response.status)
        && !cookies.length
      if (!publicAvatar) responseHeaders.set('cache-control', 'no-store')
      responseHeaders.set('referrer-policy', 'no-referrer')
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  })
}

function portalRootAssetProxyResponse(request, env, url) {
  const targetUrl = new URL(url)
  targetUrl.pathname = `/__portal_root${targetUrl.pathname}`
  return proxyResponse(request, env.PORTAL_SITE_ORIGIN || DEFAULT_PORTAL_SITE_ORIGIN, targetUrl, { rewriteCookieDomain: true })
}

function portalRootNavigationProxyResponse(request, env, url) {
  const targetUrl = new URL(url)
  targetUrl.pathname = '/__portal_root/'
  return proxyResponse(request, env.PORTAL_SITE_ORIGIN || DEFAULT_PORTAL_SITE_ORIGIN, targetUrl, { rewriteCookieDomain: true })
    .then((response) => applyTenantPortalMetadata(request, response, url, env))
}

function applyApiHeaders(request, response) {
  if (response.status === 101) return response
  const headers = applyCorsHeaders(request, new Headers(response.headers))
  headers.set('x-content-type-options', 'nosniff')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function applyStaticHeaders(request, path, response) {
  const headers = new Headers(response.headers)

  if (path.startsWith('/assets/')) {
    headers.set('cache-control', 'public, max-age=31536000, immutable')
  } else if (path === '/' || path.endsWith('.html')) {
    headers.set('cache-control', 'public, max-age=0, must-revalidate')
  } else {
    headers.set('cache-control', 'public, max-age=300, must-revalidate')
  }
  applyCorsHeaders(request, headers)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function isHtmlNavigation(request) {
  if (request.method !== 'GET') return false
  const accept = request.headers.get('accept') || ''
  return accept.includes('text/html')
}

function isRootPortalAssetPath(pathname) {
  return pathname === '/assets' || pathname.startsWith('/assets/')
    || pathname === '/ecosystem-data' || pathname.startsWith('/ecosystem-data/')
    || pathname === '/images' || pathname.startsWith('/images/')
    || pathname === '/css' || pathname.startsWith('/css/')
    || pathname === '/mobile-update.json'
    || /^\/[^/]+\.(?:png|jpe?g|webp|gif|svg|ico|css|js|wasm|webmanifest)$/.test(pathname)
}

async function localAssetResponse(request, env, path) {
  const response = await env.ASSETS.fetch(request)
  if (response.status === 404) return null
  return applyStaticHeaders(request, path, response)
}

function isPortalDevAssetPath(pathname) {
  return pathname === '/@vite' || pathname.startsWith('/@vite/')
    || pathname === '/@react-refresh'
    || pathname === '/src' || pathname.startsWith('/src/')
    || pathname === '/node_modules' || pathname.startsWith('/node_modules/')
}

function isPortalRoute(pathname) {
  return pathname === '/ecosystem/network' || pathname === '/ecosystem/network/' || pathname.startsWith('/ecosystem/network/') || pathname === '/onboarding' || pathname === '/availability' || pathname.startsWith('/availability/')
    || pathname === '/governance' || pathname.startsWith('/governance/')
    || pathname === '/users' || pathname.startsWith('/users/')
    || pathname === '/events' || pathname.startsWith('/events/')
    || pathname === '/org-events' || pathname.startsWith('/org-events/')
    || pathname === '/specialty' || pathname.startsWith('/specialty/')
    || pathname === '/orgs' || pathname.startsWith('/orgs/')
    || pathname === '/create' || pathname.startsWith('/create/')
    || pathname === '/people' || pathname.startsWith('/people/')
    || pathname === '/chat' || pathname.startsWith('/chat/')
    || pathname === '/auth/callback'
    || pathname === '/email' || pathname.startsWith('/email/')
    || pathname === '/admin' || pathname.startsWith('/admin/')
    || pathname === '/profile'
    || pathname === '/settings' || pathname.startsWith('/settings/')
    || pathname === '/search'
    || pathname === '/branding'
    || pathname === '/resources' || pathname.startsWith('/resources/')
    || pathname === '/tools' || pathname.startsWith('/tools/')
}


const productionWorker = {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return preflightResponse(request)

    if (env.SITE_BRAND === 'lifetech' && ['/robots.txt', '/sitemap.xml'].includes(url.pathname)) {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
      const brand = siteBrand(env.SITE_BRAND)
      const sitemap = url.pathname === '/sitemap.xml'
      const body = sitemap ? buildSitemap(brand.origin, Object.keys(importantPages)) : `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /pidp/\nSitemap: ${brand.origin}/sitemap.xml\n`
      return new Response(request.method === 'HEAD' ? null : body, { headers: { 'content-type': sitemap ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
    }

    if (env.SITE_BRAND === 'lifetech' && ['/portals/lifetech', '/portals/lifetech/'].includes(url.pathname)) {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
      url.pathname = '/'
      return Response.redirect(url.toString(), 301)
    }

    if (url.pathname === '/community' || url.pathname.startsWith('/community/')) {
      return Response.redirect(`${url.origin}/`, 301)
    }

    if (url.pathname === '/medtech-events' || url.pathname.startsWith('/medtech-events/')) {
      url.pathname = url.pathname.replace(/^\/medtech-events/, '/org-events')
      return Response.redirect(url.toString(), 301)
    }

    if (url.pathname === '/branding.html') {
      url.pathname = '/branding'
      return Response.redirect(url.toString(), 301)
    }

    if (isPortalDevAssetPath(url.pathname)) {
      return proxyResponse(request, env.PORTAL_SITE_ORIGIN || DEFAULT_PORTAL_SITE_ORIGIN, url, { rewriteCookieDomain: true })
    }

    if (url.pathname.startsWith('/ecosystem-data/')) return portalRootAssetProxyResponse(request, env, url)

    if (url.pathname === '/specialty' || url.pathname.startsWith('/specialty/')) {
      return portalRootAssetProxyResponse(request, env, url)
    }

    if (isRootPortalAssetPath(url.pathname)) {
      const response = await localAssetResponse(request, env, url.pathname)
      if (response) return response
      return portalRootAssetProxyResponse(request, env, url)
    }

    if (url.pathname === '/api/datasets' || url.pathname.startsWith('/api/datasets/')) {
      const response = await handleDatasetApi(request, env, url)
      return applyApiHeaders(request, response)
    }

    if (url.pathname === '/.well-known/oauth-protected-resource/api/org/mcp' || url.pathname.startsWith('/.well-known/oauth-protected-resource/api/org/mcp/')) {
      const response = await proxyResponse(request, env.ORG_API_ORIGIN || DEFAULT_ORG_API_ORIGIN, url)
      return applyApiHeaders(request, response)
    }

    if (url.pathname === '/api/governance' || url.pathname.startsWith('/api/governance/')) {
      const response = await proxyResponse(request, env.ORG_API_ORIGIN || DEFAULT_ORG_API_ORIGIN, url)
      return applyApiHeaders(request, response)
    }

    if (url.pathname === '/api/org' || url.pathname.startsWith('/api/org/')) {
      const response = await proxyResponse(request, env.ORG_API_ORIGIN || DEFAULT_ORG_API_ORIGIN, url, { stripPrefix: '/api/org' })
      if (request.method === 'GET' && /^\/api\/org\/api\/network\/events\/public\/[^/]+$/.test(url.pathname) && response.ok) {
        try {
          const event = await response.clone().json()
          const enriched = await withEventSourcePreview(event)
          if (enriched !== event) {
            const headers = new Headers(response.headers)
            for (const name of ['content-length', 'content-encoding', 'etag']) headers.delete(name)
            headers.set('cache-control', 'no-store')
            return applyApiHeaders(request, Response.json(enriched, { status: response.status, headers }))
          }
        } catch { /* Preserve the API response when preview lookup fails. */ }
      }
      return applyApiHeaders(request, response)
    }

    if (url.pathname === '/api/network' || url.pathname.startsWith('/api/network/')) {
      const response = await proxyResponse(request, env.ORG_API_ORIGIN || DEFAULT_ORG_API_ORIGIN, url)
      return applyApiHeaders(request, response)
    }

    if (url.pathname === '/api/chat' || url.pathname.startsWith('/api/chat/')) {
      const response = await proxyResponse(request, env.CHAT_API_ORIGIN || DEFAULT_CHAT_API_ORIGIN, url, { stripPrefix: '/api/chat' })
      return applyApiHeaders(request, response)
    }

    if (url.pathname === '/pidp' || url.pathname.startsWith('/pidp/')) {
      const response = await proxyResponse(request, env.PIDP_PROXY_ORIGIN || env.PIDP_API_ORIGIN || DEFAULT_PIDP_API_ORIGIN, url, {
        stripPrefix: '/pidp',
        forwardedPrefix: '/pidp',
        rewriteCookieDomain: true,
      })
      return applyApiHeaders(request, response)
    }

    // LifeTech-owned static routes; never route these through the shared portal.
    const ecosystemAssets = { '/ecosystem': '/ecosystem/', '/ecosystem/': '/ecosystem/' }
    if (ecosystemAssets[url.pathname]) {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
      const assetUrl = new URL(request.url)
      assetUrl.pathname = ecosystemAssets[url.pathname]
      const response = await env.ASSETS.fetch(new Request(assetUrl, request))
      return applyStaticHeaders(request, '/ecosystem.html', response)
    }

    if (isPortalRoute(url.pathname)) {
      if (!isPortalPagePath(url.pathname)) return notFoundResponse(request)
      return portalRootNavigationProxyResponse(request, env, url)
    }

    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404) return applyStaticHeaders(request, url.pathname, response)

    if (isHtmlNavigation(request)) {
      return notFoundResponse(request)
    }

    return response
  },
}

export default {
  async fetch(request, env) {
    const missing = await missingPortalResource(request, new URL(request.url).pathname, env.ORG_API_ORIGIN || DEFAULT_ORG_API_ORIGIN)
    if (missing) return missing
    const selected = await deploymentResponse(request, env, { enabled: env.SITE_BRAND === 'lifetech', mount: 'lifetech' })
    if (selected) return selected
    const response = await productionWorker.fetch(request, env)
    return isDeploymentAssetRequest(request) ? deploymentCachePolicy(response, env) : response
  },
}
