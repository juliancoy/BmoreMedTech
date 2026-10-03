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
  const photo = entry => `<a class="showcase-image-link" href="${escape(entry.sourceUrl)}" aria-label="${escape(entry.name)}: view original photo source"><img src="${entry.image}" width="${entry.width}" height="${entry.height}" alt="${escape(entry.alt)}" loading="lazy" decoding="async" /></a>`
  const robot = showcase.entries[0]
  const spotlight = isMedTech ? `<div class="hero-features"><figure class="hero-spotlight">
    ${photo(robot).replace('loading="lazy"', 'fetchpriority="high"')}
    <figcaption><span>Surgical robotics, built in Baltimore</span><strong>${escape(robot.name)}</strong><a href="${escape(robot.sourceUrl)}">Training demonstration · Photo: ${escape(robot.credit)} ↗</a></figcaption>
  </figure>
  <article class="hero-spotlight amplify-spotlight" id="amplify-medtech" aria-labelledby="amplify-title">
    <a class="amplify-image-link" href="https://www.amplifymedtech.com/" aria-label="Visit Amplify MedTech"><img src="/assets/images/medtech-showcase/amplify-medtech-logo.png" width="500" height="194" alt="Amplify MedTech logo" decoding="async" /></a>
    <div class="amplify-copy">
      <p class="eyebrow">Featured organization</p>
      <h2 id="amplify-title">Amplify MedTech Organization</h2>
      <p>Networking events, educational programs, and consulting to connect and support the MedTech ecosystem.</p>
      <a href="https://www.amplifymedtech.com/">Visit Amplify MedTech <span aria-hidden="true">↗</span></a>
      <a href="/ecosystem#org-amplify-medtech">Explore our organization index <span aria-hidden="true">→</span></a>
      <small>Logo: <a href="https://www.amplifymedtech.com/">Amplify MedTech</a></small>
    </div>
  </article></div>` : `<div class="hero-place" aria-hidden="true"><span>Baltimore, Maryland</span><strong>${brand.home.place}</strong></div>`
  result = result.replaceAll('{{home.spotlight}}', spotlight)
  const gallery = isMedTech ? `<section class="showcase-section" id="local-technology" aria-labelledby="showcase-title">
    <div class="technology-heading"><p class="eyebrow">Made here. Used here.</p><h2 id="showcase-title">Meet the technology in our region.</h2><p>Start with builders in our local index and their Hopkins connections. Then explore CT and MRI equipment in Baltimore’s clinical settings.</p><a class="showcase-index-link" href="/ecosystem">Explore the local organization index <span aria-hidden="true">→</span></a></div>
    ${['company', 'clinical-setting'].map(kind => `<h3 class="showcase-group-title">${kind === 'company' ? 'Local builders & their technology' : 'Inside local imaging suites'}</h3><div class="showcase-grid">${showcase.entries.filter(entry => entry.kind === kind).map(entry => `<article class="showcase-card">
      <figure>${photo(entry)}<figcaption>Photo: <a href="${escape(entry.sourceUrl)}">${escape(entry.credit)} ↗</a></figcaption></figure>
      <div class="showcase-card-copy"><p class="eyebrow">${escape(entry.label)}</p><h4>${escape(entry.title)}</h4><p class="showcase-company">${escape(entry.name)}</p><p>${escape(entry.description)}</p>${entry.indexOrganizationId ? `<a class="showcase-index-link" href="/ecosystem#${entry.indexOrganizationId}">${escape(entry.indexLabel)} →</a>` : ''}</div>
    </article>`).join('')}</div>`).join('')}
  </section>` : ''
  result = result.replaceAll('{{home.showcase}}', gallery)
  const agentPhotoRequest = `Help me upload pictures to ${brand.name} using my existing account. Ask me which files to upload and whether they belong in the organization's public photo gallery or a specific event gallery.

MCP server: ${brand.origin}/api/org/mcp
OAuth discovery: ${brand.origin}/.well-known/oauth-protected-resource/api/org/mcp
Organization ID: ${brand.organizationId}

Connect using OAuth and the same ${brand.name} account I use on the website. Let me approve the connection in the browser. Discover the available MCP tools and check my organization permissions; do not use an owner account or ask me to paste tokens or API keys.

For local picture files, use OrgPortal's existing multipart upload endpoint: ${brand.origin}/api/org/mcp/uploads/organization-media (scopes org:portal.read and org:portal.write). Fields: organizationId, image, and optional label and alt. For a specific event use ${brand.origin}/api/org/mcp/uploads/event-media with eventId and scopes org:events.read and org:events.write. JPEG, PNG, GIF and WebP are supported, up to 8 MB each and 12 pictures per gallery.

First submit without confirm to get the upload preview and previewId. Show me the destination and pictures and ask for approval. Only after approval, submit the identical files and metadata with confirm=true and that previewId. Uploads append to the chosen gallery. If my account lacks permission, explain what access I need. After an ambiguous failure inspect the operation before retrying. Return the gallery links and confirmed results.

The homepage carousel uses a separate shared Drive folder. Upload these pictures to the organization or event gallery; do not claim they were added to the Drive folder or carousel.`
  result = result.replaceAll('{{home.carousel}}', `<section class="drive-carousel-section" id="community-photos" aria-labelledby="community-photos-title">
    <div class="technology-heading"><p class="eyebrow">The community, in pictures</p><h2 id="community-photos-title">Meet the people behind the ideas.</h2><p>Photos from our shared community folder. Sign in to hide a photo from your carousel and find it later in your account.</p><a href="https://drive.google.com/drive/folders/1PoJ9KQvInRhJeoY91ODJ-915_eGuPAmb" target="_blank" rel="noopener noreferrer">Open the Google Drive folder ↗</a></div>
    <aside class="agent-photo-upload" id="agent-photo-upload" aria-labelledby="agent-photo-upload-title" hidden>
      <div><h3 id="agent-photo-upload-title">Upload photos with your AI</h3><p>Copy this request to your agent. Connect with your account, choose your photos, and review the upload before it is published.</p><p>Uploads go to your organization or event gallery and use your existing permissions.</p></div>
      <button class="button primary" type="button" data-copy-agent-request>Copy request for my AI</button>
      <p class="agent-copy-status" role="status" aria-live="polite"></p>
      <details><summary>MCP connection and upload instructions</summary><p>MCP server: <a href="${brand.origin}/api/org/mcp">${brand.origin}/api/org/mcp</a> · <a href="${brand.origin}/.well-known/oauth-protected-resource/api/org/mcp">Connection discovery</a></p><label for="agent-photo-request">Request for your AI agent</label><textarea id="agent-photo-request" rows="12" readonly spellcheck="false">${escape(agentPhotoRequest)}</textarea></details>
    </aside>
    <figure class="community-video" aria-labelledby="community-video-title">
      <figcaption><p class="eyebrow">Meet the community</p><h3 id="community-video-title">Say “MedTech!”</h3><p>Three seconds. One community. Press play to hear us.</p></figcaption>
      <video controls playsinline preload="metadata" poster="/assets/images/medtech-community-poster.jpg" width="1024" height="576" aria-label="MedTech community group greeting">
        <source src="/assets/videos/medtech-community.mp4" type="video/mp4" />
        <track kind="captions" src="/assets/videos/medtech-community.vtt" srclang="en" label="English" default />
        <a href="https://drive.google.com/file/d/1IoIN2F9zSsiDDvP5qIxGLWJMFjdyomtw/view">Watch the MedTech community video</a>
      </video>
      <a class="community-video-source" href="https://drive.google.com/file/d/1IoIN2F9zSsiDDvP5qIxGLWJMFjdyomtw/view">Original community video ↗</a>
    </figure>
    <h3 class="community-photo-title">More moments from the meetup</h3>
    <div id="drive-carousel" role="region" aria-roledescription="carousel" aria-label="Community photos"><p role="status">Loading community photos…</p></div>
    <noscript><p>Open the Google Drive folder above to view the photos.</p></noscript>
  </section>`)
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
