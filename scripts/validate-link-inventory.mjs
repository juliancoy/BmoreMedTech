import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { basename, relative } from 'node:path'

const root = new URL('../', import.meta.url)
const workspaces = [
  {
    id: 'medtech',
    label: 'MedTech',
    root,
    strict: true,
    extensions: new Set(['.html']),
    ignoredDirs: new Set(['.git', '.local', '.wrangler', 'dist', 'node_modules', '__pycache__']),
  },
  {
    id: 'orgportal',
    label: 'OrgPortal',
    root: new URL('../../OrgPortal/web/', import.meta.url),
    strict: false,
    extensions: new Set(['.html', '.tsx', '.ts', '.jsx', '.js']),
    ignoredDirs: new Set(['.git', '.vite-local-check-cache', '.vite-playwright-cache', 'dist', 'node_modules', 'playwright-report', 'coverage']),
    ignoredPathParts: ['public/specialty/baltimore-medtech'],
  },
  {
    id: 'pidp',
    label: 'PIdP',
    root: new URL('../../pidp/', import.meta.url),
    strict: false,
    extensions: new Set(['.html', '.tsx', '.ts', '.jsx', '.js', '.py', '.mjs']),
    ignoredDirs: new Set(['.git', '.stable-backups', 'dist', 'node_modules', '__pycache__', '.pytest_cache']),
    ignoredPathParts: ['frontend/stable'],
  },
]
const scannableExtensions = new Set(['.html', '.tsx', '.ts', '.jsx', '.js', '.py', '.mjs'])
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
const knownPortalRoutes = new Set([
  '/branding',
  '/chat',
  '/org-events',
  '/resources',
])
const writeIndex = process.argv.indexOf('--write')
const plannedOutputPath = writeIndex === -1 ? '' : process.argv[writeIndex + 1]

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

async function walkHtml(dirUrl = root) {
  return walkFiles(workspaces[0], dirUrl)
}

async function walkFiles(workspace, dirUrl = workspace.root) {
  const entries = await readdir(dirUrl, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (workspace.ignoredDirs.has(entry.name)) continue
      const next = new URL(`${entry.name}/`, dirUrl)
      const rel = relative(workspace.root.pathname, next.pathname)
      if (workspace.ignoredPathParts?.some((part) => rel.startsWith(part))) continue
      files.push(...await walkFiles(workspace, next))
      continue
    }
    const extensions = workspace.extensions || scannableExtensions
    if (entry.isFile() && extensions.has(extensionOf(entry.name))) files.push(new URL(entry.name, dirUrl))
  }
  return files
}

function extensionOf(path) {
  const name = basename(path)
  const index = name.lastIndexOf('.')
  return index === -1 ? '' : name.slice(index)
}

function repoPath(workspace, fileUrl) {
  return relative(workspace.root.pathname, fileUrl.pathname)
}

function pageId(workspace, path) {
  return `${workspace.id}:${path}`
}

