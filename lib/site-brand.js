import sites from '../sites.json' with { type: 'json' }
import showcase from './medtech-showcase.json' with { type: 'json' }

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
  const isMedTech = brand === sites.medtech
  result = result.replaceAll('{{home.amplifyLink}}', isMedTech
    ? '<p><a href="#amplify-medtech">Explore Amplify MedTech Organization <span aria-hidden="true">→</span></a></p>'
    : '')
  result = result.replaceAll('{{home.amplify}}', isMedTech ? `<section class="technology-section" id="amplify-medtech" aria-labelledby="amplify-title">
    <div class="technology-card">
      <p class="eyebrow">Featured organization</p>
      <h2 id="amplify-title">Amplify MedTech Organization</h2>
      <p>Connect with the wider MedTech ecosystem through Amplify MedTech’s networking events, educational programs, and consulting. Explore opportunities to learn, meet other innovators, and move your work forward.</p>
      <div class="technology-invitation">
        <a class="button primary" href="https://www.amplifymedtech.com/">Visit Amplify MedTech <span aria-hidden="true">↗</span></a>
        <a class="showcase-index-link" href="/ecosystem#org-amplify-medtech">Explore Amplify in our organization index <span aria-hidden="true">→</span></a>
      </div>
    </div>
  </section>` : '')
  const photo = entry => `<a class="showcase-image-link" href="${escape(entry.sourceUrl)}" aria-label="${escape(entry.name)}: view original photo source"><img src="${entry.image}" width="${entry.width}" height="${entry.height}" alt="${escape(entry.alt)}" loading="lazy" decoding="async" /></a>`
  const robot = showcase.entries[0]
  const spotlight = isMedTech ? `<figure class="hero-spotlight">
    ${photo(robot).replace('loading="lazy"', 'fetchpriority="high"')}
    <figcaption><span>Surgical robotics, built in Baltimore</span><strong>${escape(robot.name)}</strong><a href="${escape(robot.sourceUrl)}">Training demonstration · Photo: ${escape(robot.credit)} ↗</a></figcaption>
  </figure>` : `<div class="hero-place" aria-hidden="true"><span>Baltimore, Maryland</span><strong>${brand.home.place}</strong></div>`
  result = result.replaceAll('{{home.spotlight}}', spotlight)
  const gallery = isMedTech ? `<section class="showcase-section" id="local-technology" aria-labelledby="showcase-title">
    <div class="technology-heading"><p class="eyebrow">Made here. Used here.</p><h2 id="showcase-title">Meet the technology in our region.</h2><p>Start with builders in our local index and their Hopkins connections. Then explore CT and MRI equipment in Baltimore’s clinical settings.</p><a class="showcase-index-link" href="/ecosystem">Explore the local organization index <span aria-hidden="true">→</span></a></div>
    ${['company', 'clinical-setting'].map(kind => `<h3 class="showcase-group-title">${kind === 'company' ? 'Local builders & their technology' : 'Inside local imaging suites'}</h3><div class="showcase-grid">${showcase.entries.filter(entry => entry.kind === kind).map(entry => `<article class="showcase-card">
      <figure>${photo(entry)}<figcaption>Photo: <a href="${escape(entry.sourceUrl)}">${escape(entry.credit)} ↗</a></figcaption></figure>
      <div class="showcase-card-copy"><p class="eyebrow">${escape(entry.label)}</p><h4>${escape(entry.title)}</h4><p class="showcase-company">${escape(entry.name)}</p><p>${escape(entry.description)}</p>${entry.indexOrganizationId ? `<a class="showcase-index-link" href="/ecosystem#${entry.indexOrganizationId}">${escape(entry.indexLabel)} →</a>` : ''}</div>
    </article>`).join('')}</div>`).join('')}
  </section>` : ''
  result = result.replaceAll('{{home.showcase}}', gallery)
  result = result.replaceAll('{{home.carousel}}', isMedTech ? `<section class="drive-carousel-section" id="community-photos" aria-labelledby="community-photos-title">
    <div class="technology-heading"><p class="eyebrow">The community, in pictures</p><h2 id="community-photos-title">Meet the people behind the ideas.</h2><p>Photos from our shared community folder. Sign in to hide a photo from your carousel and find it later in your account.</p><a href="https://drive.google.com/drive/folders/1PoJ9KQvInRhJeoY91ODJ-915_eGuPAmb" target="_blank" rel="noopener noreferrer">Open the Google Drive folder ↗</a></div>
    <div id="drive-carousel" role="region" aria-roledescription="carousel" aria-label="Community photos"><p role="status">Loading community photos…</p></div>
    <noscript><p>Open the Google Drive folder above to view the photos.</p></noscript>
  </section>` : '')
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
