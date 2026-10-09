import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker.js'

test('LifeTech Worker proxies public OrgPortal event feeds through the same origin', async (t) => {
  t.mock.method(globalThis, 'fetch', async (request) => {
    const url = new URL(request.url)
    assert.equal(url.href, 'https://org.example/api/network/orgs/public/lifetech/events?upcoming_only=true&hosted_only=true&limit=120')
    assert.equal(request.headers.get('x-forwarded-host'), 'lifetech.fyi')
    return Response.json([{ title: 'LifeTech Formational Event' }], {
      headers: { 'cache-control': 'no-store' },
    })
  })

  const response = await worker.fetch(
    new Request('https://lifetech.fyi/api/org/api/network/orgs/public/lifetech/events?upcoming_only=true&hosted_only=true&limit=120'),
    { ORG_API_ORIGIN: 'https://org.example', ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } },
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(await response.json(), [{ title: 'LifeTech Formational Event' }])
})

test('LifeTech Worker proxies the base-domain portal, org API, and PIdP paths', async (t) => {
  const seen = []
  t.mock.method(globalThis, 'fetch', async (request, options) => {
    if (typeof request === 'string') request = new Request(request, options)
    seen.push({ url: request.url, method: request.method, headers: request.headers })
    if (new URL(request.url).pathname.startsWith('/api/network/orgs/public/')) return Response.json({ tenant_id: null, tenant_home_url: null })
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
  assert.equal(seen.some(entry => entry.url === 'https://portal.example/__portal_root/'), true)
  assert.equal(seen.at(-1).headers.get('x-forwarded-host'), 'lifetech.fyi')
  assert.deepEqual(portal.headers.getSetCookie(), [
    'portal_session=fixture; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax',
  ])

  const localThemeAsset = await worker.fetch(new Request('https://lifetech.fyi/assets/theme-fixture.css'), env)
  assert.equal(localThemeAsset.status, 200)
  assert.equal(localThemeAsset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal(await localThemeAsset.text(), 'body{color:#123}')
  assert.equal(seen.some(entry => entry.url === 'https://portal.example/__portal_root/'), true)

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
  assert.match(tenantBrandingHtml, /property="og:image" content="https:\/\/lifetech.fyi\/assets\/images\/lifetech-social-preview-v2.png"/)
  assert.match(tenantBrandingHtml, /name="twitter:card" content="summary_large_image"/)
  assert.match(tenantBrandingHtml, /property="og:image:width" content="1733"/)
  assert.match(tenantBrandingHtml, /property="og:image:height" content="907"/)

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
  assert.equal(orgRegister.status, 200)
  assert.equal(orgRegister.headers.has('location'), false)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/?from=medtech')
  assert.equal(seen.at(-1).headers.get('x-forwarded-host'), 'lifetech.fyi')

  const createForProfit = await worker.fetch(new Request('https://lifetech.fyi/create/for-profit', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(createForProfit.status, 200)
  assert.equal(createForProfit.headers.has('location'), false)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/')
  assert.equal(seen.at(-1).headers.get('x-forwarded-host'), 'lifetech.fyi')

  const orgDirectory = await worker.fetch(new Request('https://lifetech.fyi/orgs?q=medtech', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(orgDirectory.status, 200)
  assert.equal(orgDirectory.headers.has('location'), false)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/?q=medtech')
  assert.equal(seen.at(-1).headers.get('x-forwarded-host'), 'lifetech.fyi')

  const publicOrgProfile = await worker.fetch(new Request('https://lifetech.fyi/orgs/baltimore-medtech', {
    headers: { accept: 'text/html' },
  }), env)
  assert.equal(publicOrgProfile.status, 200)
  assert.equal(publicOrgProfile.headers.has('location'), false)
  assert.equal(seen.at(-1).url, 'https://portal.example/__portal_root/')
  assert.equal(seen.at(-1).headers.get('x-forwarded-host'), 'lifetech.fyi')

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
  if(typeof request==='string' && request.includes('/api/network/orgs/public/')) return Response.json({slug:'lifetech'})
  assert.equal(new URL(request.url).pathname,'/__portal_root/')
  assert.equal(request.headers.get('x-forwarded-host'),'lifetech.fyi')
  return new Response('portal',{headers:{'content-type':'text/html'}})
 })
 for(const path of ['/onboarding','/availability','/availability/poll-123','/admin','/admin/nametags','/orgs/lifetech','/settings/notifications']){
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


test('organization pages stay on each tenant and keep authenticated requests intact', async (t) => {
  const seen = []
  t.mock.method(globalThis, 'fetch', async (request, options) => {
    if (typeof request === 'string') request = new Request(request, options)
    seen.push(request)
    if (new URL(request.url).pathname.startsWith('/api/network/orgs/public/')) return Response.json({ tenant_id: null, tenant_home_url: null })
    return new Response('<div id="root"></div>', { headers: { 'content-type': 'text/html' } })
  })
  const env = { ORG_API_ORIGIN: 'https://org.example', PORTAL_SITE_ORIGIN: 'https://portal.example', ASSETS: { fetch: async () => { throw new Error('Organization pages belong in OrgPortal') } } }
  for (const host of ['lifetech.fyi', 'medtech.social']) {
    for (const path of ['/orgs/tedco', '/orgs/amplify-medtech', '/orgs/profile', '/orgs/register', '/create/non-profit']) {
      const response = await worker.fetch(new Request(`https://${host}${path}`, { headers: { cookie: 'session=fixture', authorization: 'Bearer fixture', accept: 'text/html' } }), env)
      assert.equal(response.status, 200)
      assert.equal(response.headers.has('location'), false)
      assert.equal(seen.at(-1).headers.get('x-forwarded-host'), host)
      assert.equal(seen.at(-1).headers.get('authorization'), 'Bearer fixture')
      assert.equal(seen.at(-1).headers.get('cookie'), 'session=fixture')
    }
  }
})

test('PIdP avatar cache headers survive the tenant proxy while session responses remain uncached', async t => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async request => {
    const headers = new Headers({ 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable', etag: '"avatar-v1"' })
    if (request.url.includes('/session')) headers.append('set-cookie', 'session=fixture; Domain=id.example; Secure; HttpOnly')
    const conditional = request.headers.has('if-none-match')
    return new Response(conditional ? null : 'avatar-bytes', { status: conditional ? 304 : 200, headers })
  }
  t.after(() => { globalThis.fetch = originalFetch })
  const env = { SITE_BRAND: 'lifetech', PIDP_PROXY_ORIGIN: 'https://id.example' }
  const image = await worker.fetch(new Request('https://lifetech.fyi/pidp/avatars/member/photo.jpg'), env)
  assert.equal(image.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal(image.headers.get('etag'), '"avatar-v1"')
  const conditional = await worker.fetch(new Request('https://lifetech.fyi/pidp/avatars/member/photo.jpg', { headers: { 'if-none-match': '"avatar-v1"' } }), env)
  assert.equal(conditional.status, 304)
  assert.equal(conditional.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  const session = await worker.fetch(new Request('https://lifetech.fyi/pidp/auth/session'), env)
  assert.equal(session.headers.get('cache-control'), 'no-store')
  assert.match(session.headers.get('set-cookie'), /session=fixture/)
  const withCookie = await worker.fetch(new Request('https://lifetech.fyi/pidp/avatars/member/session.jpg'), env)
  assert.equal(withCookie.headers.get('cache-control'), 'no-store')
})

test('LifeTech preserves the upstream chat WebSocket and its authentication protocol', async t => {
  const socket = { fixture: 'accepted-chat-socket' }
  const upstream = { status: 101, webSocket: socket, headers: new Headers({ 'sec-websocket-protocol': 'pidp.local-fixture' }) }
  t.mock.method(globalThis, 'fetch', async request => {
    assert.equal(request.url, 'https://chat.example/api/network/chat/conversations/local-room/socket')
    assert.equal(request.headers.get('upgrade'), 'websocket')
    assert.equal(request.headers.get('sec-websocket-protocol'), 'pidp.local-fixture')
    assert.equal(request.headers.get('x-forwarded-host'), 'lifetech.fyi')
    return upstream
  })
  const result = await worker.fetch(new Request('https://lifetech.fyi/api/chat/api/network/chat/conversations/local-room/socket', {
    headers: { upgrade: 'websocket', 'sec-websocket-protocol': 'pidp.local-fixture' },
  }), { CHAT_API_ORIGIN: 'https://chat.example' })
  assert.equal(result, upstream)
  assert.equal(result.webSocket, socket)
})


test('LifeTech slug homepage redirects signed-in and public navigation to the domain root', async () => {
  const env = { SITE_BRAND: 'lifetech', ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } };
  for (const cookie of ['', 'pidp_session=fixture']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await worker.fetch(new Request('https://lifetech.fyi/portals/lifetech/?source=logo', { method, headers: { cookie } }), env);
      assert.equal(response.status, 301);
      assert.equal(response.headers.get('location'), 'https://lifetech.fyi/?source=logo');
    }
  }
  const post = await worker.fetch(new Request('https://lifetech.fyi/portals/lifetech', { method: 'POST' }), env);
  assert.equal(post.status, 405);
});


test('ecosystem event navigation reaches the shared portal and its data stays available', async (t) => {
  const seen = []
  t.mock.method(globalThis, 'fetch', async (request, options) => {
    const target = typeof request === 'string' ? new Request(request, options) : request
    seen.push(target.url)
    return target.url.includes('/ecosystem-data/')
      ? Response.json({ organizations: [] })
      : new Response('<html><head></head><body>Portal</body></html>', { headers: { 'content-type': 'text/html' } })
  })
  const env = { SITE_BRAND: 'lifetech', PORTAL_SITE_ORIGIN: 'https://portal.example', ASSETS: { fetch: async () => new Response('missing', { status: 404 }) } }
  const navigation = await worker.fetch(new Request('https://lifetech.fyi/ecosystem/network/events?org=example', { headers: { accept: 'text/html' } }), env)
  assert.equal(navigation.status, 200)
  assert.equal(seen.at(-1), 'https://portal.example/__portal_root/?org=example')
  const data = await worker.fetch(new Request('https://lifetech.fyi/ecosystem-data/ecosystem-portal.json'), env)
  assert.equal(data.status, 200)
  assert.deepEqual(await data.json(), { organizations: [] })
  assert.equal(seen.at(-1), 'https://portal.example/__portal_root/ecosystem-data/ecosystem-portal.json')
})


test('LifeTech event pages retain external listing social previews', async t => {
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const request = typeof input === 'string' ? new Request(input, options) : input
    const url = new URL(request.url)
    if (url.pathname === '/api/network/events/public/imported') {
      assert.equal(request.headers.get('x-forwarded-host'), 'lifetech.fyi')
      return Response.json({ title: 'Imported event', source_url: 'https://eventbrite.com/event',
        links: [{ url: 'https://eventbrite.com/event', title: 'Original event title', description: 'Original description', image_url: 'https://eventbrite.com/image.jpg?original=1' }] })
    }
    return new Response('<html><head><title>Portal</title></head><body></body></html>', { headers: { 'content-type': 'text/html' } })
  })
  const response = await worker.fetch(new Request('https://lifetech.fyi/events/imported', { headers: { accept: 'text/html' } }), {
    SITE_BRAND: 'lifetech', ORG_API_ORIGIN: 'https://org.example', PORTAL_SITE_ORIGIN: 'https://portal.example',
    ASSETS: { fetch: async () => new Response('not found', { status: 404 }) },
  })
  const html = await response.text()
  assert.match(html, /property="og:title" content="Imported event on lifetech.fyi"/)
  assert.match(html, /property="og:description" content="Original description"/)
  assert.match(html, /property="og:image" content="https:\/\/eventbrite.com\/image.jpg\?original=1"/)
  assert.match(html, /name="twitter:card" content="summary_large_image"/)
})

test('LifeTech event API imports the Eventbrite social preview image', async t => {
  t.mock.method(globalThis, 'fetch', async request => {
    const url = typeof request === 'string' ? request : request.url
    if (url === 'https://org.example/api/network/events/public/pitch') return Response.json({ title: 'Pitch', source_url: 'https://www.eventbrite.com/e/pitch-123', social_image_url: null })
    if (url === 'https://www.eventbrite.com/e/pitch-123') return new Response('<meta property="og:image" content="https://img.evbuc.com/pitch.jpg">', { headers: { 'content-type': 'text/html' } })
    throw new Error(`Unexpected fetch ${url}`)
  })
  const response = await worker.fetch(new Request('https://lifetech.fyi/api/org/api/network/events/public/pitch'), { ORG_API_ORIGIN: 'https://org.example' })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).social_image_url, 'https://img.evbuc.com/pitch.jpg')
})

test('LifeTech cards use the event name and a direct raster image instead of registration labels', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    if (url.pathname.startsWith('/api/network/events/public/')) return Response.json({
      title: 'MedTech Startup Pitch Competition',
      links: [{url: 'https://www.eventbrite.com/e/tickets', title: 'Register on Eventbrite',
        image_url: 'https://www.eventbrite.com/e/_next/image?url=https%3A%2F%2Fimg.evbuc.com%2Fposter.jpg&w=940'}],
    })
    return new Response('<html><head></head><body></body></html>', {headers: {'content-type': 'text/html'}})
  })
  const response = await worker.fetch(new Request('https://lifetech.fyi/events/pitch'), {
    SITE_BRAND: 'lifetech', ORG_API_ORIGIN: 'https://org.example', PORTAL_SITE_ORIGIN: 'https://portal.example',
    ASSETS: {fetch: async () => new Response('missing', {status: 404})},
  })
  const html = await response.text()
  assert.match(html, /property="og:title" content="MedTech Startup Pitch Competition on lifetech.fyi"/)
  assert.match(html, /property="og:image" content="https:\/\/img.evbuc.com\/poster.jpg"/)
  assert.doesNotMatch(html, /Register on Eventbrite|_next\/image/)
})

test('pitch competition serves the original raster poster and keeps the browser event title', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    if (url.pathname.startsWith('/api/network/events/public/')) return Response.json({title:'MedTech Startup Pitch Competition',links:[{url:'https://www.eventbrite.com/e/tickets',title:'Register on Eventbrite'}]})
    return new Response('<html><head></head><body></body></html>',{headers:{'content-type':'text/html'}})
  })
  const env={SITE_BRAND:'lifetech',ORG_API_ORIGIN:'https://org.example',PORTAL_SITE_ORIGIN:'https://portal.example',ASSETS:{fetch:async()=>new Response('missing',{status:404})}}
  const page=await worker.fetch(new Request('https://lifetech.fyi/events/medtech-startup-pitch-competition-eventbri'),env)
  const html=await page.text()
  assert.match(html,/og:image" content="https:\/\/lifetech.fyi\/event-preview\/medtech-pitch-competition-20261008.jpg/)
  assert.match(html,/og:image:width" content="940/)
  assert.match(html,/public-event-title-row h1/)
  const poster=await worker.fetch(new Request('https://lifetech.fyi/event-preview/medtech-pitch-competition-20261008.jpg'),env)
  assert.equal(poster.status,200)
  assert.equal(poster.headers.get('content-type'),'image/jpeg')
  assert.deepEqual([...new Uint8Array(await poster.arrayBuffer()).slice(0,3)],[255,216,255])
  const head=await worker.fetch(new Request('https://lifetech.fyi/event-preview/medtech-pitch-competition-20261008.jpg',{method:'HEAD'}),env)
  assert.equal((await head.arrayBuffer()).byteLength,0)
})
