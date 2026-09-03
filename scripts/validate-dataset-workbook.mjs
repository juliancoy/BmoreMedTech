import { readFile } from 'node:fs/promises'
import { buildOewsSeriesId, handleDatasetApi } from '../worker/datasets.js'

const root = new URL('../', import.meta.url)
const text = (path) => readFile(new URL(path, root), 'utf8')
const json = async (path) => JSON.parse(await text(path))
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const registryManifest = await json('assets/data/dataset-registry.json')
const registryParts = await Promise.all(registryManifest.parts.map((path) => json(`assets/data/${path.split('/').at(-1)}`)))
const registry = { meta: registryManifest.meta, datasets: registryParts.flatMap((part) => part.datasets) }
const [
  metaIndex,
  taxonomyDatabases,
  publicFieldAtlas,
  compatibilityFieldAsset,
  catalog,
  catalogJs,
  sheetJs,
  styles,
  workerRoot,
  workerAdapters,
  vite,
  pkg,
  theme,
  buildScript,
  legacyPage,
] = await Promise.all([
  json('assets/data/medtech-meta-index.json'),
  json('assets/data/taxonomy-databases.json'),
  json('assets/data/medical-science-field-atlas.json'),
  json('assets/data/medtech-index.json'),
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
  text('scripts/build-medical-science-field-atlas.mjs'),
  text('datasets/medical-taxonomy.html'),
])

assert(registry.meta?.as_of === '2026-09-03', 'Dataset registry must declare the review date')
assert(registry.meta?.description?.includes('MedTech Meta Index'), 'Registry must identify the Meta Index as its governing source')
assert(registry.meta?.live_definition?.includes('queries the publisher'), 'Registry must define live behavior')
assert(registry.meta?.privacy_note?.includes('does not retrieve patient-level records'), 'Registry must include a privacy boundary')
assert(registryManifest.parts[0] === '/dataset-registry-meta.json', 'The Meta Index must be the first workbook registry part')
assert(Array.isArray(registry.datasets) && registry.datasets.length === 14, 'Expected fourteen dataset sheets')

const expected = [
  ['medtech-meta-index', 'repository-snapshot', 'local_meta_index'],
  ['cms-doctors-clinicians', 'live-api', 'cms_doctors_clinicians'],
  ['cms-provider-services', 'live-api', 'cms_provider_services'],
  ['nppes-registry', 'live-api', 'nppes_registry'],
  ['bls-oews-baltimore', 'live-api', 'bls_oews'],
  ['hrsa-ahrf', 'live-release', 'hrsa_ahrf_releases'],
  ['maryland-medicaid-pvs', 'live-lookup', 'maryland_medicaid_pvs'],
  ['maryland-medicaid-provider-finder', 'live-lookup', 'maryland_medicaid_provider_finder'],
  ['medical-science-field-atlas', 'repository-snapshot', 'local_medical_science_field_atlas'],
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
  assert(vite.includes(`'${dataset.id}'`), `${pagePath} dataset id must be present in Vite's generated input list`)
}

assert(!ids.has('medical-taxonomy'), 'The former medical-taxonomy dataset id must be retired')
assert(vite.includes('datasetPages.map'), 'Vite must generate dataset entries from the registry-aligned page list')
assert(vite.includes('`datasets/${id}.html`'), 'Vite dataset input template is missing')
assert(vite.includes("legacyMedicalTaxonomy: 'datasets/medical-taxonomy.html'"), 'The retired dataset route must remain a redirect build entry')
assert(legacyPage.includes('/datasets/medical-science-field-atlas.html'), 'The retired dataset route must redirect to the Field Atlas')
assert(workerRoot.includes("['/datasets/medical-taxonomy.html', '/datasets/medical-science-field-atlas.html']"), 'The Worker must preserve the retired dataset route')

const live = registry.datasets.filter((dataset) => dataset.mode.startsWith('live-'))
const snapshots = registry.datasets.filter((dataset) => dataset.mode === 'repository-snapshot')
assert(live.length === 7, 'Expected seven live source sheets')
assert(snapshots.length === 7, 'Expected the Meta Index plus six versioned dataset sheets')
assert(registry.datasets[0].id === 'medtech-meta-index', 'The Meta Index must be the first workbook source')
assert(registry.datasets[8].id === 'medical-science-field-atlas', 'The renamed Field Atlas must replace the former medical-taxonomy source')

assert(metaIndex.meta?.as_of === '2026-09-03', 'Meta Index must declare a review date')
assert(metaIndex.meta?.ranking_rule?.includes('proximity to measurable patient access'), 'Meta Index ranking rule is required')
assert(Object.keys(metaIndex.meta?.quality_tiers || {}).join(',') === 'A1,A2,B1,B2,C1', 'Meta Index quality tiers changed unexpectedly')
assert(Array.isArray(metaIndex.sources) && metaIndex.sources.length === 13, 'Meta Index must consist of thirteen component sources')
assert(!metaIndex.sources.some((source) => source.source_id === 'medtech-meta-index'), 'Meta Index must not recursively index itself')
assert(metaIndex.sources.map((source) => source.decision_rank).join(',') === '1,2,3,4,5,6,7,8,9,10,11,12,13', 'Meta Index decision ranks must be contiguous')
assert(new Set(metaIndex.sources.map((source) => source.source_id)).size === 13, 'Meta Index component ids must be unique')
for (const source of metaIndex.sources) {
  assert(ids.has(source.source_id), `Meta Index references an unregistered source: ${source.source_id}`)
  for (const key of ['source_tier', 'source_tier_label', 'authority_class', 'evidence_type', 'unit_of_observation', 'data_layer', 'availability_layer', 'decision_role', 'quality_strength', 'principal_caveat', 'join_keys', 'dependencies']) {
    assert(typeof source[key] === 'string' && source[key], `${source.source_id}.${key} is required`)
  }
}
assert(metaIndex.sources[0].source_id === 'cms-provider-services', 'Realized service output must lead the Meta Index decision order')
assert(metaIndex.sources.some((source) => source.source_id === 'medical-science-field-atlas'), 'Meta Index must include the renamed Field Atlas')
assert(metaIndex.sources.filter((source) => source.source_tier.startsWith('A')).length === 7, 'Expected seven authoritative primary components')

