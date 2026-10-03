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
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  for (const key of ['title', 'description', 'intro']) {
    result = result.replaceAll(`{{home.${key}}}`, escape(brand.home[key]))
  }
  result = result.replaceAll('{{home.place}}', brand.home.place)
  const topics = brand.home.topics.length ? `
    <section class="technology-section" aria-labelledby="technology-title">
      <div class="technology-heading">
        <p class="eyebrow">Explore medical technology</p>
        <h2 id="technology-title">What are you working on?</h2>
        <p>Meet people across the lab, the workshop, and the clinic. These are some of the ideas we want to bring into the conversation.</p>
      </div>
      <div class="technology-grid">${brand.home.topics.map((topic, index) => `
        <article class="technology-card">
          <span class="technology-number" aria-hidden="true">0${index + 1}</span>
          <p class="eyebrow">${escape(topic.label)}</p>
          <h3>${escape(topic.title)}</h3>
          <p>${escape(topic.description)}</p>
        </article>`).join('')}
      </div>
      <div class="technology-invitation">
        <div><h3>Bring something worth talking about.</h3><p>A prototype, a research question, or a challenge from the clinic—start with the community.</p></div>
        <a class="button primary" href="/org-events">Find a MedTech event <span aria-hidden="true">&rarr;</span></a>
      </div>
    </section>` : ''
  return result.replaceAll('{{home.topics}}', topics)
}