function normalizePage(pathname) {
  if (pathname === '/') return 'index.html'
  const trimmed = pathname.replace(/^\/+/, '')
  if (!trimmed || trimmed.endsWith('/')) return `${trimmed}index.html`
  if (/\.[A-Za-z0-9]+$/.test(trimmed)) return trimmed
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

function sourceFromFile(workspace, fileUrl, content) {
  const path = repoPath(workspace, fileUrl)
  const anchors = [...content.matchAll(/<a\b[^>]*>/gi)].map((match) => attrsFrom(match[0]))
  const ids = new Set([...content.matchAll(/\bid\s*=\s*("([^"]+)"|'([^']+)')/gi)].map((match) => decodeHtml(match[2] ?? match[3])))
  const sourceLinks = anchors.map((attrs) => ({
    href: attrs.href,
    textRole: attrs['aria-label'] || attrs.title || '',
    element: 'a',
    attrs,
  })).filter((link) => link.href)

  if (extensionOf(path) !== '.html') {
    for (const match of content.matchAll(/\b(?:href|to|action)\s*=\s*(?:"([^"]+)"|'([^']+)'|{`([^`]+)`}|{"([^"]+)"}|{'([^']+)'})/g)) {
      const href = decodeHtml(match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '')
      if (href && !href.includes('${') && !sourceLinks.some((link) => link.href === href)) {
        sourceLinks.push({ href, textRole: '', element: 'literal' })
      }
    }
  }

  return { id: pageId(workspace, path), path, workspace: workspace.id, links: sourceLinks, ids }
}

async function fileExists(path) {
  if (plannedOutputPath && path === plannedOutputPath.replace(/^\/+/, '')) return true
  if (plannedOutputPath && `assets/data/${path}` === plannedOutputPath.replace(/^\/+/, '')) return true
  try {
    const details = await stat(new URL(path, root))
    return details.isFile()
  } catch {
    try {
      const details = await stat(new URL(`assets/data/${path}`, root))
      return details.isFile()
    } catch {
      return false
    }
  }
}

const sources = new Map()
const pages = new Map()

for (const workspace of workspaces) {
  let files = []
  try {
    files = await walkFiles(workspace)
  } catch {
    continue
  }
  for (const fileUrl of files) {
    const content = await readFile(fileUrl, 'utf8')
    const source = sourceFromFile(workspace, fileUrl, content)
    if (source.links.length === 0 && source.ids.size === 0) continue
    sources.set(source.id, source)
    if (workspace.strict && extensionOf(source.path) === '.html') pages.set(source.path, source)
  }
}

const pagePaths = new Set(pages.keys())
const inventory = []
const failures = []

function classifyWorkspaceForUrl(url, sourceRepo = 'medtech') {
  if (url.origin === 'https://medtech.local') {
    if (url.pathname.startsWith('/pidp') || url.pathname.startsWith('/oauth') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/session/')) return 'pidp'
    if (url.pathname.startsWith('/users') || url.pathname.startsWith('/org') || url.pathname.startsWith('/people') || url.pathname.startsWith('/chat') || url.pathname.startsWith('/events') || url.pathname.startsWith('/create') || url.pathname.startsWith('/branding') || url.pathname.startsWith('/resources')) return 'orgportal'
    if (sourceRepo !== 'medtech') return sourceRepo
    return 'medtech'
  }
  if (url.hostname === 'medtech.social') {
    if (url.pathname.startsWith('/pidp') || url.pathname.startsWith('/oauth') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/session/')) return 'pidp'
    if (url.pathname.startsWith('/users') || url.pathname.startsWith('/org') || url.pathname.startsWith('/people') || url.pathname.startsWith('/chat') || url.pathname.startsWith('/events') || url.pathname.startsWith('/medtech-events') || url.pathname.startsWith('/create') || url.pathname.startsWith('/branding') || url.pathname.startsWith('/resources')) return 'orgportal'
    return 'medtech'
  }
  if (url.hostname.includes('pidp')) return 'pidp'
  if (url.hostname.includes('portal') || url.hostname.includes('codecollective')) return 'orgportal'
  return ''
}

function isSiblingPortalMountReference(href, sourceRepo) {
  if (sourceRepo === 'medtech') return false
  try {
    const url = new URL(href, 'https://medtech.local/')
    const mountPath = `/${'p'}`
    return url.hostname === 'codecollective.us' && (url.pathname === mountPath || url.pathname.startsWith(`${mountPath}/`))
  } catch {
    return false
  }
}

for (const [source, page] of sources) {
  const sourceRepo = page.workspace
  const strict = workspaces.find((workspace) => workspace.id === sourceRepo)?.strict
  for (const link of page.links) {
    const href = link.href
    if (!href) continue
    if (isSiblingPortalMountReference(href, sourceRepo)) continue

    const item = {
      source,
      sourcePath: page.path,
      sourceRepo,
      href,
      textRole: link.textRole || '',
      kind: 'unknown',
      targetRepo: '',
    }

    if (href === '#') {
      item.kind = 'runtime-placeholder'
      if (strict && !allowedPlaceholderIds.has(link.attrs?.id)) {
        failures.push(`${source}: href="#" must be runtime-populated and whitelisted; found id="${link.attrs?.id || ''}"`)
      }
      inventory.push(item)
      continue
    }

    if (href.startsWith('#')) {
      item.kind = 'same-page-anchor'
      item.target = source
      item.targetRepo = sourceRepo
      item.fragment = href.slice(1)
      if (strict && extensionOf(page.path) === '.html' && !page.ids.has(item.fragment)) failures.push(`${source}: missing anchor target ${href}`)
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
      item.targetRepo = classifyWorkspaceForUrl(url, sourceRepo)
      if (strict && !knownExternalOrigins.has(url.origin)) {
        failures.push(`${source}: unexpected external origin ${url.origin} in "${href}"`)
      }
      inventory.push(item)
      continue
    }

    if (knownPortalRoutes.has(url.pathname)) {
      item.kind = 'portal-route'
      item.target = url.pathname
      item.targetRepo = 'orgportal'
      inventory.push(item)
      continue
    }

    item.targetRepo = classifyWorkspaceForUrl(url, sourceRepo)
    item.kind = item.targetRepo && item.targetRepo !== sourceRepo ? 'app-handoff' : 'internal-page'
    item.target = normalizePage(url.pathname)
    item.fragment = url.hash ? decodeURIComponent(url.hash.slice(1)) : ''
    if (strict && !pagePaths.has(item.target) && !(await fileExists(item.target))) {
      failures.push(`${source}: missing internal page ${url.pathname} from "${href}"`)
    } else if (strict && item.fragment) {
      const targetPage = pages.get(item.target)
      if (targetPage && !targetPage.ids.has(item.fragment)) {
        failures.push(`${source}: ${href} points to missing #${item.fragment} in ${item.target}`)
      }
    }
    inventory.push(item)
  }
}

inventory.sort((a, b) => `${a.source} ${a.href}`.localeCompare(`${b.source} ${b.href}`))

const output = {
  schema_version: 2,
  scope: 'bounded-static-and-source-link-literals',
  note: 'Bounded static/source link inventory across MedTech, OrgPortal, and PIdP. This is not an exhaustive dynamic click-through hierarchy.',
  repositories: workspaces.map(({ id, label, strict }) => ({ id, label, strict })),
  pages: [...sources.keys()].sort(),
  linkCount: inventory.length,
  links: inventory,
}

if (writeIndex !== -1) {
  const destination = plannedOutputPath
  assert(destination, '--write requires an output path')
  await mkdir(dirname(new URL(destination, root).pathname), { recursive: true })
  await writeFile(new URL(destination, root), `${JSON.stringify(output, null, 2)}\n`)
  console.log(`Wrote ${output.linkCount} links across ${output.pages.length} pages to ${destination}`)
} else if (process.argv.includes('--json')) {
  console.log(JSON.stringify(output, null, 2))
} else {
  const counts = inventory.reduce((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + 1
    return acc
  }, {})
  console.log(`Link inventory checked ${pagePaths.size} pages and ${inventory.length} static links.`)
  console.log(Object.entries(counts).sort().map(([kind, count]) => `${kind}: ${count}`).join('\n'))
}

assert(failures.length === 0, `Link inventory failed:\n${failures.join('\n')}`)
