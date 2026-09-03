import { readFile } from 'node:fs/promises'

const contextFile = 'assets/data/strategy-context.json'
const fieldFiles = [
  'assets/data/strategy-neurology.json',
  'assets/data/strategy-oncology.json',
  'assets/data/strategy-radiology.json',
  'assets/data/strategy-genomics.json',
]
const [context, ...fields] = await Promise.all(
  [contextFile, ...fieldFiles].map(async (file) => JSON.parse(await readFile(file, 'utf8'))),
)
const data = { ...context, fields }

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(data && typeof data === 'object', 'Strategy metrics must be an object')
assert(data.meta?.as_of === '2026-09-03', 'Strategy metrics must declare the review date')
assert(typeof data.meta?.comparability_note === 'string' && data.meta.comparability_note.length > 100, 'Comparability note is required')
assert(typeof data.meta?.radar_note === 'string' && data.meta.radar_note.length > 100, 'Radar-method note is required')
assert(Array.isArray(data.fields) && data.fields.length === 4, 'Expected four comparison fields')

const requiredIds = new Set(['neurology', 'oncology', 'radiology', 'genomics'])
const seen = new Set()
for (const field of data.fields) {
  assert(requiredIds.has(field.id), `Unexpected field id: ${field.id}`)
  assert(!seen.has(field.id), `Duplicate field id: ${field.id}`)
  seen.add(field.id)
  assert(typeof field.index_field_id === 'string' && field.index_field_id, `${field.id}.index_field_id is required`)
  assert(typeof field.name === 'string' && field.name, `${field.id}.name is required`)
  assert(typeof field.stance === 'string' && field.stance, `${field.id}.stance is required`)

  for (const metricName of ['workforce', 'pipeline', 'need']) {
    const metric = field[metricName]
    assert(metric && typeof metric === 'object', `${field.id}.${metricName} is required`)
    assert(Number.isFinite(metric.value) && metric.value > 0, `${field.id}.${metricName}.value must be positive`)
    assert(typeof metric.display === 'string' && metric.display, `${field.id}.${metricName}.display is required`)
    assert(typeof metric.label === 'string' && metric.label, `${field.id}.${metricName}.label is required`)
    assert(typeof metric.source_url === 'string' && /^https:\/\//.test(metric.source_url), `${field.id}.${metricName} needs an HTTPS source`)
  }

  const funding = field.funding
  assert(Array.isArray(funding?.values) && funding.values.length === 3, `${field.id} needs three funding observations`)
  assert(funding.values.map(({ year }) => year).join(',') === '2022,2023,2024', `${field.id} funding years must be 2022–2024`)
  assert(funding.values.every(({ value }) => Number.isFinite(value) && value > 0), `${field.id} funding values must be positive`)
  assert(/^https:\/\//.test(funding.source_url), `${field.id}.funding needs an HTTPS source`)
  assert(
    Number.isFinite(field.digital_leverage?.score)
      && field.digital_leverage.score >= 0
      && field.digital_leverage.score <= 100,
    `${field.id}.digital_leverage.score must be 0–100`,
  )

  for (const key of ['labor', 'applications', 'group']) {
    assert(typeof field.strategy?.[key] === 'string' && field.strategy[key].length > 40, `${field.id}.strategy.${key} is required`)
  }
}

assert(seen.size === requiredIds.size, 'Not all required fields were found')
assert(data.fields.find(({ id }) => id === 'genomics').workforce.label === 'board-certified physicians', 'Genomics workforce definition must remain explicit')
assert(data.fields.find(({ id }) => id === 'radiology').need.type === 'annual service-demand proxy', 'Radiology need metric must remain a utilization proxy')

assert(Array.isArray(data.baltimore?.anchors) && data.baltimore.anchors.length === 2, 'Expected two Baltimore anchor institutions')
const calculatedFunding = data.baltimore.anchors.reduce((sum, anchor) => sum + anchor.funding, 0)
const calculatedAwards = data.baltimore.anchors.reduce((sum, anchor) => sum + anchor.awards, 0)
assert(calculatedFunding === data.baltimore.total_funding, 'Baltimore funding subtotal does not match anchors')
assert(calculatedAwards === data.baltimore.total_awards, 'Baltimore awards subtotal does not match anchors')
assert(data.baltimore.anchors.every(({ source_url }) => /^https:\/\//.test(source_url)), 'Baltimore anchors need HTTPS sources')

assert(Array.isArray(data.recommendations) && data.recommendations.length >= 4, 'Expected at least four strategy recommendations')
assert(Array.isArray(data.sources) && data.sources.length >= 8, 'Expected a substantial source list')
for (const source of data.sources) {
  assert(typeof source.id === 'string' && source.id, 'Every source needs an id')
  assert(/^https:\/\//.test(source.url), `${source.id} must use HTTPS`)
}

console.log(
  `Validated ${data.fields.length} fields, ${data.fields.length * 4} quantitative signal groups, `
  + `${data.baltimore.anchors.length} Baltimore anchors, and ${data.recommendations.length} strategy recommendations`,
)
