import { appearanceBootstrap, appearanceCss, appearanceFallback } from './lifetech-appearance.js'
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
  if (brand === sites.lifetech) {
    result = result.replace('<html', '<html data-site-brand="lifetech" data-brand-layout="postcapitalist-corporate"')
      .replace('</head>', '<link rel="stylesheet" href="/assets/lifetech-brand.css"><link rel="stylesheet" href="/assets/lifetech-layouts.css">\n</head>')
    result = result.replace(/<script>\s*\(\(\) => \{\s*const key = 'lifetech.theme';[\s\S]*?<\/script>/, `<script id="lifetech-appearance-bootstrap">${appearanceBootstrap()}</script>`)
    result = result.replace('</head>', `<style id="lifetech-appearance-colors">${appearanceCss(appearanceFallback)}</style></head>`)
    const defaultTheme = appearanceFallback.brandThemes.themes.find(theme => theme.id === appearanceFallback.brandThemes.defaultTheme)
    result = result.replaceAll(`src="${brand.hero}"`, `src="${defaultTheme.imagery.background}"`)
      .replaceAll(`src="${brand.logo}"`, `src="${defaultTheme.imagery.icon}"`)
    const signature = `<img class="signature-wordmark" src="${appearanceFallback.nameBannerUrl}" alt="LifeTech" width="422" height="88" />`
    result = result.replace('<div class="hero-copy">', `<div class="hero-copy">${signature}`)
    const banner = '<img class="name-banner" src="/assets/images/lifetech-namebanner.webp" alt="LifeTech" width="2172" height="724" decoding="async" />'
    result = result.replaceAll('<strong>LifeTech</strong>', `<strong>${banner}${signature}</strong>`)
      .replaceAll('<a class="footer-brand" href="/">LifeTech</a>', `<a class="footer-brand" href="/">${banner}${signature}</a>`)
  }
  const isMedTech = brand === sites.medtech
  if (!isMedTech) {
    const newsletterLink = '<a class="social-link" href="/#newsletter" aria-label="Join the LifeTech mailing list" title="Join the LifeTech mailing list"><span class="social-button"><svg class="social-icon mail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span></a>'
    result = result.replace(/(<div class="social-links"[^>]*>)/g, `$1\n      ${newsletterLink}`)
  }
  result = result.replaceAll('{{home.newsletter}}', isMedTech ? '' : `<section id="newsletter" class="newsletter-signup" aria-labelledby="newsletter-title">
    <h2 id="newsletter-title">Get the LifeTech newsletter</h2>
    <p>Community news and upcoming events in your inbox. Just your email—no account or membership required.</p>
    <form data-newsletter-form>
      <label for="newsletter-email">Email address</label>
      <input id="newsletter-email" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com" aria-describedby="newsletter-consent" />
      <p id="newsletter-consent">By selecting Subscribe, you agree to receive the LifeTech newsletter. Unsubscribe anytime using the link in each email. <a href="/api/org/privacy">Privacy policy</a></p>
      <button class="button primary" type="submit">Subscribe</button>
      <p role="status" aria-live="polite"></p>
      <noscript>Please enable JavaScript to subscribe.</noscript>
    </form>
  </section>`)
  if (!isMedTech && source.includes('{{home.newsletter}}')) result = result.replace('</head>', '<link rel="stylesheet" href="/assets/newsletter.css"><script type="module" src="/assets/newsletter.js"></script></head>')
  result = result.replaceAll('{{home.amplifyLink}}', isMedTech
    ? '<p><a href="#amplify-medtech">Explore Amplify MedTech Organization <span aria-hidden="true">→</span></a></p>'
    : '')
  result = result.replaceAll('{{home.community}}', isMedTech ? '' : `<section class="technology-section" aria-labelledby="community-title">
    <div class="technology-heading"><p class="eyebrow">Connect across disciplines</p><h2 id="community-title">A place to meet Baltimore’s life sciences community.</h2><p>LifeTech is an open regional community for people working on human health. Bring a clinical challenge, a research question, a prototype, or curiosity about what others are building.</p></div>
    <div class="technology-grid">
      <article class="technology-card"><h3>Meet clinicians, researchers, and builders</h3><p>Our monthly meetups bring people across medicine, engineering, biotechnology, and entrepreneurship into the same conversation. Share your work and find perspectives beyond your own field.</p><a href="/org-events">Find a LifeTech meetup →</a></article>
      <article class="technology-card"><h3>Explore startups and local organizations</h3><p>Demo days introduce founders and their ideas to the community. The regional directory connects companies, research institutions, and support organizations, with sources for documented relationships.</p><a href="/ecosystem">Explore Baltimore’s health and biotech ecosystem →</a></article>
      <article class="technology-card"><h3>Find events and research resources</h3><p>Browse the regional events calendar, explore medical specialties in the atlas, and find public healthcare datasets. Use these resources to prepare for your next conversation or project.</p><a href="/calendar">Browse regional events →</a> <a href="/datasets">Explore healthcare data →</a></article>
      <article class="technology-card"><h3>Join the conversation</h3><p>You do not need a pitch or a specialized background to get involved. Start with an upcoming event, meet the people in the community, and share a question you would like to work on.</p><a href="/start">Get involved with LifeTech →</a> <a href="/about">Learn about the community →</a></article>
    </div>
  </section>`)
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
  result = result.replaceAll('{{home.carousel}}', `<section class="drive-carousel-section" id="community-photos" aria-labelledby="community-photos-title">
    <div class="technology-heading"><p class="eyebrow">The community, in pictures</p><h2 id="community-photos-title">Meet the people behind the ideas.</h2><p>Photos from our shared community folder. Sign in to hide a photo from your carousel and find it later in your account.</p><a href="https://drive.google.com/drive/folders/1PoJ9KQvInRhJeoY91ODJ-915_eGuPAmb" target="_blank" rel="noopener noreferrer">Open the Google Drive folder ↗</a></div>
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
