const SOURCE_URL = 'https://codecollective.us/baltimore/upcoming_events.json'
const PORTAL_URL = 'https://codecollective.us/p/?portalProfile=baltimore-medtech'

const state = {
  events: [],
  visibleDate: new Date(),
}

const statusEl = document.getElementById('status')
const gridEl = document.getElementById('calendar-grid')
const listEl = document.getElementById('event-list')
const monthLabelEl = document.getElementById('month-label')
const countEl = document.getElementById('event-count')
const prevButton = document.getElementById('prev-month')
const nextButton = document.getElementById('next-month')

const medicalSourceHints = [
  'nami',
  'bio-trac',
  'biotrac',
  'biobuzz',
  'mdtechcouncil',
  'johns hopkins',
  'hopkins',
  'nih',
  'national cancer institute',
  'university of maryland medical',
]

const medicalKeywords = /\b(medtech|medical|medicine|healthcare|health care|public health|mental health|biotech|biopharma|pharma(?:ceutical)?|clinical|clinic|hospital|patient|therapeutics?|life sciences?|genomics?|sequencing|cancer|oncology|nursing|physician|diagnos(?:is|tic|tics)?|disease|vaccine|surgery|surgical|neuroscience|cardiology|dental|pharmacology)\b/i
const wellnessOnly = /\b(yoga|meditation|fitness|pilates|dance fitness|line dancing|workout)\b/i

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

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''), window.location.href)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : PORTAL_URL
  } catch {
    return PORTAL_URL
  }
}

function eventBlob(event) {
  return [
    event.name,
    event.description,
    event.source_group,
    event.org_name,
    event.orgName,
    event.location?.name,
    event.location?.address,
    event.url,
    event.source,
  ].map(cleanText).join(' ')
}

function isMedicalEvent(event) {
  const tags = Array.isArray(event.tags) ? event.tags.map((tag) => String(tag).toLowerCase()) : []
  const blob = eventBlob(event)
  const normalizedBlob = blob.toLowerCase()
  const sourceMatch = medicalSourceHints.some((hint) => normalizedBlob.includes(hint))
  const keywordMatch = medicalKeywords.test(blob)
  const taggedHealth = tags.includes('health')

  if (sourceMatch || keywordMatch) return true
  if (taggedHealth && !wellnessOnly.test(blob)) return true
  return false
}

function parseEventDate(event) {
  const date = new Date(event.startDate)
  return Number.isNaN(date.getTime()) ? null : date
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTime(date) {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatEventMeta(event, date) {
  const location = typeof event.location === 'object'
    ? [event.location.name, event.location.address, event.location.city].filter(Boolean).join(', ')
    : ''
  return [formatTime(date), event.source_group || event.org_name, location].filter(Boolean).join(' | ')
}

function monthEvents() {
  const visibleKey = monthKey(state.visibleDate)
  return state.events.filter(({ date }) => monthKey(date) === visibleKey)
}

function renderCalendar() {
  const monthStart = new Date(state.visibleDate.getFullYear(), state.visibleDate.getMonth(), 1)
  const firstGridDate = new Date(monthStart)
  firstGridDate.setDate(monthStart.getDate() - monthStart.getDay())
  const eventsByDay = new Map()

  for (const item of monthEvents()) {
    const key = dayKey(item.date)
    eventsByDay.set(key, [...(eventsByDay.get(key) || []), item])
  }

  monthLabelEl.textContent = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  gridEl.innerHTML = ''
  for (const label of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    const weekday = document.createElement('div')
    weekday.className = 'weekday'
    weekday.textContent = label
    gridEl.appendChild(weekday)
  }

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(firstGridDate)
    date.setDate(firstGridDate.getDate() + i)
    const key = dayKey(date)
    const day = document.createElement('div')
    day.className = `day${date.getMonth() === monthStart.getMonth() ? '' : ' outside'}`

    const number = document.createElement('span')
    number.className = 'day-number'
    number.textContent = String(date.getDate())
    day.appendChild(number)

    for (const item of (eventsByDay.get(key) || []).slice(0, 3)) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'day-event'
      button.textContent = item.event.name
      button.addEventListener('click', () => {
        document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      day.appendChild(button)
    }

    const overflow = (eventsByDay.get(key) || []).length - 3
    if (overflow > 0) {
      const more = document.createElement('span')
      more.className = 'status'
      more.textContent = `+${overflow} more`
      day.appendChild(more)
    }

    gridEl.appendChild(day)
  }

  gridEl.hidden = false
}

function renderList() {
  const now = new Date()
  const upcoming = state.events.filter(({ date }) => date >= now).slice(0, 40)
  countEl.textContent = `${upcoming.length} shown`
  listEl.innerHTML = ''

  if (upcoming.length === 0) {
    listEl.innerHTML = '<p class="status">No upcoming medical events are published right now.</p>'
    return
  }

  for (const item of upcoming) {
    const article = document.createElement('article')
    article.className = 'event-card'
    article.id = item.id

    const month = item.date.toLocaleDateString(undefined, { month: 'short' })
    const day = item.date.toLocaleDateString(undefined, { day: 'numeric' })
    const description = cleanText(item.event.description).replace(/\s+/g, ' ').trim()
    const eventUrl = safeUrl(item.event.url)

    article.innerHTML = `
      <div class="event-date">${month}<span>${day}</span></div>
      <div>
        <h3>${escapeHtml(cleanText(item.event.name))}</h3>
        <p>${escapeHtml(formatEventMeta(item.event, item.date))}</p>
        ${description ? `<p>${escapeHtml(description.slice(0, 180))}${description.length > 180 ? '...' : ''}</p>` : ''}
        <a href="${escapeHtml(eventUrl)}" target="_blank" rel="noopener noreferrer">Open event</a>
      </div>
    `
    listEl.appendChild(article)
  }
}

async function loadEvents() {
  try {
    const response = await fetch(SOURCE_URL, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Calendar source returned ${response.status}`)
    const sourceEvents = await response.json()
    state.events = sourceEvents
      .filter(isMedicalEvent)
      .map((event, index) => ({ event, date: parseEventDate(event), id: `event-${index}` }))
      .filter((item) => item.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    const firstUpcoming = state.events.find((item) => item.date >= new Date())
    if (firstUpcoming) state.visibleDate = new Date(firstUpcoming.date)
    statusEl.hidden = true
    renderCalendar()
    renderList()
  } catch (error) {
    statusEl.innerHTML = `
      The published calendar source could not be loaded here.
      <a href="https://codecollective.us/calendar.html?city=baltimore&lm=individual_tags&lt=health.science" target="_blank" rel="noopener noreferrer">
        Open the published Code Collective calendar.
      </a>
    `
    console.error(error)
  }
}

prevButton.addEventListener('click', () => {
  state.visibleDate = new Date(state.visibleDate.getFullYear(), state.visibleDate.getMonth() - 1, 1)
  renderCalendar()
})

nextButton.addEventListener('click', () => {
  state.visibleDate = new Date(state.visibleDate.getFullYear(), state.visibleDate.getMonth() + 1, 1)
  renderCalendar()
})

loadEvents()
