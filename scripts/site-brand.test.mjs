import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderSiteBrand, siteBrand } from '../lib/site-brand.js'

test('MedTech and LifeTech have distinct names, imagery, origins, and preference keys', () => {
  const template = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  for (const id of ['medtech', 'lifetech']) {
    const brand = siteBrand(id)
    const html = renderSiteBrand(template, brand)
    assert.ok(html.includes(`<title>${brand.name}</title>`))
    for (const key of ['origin', 'logo', 'hero', 'social', 'themeKey']) {
      assert.ok(html.includes(brand[key]), `${id}: missing ${key}`)
    }
    const other = siteBrand(id === 'medtech' ? 'lifetech' : 'medtech')
    for (const key of ['origin', 'logo', 'hero', 'social', 'themeKey']) {
      assert.ok(!html.includes(other[key]), `${id}: leaked ${key}`)
    }
    assert.ok(html.includes('href="/users/login"'))
    assert.ok(html.includes('href="/about.html#ways-in"'))
  }
})

test('deployment routes and asset directories keep the sites separate', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  assert.equal(config.vars.SITE_BRAND, 'medtech')
  assert.equal(config.env.lifetech.vars.SITE_BRAND, 'lifetech')
  assert.notEqual(config.name, config.env.lifetech.name)
  assert.notEqual(config.assets.directory, config.env.lifetech.assets.directory)
  assert.deepEqual(config.routes.map(route => route.pattern), [new URL(siteBrand('medtech').origin).hostname])
  assert.deepEqual(config.env.lifetech.routes.map(route => route.pattern), [new URL(siteBrand('lifetech').origin).hostname])
  assert.throws(() => siteBrand('unknown'), /Unknown site brand/)
})

test('medical technology showcase belongs only to MedTech', () => {
  const template = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const medtech = renderSiteBrand(template, siteBrand('medtech'))
  const lifetech = renderSiteBrand(template, siteBrand('lifetech'))
  assert.ok(medtech.includes('Surgical robotics'))
  assert.ok(medtech.includes('Clinical AI &amp; software'))
  assert.ok(!lifetech.includes('technology-section'))
  assert.ok(lifetech.includes('Better care starts with a better-connected city.'))
  assert.ok(!medtech.includes('{{home.'))
  assert.ok(!lifetech.includes('{{home.'))
})

test('MedTech showcase preserves image provenance and local index connections', () => {
  const showcase = JSON.parse(readFileSync(new URL('../lib/medtech-showcase.json', import.meta.url)))
  const organizations = JSON.parse(readFileSync(new URL('../../OrgPortal/web/public/ecosystem-data/ecosystem.json', import.meta.url))).organizations
  const template = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const medtech = renderSiteBrand(template, siteBrand('medtech'))
  const lifetech = renderSiteBrand(template, siteBrand('lifetech'))
  assert.equal(showcase.entries.length, 6)
  for (const entry of showcase.entries) {
    assert.ok(readFileSync(new URL(`..${entry.image}`, import.meta.url)).length > 1000)
    assert.ok(medtech.includes(entry.image))
    assert.ok(medtech.includes(entry.sourceUrl))
    assert.ok(!lifetech.includes(entry.image))
    assert.equal(new URL(entry.sourceImageUrl).protocol, 'https:')
    if (entry.indexOrganizationId) {
      assert.ok(organizations.some(organization => organization.id === entry.indexOrganizationId && organization.directory), `${entry.name}: missing index organization`)
      const directory = readFileSync(new URL('../ecosystem/index.html', import.meta.url), 'utf8')
      assert.ok(directory.includes(`id="${entry.indexOrganizationId}"`), `${entry.name}: missing directory anchor`)
    }
  }
  assert.ok(!lifetech.includes('showcase-section'))
  assert.ok(!lifetech.includes('hero-spotlight'))
  assert.ok(!medtech.includes('{{home.'))
  assert.ok(medtech.includes('CT / CAT scanning'))
  assert.ok(medtech.includes('MRI · Baltimore'))
})

test('Both sites share the Drive carousel and featured community video', () => {
  const template = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const medtech = renderSiteBrand(template, siteBrand('medtech'))
  const lifetech = renderSiteBrand(template, siteBrand('lifetech'))
  assert.ok(medtech.includes('id="community-photos"'))
  assert.ok(medtech.includes('id="drive-carousel"'))
  assert.ok(medtech.includes('https://drive.google.com/drive/folders/1PoJ9KQvInRhJeoY91ODJ-915_eGuPAmb'))
  assert.ok(lifetech.includes('id="drive-carousel"'))
  assert.ok(lifetech.includes('1PoJ9KQvInRhJeoY91ODJ-915_eGuPAmb'))
  for (const html of [medtech, lifetech]) {
    assert.ok(html.includes('/assets/videos/medtech-community.mp4'))
    assert.ok(html.includes('<video controls playsinline'))
  }
})


test('homepages keep MCP instructions in the portal rather than the carousel', () => {
  const template = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  for (const id of ['medtech', 'lifetech']) {
    const html = renderSiteBrand(template, siteBrand(id))
    assert.ok(!html.includes('agent-photo-upload'))
    assert.ok(!html.includes('Copy request for my AI'))
    assert.ok(html.includes('id="drive-carousel"'))
  }
})
