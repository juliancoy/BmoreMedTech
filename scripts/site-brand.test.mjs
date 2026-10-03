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
