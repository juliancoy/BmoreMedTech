import { readFile } from 'node:fs/promises'

const file = 'assets/data/clinical-semantic-systems.json'
const data = JSON.parse(await readFile(file, 'utf8'))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(data && typeof data === 'object', 'Clinical semantic data must be an object')
assert(data.meta?.as_of === '2026-09-02', 'Clinical semantic data must declare its review date')
assert(typeof data.meta?.principle === 'string' && data.meta.principle.length > 40, 'A clear semantic principle is required')
assert(Array.isArray(data.flow_stages) && data.flow_stages.length === 7, 'Expected seven global flow stages')
assert(Array.isArray(data.systems) && data.systems.length === 8, 'Expected eight semantic and interoperability systems')

const stageIds = new Set()
let featuredStages = 0
for (const stage of data.flow_stages) {
  assert(typeof stage.id === 'string' && stage.id, 'Every flow stage needs an id')
  assert(!stageIds.has(stage.id), `Duplicate flow stage: ${stage.id}`)
  stageIds.add(stage.id)
  for (const key of ['step', 'eyebrow', 'title', 'question', 'description', 'tone', 'target']) {
    assert(typeof stage[key] === 'string' && stage[key], `${stage.id}.${key} is required`)
  }
  assert(Array.isArray(stage.systems) && stage.systems.length > 0, `${stage.id}.systems must be non-empty`)
  if (stage.featured) featuredStages += 1
}
assert(featuredStages === 1, 'Exactly one flow stage must be visually featured')
assert(data.flow_stages.find(({ featured }) => featured)?.id === 'clinical-semantics', 'Clinical semantics must be the featured hinge')

const allowedStages = new Set(['clinical-semantics', 'interoperability', 'learning'])
const systemIds = new Set()
for (const system of data.systems) {
  assert(typeof system.id === 'string' && system.id, 'Every semantic system needs an id')
  assert(!systemIds.has(system.id), `Duplicate semantic-system id: ${system.id}`)
  systemIds.add(system.id)
  assert(allowedStages.has(system.stage), `${system.id} has an unsupported stage: ${system.stage}`)
  for (const key of ['short_name', 'name', 'role', 'question', 'scope', 'steward', 'source_url', 'source_label', 'tone', 'note']) {
    assert(typeof system[key] === 'string' && system[key], `${system.id}.${key} is required`)
  }
  assert(/^https:\/\//.test(system.source_url), `${system.id} must use an HTTPS official source URL`)
  assert(Array.isArray(system.match_terms) && system.match_terms.length > 0, `${system.id}.match_terms must be non-empty`)
  assert(typeof system.licensed === 'boolean', `${system.id}.licensed must be boolean`)
}

for (const id of ['snomed-ct', 'loinc', 'rxnorm', 'fhir', 'umls', 'dicom', 'ga4gh-vrs', 'omop-cdm']) {
  assert(systemIds.has(id), `Missing required semantic or interoperability system: ${id}`)
}

assert(data.systems.find(({ id }) => id === 'snomed-ct')?.stage === 'clinical-semantics', 'SNOMED CT must anchor clinical semantics')
assert(data.systems.find(({ id }) => id === 'fhir')?.stage === 'interoperability', 'FHIR must be modeled as interoperability')
assert(data.systems.find(({ id }) => id === 'omop-cdm')?.stage === 'learning', 'OMOP CDM must be modeled in the learning layer')

console.log(`Validated ${data.flow_stages.length} global-flow stages and ${data.systems.length} semantic/interoperability systems`)
