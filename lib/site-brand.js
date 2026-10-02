import sites from '../sites.json' with { type: 'json' }

export function siteBrand(id = 'medtech') {
  const brand = sites[id]
  if (!brand) throw new Error(`Unknown site brand: ${id}`)
  return brand
}

// One presentation source, two independent builds; domains are deployment configuration.
export function renderSiteBrand(source, brand) {
  const template = sites.lifetech
  let result = source
  for (const key of ['origin', 'logo', 'hero', 'social', 'themeKey']) {
    result = result.replaceAll(template[key], brand[key])
  }
  result = result.replace(/\bLifeTech\b/g, brand.name)
    .replaceAll('BALTIMORE LIFETECH', brand.name.toUpperCase())
    .replace(/(property="og:image:width" content=")\d+/g, `$1${brand.socialWidth}`)
    .replace(/(property="og:image:height" content=")\d+/g, `$1${brand.socialHeight}`)
  if (brand.logo.endsWith('.jpg')) {
    result = result.replace(/(rel="icon" type=")image\/png/g, '$1image/jpeg')
  }
  return result
}
