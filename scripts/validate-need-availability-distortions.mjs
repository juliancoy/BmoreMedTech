import { readFile } from 'node:fs/promises'
import { calculateNeedAvailabilityMetrics, DISTORTION_METHOD } from '../assets/need-availability-metrics.js'

const root = new URL('../', import.meta.url)
const text = (path) => readFile(new URL(path, root), 'utf8')
const json = async (path) => JSON.parse(await text(path))
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const [editorial, ...fields] = await Promise.all([
  json('assets/data/need-availability-distortions.json'),
  json('assets/data/strategy-neurology.json'),
  json('assets/data/strategy-oncology.json'),
  json('assets/data/strategy-radiology.json'),
  json('assets/data/strategy-genomics.json'),
])
const [page, renderer, callout, pageCss, contentCss, atlasCss, theme, vite] = await Promise.all([
  text('need-availability-distortions.html'),
  text('assets/need-availability-distortion.js'),
  text('assets/strategy-distortion-link.js'),
  text('assets/need-availability-page.css'),
  text('assets/need-availability-distortion-content.css'),
  text('assets/taxonomy-atlas-strategy.css'),
  text('assets/theme.js'),
  text('vite.config.js'),
])

assert(editorial.meta?.as_of === '2026-09-03', 'Methodology must declare its review date')
assert(editorial.meta.availability_definition.includes('does not measure appointment supply'), 'Availability limitations must be explicit')
assert(editorial.meta.comparability_guardrail.includes('not equivalent patient denominators'), 'Need-denominator guardrail is required')
assert(editorial.weights.distortion.need_per_specialist_pressure === DISTORTION_METHOD.pressureWeight, 'Pressure weight mismatch')
assert(editorial.weights.distortion.pipeline_fragility === DISTORTION_METHOD.renewalWeight, 'Pipeline weight mismatch')
assert(editorial.interpretations?.length === 4, 'Expected four field interpretations')

const result = calculateNeedAvailabilityMetrics(fields)
assert(result.records.length === 4, 'Expected four distortion records')
assert(result.leader.id === 'genomics', 'Genomics must remain the largest frozen-data shortfall signal')
assert(result.records.map(({ id }) => id).join(',') === 'genomics,radiology,oncology,neurology', 'Unexpected distortion ranking')
assert(result.records.every(({ distortionIndex }) => distortionIndex >= 20 && distortionIndex <= 100), 'Indices must remain on 20–100 scale')
assert(result.records.some(({ signedNeedAvailabilityGap }) => signedNeedAvailabilityGap > 0), 'Positive gaps must be retained')
assert(result.records.some(({ signedNeedAvailabilityGap }) => signedNeedAvailabilityGap < 0), 'Negative gaps must be retained')
for (const field of fields) for (const key of ['need','workforce','pipeline']) {
  assert(Number.isFinite(field[key]?.value) && field[key].value > 0, `${field.id}.${key}.value must be positive`)
  assert(/^https:\/\//.test(field[key]?.source_url), `${field.id}.${key} requires an HTTPS source`)
}
for (const id of ['distortion-ranking-cards','distortion-index-chart','distortion-ratio-chart','distortion-pipeline-chart','distortion-quadrant-chart','distortion-data-table','distortion-field-profiles','distortion-source-register']) {
  assert(page.includes(`id="${id}"`), `Page is missing #${id}`)
}
assert(page.includes('/assets/need-availability-distortion.js'), 'Page must load its renderer')
assert(page.includes('/assets/need-availability-page.css'), 'Page must load its stylesheet')
assert(renderer.includes('calculateNeedAvailabilityMetrics'), 'Renderer must use the shared metric module')
assert(callout.includes('/need-availability-distortions.html'), 'Atlas dashboard must link to the new page')
assert(theme.includes("import('./strategy-distortion-link.js')"), 'Atlas initialization must load the entry card')
assert(atlasCss.includes('need-availability-distortion.css'), 'Atlas stylesheet must include entry-card styles')
assert(pageCss.includes('need-availability-distortion-content.css'), 'Page stylesheet must include content styles')
assert(contentCss.includes('.distortion-shortfall-zone'), 'Quadrant shortfall region must be styled')
assert(vite.includes("needAvailabilityDistortions: 'need-availability-distortions.html'"), 'Page must be a Vite build entry')

console.log(`Validated need–availability distortion page: ${result.records.map(({ name, distortionIndex }) => `${name} ${distortionIndex}`).join(' · ')}`)
