import { createReadStream, readFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'

const siteRoot = process.env.SITE_ROOT || '/site'
const publicRoot = process.env.PUBLIC_ROOT || ''
const port = Number.parseInt(process.env.CONTAINER_PORT || '8080', 10)
const certFile = process.env.TLS_CERT_FILE || '/certs/localhost.crt'
const keyFile = process.env.TLS_KEY_FILE || '/certs/localhost.key'
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
      const filePath = await existingFile(cleanPathname(requestUrl.pathname))
      if (filePath) {
        await serveFile(req, res, filePath)
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
