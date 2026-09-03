import { readFile } from 'node:fs/promises'
import { buildOewsSeriesId, handleDatasetApi } from '../worker/datasets.js'

const root = new URL('../', import.meta.url)
const text = (path) => readFile(new URL(path, root), 'utf8')
const json = async (path) => JSON.parse(await text(path))
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const registryManifest = await json('assets/data/dataset-registry.json')
const registryParts = await Promise.all(registryManifest.parts.map((path) => json(`assets/data/${path.split('/').at(-1)}`)))
const registry = { meta: registryManifest.meta, datasets: registryParts.flatMap((part) => part.datasets) }
const [catalog, catalogJs, sheetJs, styles, workerRoot, workerAdapters, vite, pkg, theme] = await Promise.all([
  text('datasets.html'),
  text('assets/dataset-catalog.js'),
  text('assets/dataset-sheet.js'),
  text('assets/dataset-pages.css'),
  text('worker.js'),
  Promise.all([
    text('worker/datasets.js'),
    text('worker/dataset-live-cms.js'),
    text('worker/dataset-live-workforce.js'),
    text('worker/dataset-live-maryland.js'),
    text('worker/dataset-snapshots.js'),
  ]).then((parts) => parts.join('\n')),
  text('vite.config.js'),
  json('package.json'),
  text('assets/theme.js'),
])

assert(registry.meta?.as_of === '2026-09-03', 'Dataset registry must declare the review date')
assert(registry.meta?.live_definition?.includes('queries the publisher'), 'Registry must define live behavior')
assert(registry.meta?.privacy_note?.includes('does not retrieve patient-level records'), 'Registry must include a privacy boundary')
assert(Array.isArray(registry.datasets) && registry.datasets.length === 13, 'Expected thirteen dataset sheets')

const expected = [
  ['cms-doctors-clinicians', 'live-api', 'cms_doctors_clinicians'],
  ['cms-provider-services', 'live-api', 'cms_provider_services'],
  ['nppes-registry', 'live-api', 'nppes_registry'],
  ['bls-oews-baltimore', 'live-api', 'bls_oews'],
  ['hrsa-ahrf', 'live-release', 'hrsa_ahrf_releases'],
  ['maryland-medicaid-pvs', 'live-lookup', 'maryland_medicaid_pvs'],
  ['maryland-medicaid-provider-finder', 'live-lookup', 'maryland_medicaid_provider_finder'],
  ['medical-taxonomy', 'repository-snapshot', 'local_medtech_index'],
  ['clinical-code-systems', 'repository-snapshot', 'local_systems'],
  ['clinical-semantic-systems', 'repository-snapshot', 'local_systems'],
  ['strategy-field-metrics', 'repository-snapshot', 'local_strategy_fields'],
  ['need-availability-distortions', 'repository-snapshot', 'local_distortions'],
  ['allied-care-teams', 'repository-snapshot', 'local_care_teams'],
]

