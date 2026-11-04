import {chromium,expect} from '@playwright/test'
import {readFile,mkdir} from 'node:fs/promises'
import {appearanceFallback,modeStorageKey} from '../lib/lifetech-appearance.js'
const base=process.env.LIFETECH_APPEARANCE_BASE||'http://127.0.0.1:18772'
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Use isolated local UI')
const output=new URL('../artifacts/topbar-review/',import.meta.url)
await mkdir(output,{recursive:true})
const assets=new Map()
for(const theme of appearanceFallback.brandThemes.themes)for(const role of ['icon','avatar','background'])assets.set(theme.imagery[role],`../../OrgPortal/web/public/images/organization-themes/${theme.id}-${role}.webp`)
assets.set(appearanceFallback.nameBannerUrl,'../../OrgPortal/web/public/images/organization-themes/postcapitalist-corporate-namebanner.webp')
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'})
try {
 const context=await browser.newContext({colorScheme:'light',reducedMotion:'reduce',ignoreHTTPSErrors:true})
 const writes=[]
 async function fixtures(context,viewer='guest'){let site={id:'life-fixture',organization_id:'ef646755-9443-4c7b-ba4b-a7a29754f666',slug:'lifetech',name:'LifeTech',tagline:'Health × Medicine × Biotech',home_kind:'main',home_description:'Keep existing homepage copy',features:['directory','events','chat'],feature_config:structuredClone(appearanceFallback)};await context.route('**/*',async route=>{
  const url=route.request().url(),path=new URL(url).pathname
  if(path==='/assets/images/lifetech-social-preview-v2.png')return route.fulfill({contentType:'image/png',body:await readFile(new URL('../assets/images/lifetech-social-preview-v2.png',import.meta.url))})
  if(assets.has(url))return route.fulfill({contentType:'image/webp',body:await readFile(new URL(assets.get(url),import.meta.url))})
  if(!url.startsWith(base))return route.abort()
  if(path.endsWith('/branding'))return route.fulfill({json:{portal:site}})
  if(path.endsWith('/membership'))return route.fulfill({json:{status:'active',role:viewer==='administrator'?'administrator':'member'}})
  if(path.endsWith('/admin/me'))return route.fulfill({json:{is_sysadmin:false}})
  if(path.endsWith('/portal')){
   if(route.request().method()==='PUT'){const body=route.request().postDataJSON();writes.push({viewer,body});if(viewer!=='administrator')return route.fulfill({status:403,json:{}});site={...site,...body,feature_config:{...site.feature_config,brandThemes:body.brandThemes}}}
   return route.fulfill({json:{portal:site}})
  }
  if(path.startsWith('/pidp/'))return route.fulfill(viewer==='guest'?{status:401,json:{}}:{json:path.endsWith('/session-token')?{access_token:'local-synthetic-'+viewer}:{id:'fixture-'+viewer,email:viewer+'@example.invalid',full_name:'Fixture '+viewer}})
  if(path.startsWith('/api/'))return route.fulfill({json:path.includes('/media/carousels/')?{images:[],hidden:[],tags:[]}:path.endsWith('/events')?[{id:'demo',slug:'demo-day',title:'LifeTech Demo Day',starts_at:new Date(Date.now()+604800000).toISOString(),ends_at:new Date(Date.now()+612000000).toISOString(),image_url:'/assets/images/lifetech-social-preview-v2.png',location:'Baltimore, Maryland'}]:[]})
  return route.continue()
 })}
 await fixtures(context)
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)))
 for (const width of [1440,390]) {
  await page.setViewportSize({width,height:1000})
  await page.goto(base+'/')
  const layout=page.getByLabel('Branding layout',{exact:true})
  const settings=page.locator('.nav-group[data-nav-section=settings]')
  await expect(settings).toHaveCount(1)
  await expect(layout).toBeHidden()
  const toggle=page.getByRole('button',{name:'Menu',exact:true})
  if(await toggle.isVisible())await toggle.click()
  await settings.locator('summary').click()
  await expect(layout).toBeVisible()
  await layout.selectOption('ankhtech')
  await page.getByRole('button',{name:'Use dark theme',exact:true}).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
  await page.screenshot({path:new URL(`settings-open-${width}.png`,output).pathname,animations:'disabled'})
  await settings.locator('summary').press('Escape')
  await expect(layout).toBeHidden()
  await settings.locator('summary').click();await expect(layout).toBeVisible()
  await page.locator('#main-content').click({position:{x:5,y:5}})
  await expect(layout).toBeHidden()
  await page.screenshot({path:new URL(`settings-closed-${width}.png`,output).pathname,animations:'disabled'})
  await page.reload();await expect(layout).toBeHidden()
 }
 expect(errors).toEqual([])
 console.log('PASS: Settings is the only theme entry; closed on load/reload; desktop/mobile selection, Escape and outside-click dismissal.')
}finally{await browser.close()}
