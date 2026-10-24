// Read-only audit of the built site, registered portal pages, and rendered links.
import {createRequire} from 'node:module'
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises'
import {resolve, relative, join} from 'node:path'
import {fileURLToPath} from 'node:url'
const require = createRequire(new URL('../../OrgPortal/web/package.json', import.meta.url))
const {chromium} = require('playwright')
const root = fileURLToPath(new URL('../', import.meta.url))
const base = new URL(process.argv[2] || 'https://localhost:8770')
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Use a loopback preview URL')
const output = resolve(process.argv[3] || join(root, '.local/link-audit'))
const build = resolve(process.argv[4] || join(root, 'dist-lifetech'))
await mkdir(output, {recursive: true})
const paths = new Set(['/', '/org-events', '/branding', '/search?q=health', '/this-page-must-not-exist'])
async function addFiles(dir) {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await addFiles(path)
    else if (entry.name.endsWith('.html')) {
      const url = '/' + relative(build, path)
      paths.add(url)
      paths.add(url.replace(/\/index\.html$/, '/').replace(/\.html$/, ''))
    }
  }
}
await addFiles(build)
const router = await readFile(new URL('../../OrgPortal/web/src/ui/router/createAppRouter.tsx', import.meta.url), 'utf8')
const templates = [...router.matchAll(/path:\s*'([^']+)'/g)].map(match => match[1]).filter(path => path !== '*')
for (const path of templates) if (!path.includes(':')) paths.add(path)
const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome'})
const context = await browser.newContext({ignoreHTTPSErrors: true, viewport: {width: 1440, height: 1000}})
const pages = [], links = new Map(), external = new Set()
let cursor = 0
const seeds = [...paths]
function recordLink(href, source) {
  let url
  try { url = new URL(href, source) } catch { return }
  if (!['https:', 'http:'].includes(url.protocol)) return
  if (url.origin !== base.origin) { external.add(url.origin); return }
  // Login/logout/provider actions are handoffs, never follow them as crawler actions.
  if (/^\/(?:pidp|oauth|auth)\//.test(url.pathname)) return
  const key = url.pathname + url.search + url.hash
  const item = links.get(key) || {path: key, sources: []}
  if (item.sources.length < 3 && !item.sources.includes(source)) item.sources.push(source)
  links.set(key, item)
}
try {
  await Promise.all(Array.from({length: 3}, async () => {
    while (cursor < seeds.length) {
      const path = seeds[cursor++]
      const page = await context.newPage()
      const item = {path, errors: [], resources: [], failedRequests: []}
      page.on('pageerror', error => item.errors.push(error.message))
      page.on('response', response => {
        const url = new URL(response.url())
        if (url.origin === base.origin && response.status() >= 400 && !['document'].includes(response.request().resourceType())
          && !(response.status() === 401 && url.pathname === '/pidp/auth/session-token')) {
          item.resources.push({status: response.status(), url: url.pathname + url.search})
        }
      })
      page.on('requestfailed', request => {
        const url = new URL(request.url())
        if (url.origin === base.origin && request.failure()?.errorText !== 'net::ERR_ABORTED') {
          item.failedRequests.push({url: url.pathname + url.search, error: request.failure()?.errorText})
        }
      })
      try {
        const response = await page.goto(new URL(path, base).href, {waitUntil: 'domcontentloaded', timeout: 25000})
        item.status = response?.status()
        await page.waitForTimeout(1800)
        item.finalUrl = page.url()
        item.title = await page.title()
        item.text = (await page.locator('body').innerText()).slice(0, 1200)
        item.blank = !item.text.trim()
        item.visibleError = /Failed to fetch|Something went wrong|Unexpected Application Error|Cannot GET\b|Unable to load|Could not load/i.test(item.text)
        for (const href of await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => node.href))) recordLink(href, page.url())
        item.brokenImages = await page.locator('img').evaluateAll(nodes => nodes.filter(node => node.complete && !node.naturalWidth).map(node => node.currentSrc || node.src))
        if (path === '/org-events' || item.blank || item.errors.length || item.visibleError) {
          const name = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'
          item.screenshot = name + '.png'
          await page.screenshot({path: join(output, item.screenshot), fullPage: false})
        }
      } catch (error) { item.error = error.message }
      pages.push(item)
      await page.close()
      if (pages.length % 15 === 0) console.log(`Rendered ${pages.length}/${seeds.length} pages`)
    }
  }))
  const queue = [...links.values()]
  cursor = 0
  await Promise.all(Array.from({length: 5}, async () => {
    while (cursor < queue.length) {
      const item = queue[cursor++]
      try {
        const response = await context.request.get(new URL(item.path, base).href, {timeout: 20000})
        item.status = response.status()
        item.finalUrl = response.url()
        const fragment = new URL(item.path, base).hash
        if (fragment && response.ok() && response.headers()['content-type']?.includes('text/html')
          && !response.url().includes('/pidp/')) {
          const html = await response.text()
          // Only static HTML anchors can be checked without another JS navigation.
          if (!html.includes('id="root"')) {
            const id = decodeURIComponent(fragment.slice(1))
            item.missingAnchor = ![...html.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)].some(match => match[1] === id)
          }
        }
        await response.dispose()
      } catch (error) { item.error = error.message }
    }
  }))
  const brokenPages = pages.filter(item => item.error || item.blank || item.errors.length || item.visibleError || item.resources.length || item.failedRequests.length || (item.status >= 400 && item.path !== '/this-page-must-not-exist'))
  const brokenLinks = queue.filter(item => item.error || item.status >= 400 || item.missingAnchor)
  const report = {
    base: base.href, scope: 'Anonymous local reads; all built HTML variants and non-parameter portal routes; all rendered same-origin link destinations.',
    limits: 'Dynamic route templates are covered by the route-contract tests; arbitrary IDs, authenticated actions and external websites are not exhaustively crawled.',
    summary: {pages: pages.length, links: queue.length, routeTemplates: templates.length, externalOrigins: external.size, brokenPages: brokenPages.length, brokenLinks: brokenLinks.length},
    brokenPages, brokenLinks, pages, links: queue, externalOrigins: [...external].sort(),
  }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report.summary, null, 2))
  console.log(`Report: ${join(output, 'report.json')}`)
  if (brokenPages.length || brokenLinks.length) process.exitCode = 1
} finally { await browser.close() }
