import { readFile } from 'node:fs/promises'

const index = JSON.parse(await readFile('assets/data/medtech-index.json', 'utf8'))
const databases = JSON.parse(await readFile('assets/data/taxonomy-databases.json', 'utf8'))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(Array.isArray(index), 'MedTech Index must be a flat JSON array')
assert(index.length >= 200, `Expected a comprehensive index, received ${index.length} records`)
assert(Array.isArray(databases) && databases.length === 6, 'Expected the Index plus five reference frameworks')

const ids = new Set(index.map(({ id }) => id))
assert(ids.size === index.length, 'Every MedTech Index id must be unique')

const requiredArrays = [
  'scientific_lineage', 'body_parts', 'parent_disciplines', 'subdisciplines', 'child_disciplines', 'tags',
]
const databaseIds = new Set(databases.map(({ id }) => id))

for (const record of index) {
  assert(typeof record.id === 'string' && record.id, 'Every record needs an id')
  assert(typeof record.name === 'string' && record.name, `${record.id} needs a name`)
  for (const key of requiredArrays) assert(Array.isArray(record[key]), `${record.id}.${key} must be an array`)
  assert(record.scientific_lineage.length > 0, `${record.id} needs a scientific lineage`)
  for (const relativeId of [...record.parent_disciplines, ...record.child_disciplines]) {
    assert(ids.has(relativeId), `${record.id} references missing discipline ${relativeId}`)
  }
  assert(record.subdisciplines.length === record.child_disciplines.length, `${record.id} child labels and ids disagree`)
  for (const sourceId of Object.keys(record.source_lenses || {})) {
    assert(databaseIds.has(sourceId), `${record.id} references unknown source lens ${sourceId}`)
  }
}

for (const exemplar of ['neurology', 'oncology', 'radiology-and-biomedical-imaging', 'genomics']) {
  assert(ids.has(exemplar), `Missing requested exemplar discipline ${exemplar}`)
}

console.log(`Validated ${index.length} MedTech Index records and ${databases.length} selectable frameworks`)
