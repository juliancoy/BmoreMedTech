import { readFile } from 'node:fs/promises'

const file = 'assets/data/clinical-code-systems.json'
const data = JSON.parse(await readFile(file, 'utf8'))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(data && typeof data === 'object', 'Clinical coding data must be an object')
assert(data.meta?.as_of === '2026-09-02', 'Clinical coding data must declare its review date')
assert(Array.isArray(data.claim_flow) && data.claim_flow.length === 6, 'Expected six claim-flow stages')
assert(Array.isArray(data.systems) && data.systems.length === 11, 'Expected eleven coding and payment systems')
assert(Array.isArray(data.icd10cm_chapters) && data.icd10cm_chapters.length === 22, 'Expected all 22 ICD-10-CM chapters')

const flowIds = new Set()
for (const stage of data.claim_flow) {
  assert(typeof stage.id === 'string' && stage.id, 'Every claim-flow stage needs an id')
  assert(!flowIds.has(stage.id), `Duplicate claim-flow stage: ${stage.id}`)
  flowIds.add(stage.id)
  for (const key of ['step', 'title', 'question', 'description']) {
    assert(typeof stage[key] === 'string' && stage[key], `${stage.id}.${key} is required`)
  }
}

const allowedKinds = new Set(['diagnosis', 'procedure', 'claim-context', 'product', 'payer-policy', 'facility-local'])
const systemIds = new Set()
for (const system of data.systems) {
  assert(typeof system.id === 'string' && system.id, 'Every code system needs an id')
  assert(!systemIds.has(system.id), `Duplicate code-system id: ${system.id}`)
  systemIds.add(system.id)
  assert(allowedKinds.has(system.kind), `${system.id} has an unsupported kind: ${system.kind}`)
  for (const key of ['short_name', 'name', 'layer', 'question', 'scope', 'steward', 'identifier_shape', 'note']) {
    assert(typeof system[key] === 'string' && system[key], `${system.id}.${key} is required`)
  }
  assert(Array.isArray(system.tags) && system.tags.length > 0, `${system.id}.tags must be a non-empty array`)
  assert(Array.isArray(system.source_links) && system.source_links.length > 0, `${system.id} needs at least one official source`)
  for (const link of system.source_links) {
    assert(typeof link.label === 'string' && link.label, `${system.id} has a source without a label`)
    assert(/^https:\/\//.test(link.url), `${system.id} has a non-HTTPS source URL`)
  }
  assert(typeof system.licensed_descriptions === 'boolean', `${system.id}.licensed_descriptions must be boolean`)
}

for (const id of [
  'icd-10-cm', 'icd-10-pcs', 'cpt-hcpcs-level-i', 'hcpcs-level-ii', 'claim-modifiers',
  'place-of-service', 'ub04-revenue-codes', 'ndc', 'cdt', 'maryland-medicaid', 'local-charge-codes',
]) {
  assert(systemIds.has(id), `Missing required coding layer: ${id}`)
}

for (const id of ['cpt-hcpcs-level-i', 'claim-modifiers', 'ub04-revenue-codes', 'cdt']) {
  const system = data.systems.find((entry) => entry.id === id)
  assert(system.licensed_descriptions, `${id} must retain its licensing warning`)
}
assert(data.systems.find(({ id }) => id === 'maryland-medicaid')?.kind === 'payer-policy', 'Maryland Medicaid must be modeled as payer policy, not a code set')
assert(data.systems.find(({ id }) => id === 'local-charge-codes')?.kind === 'facility-local', 'Local charge codes must remain facility-specific')

const chapterNumbers = new Set()
const chapterRanges = new Set()
for (const chapter of data.icd10cm_chapters) {
  assert(/^\d{2}$/.test(chapter.chapter), `Invalid ICD chapter number: ${chapter.chapter}`)
  assert(!chapterNumbers.has(chapter.chapter), `Duplicate ICD chapter number: ${chapter.chapter}`)
  assert(!chapterRanges.has(chapter.range), `Duplicate ICD chapter range: ${chapter.range}`)
  chapterNumbers.add(chapter.chapter)
  chapterRanges.add(chapter.range)
  for (const key of ['range', 'title', 'index_query', 'tone']) {
    assert(typeof chapter[key] === 'string' && chapter[key], `ICD chapter ${chapter.chapter}.${key} is required`)
  }
}

assert(data.icd10cm_chapters[0].range === 'A00–B99', 'ICD chapter 01 must begin with A00–B99')
assert(data.icd10cm_chapters.at(-1).range === 'U00–U85', 'ICD chapter 22 must use U00–U85')

console.log(`Validated ${data.systems.length} coding/payment layers, ${data.claim_flow.length} claim stages, and ${data.icd10cm_chapters.length} ICD-10-CM chapters`)
