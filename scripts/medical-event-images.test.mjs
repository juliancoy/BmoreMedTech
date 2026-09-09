import test from 'node:test'
import assert from 'node:assert/strict'
import { eventImageUrl } from '../assets/medical-events.js'

test('event pictures resolve against the published feed and retain organizer fallback', () => {
  assert.equal(eventImageUrl({ imageUrl: '/event_images/meetup.webp' }), 'https://codecollective.us/event_images/meetup.webp')
  assert.equal(eventImageUrl({ imageUrl: 'https://images.example/event.jpg' }), 'https://images.example/event.jpg')
  assert.equal(eventImageUrl({ imageUrl: '', orgImageUrl: '/images/organizer.png' }), 'https://codecollective.us/images/organizer.png')
  assert.equal(eventImageUrl({ imageUrl: 'javascript:alert(1)', orgImageUrl: 'data:text/html,unsafe' }), null)
  assert.equal(eventImageUrl({}), null)
})
