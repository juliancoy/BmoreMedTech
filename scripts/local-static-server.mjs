import { createReadStream, readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import { handleDatasetApi } from '../worker/datasets.js'

const siteRoot = process.env.SITE_ROOT || '/site'
const publicRoot = process.env.PUBLIC_ROOT || ''
const port = Number.parseInt(process.env.CONTAINER_PORT || '8080', 10)
const certFile = process.env.TLS_CERT_FILE || '/certs/localhost.crt'
const keyFile = process.env.TLS_KEY_FILE || '/certs/localhost.key'
const orgApiOrigin = process.env.ORG_API_ORIGIN || 'https://org-codecollective.jcloiacon.workers.dev'
const pidpApiOrigin = process.env.PIDP_PROXY_ORIGIN || process.env.PIDP_API_ORIGIN || 'https://pidp-codecollective.jcloiacon.workers.dev'
const portalSiteOrigin = process.env.PORTAL_SITE_ORIGIN || 'https://codecollective.us'
const allowedCorsOrigins = new Set([
  'https://baltimore-medtech.jcloiacon.workers.dev',
  'https://baltimoremedtech.org',
  'https://www.baltimoremedtech.org',
  'https://bmoremedtech.org',
  'https://www.bmoremedtech.org',
  'https://codecollective.us',
])

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
])

function cleanPathname(rawPathname) {
  let pathname
  try {
    pathname = decodeURIComponent(rawPathname)
  } catch {
    pathname = rawPathname
  }
  const normalized = path.posix.normalize(`/${pathname}`)
  return normalized === '/.' ? '/' : normalized
}

function resolveInsideRoot(urlPath, rootPath = siteRoot) {
  const relative = urlPath.replace(/^\/+/, '')
  const resolved = path.resolve(rootPath, relative)
  const root = path.resolve(rootPath)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null
  return resolved
}

async function existingFile(urlPath) {
  const candidates = [urlPath]
  const roots = [siteRoot, publicRoot].filter(Boolean)
  if (!path.posix.basename(urlPath).includes('.')) {
    candidates.push(`${urlPath}.html`)
  }

  for (const root of roots) {
    for (const candidate of candidates) {
      const filePath = resolveInsideRoot(candidate, root)
      if (!filePath) continue
      try {
        const info = await stat(filePath)
        if (info.isFile()) return filePath
        if (info.isDirectory()) {
          const indexPath = path.join(filePath, 'index.html')
          if ((await stat(indexPath)).isFile()) return indexPath
        }
      } catch {
        // Try the next candidate or public root.
      }
    }
  }
  return null
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(body)
}

function allowedCorsOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return null
  if (allowedCorsOrigins.has(origin)) return origin
  try {
    const url = new URL(origin)
    if (['localhost', '127.0.0.1', 'host.docker.internal'].includes(url.hostname)) return origin
  } catch {
    return null
  }
  return null
}

function corsHeaders(req) {
  const origin = allowedCorsOrigin(req)
  if (!origin) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,HEAD,OPTIONS',
    'access-control-allow-headers': req.headers['access-control-request-headers'] || 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

function sendPreflight(req, res) {
  if (req.headers.origin && !allowedCorsOrigin(req)) {
    send(res, 403, '')
    return
  }
  send(res, 204, '', { allow: 'GET, HEAD, OPTIONS', ...corsHeaders(req) })
}

async function serveFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mimeTypes.get(ext) || 'application/octet-stream',
    ...corsHeaders(req),
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(filePath).pipe(res)
}

const localAssets = {
  async fetch(request) {
    const url = new URL(request.url)
    const filePath = await existingFile(cleanPathname(url.pathname))
    if (!filePath) return new Response('Not found\n', { status: 404 })
    const ext = path.extname(filePath).toLowerCase()
    return new Response(request.method === 'HEAD' ? null : await readFile(filePath), {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': mimeTypes.get(ext) || 'application/octet-stream',
      },
    })
  },
}

function webRequest(req, requestUrl) {
  const headers = new Headers()
  const blockedHeaders = new Set([
    'connection',
    'host',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ])
  for (const [name, value] of Object.entries(req.headers)) {
    if (blockedHeaders.has(name.toLowerCase())) continue
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  }
  const init = {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : req,
  }
  if (init.body) init.duplex = 'half'
  return new Request(requestUrl, init)
}

async function sendWebResponse(req, res, response) {
  const headers = Object.fromEntries(response.headers.entries())
  res.writeHead(response.status, {
    'cache-control': 'no-store',
    ...headers,
    ...corsHeaders(req),
  })
  if (req.method === 'HEAD' || !response.body) {
    res.end()
    return
  }
  res.end(Buffer.from(await response.arrayBuffer()))
}

