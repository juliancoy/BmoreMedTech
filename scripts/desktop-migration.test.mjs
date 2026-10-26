import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { chromium } from '@playwright/test'

test('only legacy desktop users see the optional replacement; dismissal persists and no uninstall runs', async () => {
  const source = await readFile(new URL('../assets/desktop-migration.js', import.meta.url), 'utf8')
  const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><body><h1>LifeTech</h1></body></html>') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.addScriptTag({ type: 'module', content: source })
    assert.equal(await page.locator('#desktop-migration').count(), 0)
    await page.evaluate(() => { document.documentElement.dataset.desktop = 'true' })
    await page.locator('#desktop-migration').waitFor()
    assert.match(await page.locator('#desktop-migration').textContent(), /same LifeTech view/)
    assert.match(await page.locator('#desktop-migration a').getAttribute('href'), /^https:\/\/github.com\/juliancoy\/OrgPortal\/releases\//)
    await page.getByRole('button', { name: 'Keep using LifeTech for now' }).click()
    await page.reload()
    await page.evaluate(() => { document.documentElement.dataset.desktop = 'true' })
    await page.addScriptTag({ type: 'module', content: source })
    assert.equal(await page.locator('#desktop-migration').count(), 0)
    await page.evaluate(() => { localStorage.clear(); document.documentElement.dataset.desktopApp = 'orgportal' })
    await page.addScriptTag({ type: 'module', content: source })
    assert.equal(await page.locator('#desktop-migration').count(), 0)
    await page.evaluate(() => { document.documentElement.dataset.desktopApp = ''; Object.defineProperty(window, 'localStorage', { get() { throw Error('Storage blocked') } }) })
    await page.addScriptTag({ type: 'module', content: source })
    await page.locator('#desktop-migration').waitFor()
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})
