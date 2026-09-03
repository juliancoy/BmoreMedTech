import { readFile } from 'node:fs/promises'
import { calculateNeedAvailabilityMetrics, DISTORTION_METHOD } from '../assets/need-availability-metrics.js'

const root = new URL('../', import.meta.url)
const text = (path) => readFile(new URL(path, root), 'utf8')
const json = async (path) => JSON.parse(await text(path))
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const [editorial, careTeams, ...fields] = await Promise.all([
  json('assets/data/need-availability-distortions.json'),
  json('assets/data/need-availability-care-teams.json'),
  json('assets/data/strategy-neurology.json'),
  json('assets/data/strategy-oncology.json'),
  json('assets/data/strategy-radiology.json'),
  json('assets/data/strategy-genomics.json'),
])
const [page, renderer, callout, pageCss, contentCss, careTeamCss, atlasCss, theme, vite, workflow] = await Promise.all([
  text('need-availability-distortions.html'),
  text('assets/need-availability-distortion.js'),
  text('assets/strategy-distortion-link.js'),
  text('assets/need-availability-page.css'),
  text('assets/need-availability-distortion-content.css'),
  text('assets/need-availability-care-team.css'),
  text('assets/taxonomy-atlas-strategy.css'),
  text('assets/theme.js'),
  text('vite.config.js'),
  text('.github/workflows/deploy.yml'),
])

assert(editorial.meta?.as_of === '2026-09-03', 'Methodology must declare its review date')
assert(editorial.meta.availability_definition.includes('separately displays selected nonphysician occupations'), 'Allied-care-team correction must be explicit')
assert(editorial.meta.fixed_limitation.includes('Nonphysician labor is no longer omitted'), 'The corrected limitation must be named')
assert(editorial.meta.comparability_guardrail.includes('not equivalent patient denominators'), 'Need-denominator guardrail is required')
assert(editorial.meta.formula.includes('not folded into this index'), 'Allied occupations must remain separate from the physician index')
assert(editorial.weights.distortion.need_per_specialist_pressure === DISTORTION_METHOD.pressureWeight, 'Pressure weight mismatch')
assert(editorial.weights.distortion.pipeline_fragility === DISTORTION_METHOD.renewalWeight, 'Pipeline weight mismatch')
assert(editorial.interpretations?.length === 4, 'Expected four field interpretations')
assert(editorial.interpretations.every(({ care_team_context }) => typeof care_team_context === 'string' && care_team_context.length > 80), 'Every interpretation needs allied-team context')

assert(careTeams.meta?.employment_year === 2025, 'Care-team data must use the 2025 BLS base year')
assert(careTeams.meta?.openings_window === '2025–2035', 'Care-team openings window must be declared')
assert(careTeams.meta?.index_policy.includes('not added to the physician-specialist distortion index'), 'Care-team index exclusion must be explicit')
assert(careTeams.meta?.remaining_gap.includes('appointment supply'), 'Remaining access limitations must stay visible')
assert(Array.isArray(careTeams.groups) && careTeams.groups.length === 4, 'Expected four allied-care field groups')

