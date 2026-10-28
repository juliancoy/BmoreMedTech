import {createServer} from 'node:http'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve,extname} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {appearanceFallback,injectAppearance,LAYOUT_STORAGE_KEY,modeStorageKey} from '../lib/lifetech-appearance.js'
const config=structuredClone(appearanceFallback);config.brandThemes.defaultTheme='ankhtech'
const dist=resolve('dist-lifetech'),output=resolve('artifacts/first-paint');await mkdir(output,{recursive:true})
let serverReady=true
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname
 if(path.startsWith('/api/')||path.startsWith('/pidp/')){res.writeHead(path.startsWith('/pidp/')?401:200,{'content-type':'application/json'});return res.end(JSON.stringify(path.endsWith('/branding')?{portal:{feature_config:config}}:path.includes('/media/carousels/')?{images:[],hidden:[],tags:[]}:[]))}
 const file=resolve(dist,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(dist+'/'))throw Error('Invalid path')
 const body=await readFile(file);const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream'
 res.writeHead(200,{'content-type':type});res.end(path==='/'&&serverReady?injectAppearance(body.toString(),config):body)
}catch{res.writeHead(404);res.end()}})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome'})
try{
 for(const layout of ['ankhtech','postcapitalist-corporate'])for(const mode of ['light','dark']){
  const context=await browser.newContext({viewport:{width:390,height:900},colorScheme:mode,reducedMotion:'reduce'})
  await context.addInitScript(({layout,mode,key,modeKey})=>{
   // AnkhTech exercises a first visit with no preview selection; Corporate a saved preview.
   if(layout==='postcapitalist-corporate')localStorage.setItem(key,layout)
   localStorage.setItem(modeKey,mode)
   window.paintFrames=[]
   const sample=()=>{const root=document.documentElement,brand=document.querySelector('.brand');if(brand&&getComputedStyle(brand).visibility==='visible')window.paintFrames.push({layout:root.dataset.brandLayout,mode:root.dataset.theme,ready:root.dataset.appearanceReady,icon:getComputedStyle(brand.querySelector('img')).content,surface:getComputedStyle(root).getPropertyValue('--surface').trim()});requestAnimationFrame(sample)};requestAnimationFrame(sample)
  },{layout,mode,key:LAYOUT_STORAGE_KEY,modeKey:modeStorageKey(layout)})
  const images=new Map();for(const theme of config.brandThemes.themes)for(const role of ['icon','avatar','background'])images.set(theme.imagery[role],resolve(`../OrgPortal/web/public/images/organization-themes/${theme.id}-${role}.webp`))
  images.set(config.nameBannerUrl,resolve('../OrgPortal/web/public/images/organization-themes/postcapitalist-corporate-namebanner.webp'))
  await context.route('**/*',async route=>{const url=route.request().url();if(images.has(url))return route.fulfill({contentType:'image/webp',body:await readFile(images.get(url))});if(!url.startsWith(base))return route.abort();if(/\/assets\/main-.*\.js/.test(url))await new Promise(r=>setTimeout(r,800));return route.continue()})
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)))
  for(let load=0;load<2;load++){
   await page.goto(base+'/');await expect(page.locator('html')).toHaveAttribute('data-appearance-source','portal');await page.waitForTimeout(150)
   const frames=await page.evaluate(()=>window.paintFrames),theme=config.brandThemes.themes.find(t=>t.id===layout)
   expect(frames.length).toBeGreaterThan(0);expect(frames.some(f=>!f.ready)).toBe(true)
   expect(frames.every(f=>f.layout===layout&&f.mode===mode&&f.icon.includes(theme.imagery.icon)&&f.surface===theme[mode].surface)).toBe(true)
  }
  await page.screenshot({path:resolve(output,`${layout}-${mode}.png`),fullPage:false})
  expect(errors).toEqual([]);await context.close()
 }
 // If the server cannot supply branding, hold the fallback until the public lookup settles.
 serverReady=false
 const context=await browser.newContext();await context.route('**/branding',async route=>{await new Promise(r=>setTimeout(r,600));return route.fulfill({json:{portal:{feature_config:config}}})})
 await context.route('https://**/*',route=>route.abort())
 const page=await context.newPage();await page.goto(base+'/');await expect(page.locator('html')).not.toHaveAttribute('data-appearance-pending','true');await expect(page.locator('html')).toHaveAttribute('data-brand-layout','ankhtech');await context.close()
 console.log('PASS: current server default and saved preview; light/dark cold loads and reloads paint only the selected brand before and after delayed application startup; lookup fallback recovers')
}finally{await browser.close();await new Promise(r=>server.close(r))}
