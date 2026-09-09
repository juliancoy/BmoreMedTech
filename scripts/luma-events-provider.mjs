import { readFile } from 'node:fs/promises'

const DEFAULT_BASE_URL = 'https://public-api.luma.com'
const REQUEST_TIMEOUT_MS = 30_000
const EVENT_UPDATE_FIELDS = new Map([
  ['canRegisterForMultipleTickets', 'can_register_for_multiple_tickets'],
  ['coverUrl', 'cover_url'],
  ['descriptionMarkdown', 'description_md'],
  ['endAt', 'end_at'],
  ['font', 'font'],
  ['location', 'geo_address_json'],
  ['locationVisibility', 'location_visibility'],
  ['maxCapacity', 'max_capacity'],
  ['meetingUrl', 'meeting_url'],
  ['name', 'name'],
  ['nameRequirement', 'name_requirement'],
  ['phoneNumberRequirement', 'phone_number_requirement'],
  ['registrationOpen', 'registration_open'],
  ['remindersDisabled', 'reminders_disabled'],
  ['showGuestList', 'show_guest_list'],
  ['slug', 'slug'],
  ['startAt', 'start_at'],
  ['suppressNotifications', 'suppress_notifications'],
  ['theme', 'theme'],
  ['timezone', 'timezone'],
  ['tintColor', 'tint_color'],
  ['visibility', 'visibility'],
  ['waitlistStatus', 'waitlist_status'],
])

function ensureApiKey(apiKey) {
  if (!apiKey) throw new Error('LUMA_API_KEY is required for Luma event writes')
  return apiKey
}

function inferContentType(pathname) {
  const lower = pathname.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  throw new Error('Luma cover images must be PNG or JPEG')
}

export class LumaEventsProvider {
  constructor({
    apiKey = process.env.LUMA_API_KEY,
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = fetch,
    requestTimeoutMs = REQUEST_TIMEOUT_MS,
  } = {}) {
    this.apiKey = ensureApiKey(apiKey)
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.fetch = fetchImpl
    this.requestTimeoutMs = requestTimeoutMs
  }

  async request(path, body) {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-luma-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    })
    const text = await response.text()
    let payload = null
    if (text) {
      try { payload = JSON.parse(text) } catch { payload = text }
    }
    if (!response.ok) {
      const detail = typeof payload === 'string' ? payload : JSON.stringify(payload)
      throw new Error(`Luma API ${response.status} ${path}: ${detail}`)
    }
    return payload
  }

  updateEvent(eventId, update) {
    const payload = { event_id: eventId }
    for (const [field, value] of Object.entries(update)) {
      const lumaField = EVENT_UPDATE_FIELDS.get(field)
      if (!lumaField) throw new Error(`Unsupported generic event update field: ${field}`)
      payload[lumaField] = value
    }
    return this.request('/v1/events/update', payload)
  }

  addHost(eventId, { email, name, accessLevel = 'manager', isVisible = true }) {
    return this.request('/v1/events/hosts/add', {
      event_id: eventId,
      email,
      name,
      access_level: accessLevel,
      is_visible: isVisible,
    })
  }

  async uploadImage(fileUrl) {
    const contentType = inferContentType(fileUrl.pathname)
    const upload = await this.request('/v1/images/create-upload-url', { content_type: contentType })
    if (!upload?.upload_url || !upload?.file_url) throw new Error('Luma did not return an image upload URL')
    const bytes = await readFile(fileUrl)
    const response = await this.fetch(upload.upload_url, {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body: bytes,
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    })
    if (!response.ok) throw new Error(`Luma image upload failed with status ${response.status}`)
    return upload.file_url
  }
}
