import { execFile } from 'node:child_process'
import { copyFile, readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const legacyPath = 'assets/data/medtech-index.json'
const atlasPath = 'assets/data/medical-science-field-atlas.json'

await execFileAsync(process.execPath, ['scripts/build-medtech-index.mjs'], {
  maxBuffer: 8 * 1024 * 1024,
})
await copyFile(legacyPath, atlasPath)

const records = JSON.parse(await readFile(atlasPath, 'utf8'))
if (!Array.isArray(records) || records.length < 200) {
  throw new Error('Medical Science Field Atlas build did not produce the expected flat field array')
}

console.log(`Wrote ${records.length} Medical Science Field Atlas records to ${atlasPath}`)
console.log(`Retained ${legacyPath} as an internal compatibility asset`)
