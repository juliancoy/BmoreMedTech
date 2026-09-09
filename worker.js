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
const ORG_PUBLIC_EVENT_PREFIXES = [
  '/api/org/api/network/orgs/public/baltimore-medtech/events',
  '/api/org/api/network/events/public',
]

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
  headers.set('access-control-allow-methods', 'GET,HEAD,OPTIONS')
  headers.set('access-control-allow-headers', request.headers.get('access-control-request-headers') || 'content-type')
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

function isPublicOrgEventRequest(path) {
  return ORG_PUBLIC_EVENT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function orgProxyResponse(request, env, url) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed\n', {
      status: 405,
      headers: { allow: 'GET, HEAD, OPTIONS' },
    })
  }
  const targetUrl = new URL(url)
  const targetOrigin = new URL(trimTrailingSlash(env.ORG_API_ORIGIN || DEFAULT_ORG_API_ORIGIN))
  targetUrl.protocol = targetOrigin.protocol
  targetUrl.host = targetOrigin.host
  targetUrl.pathname = url.pathname.slice('/api/org'.length) || '/'

  const headers = new Headers(request.headers)
  headers.set('x-forwarded-host', url.host)
  headers.delete('host')

  return fetch(new Request(targetUrl, {
    method: request.method,
    headers,
    redirect: 'manual',
  }))
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
  if (!target || !['GET', 'HEAD'].includes(request.method)) return null
  const destination = new URL(target, url.origin)
  destination.search = url.search
  return Response.redirect(destination.toString(), 308)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return preflightResponse(request)

    const redirect = legacyRedirect(request, url)
    if (redirect) return redirect

    if (url.pathname === '/api/datasets' || url.pathname.startsWith('/api/datasets/')) {
      const response = await handleDatasetApi(request, env, url)
      return applyApiHeaders(request, response)
    }

    if (isPublicOrgEventRequest(url.pathname)) {
      const response = await orgProxyResponse(request, env, url)
      return applyApiHeaders(request, response)
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
