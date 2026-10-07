import {
  MEDTECH_ORG_EVENTS_SOURCE_URL,
  MEDTECH_IN_HUT_EVENT_SLUG,
  eventAttachmentImages,
  eventImageUrl,
  medtechEventUrl,
  normalizeLifeTechPortalEvent,
  parseEventDate,
} from './medical-events.js'

const revealItems = [...document.querySelectorAll('[data-reveal]')]
const nextEventEl = document.getElementById('next-medtech-event')
const eventMediaSection = document.getElementById('medtech-in-hut-media')
const eventMediaGrid = document.getElementById('medtech-in-hut-gallery')
const EVENT_TIME_ZONE = 'America/New_York'

function cleanText(value) {
  const div = document.createElement('div')
  div.innerHTML = String(value || '')
  return div.textContent || div.innerText || ''
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatHeroEventDate(date) {
  return date.toLocaleString(undefined, {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function progressiveImageMarkup(image, attrs = '') {
  const placeholder = image.placeholderSrc || image.src
  const fullAttrs = placeholder === image.src ? '' : ` data-full-src="${escapeHtml(image.src)}"`
  const className = placeholder === image.src ? '' : ' class="progressive-image"'
  return `<img${className} src="${escapeHtml(placeholder)}"${fullAttrs} alt="${escapeHtml(image.alt)}" ${attrs} />`
}

async function showNextLifeTechEvent() {
  if (!nextEventEl && !eventMediaSection) return
  if (nextEventEl) {
    nextEventEl.hidden = false
    nextEventEl.innerHTML = '<p role="status">Loading LifeTech events…</p>'
  }
  try {
    let response
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch(MEDTECH_ORG_EVENTS_SOURCE_URL, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
        if (response.ok) break
        if (response.status < 500) break
      } catch (error) {
        if (attempt === 1) throw error
      }
    }
    if (!response.ok) throw new Error(`LifeTech events returned ${response.status}`)
    const events = await response.json()
    const now = new Date()
    const next = (Array.isArray(events) ? events : [])
      .map(normalizeLifeTechPortalEvent)
      .map((event) => ({ event, date: parseEventDate(event) }))
      .filter((item) => {
        if (!item.date) return false
        const end = item.event.endTime ? new Date(item.event.endTime) : item.date
        // Date-only events stay visible throughout their calendar day.
        if (/^\d{4}-\d{2}-\d{2}$/.test(item.event.startDate) && !item.event.endTime) end.setHours(23, 59, 59, 999)
        return !Number.isNaN(end.getTime()) && end >= now
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0]
    const medtechInHut = (Array.isArray(events) ? events : [])
      .map(normalizeLifeTechPortalEvent)
      .find((event) => event.slug === MEDTECH_IN_HUT_EVENT_SLUG || event.portalSlug === MEDTECH_IN_HUT_EVENT_SLUG)
    if (medtechInHut && eventMediaSection && eventMediaGrid) {
      const images = eventAttachmentImages(medtechInHut)
      if (images.length) {
        eventMediaGrid.innerHTML = images.map((image) => `
          <a class="event-media-card" href="${escapeHtml(image.src)}" target="_blank" rel="noopener noreferrer">
            ${progressiveImageMarkup(image, 'loading="lazy" decoding="async"')}
            <span>${escapeHtml(image.label)}</span>
          </a>
        `).join('')
        eventMediaSection.hidden = false
        window.dispatchEvent(new Event('bmoremedtech:progressive-images'))
      }
    }
    if (!nextEventEl) return
    if (!next) {
      nextEventEl.innerHTML = '<p>No upcoming LifeTech events are published yet. <a href="/org-events">Browse events</a></p>'
      return
    }

    const imageUrl = eventImageUrl(next.event)
    const location = typeof next.event.location === 'object'
      ? [next.event.location.name, next.event.location.address].filter(Boolean)[0]
      : ''
    const eventName = cleanText(next.event.name)
    nextEventEl.innerHTML = `
      <a class="hero-event-card${imageUrl ? ' has-image' : ''}" href="${escapeHtml(medtechEventUrl(next.event))}" aria-label="Open ${escapeHtml(eventName)}">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="eager" decoding="async" />` : ''}
        <span class="hero-event-copy">
          <span class="hero-event-label">Next LifeTech event</span>
          <span class="hero-event-title">${escapeHtml(eventName)}</span>
          <span class="hero-event-meta">${escapeHtml(formatHeroEventDate(next.date))}${location ? ` | ${escapeHtml(cleanText(location))}` : ''}</span>
        </span>
        <span class="hero-event-cue">View event <span aria-hidden="true">&rarr;</span></span>
      </a>
    `
    nextEventEl.hidden = false
    window.dispatchEvent(new Event('bmoremedtech:progressive-images'))
    nextEventEl.querySelector('img')?.addEventListener('error', (event) => {
      event.currentTarget.remove()
    }, { once: true })
  } catch (error) {
    console.warn('Next LifeTech event could not be loaded for the hero.', error)
    if (nextEventEl) {
      nextEventEl.innerHTML = '<p role="status">LifeTech events could not be loaded.</p><button type="button" class="button">Retry</button> <a href="/org-events">Browse events</a>'
      nextEventEl.querySelector('button').addEventListener('click', showNextLifeTechEvent, { once: true })
    }
  }
}

if (revealItems.length && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('reveal-enabled')

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    },
    {
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.12,
    },
  )

  requestAnimationFrame(() => {
    revealItems.forEach((item) => observer.observe(item))
  })
}

showNextLifeTechEvent()
