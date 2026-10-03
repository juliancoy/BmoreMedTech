import test from 'node:test'
import assert from 'node:assert/strict'
import {
  eventImageUrl,
  parseEventDate,
  isMedicalEvent,
  isLifeTechOwnedEvent,
  medtechEventUrl,
  mergeEventSources,
  normalizeLifeTechPortalEvent,
} from '../assets/medical-events.js'

test('event pictures resolve against the published feed and retain organizer fallback', () => {
  assert.equal(eventImageUrl({ imageUrl: '/event_images/meetup.webp' }), 'https://codecollective.us/event_images/meetup.webp')
  assert.equal(eventImageUrl({ imageUrl: 'https://images.example/event.jpg' }), 'https://images.example/event.jpg')
  assert.equal(eventImageUrl({ imageUrl: '', orgImageUrl: '/images/organizer.png' }), 'https://codecollective.us/images/organizer.png')
  assert.equal(eventImageUrl({ imageUrl: 'javascript:alert(1)', orgImageUrl: 'data:text/html,unsafe' }), null)
  assert.equal(eventImageUrl({}), null)
})

test('portal-owned LifeTech events normalize into the general calendar feed', () => {
  const portalEvent = {
    id: 'event-1',
    title: 'LifeTech Formational Event',
    slug: 'medtech-formational-event',
    description: 'Meet the community.',
    starts_at: '2026-09-29T22:00:00.000Z',
    ends_at: '2026-09-30T00:30:00.000Z',
    location: 'Checkerspot Brewing, 1421 Ridgely St, Baltimore, MD 21230',
    image_url: 'https://images.example/event.png',
    host_org_id: 'org-baltimore-medtech',
    host_org_name: 'LifeTech',
    tags: ['health'],
  }
  const normalized = normalizeLifeTechPortalEvent(portalEvent)
  assert.equal(normalized.name, 'LifeTech Formational Event')
  assert.equal(normalized.startDate, '2026-09-29T22:00:00.000Z')
  assert.equal(normalized.url, 'https://lifetech.fyi/events/medtech-formational-event')
  assert.equal(normalized.location.name, 'Checkerspot Brewing, 1421 Ridgely St, Baltimore, MD 21230')
  assert.equal(normalized.medtechOwned, true)
  assert.equal(isLifeTechOwnedEvent(normalized), true)
  assert.equal(isMedicalEvent(normalized), true)
})

test('event merging prefers LifeTech-owned portal records and deduplicates by URL', () => {
  const medtech = { name: 'LifeTech Formational Event', startDate: '2026-09-29T22:00:00.000Z', url: 'https://lifetech.fyi/events/medtech-formational-event', medtechOwned: true }
  const duplicate = { name: 'LifeTech Formational Event', startDate: '2026-09-29T22:00:00.000Z', url: 'https://lifetech.fyi/events/medtech-formational-event' }
  const regional = { name: 'Clinical AI meetup', startDate: '2026-09-30T22:00:00.000Z', url: 'https://events.example/clinical-ai' }
  assert.deepEqual(mergeEventSources([medtech], [duplicate, regional]), [medtech, regional])
})

test('LifeTech event URLs stay on the LifeTech base domain', () => {
  assert.equal(
    medtechEventUrl({ public_url: 'https://codecollective.us/events/example-event' }),
    'https://lifetech.fyi/events/example-event',
  )
})

 test('date-only portal events retain their calendar day', () => {
  const event = normalizeLifeTechPortalEvent({ title: 'November gathering', event_date: '2026-11-17', starts_at: null })
  const date = parseEventDate(event)
  assert.equal(date.getFullYear(), 2026)
  assert.equal(date.getMonth(), 10)
  assert.equal(date.getDate(), 17)
  assert.equal(parseEventDate({ startDate: 'invalid' }), null)
})