const ids = new Set()
const pages = new Set()
for (const [index, [expectedId, expectedMode, expectedAdapter]] of expected.entries()) {
  const dataset = registry.datasets[index]
  assert(dataset.id === expectedId, `Registry row ${index + 1} must be ${expectedId}`)
  assert(dataset.mode === expectedMode, `${expectedId} must use ${expectedMode}`)
  assert(dataset.adapter === expectedAdapter, `${expectedId} must use ${expectedAdapter}`)
  assert(!ids.has(dataset.id), `Duplicate dataset id: ${dataset.id}`)
  assert(!pages.has(dataset.page), `Duplicate dataset page: ${dataset.page}`)
  ids.add(dataset.id)
  pages.add(dataset.page)

  for (const key of ['title', 'short_title', 'publisher', 'category', 'coverage', 'refresh', 'geography', 'description', 'source_url']) {
    assert(typeof dataset[key] === 'string' && dataset[key], `${dataset.id}.${key} is required`)
  }
  assert(Array.isArray(dataset.preferred_columns) && dataset.preferred_columns.length > 0, `${dataset.id} needs preferred columns`)
  assert(Array.isArray(dataset.limitations) && dataset.limitations.length > 0, `${dataset.id} needs limitations`)
  assert(Number.isInteger(dataset.default_page_size) && dataset.default_page_size > 0, `${dataset.id} needs a default page size`)
  assert(Number.isInteger(dataset.max_page_size) && dataset.max_page_size >= dataset.default_page_size, `${dataset.id} max page size is invalid`)
  assert(workerAdapters.includes(`${expectedAdapter}:`), `Worker adapter map is missing ${expectedAdapter}`)

  const pagePath = dataset.page.replace(/^\//, '')
  const page = await text(pagePath)
  for (const mount of ['dataset-title', 'dataset-filter-form', 'dataset-table-head', 'dataset-table-body', 'dataset-columns-panel', 'dataset-source-panel']) {
    assert(page.includes(`id="${mount}"`), `${pagePath} is missing #${mount}`)
  }
  assert(page.includes('/assets/dataset-sheet.js'), `${pagePath} must load the sheet renderer`)
  assert(page.includes('/assets/dataset-pages.css'), `${pagePath} must load the workbook stylesheet`)
  assert(vite.includes(`datasets/${dataset.id}.html`), `${pagePath} must be a Vite entry`)
}

const live = registry.datasets.filter((dataset) => dataset.mode.startsWith('live-'))
const snapshots = registry.datasets.filter((dataset) => dataset.mode === 'repository-snapshot')
assert(live.length === 7, 'Expected seven live source sheets')
assert(snapshots.length === 6, 'Expected six repository snapshot sheets')
assert(catalog.includes('id="dataset-catalog-body"'), 'Workbook catalog is missing the sheet body')
assert(catalog.includes('Live sources and repository snapshots are labeled separately'), 'Catalog must distinguish live and snapshot data')
assert(catalogJs.includes("fetch('/api/datasets')"), 'Catalog must prefer the live registry endpoint')
assert(sheetJs.includes("fetch(`/api/datasets/${datasetId}"), 'Dataset sheets must query the same-origin Worker gateway')
assert(sheetJs.includes("elements.csvLink.textContent = 'CSV page'"), 'CSV scope must be explicit')
assert(styles.includes('.dataset-grid-table'), 'Spreadsheet table styling is required')
assert(workerRoot.includes("import { handleDatasetApi } from './worker/datasets.js'"), 'Root Worker must load the dataset gateway')
assert(workerRoot.includes("url.pathname.startsWith('/api/datasets/')"), 'Root Worker must route dataset requests')
assert(theme.includes("link.href = '/datasets.html'"), 'Shared navigation must expose the data workbook')
assert(pkg.scripts['dev:worker'] === 'wrangler dev', 'A Worker-backed local development command is required')
assert(pkg.scripts['test:datasets'] === 'node scripts/validate-dataset-workbook.mjs', 'Dataset validator must be wired into package scripts')
assert(pkg.scripts['test:data'].includes('npm run test:datasets'), 'Dataset validation must run during the build')

assert(buildOewsSeriesId({ areatype: 'M', code: '0012580' }, '291123', '01') === 'OEUM001258000000029112301', 'Baltimore OEWS series construction changed unexpectedly')
assert(buildOewsSeriesId({ areatype: 'S', code: '2400000' }, '291141', '13') === 'OEUS240000000000029114113', 'Maryland OEWS series construction changed unexpectedly')

const assetRoot = new URL('../assets/data/', import.meta.url)
const env = {
  ASSETS: {
    async fetch(request) {
      const pathname = new URL(request.url).pathname.replace(/^\//, '')
      try {
        const body = await readFile(new URL(pathname, assetRoot))
        return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    },
  },
}

async function requestDataset(id, pageSize = 500) {
  const response = await handleDatasetApi(new Request(`https://workbook.test/api/datasets/${id}?page_size=${pageSize}`), env)
  const payload = await response.json()
  assert(response.ok && payload.ok, `${id} snapshot endpoint failed: ${payload.error || response.status}`)
  assert(payload.dataset.id === id, `${id} returned the wrong identity`)
  assert(Array.isArray(payload.columns) && payload.columns.length > 0, `${id} needs spreadsheet columns`)
  return payload
}

const registryResponse = await handleDatasetApi(new Request('https://workbook.test/api/datasets'), env)
const registryPayload = await registryResponse.json()
assert(registryResponse.ok && registryPayload.datasets.length === 13, 'Dataset registry API failed')

const taxonomy = await requestDataset('medical-taxonomy')
const codes = await requestDataset('clinical-code-systems')
const semantics = await requestDataset('clinical-semantic-systems')
const strategy = await requestDataset('strategy-field-metrics')
const distortions = await requestDataset('need-availability-distortions')
const allied = await requestDataset('allied-care-teams')
assert(taxonomy.total === 223, `Medical taxonomy should contain 223 fields, found ${taxonomy.total}`)
assert(codes.total >= 8, `Clinical code-system sheet is unexpectedly small: ${codes.total}`)
assert(semantics.total === 8, `Semantic-system sheet should contain 8 systems, found ${semantics.total}`)
assert(strategy.total === 4, `Strategy field sheet should contain 4 fields, found ${strategy.total}`)
assert(distortions.total === 4, `Distortion sheet should contain 4 fields, found ${distortions.total}`)
assert(allied.total === 8, `Allied-care sheet should contain 8 occupations, found ${allied.total}`)
assert(codes.columns.includes('source_urls'), 'Clinical code-system sources must be flattened into a spreadsheet column')
assert(semantics.columns.includes('source_urls'), 'Semantic-system sources must be flattened into a spreadsheet column')

const csvResponse = await handleDatasetApi(new Request('https://workbook.test/api/datasets/allied-care-teams.csv?page_size=100'), env)
const csv = await csvResponse.text()
assert(csvResponse.ok && csv.startsWith('field,mapping_strength,occupation'), 'Snapshot CSV export failed')
assert(csvResponse.headers.get('content-disposition')?.includes('allied-care-teams-page-1.csv'), 'CSV filename must identify the dataset and page')

console.log(`Validated ${registry.datasets.length} spreadsheet pages: ${live.length} live source sheets and ${snapshots.length} versioned snapshots`)
