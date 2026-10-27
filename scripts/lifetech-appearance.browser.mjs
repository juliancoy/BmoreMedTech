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
 await page.goto(base+'/')
 const root=page.locator('html'),layout=page.getByLabel('Branding layout',{exact:true})
 await expect(root).toHaveAttribute('data-appearance-source','portal')
 await expect(root).toHaveAttribute('data-brand-layout','postcapitalist-corporate')
 await expect(root).toHaveAttribute('data-theme','light')
 async function menu(){const toggle=page.getByRole('button',{name:'Menu',exact:true});if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();const about=page.locator('.nav-group[data-nav-section=about]');if(!await about.evaluate(el=>el.open))await about.locator('summary').click();await expect(layout).toBeVisible()}
 await expect(page.locator('nav[aria-label="Primary navigation"]>.nav-group>summary')).toHaveText(['Events & calendar','Research','About Us'])
 await expect(page.locator('.nav-group[data-nav-section=about] a[href="/branding"]')).toHaveText('Branding guide')
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
  await page.locator('.nav-group[data-nav-section=about]').evaluate(el=>el.open=false)
  const toggle=page.getByRole('button',{name:'Menu',exact:true});if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='true')await toggle.click()
  await page.evaluate(()=>document.fonts.ready)
  await page.evaluate(()=>scrollTo(0,0))
  await page.mouse.move(0,0)
  await expect.poll(()=>page.locator('#next-medtech-event img').evaluateAll(images=>images.length>0&&images.every(img=>img.complete&&img.naturalWidth>0))).toBe(true)
  await page.screenshot({path:new URL(`${id}-${mode}-${width}.png`,output).pathname,fullPage:true,animations:'disabled'})
  await page.locator('.site-header').screenshot({path:new URL(`header-${id}-${mode}-${width}.png`,output).pathname,animations:'disabled'})
  await menu()
  await page.locator('.nav-group[data-nav-section=about]>.nav-group-links').screenshot({path:new URL(`about-${id}-${mode}-${width}.png`,output).pathname,animations:'disabled'})
  await page.locator('.nav-group[data-nav-section=about]').evaluate(el=>el.open=false)
  if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='true')await toggle.click()
 }
 expect(errors).toEqual([])
 await context.route('**/assets/images/lifetech-social-preview-v2.png',route=>route.abort())
 await page.reload()
 await expect(page.locator('.hero-event-card')).toContainText('LifeTech Demo Day')
 await expect(page.locator('.hero-event-card')).not.toHaveClass(/has-image/)
 await context.close()
 for(const viewer of ['guest','attendee','volunteer','member','administrator']) {
  const account=await browser.newContext({colorScheme:'light',reducedMotion:'reduce',ignoreHTTPSErrors:true})
  await fixtures(account,viewer)
  await account.addInitScript(()=>localStorage.setItem('orgportal.organizationView.lifetech','organizers'))
  const home=await account.newPage();let membershipRequests=0
  home.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/membership'))membershipRequests++})
  await home.goto(base+'/?view=organizers')
  if(viewer!=='guest')await expect(home.locator('.account-avatar')).toBeVisible()
  await expect(home).toHaveURL(base+'/?view=organizers')
  await expect(home.locator('#hero-title')).toHaveText('Baltimore’s health, medicine & biotech community.')
  await expect(home.locator('.organization-view-indicator,.organization-view-switcher')).toHaveCount(0)
  await expect(home.getByLabel('Organization view',{exact:true})).toHaveCount(0)
  if(viewer!=='guest') {
   await home.locator('.account-menu summary').click()
   await expect(home.getByRole('link',{name:'Organization workspace',exact:true})).toHaveAttribute('href','/orgs/lifetech/dashboard')
  }
  for(const width of [320,768,1024]){
   await home.setViewportSize({width,height:1000})
   const fits=await home.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)
   expect(fits,`${viewer} at ${width}px`).toBe(true)
   await home.locator('.site-header').screenshot({path:new URL(`header-${viewer}-${width}.png`,output).pathname,animations:'disabled'})
  }
  const toggle=home.getByRole('button',{name:'Menu',exact:true});if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click()
  const about=home.locator('.nav-group[data-nav-section=about]');await about.locator('summary').click()
  const permanent=home.getByRole('button',{name:'Make default layout',exact:true})
  if(viewer==='administrator') {
   await expect(permanent).toBeVisible()
   await home.getByLabel('Branding layout',{exact:true}).selectOption('ankhtech')
   expect(writes.length).toBe(0)
   await permanent.click()
   await expect(home.getByText('AnkhTech is now the site default.',{exact:true})).toBeVisible()
   expect(writes.length).toBe(1);expect(writes[0].body.brandThemes.defaultTheme).toBe('ankhtech')
   expect(writes[0].body.home_description).toBe('Keep existing homepage copy')
   expect(writes[0].body.features).toEqual(['directory','events','chat'])
   await account.route('**/portal',route=>route.fulfill({status:403,json:{}}))
   await permanent.click()
   await expect(home.getByText('Unable to read saved branding. Check your admin access.',{exact:true})).toBeVisible()
   expect(writes.length).toBe(1)
  } else {await expect(permanent).toBeHidden();await home.getByLabel('Branding layout',{exact:true}).selectOption('ankhtech');expect(writes.length).toBe(0)}
  await account.close()
 }
 console.log('PASS: both layouts × light/dark × mobile/desktop, independent preferences, reload, imagery, System media changes common navigation, local previews and admin-only permanent defaults')
}finally{await browser.close()}
