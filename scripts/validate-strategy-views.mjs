import { readFile } from 'node:fs/promises'

const viewsFile = 'assets/data/strategy-views.json'
const bootstrapFile = 'assets/strategy-view-bootstrap.js'
const viteFile = 'vite.config.js'
const data = JSON.parse(await readFile(viewsFile, 'utf8'))
const bootstrap = await readFile(bootstrapFile, 'utf8')
const vite = await readFile(viteFile, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(data && typeof data === 'object', 'Strategy-view data must be an object')
assert(data.meta?.as_of === '2026-09-03', 'Strategy-view data must declare the review date')
assert(typeof data.meta?.ranking_basis === 'string' && data.meta.ranking_basis.length > 100, 'Ranking basis is required')
assert(typeof data.meta?.ranking_scope === 'string' && data.meta.ranking_scope.length > 100, 'Ranking scope is required')
assert(Array.isArray(data.views) && data.views.length === 5, 'Expected five ranked strategy views')

const expected = [
  ['medical-need', 'medical-need.html'],
  ['workforce-capacity', 'medical-workforce.html'],
  ['clinical-applications', 'clinical-applications.html'],
  ['research-funding', 'research-funding.html'],
  ['baltimore-capacity', 'baltimore-capacity.html'],
]
const seenIds = new Set()
const seenFiles = new Set()
const seenRanks = new Set()

for (const [index, view] of data.views.entries()) {
  const [expectedId, expectedFile] = expected[index]
  assert(view.id === expectedId, `Rank ${index + 1} must be ${expectedId}`)
  assert(view.rank === index + 1, `${view.id} must have rank ${index + 1}`)
  assert(view.file === expectedFile, `${view.id} must use ${expectedFile}`)
  assert(view.href === `/${expectedFile}`, `${view.id} href must be /${expectedFile}`)
  assert(!seenIds.has(view.id), `Duplicate view id: ${view.id}`)
  assert(!seenFiles.has(view.file), `Duplicate view file: ${view.file}`)
  assert(!seenRanks.has(view.rank), `Duplicate strategy rank: ${view.rank}`)
  seenIds.add(view.id)
  seenFiles.add(view.file)
  seenRanks.add(view.rank)

  for (const key of ['short_title', 'title', 'priority', 'summary', 'question', 'rationale', 'decision', 'guardrail', 'accent']) {
    assert(typeof view[key] === 'string' && view[key], `${view.id}.${key} is required`)
  }
  assert(Array.isArray(view.chart_types) && view.chart_types.length > 0, `${view.id}.chart_types must be non-empty`)
  assert(Array.isArray(view.actions) && view.actions.length === 3, `${view.id} needs exactly three operating actions`)
  assert(view.signal && typeof view.signal.type === 'string', `${view.id}.signal is required`)

  const page = await readFile(view.file, 'utf8')
  const staticBinding = page.includes(`data-strategy-view="${view.id}"`)
  const bootstrapBinding = page.includes('/assets/strategy-view-bootstrap.js')
    && bootstrap.includes(`'${view.file}': '${view.id}'`)
  assert(staticBinding || bootstrapBinding, `${view.file} must bind to strategy view ${view.id}`)
  assert(page.includes('id="strategy-view-title"'), `${view.file} must provide the shared title mount`)
  assert(page.includes('id="strategy-view-ranking"'), `${view.file} must provide the ranked page rail`)
  assert(page.includes('id="strategy-view-content"'), `${view.file} must provide the chart workspace`)
  assert(page.includes('id="strategy-view-actions"'), `${view.file} must provide operating guidance`)
  assert(page.includes('id="strategy-view-methodology"'), `${view.file} must provide methodology and sources`)
  assert(vite.includes(`${view.id.replaceAll('-', '_')}: '${view.file}'`), `${view.file} must be a Vite entry point`)
}

assert(data.landing_view === 'medical-need', 'Patient need must be the landing strategy view')
assert(data.views[0].priority === 'Direct patient impact', 'The first view must prioritize direct patient impact')
assert(data.views[0].signal.type === 'need', 'The highest-value view must lead with patient need')
assert(data.views[3].priority === 'Resource availability', 'Research funding must remain below direct clinical views')
assert(data.views[4].priority === 'Local execution capacity', 'Baltimore capacity must remain the fifth execution view')

console.log(`Validated ${data.views.length} ranked strategy pages with patient need first`)
