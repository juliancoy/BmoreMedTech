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

test('MedTech Worker proxies the base-domain portal, org API, and PIdP paths', async (t) => {
  const seen = []
  t.mock.method(globalThis, 'fetch', async (request) => {
    seen.push({ url: request.url, method: request.method, headers: request.headers })
    if (request.url === 'https://portal.example/p/events/medtech-formational-event') {
      const headers = new Headers()
      headers.append('set-cookie', 'portal_session=fixture; Domain=codecollective.us; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax')
      return new Response('ok', { headers })
    }
    if (request.url === 'https://pidp.example/auth/session/login') {
      const headers = new Headers()
      headers.append('set-cookie', 'pidp_session=fixture; Domain=codecollective.us; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax')
      return new Response('{}', { headers })
    }
    return new Response('ok')
  })
  const assets = {
    fetch: async (request) => ['/index.html', '/calendar'].includes(new URL(request.url).pathname)
      ? new Response('<div id="root"></div>', { headers: { 'content-type': 'text/html' } })
      : new URL(request.url).pathname === '/medical-science-field-atlas.json'
        ? Response.json([{ id: 'neurology', name: 'Neurology' }])
        : new Response('not found', { status: 404 }),
  }
  const env = {
    ASSETS: assets,
    ORG_API_ORIGIN: 'https://org.example',
    PIDP_PROXY_ORIGIN: 'https://pidp.example',
    PORTAL_SITE_ORIGIN: 'https://portal.example',
  }

  const portal = await worker.fetch(new Request('https://medtech.social/events/medtech-formational-event', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(portal.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/p/events/medtech-formational-event')
  assert.equal(seen.at(-1).headers.get('x-forwarded-host'), 'medtech.social')
  assert.deepEqual(portal.headers.getSetCookie(), [
    'portal_session=fixture; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax',
  ])

  const portalAsset = await worker.fetch(new Request('https://medtech.social/p/assets/index.js'), env)
  assert.equal(portalAsset.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/p/assets/index.js')

  const portalCss = await worker.fetch(new Request('https://medtech.social/p/css/master.css'), env)
  assert.equal(portalCss.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/p/css/master.css')

  const portalIcon = await worker.fetch(new Request('https://medtech.social/p/codecollective_logo.png'), env)
  assert.equal(portalIcon.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/p/codecollective_logo.png')

  const oldPortalPath = await worker.fetch(new Request('https://medtech.social/p/users/login?portalProfile=baltimore-medtech', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(oldPortalPath.status, 404)

  const rootPortalIcon = await worker.fetch(new Request('https://medtech.social/images/google-g-logo.svg'), env)
  assert.equal(rootPortalIcon.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/p/images/google-g-logo.svg')

  const tenantBranding = await worker.fetch(new Request('https://medtech.social/branding'), env)
  assert.equal(tenantBranding.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/p/branding')

  const oldTenantBranding = await worker.fetch(new Request('https://medtech.social/branding.html?from=old'), env)
  assert.equal(oldTenantBranding.status, 301)
  assert.equal(oldTenantBranding.headers.get('location'), 'https://medtech.social/branding?from=old')

  const portalSearch = await worker.fetch(new Request('https://medtech.social/search?q=medtech&scope=people', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(portalSearch.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/p/search?q=medtech&scope=people')

  const portalResources = await worker.fetch(new Request('https://medtech.social/resources', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(portalResources.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/p/resources')

  const oldCommunity = await worker.fetch(new Request('https://medtech.social/community', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(oldCommunity.status, 301)
  assert.equal(oldCommunity.headers.get('location'), 'https://medtech.social/')

  const oldMedtechEvents = await worker.fetch(new Request('https://medtech.social/medtech-events?from=old', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(oldMedtechEvents.status, 301)
  assert.equal(oldMedtechEvents.headers.get('location'), 'https://medtech.social/org-events?from=old')

  const orgRegister = await worker.fetch(new Request('https://medtech.social/orgs/register?from=medtech', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(orgRegister.status, 301)
  assert.equal(orgRegister.headers.get('location'), 'https://portal.example/orgs/register?from=medtech')

  const createForProfit = await worker.fetch(new Request('https://medtech.social/create/for-profit', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(createForProfit.status, 301)
  assert.equal(createForProfit.headers.get('location'), 'https://portal.example/create/for-profit')

  const orgDirectory = await worker.fetch(new Request('https://medtech.social/orgs?q=medtech', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(orgDirectory.status, 301)
  assert.equal(orgDirectory.headers.get('location'), 'https://portal.example/orgs?q=medtech')

  const publicOrgProfile = await worker.fetch(new Request('https://medtech.social/orgs/baltimore-medtech', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(publicOrgProfile.status, 301)
  assert.equal(publicOrgProfile.headers.get('location'), 'https://portal.example/orgs/baltimore-medtech')

  const tenantOrgEvents = await worker.fetch(new Request('https://medtech.social/orgs/events', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(tenantOrgEvents.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/p/orgs/events')

  const tenantOrgInitiatives = await worker.fetch(new Request('https://medtech.social/orgs/initiatives/new', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(tenantOrgInitiatives.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/p/orgs/initiatives/new')

  const tenantLogin = await worker.fetch(new Request('https://medtech.social/users/login', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(tenantLogin.status, 302)
  assert.equal(tenantLogin.headers.get('location'), 'https://medtech.social/users/login?portalProfile=baltimore-medtech')

  const fetchCountBeforeStaticCalendar = seen.length
  const staticCalendar = await worker.fetch(new Request('https://medtech.social/calendar', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(staticCalendar.status, 200)
  assert.equal(seen.length, fetchCountBeforeStaticCalendar)

  const fetchCountBeforeFieldAtlas = seen.length
  const fieldAtlas = await worker.fetch(new Request('https://medtech.social/medical-science-field-atlas.json'), env)
  assert.equal(fieldAtlas.status, 200)
  assert.deepEqual(await fieldAtlas.json(), [{ id: 'neurology', name: 'Neurology' }])
  assert.equal(seen.length, fetchCountBeforeFieldAtlas)

  const orgPost = await worker.fetch(new Request('https://medtech.social/api/org/api/network/events/event-1/attendance', { method: 'POST', body: '{}' }), env)
  assert.equal(orgPost.status, 200)
  assert.equal(seen.at(-1).url, 'https://org.example/api/network/events/event-1/attendance')
  assert.equal(seen.at(-1).method, 'POST')

  const publicMedia = await worker.fetch(new Request('https://medtech.social/api/network/events/public/event-1/media/media-1'), env)
  assert.equal(publicMedia.status, 200)
  assert.equal(seen.at(-1).url, 'https://org.example/api/network/events/public/event-1/media/media-1')

  const chatList = await worker.fetch(new Request('https://medtech.social/api/chat/api/network/chat/conversations', {
    headers: { authorization: 'Bearer test-token' },
  }), env)
  assert.equal(chatList.status, 200)
  assert.equal(seen.at(-1).url, 'https://org.example/api/network/chat/conversations')
  assert.equal(seen.at(-1).headers.get('authorization'), 'Bearer test-token')

  const mcp = await worker.fetch(new Request('https://medtech.social/.well-known/oauth-protected-resource/api/org/mcp'), env)
  assert.equal(mcp.status, 200)
  assert.equal(seen.at(-1).url, 'https://org.example/.well-known/oauth-protected-resource/api/org/mcp')

  const login = await worker.fetch(new Request('https://medtech.social/pidp/auth/session/login', { method: 'POST', body: 'fixture' }), env)
  assert.equal(login.status, 200)
  assert.equal(seen.at(-1).url, 'https://pidp.example/auth/session/login')
  assert.deepEqual(login.headers.getSetCookie(), [
    'pidp_session=fixture; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax',
  ])
})
