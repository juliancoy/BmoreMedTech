import { handleDatasetApi } from './worker/datasets.js'

const ALLOWED_CORS_ORIGINS = new Set([
  'https://baltimore-medtech.jcloiacon.workers.dev',
  'https://medtech.social',
  'https://baltimoremedtech.org',
  'https://www.baltimoremedtech.org',
  'https://bmoremedtech.org',
  'https://www.bmoremedtech.org',
  'https://codecollective.us',
])

const DEFAULT_ORG_API_ORIGIN = 'https://org-codecollective.jcloiacon.workers.dev'
const DEFAULT_PIDP_API_ORIGIN = 'https://pidp-codecollective.jcloiacon.workers.dev'
const DEFAULT_PORTAL_SITE_ORIGIN = 'https://codecollective.us'
const MEDTECH_BRAND = {
  name: 'Baltimore MedTech',
  tagline: 'Health × Medicine × Biotech',
  description: 'Find your next conversation, connection, or local event across health, medicine, and biotech.',
  imagePath: '/images/baltimore-medtech-logo-square-v2.jpg',
  manifestPath: '/medtech.webmanifest',
  themeColor: '#061a26',
}

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

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char])
}

function medTechPortalPageTitle(pathname) {
  if (pathname === '/branding') return `Brand Guide | ${MEDTECH_BRAND.name}`
  if (pathname === '/org-events' || pathname.startsWith('/org-events/')) return `MedTech Events | ${MEDTECH_BRAND.name}`
  if (pathname === '/resources' || pathname.startsWith('/resources/')) return `Resources | ${MEDTECH_BRAND.name}`
  if (pathname === '/search') return `Search | ${MEDTECH_BRAND.name}`
  if (pathname === '/users/login') return `Login | ${MEDTECH_BRAND.name}`
  if (pathname === '/users/register') return `Register | ${MEDTECH_BRAND.name}`
  return `${MEDTECH_BRAND.name} Portal`
}

function medTechPortalMetadata(url) {
  const image = new URL(MEDTECH_BRAND.imagePath, url.origin).toString()
  const canonical = new URL(url.pathname + url.search, url.origin).toString()
  const title = medTechPortalPageTitle(url.pathname)
  return {
    title,
    description: MEDTECH_BRAND.description,
    canonical,
    image,
    imageAlt: `${MEDTECH_BRAND.name} logo`,
    siteName: MEDTECH_BRAND.name,
  }
}

