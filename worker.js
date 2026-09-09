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

const LEGACY_REDIRECTS = new Map([
  ['/datasets/medical-taxonomy.html', '/datasets/medical-science-field-atlas.html'],
])
const DEFAULT_ORG_API_ORIGIN = 'https://org-codecollective.jcloiacon.workers.dev'
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

function proxyResponse(request, targetOriginValue, url, { stripPrefix = '', rewriteCookieDomain = false } = {}) {
  const targetUrl = new URL(url)
  const targetOrigin = new URL(trimTrailingSlash(targetOriginValue))
  targetUrl.protocol = targetOrigin.protocol
  targetUrl.host = targetOrigin.host
  if (stripPrefix && (url.pathname === stripPrefix || url.pathname.startsWith(`${stripPrefix}/`))) {
    targetUrl.pathname = url.pathname.slice(stripPrefix.length) || '/'
  }

  const headers = new Headers(request.headers)
  headers.set('x-forwarded-host', url.host)
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''))
  headers.delete('host')

  const proxiedInit = {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  }
  if (proxiedInit.body) proxiedInit.duplex = 'half'

  return fetch(new Request(targetUrl.toString(), proxiedInit)).then((response) => {
    if (!rewriteCookieDomain) return response
    const responseHeaders = new Headers(response.headers)
    const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
    if (cookies.length) {
      responseHeaders.delete('set-cookie')
      for (const cookie of cookies) {
        responseHeaders.append('set-cookie', cookie.replace(/;\s*Domain=[^;]+/gi, ''))
      }
    }
    responseHeaders.set('cache-control', 'no-store')
    responseHeaders.set('referrer-policy', 'no-referrer')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  })
}

function portalProxyResponse(request, env, url, { stripBase = false } = {}) {
  const targetUrl = new URL(url)
  if (stripBase && (targetUrl.pathname === '/p' || targetUrl.pathname.startsWith('/p/'))) {
    targetUrl.pathname = targetUrl.pathname.slice('/p'.length) || '/'
  }
  if (!targetUrl.pathname.startsWith('/p/')) {
    targetUrl.pathname = `/p${targetUrl.pathname === '/' ? '' : targetUrl.pathname}`
  }
  return proxyResponse(request, env.PORTAL_SITE_ORIGIN || DEFAULT_PORTAL_SITE_ORIGIN, targetUrl)
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

function legacyRedirect(request, url) {
  const target = LEGACY_REDIRECTS.get(url.pathname)
  if (!['GET', 'HEAD'].includes(request.method)) return null
  if (isLegacyPortalRoute(url.pathname)) {
    const destination = new URL(url.toString())
    destination.pathname = url.pathname.slice('/p'.length) || '/'
    return Response.redirect(destination.toString(), 308)
  }
  if (!target) return null
  const destination = new URL(target, url.origin)
  destination.search = url.search
  return Response.redirect(destination.toString(), 308)
}

function isPortalAssetPath(pathname) {
  return pathname === '/p/assets' || pathname.startsWith('/p/assets/')
    || pathname === '/p/images' || pathname.startsWith('/p/images/')
    || pathname === '/p/css' || pathname.startsWith('/p/css/')
    || pathname === '/p/manifest.webmanifest'
    || pathname === '/p/medtech.webmanifest'
    || pathname === '/p/push-sw.js'
    || pathname === '/p/mobile-update.json'
    || pathname === '/p/orgportal-android-release.apk'
    || /^\/p\/[^/]+\.(?:png|jpe?g|webp|gif|svg|ico|css|js|wasm|json|webmanifest)$/.test(pathname)
}

function isLegacyPortalRoute(pathname) {
  return pathname === '/p'
    || pathname.startsWith('/p/users/')
    || pathname.startsWith('/p/events')
    || pathname.startsWith('/p/orgs')
    || pathname.startsWith('/p/people')
    || pathname.startsWith('/p/chat')
    || pathname.startsWith('/p/community')
    || pathname.startsWith('/p/medtech-events')
    || pathname.startsWith('/p/auth/callback')
}

function isPortalRoute(pathname) {
  return pathname === '/users' || pathname.startsWith('/users/')
    || pathname === '/events' || pathname.startsWith('/events/')
    || pathname === '/orgs' || pathname.startsWith('/orgs/')
    || pathname === '/people' || pathname.startsWith('/people/')
    || pathname === '/chat' || pathname.startsWith('/chat/')
    || pathname === '/community' || pathname.startsWith('/community/')
    || pathname === '/medtech-events' || pathname.startsWith('/medtech-events/')
    || pathname === '/auth/callback'
    || pathname === '/calendar'
    || pathname === '/email' || pathname.startsWith('/email/')
    || pathname === '/profile'
    || pathname === '/settings'
    || pathname === '/search'
    || pathname === '/tools' || pathname.startsWith('/tools/')
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return preflightResponse(request)

    const redirect = legacyRedirect(request, url)
    if (redirect) return redirect

    if (isPortalAssetPath(url.pathname)) {
      return portalProxyResponse(request, env, url)
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

    if (url.pathname === '/pidp' || url.pathname.startsWith('/pidp/')) {
      const response = await proxyResponse(request, env.PIDP_PROXY_ORIGIN || env.PIDP_API_ORIGIN || DEFAULT_PIDP_API_ORIGIN, url, {
        stripPrefix: '/pidp',
        rewriteCookieDomain: true,
      })
      return applyApiHeaders(request, response)
    }

    if (isPortalRoute(url.pathname)) {
      return portalProxyResponse(request, env, url)
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
