import { readdir, readFile, stat } from 'node:fs/promises'
import { relative } from 'node:path'

const root = new URL('../', import.meta.url)
const ignoredDirs = new Set(['.git', '.local', '.wrangler', 'dist', 'node_modules', '__pycache__'])
const allowedPlaceholderIds = new Set([
  'dataset-api-link',
  'dataset-csv-link',
  'dataset-json-link',
  'dataset-source-link',
  'taxonomy-source-link',
])
const knownExternalOrigins = new Set([
  'https://chat.whatsapp.com',
  'https://github.com',
  'https://medtech.social',
])

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

async function walkHtml(dirUrl = root) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) files.push(...await walkHtml(new URL(`${entry.name}/`, dirUrl)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.html')) files.push(new URL(entry.name, dirUrl))
  }
  return files
}

function repoPath(fileUrl) {
  return relative(root.pathname, fileUrl.pathname)
}

function normalizePage(pathname) {
  if (pathname === '/') return 'index.html'
  const trimmed = pathname.replace(/^\/+/, '')
  if (!trimmed || trimmed.endsWith('/')) return `${trimmed}index.html`
  return trimmed.endsWith('.html') ? trimmed : `${trimmed}.html`
}

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}

function attrsFrom(anchor) {
  const attrs = {}
  for (const match of anchor.matchAll(/\s([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[3] ?? match[4] ?? '')
  }
  return attrs
}

async function fileExists(path) {
  try {
    const details = await stat(new URL(path, root))
    return details.isFile()
  } catch {
    return false
  }
}

const htmlFiles = await walkHtml()
const pages = new Map()

for (const fileUrl of htmlFiles) {
  const path = repoPath(fileUrl)
  const html = await readFile(fileUrl, 'utf8')
  const anchors = [...html.matchAll(/<a\b[^>]*>/gi)].map((match) => attrsFrom(match[0]))
  const ids = new Set([...html.matchAll(/\bid\s*=\s*("([^"]+)"|'([^']+)')/gi)].map((match) => decodeHtml(match[2] ?? match[3])))
  pages.set(path, { anchors, ids })
}

const pagePaths = new Set(pages.keys())
const inventory = []
const failures = []

for (const [source, page] of pages) {
  for (const attrs of page.anchors) {
    const href = attrs.href
    if (!href) continue

    const item = {
      source,
      href,
      textRole: attrs['aria-label'] || attrs.title || '',
      kind: 'unknown',
    }

    if (href === '#') {
      item.kind = 'runtime-placeholder'
      if (!allowedPlaceholderIds.has(attrs.id)) {
        failures.push(`${source}: href="#" must be runtime-populated and whitelisted; found id="${attrs.id || ''}"`)
      }
      inventory.push(item)
      continue
    }

    if (href.startsWith('#')) {
      item.kind = 'same-page-anchor'
      item.target = source
      item.fragment = href.slice(1)
      if (!page.ids.has(item.fragment)) failures.push(`${source}: missing anchor target ${href}`)
      inventory.push(item)
      continue
    }

    let url
    try {
      url = new URL(href, 'https://medtech.local/')
    } catch {
      failures.push(`${source}: malformed href "${href}"`)
      inventory.push(item)
      continue
    }

    if (url.origin !== 'https://medtech.local') {
      item.kind = 'external-handoff'
      item.origin = url.origin
      if (!knownExternalOrigins.has(url.origin)) {
        failures.push(`${source}: unexpected external origin ${url.origin} in "${href}"`)
      }
      inventory.push(item)
      continue
    }

    item.kind = 'internal-page'
    item.target = normalizePage(url.pathname)
    item.fragment = url.hash ? decodeURIComponent(url.hash.slice(1)) : ''
    if (!pagePaths.has(item.target) && !(await fileExists(item.target))) {
      failures.push(`${source}: missing internal page ${url.pathname} from "${href}"`)
    } else if (item.fragment) {
      const targetPage = pages.get(item.target)
      if (targetPage && !targetPage.ids.has(item.fragment)) {
        failures.push(`${source}: ${href} points to missing #${item.fragment} in ${item.target}`)
      }
    }
    inventory.push(item)
  }
}

inventory.sort((a, b) => `${a.source} ${a.href}`.localeCompare(`${b.source} ${b.href}`))

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    pages: [...pagePaths].sort(),
    linkCount: inventory.length,
    links: inventory,
  }, null, 2))
} else {
  const counts = inventory.reduce((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + 1
    return acc
  }, {})
  console.log(`Link inventory checked ${pagePaths.size} pages and ${inventory.length} static links.`)
  console.log(Object.entries(counts).sort().map(([kind, count]) => `${kind}: ${count}`).join('\n'))
}

assert(failures.length === 0, `Link inventory failed:\n${failures.join('\n')}`)