async function applyMedTechPortalMetadata(request, response, url) {
  if (!response.ok || request.method === 'HEAD') return response
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) return response

  const metadata = medTechPortalMetadata(url)
  let html = await response.text()
  const tags = [
    `<title>${escapeHtml(metadata.title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(metadata.canonical)}" />`,
    `<link rel="icon" type="image/jpeg" href="${escapeHtml(MEDTECH_BRAND.imagePath)}" />`,
    `<link rel="apple-touch-icon" href="${escapeHtml(MEDTECH_BRAND.imagePath)}" />`,
    `<link rel="manifest" href="${escapeHtml(MEDTECH_BRAND.manifestPath)}" />`,
    `<meta name="theme-color" content="${escapeHtml(MEDTECH_BRAND.themeColor)}" />`,
    `<meta name="description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="robots" content="index,follow,max-image-preview:large" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:site_name" content="${escapeHtml(metadata.siteName)}" />`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(metadata.canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(metadata.image)}" />`,
    `<meta property="og:image:secure_url" content="${escapeHtml(metadata.image)}" />`,
    `<meta property="og:image:type" content="image/jpeg" />`,
    `<meta property="og:image:alt" content="${escapeHtml(metadata.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(metadata.image)}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(metadata.imageAlt)}" />`,
  ]
  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<link\s+rel=["'](?:canonical|icon|apple-touch-icon|manifest)["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["'](?:description|robots|theme-color|twitter:[^"']+)["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
  html = html.replace('</head>', `${tags.join('\n    ')}\n  </head>`)

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
    const responseHeaders = new Headers(response.headers)
    if (forwardedPrefix && responseHeaders.has('location')) {
      responseHeaders.set('location', prefixProxyLocation(responseHeaders.get('location') || '', forwardedPrefix))
    }
    if (rewriteCookieDomain) {
      const cookies = responseSetCookies(response.headers)
      if (cookies.length) {
        stripCookieDomains(responseHeaders, cookies)
      }
      responseHeaders.set('cache-control', 'no-store')
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
    .then((response) => applyMedTechPortalMetadata(request, response, url))
}

function applyApiHeaders(request, response) {
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
  return pathname === '/users' || pathname.startsWith('/users/')
    || pathname === '/events' || pathname.startsWith('/events/')
    || pathname === '/org-events' || pathname.startsWith('/org-events/')
    || pathname === '/specialty' || pathname.startsWith('/specialty/')
    || isMedTechTenantOrgRoute(pathname)
    || pathname === '/people' || pathname.startsWith('/people/')
    || pathname === '/chat' || pathname.startsWith('/chat/')
    || pathname === '/auth/callback'
    || pathname === '/email' || pathname.startsWith('/email/')
    || pathname === '/profile'
    || pathname === '/settings'
    || pathname === '/search'
    || pathname === '/branding'
    || pathname === '/resources' || pathname.startsWith('/resources/')
    || pathname === '/tools' || pathname.startsWith('/tools/')
}

function isMedTechTenantOrgRoute(pathname) {
  return pathname === '/orgs/login'
    || pathname.startsWith('/orgs/login/')
    || pathname === '/orgs/initiatives'
    || pathname.startsWith('/orgs/initiatives/')
    || pathname === '/orgs/profile'
    || pathname.startsWith('/orgs/profile/')
    || pathname === '/orgs/account'
    || pathname.startsWith('/orgs/account/')
    || pathname === '/orgs/events'
    || pathname.startsWith('/orgs/events/')
}

function isMasterPortalOrgRoute(pathname) {
  return pathname === '/orgs/register'
    || pathname.startsWith('/orgs/register/')
    || pathname === '/orgs'
    || (pathname.startsWith('/orgs/') && !isMedTechTenantOrgRoute(pathname))
    || pathname === '/create'
    || pathname.startsWith('/create/')
}

function masterPortalRedirect(url, env, status = 301) {
  const target = new URL(url)
  const origin = new URL(trimTrailingSlash(env.PORTAL_SITE_ORIGIN || DEFAULT_PORTAL_SITE_ORIGIN))
  target.protocol = origin.protocol
  target.hostname = origin.hostname
  target.port = origin.port
  return Response.redirect(target.toString(), status)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return preflightResponse(request)

    if (['/users/login', '/users/register'].includes(url.pathname) && !url.searchParams.has('portalProfile')) {
      url.searchParams.set('portalProfile', 'baltimore-medtech')
      return Response.redirect(url.toString(), 302)
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

    if (isMasterPortalOrgRoute(url.pathname)) {
      return masterPortalRedirect(url, env)
    }

    if (isPortalDevAssetPath(url.pathname)) {
      return proxyResponse(request, env.PORTAL_SITE_ORIGIN || DEFAULT_PORTAL_SITE_ORIGIN, url, { rewriteCookieDomain: true })
    }

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

    if (url.pathname === '/api/org' || url.pathname.startsWith('/api/org/')) {
      const response = await proxyResponse(request, env.ORG_API_ORIGIN || DEFAULT_ORG_API_ORIGIN, url, { stripPrefix: '/api/org' })
      return applyApiHeaders(request, response)
    }

    if (url.pathname === '/api/network' || url.pathname.startsWith('/api/network/')) {
      const response = await proxyResponse(request, env.ORG_API_ORIGIN || DEFAULT_ORG_API_ORIGIN, url)
      return applyApiHeaders(request, response)
    }

    if (url.pathname === '/api/chat' || url.pathname.startsWith('/api/chat/')) {
      const response = await proxyResponse(request, env.ORG_API_ORIGIN || DEFAULT_ORG_API_ORIGIN, url, { stripPrefix: '/api/chat' })
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

    if (isPortalRoute(url.pathname)) {
      return portalRootNavigationProxyResponse(request, env, url)
    }

    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404) return applyStaticHeaders(request, url.pathname, response)

    if (isHtmlNavigation(request)) {
      const fallback = await env.ASSETS.fetch(new Request(`${url.origin}/index.html`, request))
      return applyStaticHeaders(request, '/index.html', fallback)
    }

    return response
  },
}
