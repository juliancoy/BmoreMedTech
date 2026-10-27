import {chromium,expect} from '@playwright/test'
import {readFile,mkdir} from 'node:fs/promises'
import {appearanceFallback,modeStorageKey} from '../lib/lifetech-appearance.js'
const base=process.env.LIFETECH_APPEARANCE_BASE||'http://127.0.0.1:18772'
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Use isolated local UI')
const output=new URL('../artifacts/appearance/',import.meta.url)
await mkdir(output,{recursive:true})
const assets=new Map()
for(const theme of appearanceFallback.brandThemes.themes)for(const role of ['icon','avatar','background'])assets.set(theme.imagery[role],`../../OrgPortal/web/public/images/organization-themes/${theme.id}-${role}.webp`)
assets.set(appearanceFallback.nameBannerUrl,'../../OrgPortal/web/public/images/organization-themes/postcapitalist-corporate-namebanner.webp')
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'})
try {
 const context=await browser.newContext({colorScheme:'light',ignoreHTTPSErrors:true})
 await context.route('**/*',async route=>{
  const url=route.request().url(),path=new URL(url).pathname
  if(assets.has(url))return route.fulfill({contentType:'image/webp',body:await readFile(new URL(assets.get(url),import.meta.url))})
  if(!url.startsWith(base))return route.abort()
  if(path.endsWith('/branding'))return route.fulfill({json:{portal:{feature_config:appearanceFallback}}})
  if(path.startsWith('/pidp/'))return route.fulfill({status:401,json:{}})
  if(path.startsWith('/api/'))return route.fulfill({json:path.includes('/media/carousels/')?{images:[],hidden:[],tags:[]}:[]})
  return route.continue()
 })
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)))
 await page.goto(base+'/')
 const root=page.locator('html'),layout=page.getByLabel('Branding layout',{exact:true})
 await expect(root).toHaveAttribute('data-appearance-source','portal')
 await expect(root).toHaveAttribute('data-brand-layout','postcapitalist-corporate')
 await expect(root).toHaveAttribute('data-theme','light')
 async function menu(){const toggle=page.getByRole('button',{name:'Menu',exact:true});if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();const appearance=page.locator('.appearance-control');if(!await appearance.getAttribute('open')){if(!await appearance.evaluate(el=>el.open))await appearance.locator('summary').click()}await expect(layout).toBeVisible()}
 await menu();await expect(layout.locator('option')).toHaveText(['Postcapitalist Corporate','AnkhTech'])
 await page.getByRole('button',{name:'Use light theme',exact:true}).click()
 await layout.selectOption('ankhtech');await page.getByRole('button',{name:'Use dark theme',exact:true}).click()
 await layout.selectOption('postcapitalist-corporate');await expect(root).toHaveAttribute('data-theme','light')
 await layout.selectOption('ankhtech');await expect(root).toHaveAttribute('data-theme','dark')
 await page.reload();await expect(root).toHaveAttribute('data-brand-layout','ankhtech');await expect(root).toHaveAttribute('data-theme','dark')
 await menu();await page.getByRole('button',{name:'Use system theme',exact:true}).click()
 await page.emulateMedia({colorScheme:'light'});await expect(root).toHaveAttribute('data-theme','light')
 await page.emulateMedia({colorScheme:'dark'});await expect(root).toHaveAttribute('data-theme','dark')
 await expect(page.getByRole('button',{name:'Use system theme',exact:true})).toHaveAttribute('aria-pressed','true')
 expect(await page.evaluate(key=>localStorage.getItem(key),modeStorageKey('postcapitalist-corporate'))).toBe('light')
 for(const width of [390,1440])for(const id of ['postcapitalist-corporate','ankhtech'])for(const mode of ['light','dark']) {
  await page.setViewportSize({width,height:1000});await menu();await layout.selectOption(id)
  await page.getByRole('button',{name:`Use ${mode} theme`,exact:true}).click()
  await expect(root).toHaveAttribute('data-theme',mode)
  const theme=appearanceFallback.brandThemes.themes.find(t=>t.id===id)
  await expect(page.locator('.hero-image')).toHaveAttribute('src',theme.imagery.background)
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--surface').trim())).toBe(theme[mode].surface)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.locator('.appearance-control').evaluate(el=>el.open=false)
  const toggle=page.getByRole('button',{name:'Menu',exact:true});if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='true')await toggle.click()
  await page.evaluate(()=>document.fonts.ready)
  await page.evaluate(()=>scrollTo(0,0))
  await page.screenshot({path:new URL(`${id}-${mode}-${width}.png`,output).pathname,fullPage:false})
 }
 expect(errors).toEqual([])
 await context.close()
 console.log('PASS: both layouts × light/dark × mobile/desktop, independent preferences, reload, imagery and System media changes')
}finally{await browser.close()}
