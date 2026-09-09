import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const atlasPath = 'assets/data/medical-science-field-atlas.json'

await execFileAsync(process.execPath, ['scripts/build-medical-science-field-atlas-source.mjs'], {
  maxBuffer: 8 * 1024 * 1024,
})

const records = JSON.parse(await readFile(atlasPath, 'utf8'))
if (!Array.isArray(records) || records.length < 200) {
  throw new Error('Medical Science Field Atlas build did not produce the expected flat field array')
}

console.log(`Wrote ${records.length} Medical Science Field Atlas records to ${atlasPath}`)