assert(taxonomyDatabases[0]?.name === 'Medical Science Field Atlas', 'The former MedTech Index must be renamed in the framework selector')
assert(taxonomyDatabases[0]?.source_url === '/medical-science-field-atlas.json', 'Field Atlas framework must use the renamed public JSON route')
assert(taxonomyDatabases.every((database) => !database.name.includes('MedTech Index') && !database.description.includes('MedTech Index')), 'Legacy title must not remain in user-facing framework metadata')
assert(Array.isArray(publicFieldAtlas) && publicFieldAtlas.length === 223, `Public Field Atlas should contain 223 records, found ${publicFieldAtlas.length}`)
assert(JSON.stringify(publicFieldAtlas) === JSON.stringify(compatibilityFieldAsset), 'The renamed public JSON and compatibility asset must be identical')
assert(buildScript.includes("const atlasPath = 'assets/data/medical-science-field-atlas.json'"), 'Field Atlas build must publish the renamed asset')
assert(pkg.scripts['build:index'] === 'node scripts/build-medical-science-field-atlas.mjs', 'Build must use the renamed Field Atlas wrapper')

assert(catalog.includes('Open the MedTech Meta Index'), 'Workbook catalog must prominently link the Meta Index')
assert(catalog.includes('Medical Science Field Atlas'), 'Workbook catalog must expose the renamed Field Atlas')
assert(catalog.includes('Meta Index first'), 'Workbook formula bar must place the Meta Index first')
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
assert(registryResponse.ok && registryPayload.datasets.length === 14, 'Dataset registry API failed')

const metaSheet = await requestDataset('medtech-meta-index')
const taxonomy = await requestDataset('medical-science-field-atlas')
const codes = await requestDataset('clinical-code-systems')
const semantics = await requestDataset('clinical-semantic-systems')
const strategy = await requestDataset('strategy-field-metrics')
const distortions = await requestDataset('need-availability-distortions')
const allied = await requestDataset('allied-care-teams')
assert(metaSheet.total === 13, `Meta Index should contain 13 component sources, found ${metaSheet.total}`)
assert(metaSheet.rows[0]?.source_id === 'cms-provider-services', 'Meta Index API must preserve service-output-first ordering')
assert(metaSheet.columns.includes('source_tier') && metaSheet.columns.includes('unit_of_observation') && metaSheet.columns.includes('principal_caveat'), 'Meta Index is missing governing source fields')
assert(taxonomy.total === 223, `Medical Science Field Atlas should contain 223 fields, found ${taxonomy.total}`)
assert(codes.total >= 8, `Clinical code-system sheet is unexpectedly small: ${codes.total}`)
assert(semantics.total === 8, `Semantic-system sheet should contain 8 systems, found ${semantics.total}`)
assert(strategy.total === 4, `Strategy field sheet should contain 4 fields, found ${strategy.total}`)
assert(distortions.total === 4, `Distortion sheet should contain 4 fields, found ${distortions.total}`)
assert(allied.total === 8, `Allied-care sheet should contain 8 occupations, found ${allied.total}`)
assert(codes.columns.includes('source_urls'), 'Clinical code-system sources must be flattened into a spreadsheet column')
assert(semantics.columns.includes('source_urls'), 'Semantic-system sources must be flattened into a spreadsheet column')

const tierFilterResponse = await handleDatasetApi(new Request('https://workbook.test/api/datasets/medtech-meta-index?source_tier=A1&page_size=100'), env)
const tierFilter = await tierFilterResponse.json()
assert(tierFilterResponse.ok && tierFilter.total === 5, `A1 Meta Index filter should return five operational or registry sources, found ${tierFilter.total}`)
assert(tierFilter.rows.every((row) => row.source_tier === 'A1'), 'Meta Index tier filter returned a mismatched row')

const oldIdResponse = await handleDatasetApi(new Request('https://workbook.test/api/datasets/medical-taxonomy'), env)
assert(oldIdResponse.status === 404, 'The retired medical-taxonomy API id must not remain registered')

const csvResponse = await handleDatasetApi(new Request('https://workbook.test/api/datasets/medtech-meta-index.csv?page_size=100'), env)
const csv = await csvResponse.text()
assert(csvResponse.ok && csv.startsWith('decision_rank,source_id,source_name'), 'Meta Index CSV export failed')
assert(csvResponse.headers.get('content-disposition')?.includes('medtech-meta-index-page-1.csv'), 'Meta Index CSV filename must identify the source and page')

console.log(`Validated MedTech Meta Index plus ${registry.datasets.length - 1} component sheets: ${live.length} live sources and ${snapshots.length - 1} versioned scientific or analytical datasets`)
