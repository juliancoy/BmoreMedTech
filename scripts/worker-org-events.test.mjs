import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker.js'

test('MedTech Worker proxies public OrgPortal event feeds through the same origin', async (t) => {
  t.mock.method(globalThis, 'fetch', async (request) => {
    const url = new URL(request.url)
    assert.equal(url.href, 'https://org.example/api/network/orgs/public/baltimore-medtech/events?upcoming_only=true&limit=120')
    assert.equal(request.headers.get('x-forwarded-host'), 'medtech.social')
    return Response.json([{ title: 'MedTech Formational Event' }], {
      headers: { 'cache-control': 'no-store' },
    })
  })

  const response = await worker.fetch(
    new Request('https://medtech.social/api/org/api/network/orgs/public/baltimore-medtech/events?upcoming_only=true&limit=120'),
    { ORG_API_ORIGIN: 'https://org.example', ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } },
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(await response.json(), [{ title: 'MedTech Formational Event' }])
})

test('MedTech Worker keeps the OrgPortal event proxy read-only and narrow', async () => {
  const env = { ORG_API_ORIGIN: 'https://org.example', ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } }
  const blockedMutation = await worker.fetch(new Request('https://medtech.social/api/org/api/network/orgs/public/baltimore-medtech/events', { method: 'POST' }), env)
  assert.equal(blockedMutation.status, 405)

  const unrelated = await worker.fetch(new Request('https://medtech.social/api/org/api/network/orgs/private'), env)
  assert.equal(unrelated.status, 404)
})
