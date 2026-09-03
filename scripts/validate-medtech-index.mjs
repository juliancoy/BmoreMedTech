import { readFile } from 'node:fs/promises'

const fieldAtlas = JSON.parse(await readFile('assets/data/medical-science-field-atlas.json', 'utf8'))
const compatibilityAsset = JSON.parse(await readFile('assets/data/medtech-index.json', 'utf8'))
const databases = JSON.parse(await readFile('assets/data/taxonomy-databases.json', 'utf8'))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(Array.isArray(fieldAtlas), 'Medical Science Field Atlas must be a flat JSON array')
assert(fieldAtlas.length >= 200, `Expected a comprehensive field atlas, received ${fieldAtlas.length} records`)
assert(JSON.stringify(fieldAtlas) === JSON.stringify(compatibilityAsset), 'The public Field Atlas and compatibility asset must remain identical')
assert(Array.isArray(databases) && databases.length === 6, 'Expected the Field Atlas plus five reference frameworks')
assert(databases[0]?.name === 'Medical Science Field Atlas', 'The primary framework must use the new Field Atlas title')
assert(databases[0]?.source_url === '/medical-science-field-atlas.json', 'The primary framework must publish the renamed JSON route')
assert(databases.every((database) => !database.name.includes('MedTech Index') && !database.description.includes('MedTech Index')), 'Legacy MedTech Index wording must not remain in user-facing framework metadata')

const ids = new Set(fieldAtlas.map(({ id }) => id))
assert(ids.size === fieldAtlas.length, 'Every Medical Science Field Atlas id must be unique')

const requiredArrays = [
  'scientific_lineage',
  'body_parts',
  'parent_disciplines',
  'subdisciplines',
  'child_disciplines',
  'tags',
]
const databaseIds = new Set(databases.map(({ id }) => id))

for (const record of fieldAtlas) {
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

console.log(`Validated ${fieldAtlas.length} Medical Science Field Atlas records and ${databases.length} selectable frameworks`)