async function serveDatasetApi(req, res, requestUrl) {
  try {
    const response = await handleDatasetApi(webRequest(req, requestUrl), { ASSETS: localAssets }, requestUrl)
    await sendWebResponse(req, res, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dataset request failed'
    send(res, 500, JSON.stringify({ ok: false, error: message }), {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(req),
    })
  }
}

async function serveProxy(req, res, requestUrl, targetOriginValue, stripPrefix = '') {
  try {
    const targetUrl = new URL(requestUrl)
    const targetOrigin = new URL(targetOriginValue.replace(/\/+$/, ''))
    targetUrl.protocol = targetOrigin.protocol
    targetUrl.hostname = targetOrigin.hostname
    targetUrl.port = targetOrigin.port
    if (stripPrefix && (requestUrl.pathname === stripPrefix || requestUrl.pathname.startsWith(`${stripPrefix}/`))) {
      targetUrl.pathname = requestUrl.pathname.slice(stripPrefix.length) || '/'
    }
    const proxiedRequest = webRequest(req, targetUrl)
    proxiedRequest.headers.set('x-forwarded-host', req.headers.host || '')
    proxiedRequest.headers.set('x-forwarded-proto', requestUrl.protocol.replace(':', ''))
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: proxiedRequest.headers,
      body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : req,
      duplex: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : 'half',
    })
    await sendWebResponse(req, res, response)
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : ''
    const message = error instanceof Error ? `${error.message}${cause}` : 'Proxy request failed'
    send(res, 502, JSON.stringify({ ok: false, error: message }), {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(req),
    })
  }
}

async function servePortalProxy(req, res, requestUrl) {
  const targetUrl = new URL(requestUrl)
  if (!targetUrl.pathname.startsWith('/p/')) {
    targetUrl.pathname = `/p${targetUrl.pathname === '/' ? '' : targetUrl.pathname}`
  }
  await serveProxy(req, res, targetUrl, portalSiteOrigin)
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

function isRootPortalAssetPath(pathname) {
  return pathname === '/images' || pathname.startsWith('/images/')
    || pathname === '/css' || pathname.startsWith('/css/')
    || pathname === '/mobile-update.json'
    || /^\/[^/]+\.(?:png|jpe?g|webp|gif|svg|ico|css|js|wasm|webmanifest)$/.test(pathname)
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
    || pathname === '/email' || pathname.startsWith('/email/')
    || pathname === '/profile'
    || pathname === '/settings'
    || pathname === '/search'
    || pathname === '/tools' || pathname.startsWith('/tools/')
}

const server = https.createServer(
  {
    cert: readFileSync(certFile),
    key: readFileSync(keyFile),
  },
  async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        sendPreflight(req, res)
        return
      }
      const requestUrl = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`)
      if (requestUrl.pathname === '/api/datasets' || requestUrl.pathname.startsWith('/api/datasets/')) {
        await serveDatasetApi(req, res, requestUrl)
        return
      }
      if (requestUrl.pathname === '/.well-known/oauth-protected-resource/api/org/mcp' || requestUrl.pathname.startsWith('/.well-known/oauth-protected-resource/api/org/mcp/')) {
        await serveProxy(req, res, requestUrl, orgApiOrigin)
        return
      }
      if (requestUrl.pathname === '/api/org' || requestUrl.pathname.startsWith('/api/org/')) {
        await serveProxy(req, res, requestUrl, orgApiOrigin, '/api/org')
        return
      }
      if (requestUrl.pathname === '/pidp' || requestUrl.pathname.startsWith('/pidp/')) {
        await serveProxy(req, res, requestUrl, pidpApiOrigin, '/pidp')
        return
      }
      if (isPortalAssetPath(requestUrl.pathname) || isRootPortalAssetPath(requestUrl.pathname)) {
        await servePortalProxy(req, res, requestUrl)
        return
      }
      const filePath = await existingFile(cleanPathname(requestUrl.pathname))
      if (filePath) {
        await serveFile(req, res, filePath)
        return
      }
      if (isPortalRoute(requestUrl.pathname)) {
        await servePortalProxy(req, res, requestUrl)
        return
      }
      send(res, 404, 'Not found\n', { 'content-type': 'text/plain; charset=utf-8' })
    } catch (error) {
      console.error(error)
      send(res, 500, 'Internal server error\n', { 'content-type': 'text/plain; charset=utf-8' })
    }
  },
)

server.listen(port, '0.0.0.0', () => {
  console.log(`Serving ${siteRoot} on https://0.0.0.0:${port}`)
})
