import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}

export function prepareBuildAssets(outputDirectory, brand) {
  const requiredImages = new Set([brand.logo, brand.social])
  // The shared portal still advertises this public LifeTech logo URL.
  if (brand.themeKey === 'lifetech.theme') requiredImages.add('/assets/images/lifetech-logo.png')
  for (const path of files(outputDirectory)) {
    if (!/\.(html|js|css|json)$/.test(path)) continue
    let source = readFileSync(path, 'utf8')
    if (path.endsWith('.json')) {
      source = JSON.stringify(JSON.parse(source))
      writeFileSync(path, source)
    }
    for (const [url] of source.matchAll(/\/assets\/images\/[a-zA-Z0-9_./-]+/g)) requiredImages.add(url)
  }
  let copied = 0
  for (const url of requiredImages) {
    if (url.split('/').includes('..') || !/\.(png|jpe?g|webp|gif|svg|avif|ico)$/i.test(url)) continue
    const source = url.slice(1)
    if (!existsSync(source)) continue
    const target = join(outputDirectory, source)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(source, target)
    copied++
  }
  console.log(`Copied ${copied} referenced public images for ${brand.name}.`)
}