const expectedGroups = {
  neurology: { jobs: 646700, openings: 35900, roles: 3 },
  oncology: { jobs: 17400, openings: 700, roles: 1 },
  radiology: { jobs: 387700, openings: 22100, roles: 3 },
  genomics: { jobs: 4200, openings: 300, roles: 1 },
}
let occupationCount = 0
for (const group of careTeams.groups) {
  const expected = expectedGroups[group.id]
  assert(expected, `Unexpected care-team group: ${group.id}`)
  assert(group.jobs_total === expected.jobs, `${group.id} jobs total mismatch`)
  assert(group.annual_openings_total === expected.openings, `${group.id} openings total mismatch`)
  assert(group.roles.length === expected.roles, `${group.id} role count mismatch`)
  assert(group.roles.reduce((sum, role) => sum + role.jobs, 0) === group.jobs_total, `${group.id} jobs must sum from roles`)
  assert(group.roles.reduce((sum, role) => sum + role.annual_openings, 0) === group.annual_openings_total, `${group.id} openings must sum from roles`)
  assert(typeof group.scope_note === 'string' && group.scope_note.length > 100, `${group.id} scope note is required`)
  assert(typeof group.strategic_read === 'string' && group.strategic_read.length > 80, `${group.id} strategic interpretation is required`)
  for (const role of group.roles) {
    assert(Number.isFinite(role.jobs) && role.jobs > 0, `${role.title} jobs must be positive`)
    assert(Number.isFinite(role.annual_openings) && role.annual_openings > 0, `${role.title} openings must be positive`)
    assert(/^https:\/\/www\.bls\.gov\//.test(role.source_url), `${role.title} must use an official BLS source`)
  }
  occupationCount += group.roles.length
}
assert(occupationCount === 8, 'Expected eight selected nonphysician occupations')

const result = calculateNeedAvailabilityMetrics(fields)
assert(result.records.length === 4, 'Expected four distortion records')
assert(result.leader.id === 'genomics', 'Genomics must remain the largest frozen-data physician shortfall signal')
assert(result.records.map(({ id }) => id).join(',') === 'genomics,radiology,oncology,neurology', 'Unexpected distortion ranking')
assert(result.records.every(({ distortionIndex }) => distortionIndex >= 20 && distortionIndex <= 100), 'Indices must remain on 20–100 scale')
assert(result.records.some(({ signedNeedAvailabilityGap }) => signedNeedAvailabilityGap > 0), 'Positive gaps must be retained')
assert(result.records.some(({ signedNeedAvailabilityGap }) => signedNeedAvailabilityGap < 0), 'Negative gaps must be retained')
for (const field of fields) for (const key of ['need', 'workforce', 'pipeline']) {
  assert(Number.isFinite(field[key]?.value) && field[key].value > 0, `${field.id}.${key}.value must be positive`)
  assert(/^https:\/\//.test(field[key]?.source_url), `${field.id}.${key} requires an HTTPS source`)
}

for (const id of [
  'distortion-ranking-cards',
  'distortion-index-chart',
  'distortion-ratio-chart',
  'distortion-pipeline-chart',
  'distortion-quadrant-chart',
  'distortion-data-table',
  'distortion-care-team',
  'distortion-team-jobs-chart',
  'distortion-team-openings-chart',
  'distortion-team-table',
  'distortion-care-team-groups',
  'distortion-field-profiles',
  'distortion-method-team',
  'distortion-source-register',
]) {
  assert(page.includes(`id="${id}"`), `Page is missing #${id}`)
}
assert(page.includes('Most fixable limitation corrected'), 'Page must announce the corrected limitation')
assert(page.includes('allied-care-team layer'), 'Hero must name the allied-care-team layer')
assert(page.includes('/assets/need-availability-distortion.js'), 'Page must load its renderer')
assert(page.includes('/assets/need-availability-page.css'), 'Page must load its stylesheet')
assert(renderer.includes("'/need-availability-care-teams.json'"), 'Renderer must load care-team data')
assert(renderer.includes('renderCareTeams()'), 'Renderer must render the allied-care-team section')
assert(renderer.includes('mapped allied-care jobs'), 'Hero must expose the leader care-team context')
assert(callout.includes('allied-care-team context'), 'Atlas entry card must advertise the corrected limitation')
assert(theme.includes("import('./strategy-distortion-link.js')"), 'Atlas initialization must load the entry card')
assert(atlasCss.includes('need-availability-distortion.css'), 'Atlas stylesheet must include entry-card styles')
assert(pageCss.includes('need-availability-care-team.css'), 'Page stylesheet must include care-team styles')
assert(contentCss.includes('.distortion-shortfall-zone'), 'Quadrant shortfall region must be styled')
assert(careTeamCss.includes('.distortion-care-team-groups'), 'Care-team group cards must be styled')
assert(vite.includes("needAvailabilityDistortions: 'need-availability-distortions.html'"), 'Page must be a Vite build entry')
assert(workflow.includes("contains(github.event.head_commit.message, '[skip deploy]')"), 'Workflow must support explicit deployment skipping')

console.log(`Validated physician distortion plus ${occupationCount} allied occupations: ${result.records.map(({ name, distortionIndex }) => `${name} ${distortionIndex}`).join(' · ')}`)
