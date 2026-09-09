import test from 'node:test'
import assert from 'node:assert/strict'
import {
  eventImageUrl,
  isMedicalEvent,
  isMedTechOwnedEvent,
  medtechEventUrl,
  mergeEventSources,
  normalizeMedTechPortalEvent,
} from '../assets/medical-events.js'

test('event pictures resolve against the published feed and retain organizer fallback', () => {
  assert.equal(eventImageUrl({ imageUrl: '/event_images/meetup.webp' }), 'https://codecollective.us/event_images/meetup.webp')
  assert.equal(eventImageUrl({ imageUrl: 'https://images.example/event.jpg' }), 'https://images.example/event.jpg')
  assert.equal(eventImageUrl({ imageUrl: '', orgImageUrl: '/images/organizer.png' }), 'https://codecollective.us/images/organizer.png')
  assert.equal(eventImageUrl({ imageUrl: 'javascript:alert(1)', orgImageUrl: 'data:text/html,unsafe' }), null)
  assert.equal(eventImageUrl({}), null)
})

test('portal-owned MedTech events normalize into the general calendar feed', () => {
  const portalEvent = {
    id: 'event-1',
    title: 'MedTech Formational Event',
    slug: 'medtech-formational-event',
    description: 'Meet the community.',
    starts_at: '2026-09-29T22:00:00.000Z',
    ends_at: '2026-09-30T00:30:00.000Z',
    location: 'Checkerspot Brewing, 1421 Ridgely St, Baltimore, MD 21230',
    image_url: 'https://images.example/event.png',
    host_org_id: 'org-baltimore-medtech',
    host_org_name: 'Baltimore MedTech',
    tags: ['health'],
  }
  const normalized = normalizeMedTechPortalEvent(portalEvent)
  assert.equal(normalized.name, 'MedTech Formational Event')
  assert.equal(normalized.startDate, '2026-09-29T22:00:00.000Z')
  assert.equal(normalized.url, 'https://medtech.social/p/events/medtech-formational-event')
  assert.equal(normalized.location.name, 'Checkerspot Brewing, 1421 Ridgely St, Baltimore, MD 21230')
  assert.equal(normalized.medtechOwned, true)
  assert.equal(isMedTechOwnedEvent(normalized), true)
  assert.equal(isMedicalEvent(normalized), true)
})

test('event merging prefers MedTech-owned portal records and deduplicates by URL', () => {
  const medtech = { name: 'MedTech Formational Event', startDate: '2026-09-29T22:00:00.000Z', url: 'https://medtech.social/p/events/medtech-formational-event', medtechOwned: true }
  const duplicate = { name: 'MedTech Formational Event', startDate: '2026-09-29T22:00:00.000Z', url: 'https://medtech.social/p/events/medtech-formational-event' }
  const regional = { name: 'Clinical AI meetup', startDate: '2026-09-30T22:00:00.000Z', url: 'https://events.example/clinical-ai' }
  assert.deepEqual(mergeEventSources([medtech], [duplicate, regional]), [medtech, regional])
})

test('MedTech event URLs stay on the MedTech community portal profile', () => {
  assert.equal(
    medtechEventUrl({ public_url: 'https://codecollective.us/p/events/example-event' }),
    'https://medtech.social/p/events/example-event',
  )
})
