export const MEDICAL_EVENTS_SOURCE_URL = 'https://codecollective.us/baltimore/upcoming_events.json'

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

function searchableText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ')
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
  ].map(searchableText).join(' ')
}

export function isMedicalEvent(event) {
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

export function parseEventDate(event) {
  const date = new Date(event.startDate)
  return Number.isNaN(date.getTime()) ? null : date
}

export function eventCoordinates(event) {
  const rawLatitude = event.location?.latitude
  const rawLongitude = event.location?.longitude
  if (rawLatitude === '' || rawLongitude === '' || rawLatitude === null || rawLongitude === null) return null
  if (rawLatitude === undefined || rawLongitude === undefined) return null

  const latitude = Number(rawLatitude)
  const longitude = Number(rawLongitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return [longitude, latitude]
}
