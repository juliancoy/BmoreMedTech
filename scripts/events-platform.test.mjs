import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyEventPlan, createEventsPlatform, registerEventsProvider, validateEventPlan } from './events-platform.mjs'
import { LumaEventsProvider } from './luma-events-provider.mjs'

test('event plans are provider-neutral and dry-run by default', async () => {
  const plan = validateEventPlan({
    schemaVersion: 1,
    provider: 'test',
    eventId: 'evt-123',
    update: { name: 'Example' },
    hosts: [{ email: 'host@example.com' }],
  })
  const result = await applyEventPlan({}, plan)
  assert.equal(result.executed, false)
  assert.deepEqual(result.operations.map(({ action }) => action), ['updateEvent', 'addHost'])
})

test('providers can be registered without coupling plans to Luma', () => {
  const adapter = { updateEvent() {} }
  registerEventsProvider('fixture', () => adapter)
  assert.equal(createEventsPlatform('fixture'), adapter)
})

test('Luma adapter sends current event and host payloads', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) })
    return new Response('{}', { status: 200 })
  }
  const luma = new LumaEventsProvider({ apiKey: 'test-key', fetchImpl })
  await luma.updateEvent('evt-123', { startAt: '2026-09-29T22:00:00.000Z' })
  await luma.addHost('evt-123', { email: 'host@example.com', name: 'Example Host' })

  assert.equal(calls[0].url, 'https://public-api.luma.com/v1/events/update')
  assert.deepEqual(calls[0].body, { event_id: 'evt-123', start_at: '2026-09-29T22:00:00.000Z' })
  assert.equal(calls[0].options.headers['x-luma-api-key'], 'test-key')
  assert.equal(calls[1].url, 'https://public-api.luma.com/v1/events/hosts/add')
  assert.deepEqual(calls[1].body, {
    event_id: 'evt-123',
    email: 'host@example.com',
    name: 'Example Host',
    access_level: 'manager',
    is_visible: true,
  })
})

test('Luma adapter rejects provider-specific or misspelled plan fields', () => {
  const luma = new LumaEventsProvider({ apiKey: 'test-key', fetchImpl: async () => new Response('{}') })
  assert.throws(() => luma.updateEvent('evt-123', { start_at: '2026-09-29T22:00:00.000Z' }), {
    message: 'Unsupported generic event update field: start_at',
  })
})
