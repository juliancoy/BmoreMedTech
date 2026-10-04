import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker.js'

test('LifeTech Worker proxies public OrgPortal event feeds through the same origin', async (t) => {
  t.mock.method(globalThis, 'fetch', async (request) => {
    const url = new URL(request.url)
    assert.equal(url.href, 'https://org.example/api/network/orgs/public/baltimore-medtech/events?upcoming_only=true&limit=120')
    assert.equal(request.headers.get('x-forwarded-host'), 'lifetech.fyi')
    return Response.json([{ title: 'LifeTech Formational Event' }], {
      headers: { 'cache-control': 'no-store' },
    })
  })

  const response = await worker.fetch(
    new Request('https://lifetech.fyi/api/org/api/network/orgs/public/baltimore-medtech/events?upcoming_only=true&limit=120'),
    { ORG_API_ORIGIN: 'https://org.example', ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } },
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(await response.json(), [{ title: 'LifeTech Formational Event' }])
})

test('LifeTech Worker proxies the base-domain portal, org API, and PIdP paths', async (t) => {
  const seen = []
  t.mock.method(globalThis, 'fetch', async (request) => {
    seen.push({ url: request.url, method: request.method, headers: request.headers })
    if (request.url === 'https://portal.example/__portal_root/') {
      const headers = new Headers()
      headers.set('content-type', 'text/html')
      headers.append('set-cookie', 'portal_session=fixture; Domain=codecollective.us; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax')
      return new Response('<!doctype html><html><head><title>Code Collective Portal</title><link rel="icon" type="image/png" href="/codecollective_logo.png" /><meta property="og:title" content="Code Collective Portal" /></head><body><div id="root"></div></body></html>', { headers })
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
      : new URL(request.url).pathname === '/assets/theme-fixture.css'
        ? new Response('body{color:#123}', { headers: { 'content-type': 'text/css' } })
      : new URL(request.url).pathname === '/medical-science-field-atlas.json'
        ? Response.json([{ id: 'neurology', name: 'Neurology' }])
        : new Response('not found', { status: 404 }),
  }
  const env = {
    SITE_BRAND: 'lifetech',
    ASSETS: assets,
    ORG_API_ORIGIN: 'https://org.example',
    CHAT_API_ORIGIN: 'https://chat.example',
    PIDP_PROXY_ORIGIN: 'https://pidp.example',
    PORTAL_SITE_ORIGIN: 'https://portal.example',
  }

  const portal = await worker.fetch(new Request('https://lifetech.fyi/events/medtech-formational-event', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(portal.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/')
  assert.equal(seen.at(-1).headers.get('x-forwarded-host'), 'lifetech.fyi')
  assert.deepEqual(portal.headers.getSetCookie(), [
    'portal_session=fixture; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax',
  ])

  const localThemeAsset = await worker.fetch(new Request('https://lifetech.fyi/assets/theme-fixture.css'), env)
  assert.equal(localThemeAsset.status, 200)
  assert.equal(localThemeAsset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal(await localThemeAsset.text(), 'body{color:#123}')
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/')

  const portalAsset = await worker.fetch(new Request('https://lifetech.fyi/assets/index.js'), env)
  assert.equal(portalAsset.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/assets/index.js')

  const portalCss = await worker.fetch(new Request('https://lifetech.fyi/css/master.css'), env)
  assert.equal(portalCss.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/css/master.css')

  const portalIcon = await worker.fetch(new Request('https://lifetech.fyi/codecollective_logo.png'), env)
  assert.equal(portalIcon.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/codecollective_logo.png')

  const rootPortalIcon = await worker.fetch(new Request('https://lifetech.fyi/images/google-g-logo.svg'), env)
  assert.equal(rootPortalIcon.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/images/google-g-logo.svg')

  const rootPortalAsset = await worker.fetch(new Request('https://lifetech.fyi/assets/index.js'), env)
  assert.equal(rootPortalAsset.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/assets/index.js')

  const tenantBranding = await worker.fetch(new Request('https://lifetech.fyi/branding'), env)
  assert.equal(tenantBranding.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/')
  const tenantBrandingHtml = await tenantBranding.text()
  assert.match(tenantBrandingHtml, /<title>Brand Guide \| LifeTech<\/title>/)
  assert.match(tenantBrandingHtml, /property="og:title" content="Brand Guide \| LifeTech"/)
  assert.match(tenantBrandingHtml, /property="og:site_name" content="LifeTech"/)
  assert.doesNotMatch(tenantBrandingHtml, /Code Collective Portal|codecollective_logo\.png/)

  const oldTenantBranding = await worker.fetch(new Request('https://lifetech.fyi/branding.html?from=old'), env)
  assert.equal(oldTenantBranding.status, 301)
  assert.equal(oldTenantBranding.headers.get('location'), 'https://lifetech.fyi/branding?from=old')

  const portalSearch = await worker.fetch(new Request('https://lifetech.fyi/search?q=medtech&scope=people', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(portalSearch.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/?q=medtech&scope=people')

  const portalResources = await worker.fetch(new Request('https://lifetech.fyi/resources', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(portalResources.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/')

  const oldCommunity = await worker.fetch(new Request('https://lifetech.fyi/community', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(oldCommunity.status, 301)
  assert.equal(oldCommunity.headers.get('location'), 'https://lifetech.fyi/')

  const oldMedtechEvents = await worker.fetch(new Request('https://lifetech.fyi/medtech-events?from=old', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(oldMedtechEvents.status, 301)
  assert.equal(oldMedtechEvents.headers.get('location'), 'https://lifetech.fyi/org-events?from=old')

  const orgRegister = await worker.fetch(new Request('https://lifetech.fyi/orgs/register?from=medtech', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(orgRegister.status, 301)
  assert.equal(orgRegister.headers.get('location'), 'https://portal.example/orgs/register?from=medtech')

  const createForProfit = await worker.fetch(new Request('https://lifetech.fyi/create/for-profit', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(createForProfit.status, 301)
  assert.equal(createForProfit.headers.get('location'), 'https://portal.example/create/for-profit')

  const orgDirectory = await worker.fetch(new Request('https://lifetech.fyi/orgs?q=medtech', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(orgDirectory.status, 301)
  assert.equal(orgDirectory.headers.get('location'), 'https://portal.example/orgs?q=medtech')

  const publicOrgProfile = await worker.fetch(new Request('https://lifetech.fyi/orgs/baltimore-medtech', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(publicOrgProfile.status, 301)
  assert.equal(publicOrgProfile.headers.get('location'), 'https://portal.example/orgs/baltimore-medtech')

  const tenantOrgEvents = await worker.fetch(new Request('https://lifetech.fyi/orgs/events', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(tenantOrgEvents.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/')

  const tenantOrgInitiatives = await worker.fetch(new Request('https://lifetech.fyi/orgs/initiatives/new', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(tenantOrgInitiatives.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/')

  const tenantLogin = await worker.fetch(new Request('https://lifetech.fyi/users/login', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(tenantLogin.status, 200)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/')
  assert.equal(tenantLogin.headers.has('location'), false)

  const fetchCountBeforeStaticCalendar = seen.length
  const staticCalendar = await worker.fetch(new Request('https://lifetech.fyi/calendar', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(staticCalendar.status, 200)
  assert.equal(seen.length, fetchCountBeforeStaticCalendar)

  const fetchCountBeforeFieldAtlas = seen.length
  const fieldAtlas = await worker.fetch(new Request('https://lifetech.fyi/medical-science-field-atlas.json'), env)
  assert.equal(fieldAtlas.status, 200)
  assert.deepEqual(await fieldAtlas.json(), [{ id: 'neurology', name: 'Neurology' }])
  assert.equal(seen.length, fetchCountBeforeFieldAtlas)

  const orgPost = await worker.fetch(new Request('https://lifetech.fyi/api/org/api/network/events/event-1/attendance', { method: 'POST', body: '{}' }), env)
  assert.equal(orgPost.status, 200)
  assert.equal(seen.at(-1).url, 'https://org.example/api/network/events/event-1/attendance')
  assert.equal(seen.at(-1).method, 'POST')

  const publicMedia = await worker.fetch(new Request('https://lifetech.fyi/api/network/events/public/event-1/media/media-1'), env)
  assert.equal(publicMedia.status, 200)
  assert.equal(seen.at(-1).url, 'https://org.example/api/network/events/public/event-1/media/media-1')

  const chatList = await worker.fetch(new Request('https://lifetech.fyi/api/chat/api/network/chat/conversations', {
    headers: { authorization: 'Bearer test-token' },
  }), env)
  assert.equal(chatList.status, 200)
  assert.equal(seen.at(-1).url, 'https://chat.example/api/network/chat/conversations')
  assert.equal(seen.at(-1).headers.get('authorization'), 'Bearer test-token')

  const mcp = await worker.fetch(new Request('https://lifetech.fyi/.well-known/oauth-protected-resource/api/org/mcp'), env)
  assert.equal(mcp.status, 200)
  assert.equal(seen.at(-1).url, 'https://org.example/.well-known/oauth-protected-resource/api/org/mcp')

  const login = await worker.fetch(new Request('https://lifetech.fyi/pidp/auth/session/login', { method: 'POST', body: 'fixture' }), env)
  assert.equal(login.status, 200)
  assert.equal(seen.at(-1).url, 'https://pidp.example/auth/session/login')
  assert.deepEqual(login.headers.getSetCookie(), [
    'pidp_session=fixture; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax',
  ])
})

test('LifeTech availability polls use the existing tenant portal mount', async (t) => {
 t.mock.method(globalThis,'fetch',async request=>{
  assert.equal(new URL(request.url).pathname,'/__portal_root/')
  assert.equal(request.headers.get('x-forwarded-host'),'lifetech.fyi')
  return new Response('portal',{headers:{'content-type':'text/html'}})
 })
 for(const path of ['/onboarding','/availability','/availability/poll-123','/admin','/admin/nametags']){
  const response=await worker.fetch(new Request(`https://lifetech.fyi${path}`),{PORTAL_SITE_ORIGIN:'https://portal.example',ASSETS:{fetch:async()=>new Response('missing',{status:404})}})
  assert.equal(response.status,200);assert.equal(await response.text(),'portal')
 }
})

test('LifeTech mounts shared governance pages and preserves authenticated API requests', async (t) => {
  const seen = []
  t.mock.method(globalThis, 'fetch', async (request) => {
    seen.push(request)
    return new Response('shared governance', { headers: { 'content-type': 'text/html' } })
  })
  const env = {
    PORTAL_SITE_ORIGIN: 'https://portal.example',
    ORG_API_ORIGIN: 'https://org.example',
    ASSETS: { fetch: async () => { throw new Error('Governance must not fall back to static assets') } },
  }
  for (const path of ['/governance', '/governance/roberts', '/governance/roberts/propose', '/governance/roberts/mot-123', '/governance/roberts/mot-123/amend']) {
    const response = await worker.fetch(new Request(`https://lifetech.fyi${path}`), env)
    assert.equal(response.status, 200)
    assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/')
    assert.equal(seen.at(-1).headers.get('x-forwarded-host'), 'lifetech.fyi')
  }
  for (const path of ['/api/governance/motions/mot-123/vote', '/api/org/api/governance/motions/mot-123/vote']) {
    await worker.fetch(new Request(`https://lifetech.fyi${path}`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ choice: 'yea' }),
    }), env)
    const upstream = seen.at(-1)
    assert.equal(upstream.url, 'https://org.example/api/governance/motions/mot-123/vote')
    assert.equal(upstream.method, 'POST')
    assert.equal(upstream.headers.get('authorization'), 'Bearer test-token')
    assert.equal(upstream.headers.get('x-forwarded-host'), 'lifetech.fyi')
    assert.deepEqual(await upstream.json(), { choice: 'yea' })
  }
})
