import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { MEDTECH_ORG_EVENTS_SOURCE_URL } from '../assets/medical-events.js'

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH })
try {
  const now = Date.now()
  const ongoing = { title: 'LifeTech ongoing panel', slug: 'ongoing-panel', starts_at: new Date(now - 3600000).toISOString(), ends_at: new Date(now + 3600000).toISOString() }
  for (const scenario of ['ongoing', 'automatic-retry', 'manual-retry', 'empty', 'date-only']) {
    const page = await browser.newPage()
    let attempts = 0
    await page.route('http://lifetech.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.startsWith('/api/')) {
        assert.equal(url.pathname + url.search, MEDTECH_ORG_EVENTS_SOURCE_URL)
        attempts++
        const failure = scenario === 'automatic-retry' && attempts === 1 || scenario === 'manual-retry' && attempts <= 2
        const events = scenario === 'empty' ? [] : scenario === 'date-only' ? [{ title: 'LifeTech today', slug: 'today', event_date: new Date().toLocaleDateString('en-CA') }] : [ongoing]
        return route.fulfill({ status: failure ? 503 : 200, json: failure ? { error: 'unavailable' } : events })
      }
      if (url.pathname === '/') {
        const article = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/<article id="next-medtech-event"[^]*?<\/article>/)[0]
        return route.fulfill({ contentType: 'text/html', body: `<html><body>${article}<script type="module" src="/assets/home.js"></script></body></html>` })
      }
      const file = new URL(`..${url.pathname}`, import.meta.url)
      return route.fulfill({ contentType: 'text/javascript', body: readFileSync(file, 'utf8') })
    })
    await page.goto('http://lifetech.test/')
    const card = page.locator('#next-medtech-event')
    if (scenario === 'manual-retry') {
      await card.getByRole('button', { name: 'Retry' }).waitFor()
      assert.equal(attempts, 2)
      await card.getByRole('button', { name: 'Retry' }).click()
    }
    if (scenario === 'empty') {
      await card.getByText('No upcoming LifeTech events are published yet.', { exact: false }).waitFor()
    } else {
      const title = scenario === 'date-only' ? 'LifeTech today' : ongoing.title
      await card.getByText(title, { exact: true }).waitFor()
      assert.equal(await card.locator('a').getAttribute('href'), `https://lifetech.fyi/events/${scenario === 'date-only' ? 'today' : ongoing.slug}`)
    }
    assert.equal(await card.isVisible(), true)
    assert.equal(attempts, scenario === 'automatic-retry' ? 2 : scenario === 'manual-retry' ? 3 : 1)
    console.log(`${scenario}: passed`)
    await page.close()
  }
} finally {
  await browser.close()
}
