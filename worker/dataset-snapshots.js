import { calculateNeedAvailabilityMetrics } from '../assets/need-availability-metrics.js'
import { loadAssetJson, paginateLocal } from './dataset-core.js'

async function localMedtechIndex(dataset, query, env, origin) {
  const payload = await loadAssetJson(env, origin, '/medtech-index.json')
  const records = Array.isArray(payload) ? payload : payload.records || payload.fields || payload.items || []
  const rows = records.map((record) => ({
    id: record.id,
    name: record.name,
    scientific_lineage: record.scientific_lineage,
    body_parts: record.body_parts,
    methods: record.methods,
    scale: record.scale,
    population: record.population,
    translation: record.translation,
    subdisciplines: record.subdisciplines,
    tags: record.tags,
  }))
  return {
    ...paginateLocal(rows, query),
    sourceUpdatedAt: payload.meta?.as_of || payload.meta?.generated_at || null,
    upstream: { url: '/medtech-index.json', status: 200 },
  }
}

async function localSystems(dataset, query, env, origin) {
  const payload = await loadAssetJson(env, origin, dataset.asset)
  const systems = payload.systems || payload.records || []
  const rows = systems.map((system) => ({
    id: system.id,
    short_name: system.short_name,
    name: system.name,
    kind: system.kind || '',
    stage: system.stage || '',
    layer: system.layer || '',
    role: system.role || '',
    question: system.question || '',
    scope: system.scope || '',
    steward: system.steward || '',
    identifier_shape: system.identifier_shape || '',
    source_urls: system.source_url || (system.source_links || []).map((link) => `${link.label}: ${link.url}`).join('; '),
    licensed: system.licensed ?? system.licensed_descriptions ?? '',
    tags: system.tags || system.match_terms || [],
    note: system.note || '',
  }))
  return {
    ...paginateLocal(rows, query),
    sourceUpdatedAt: payload.meta?.as_of || null,
    upstream: { url: dataset.asset, status: 200 },
  }
}

const STRATEGY_PATHS = ['/strategy-neurology.json', '/strategy-oncology.json', '/strategy-radiology.json', '/strategy-genomics.json']

async function loadStrategyFields(env, origin) {
  return Promise.all(STRATEGY_PATHS.map((path) => loadAssetJson(env, origin, path)))
}

async function localStrategyFields(dataset, query, env, origin) {
  const fields = await loadStrategyFields(env, origin)
  const rows = fields.map((field) => ({
    id: field.id,
    field: field.name,
    workforce: field.workforce?.value,
    workforce_year: field.workforce?.year,
    workforce_definition: field.workforce?.definition,
    pipeline: field.pipeline?.value,
    pipeline_year: field.pipeline?.year,
    pipeline_definition: field.pipeline?.definition,
    need: field.need?.value,
    need_year: field.need?.year,
    need_type: field.need?.type,
    funding_proxy: field.funding?.proxy_label,
    funding_fy2024: field.funding?.values?.find((item) => Number(item.year) === 2024)?.value || field.funding?.values?.at(-1)?.value,
    digital_leverage: field.digital_leverage?.score,
    stance: field.stance,
    labor_strategy: field.strategy?.labor,
    application_strategy: field.strategy?.applications,
  }))
  return {
    ...paginateLocal(rows, query),
    sourceUpdatedAt: fields.map((field) => field.meta?.as_of).filter(Boolean).sort().at(-1) || null,
    upstream: { url: 'repository strategy field files', status: 200 },
  }
}

async function localDistortions(dataset, query, env, origin) {
  const fields = await loadStrategyFields(env, origin)
  const result = calculateNeedAvailabilityMetrics(fields)
  const rows = result.records.map((record) => ({
    rank: record.rank,
    id: record.id,
    field: record.name,
    need_proxy: record.field.need?.value,
    need_type: record.field.need?.type,
    physician_workforce: record.field.workforce?.value,
    physician_pipeline: record.field.pipeline?.value,
    need_per_physician: record.peoplePerSpecialist,
    entrants_per_1000_physicians: record.entrantsPerThousandSpecialists,
    need_score: record.needScore,
    availability_score: record.availabilityScore,
    signed_gap: record.signedNeedAvailabilityGap,
    distortion_index: record.distortionIndex,
  }))
  const editorial = await loadAssetJson(env, origin, '/need-availability-distortions.json')
  return {
    ...paginateLocal(rows, query),
    sourceUpdatedAt: editorial.meta?.as_of || null,
    upstream: { url: '/need-availability-distortions.json', status: 200 },
    warnings: [editorial.meta?.comparability_guardrail].filter(Boolean),
  }
}

async function localCareTeams(dataset, query, env, origin) {
  const payload = await loadAssetJson(env, origin, '/need-availability-care-teams.json')
  const rows = (payload.groups || []).flatMap((group) => (group.roles || []).map((role) => ({
    field: group.name,
    mapping_strength: group.mapping_strength,
    occupation: role.title,
    soc: role.soc,
    jobs_2025: role.jobs,
    annual_openings_2025_2035: role.annual_openings,
    source_url: role.source_url,
    field_scope_note: group.scope_note,
  })))
  return {
    ...paginateLocal(rows, query),
    sourceUpdatedAt: payload.meta?.as_of || null,
    upstream: { url: '/need-availability-care-teams.json', status: 200 },
    warnings: [payload.meta?.index_policy, payload.meta?.remaining_gap].filter(Boolean),
  }
}


export { localMedtechIndex, localSystems, localStrategyFields, localDistortions, localCareTeams }
