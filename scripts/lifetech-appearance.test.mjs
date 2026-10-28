import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { appearanceFallback, normalizeAppearanceConfig, resolveAppearance, appearanceBootstrap, modeStorageKey, LAYOUT_STORAGE_KEY } from '../lib/lifetech-appearance.js'

test('both layouts resolve separate light/dark palettes and System follows the device',()=>{
 for(const id of ['ankhtech','postcapitalist-corporate']) {
  const light=resolveAppearance(appearanceFallback,id,'light',true)
  const dark=resolveAppearance(appearanceFallback,id,'dark',false)
  assert.equal(light.colors.surface,'#F4F5F0');assert.equal(dark.colors.surface,'#061A26')
  assert.notEqual(light.colors.primary,dark.colors.primary)
  assert.equal(resolveAppearance(appearanceFallback,id,'system',false).resolved,'light')
  assert.equal(resolveAppearance(appearanceFallback,id,'system',true).resolved,'dark')
 }
 assert.equal(resolveAppearance(appearanceFallback,'removed','bad').theme.id,'postcapitalist-corporate')
})
test('initial paint reads the selected layout preference and tolerates blocked storage',()=>{
 const data=new Map([[LAYOUT_STORAGE_KEY,'ankhtech'],[modeStorageKey('ankhtech'),'dark'],[modeStorageKey('postcapitalist-corporate'),'light']])
 const dataset={}
 const context={document:{documentElement:{dataset,setAttribute(){},removeAttribute(){}}},localStorage:{getItem:key=>data.get(key)},matchMedia:()=>({matches:false})}
 vm.runInNewContext(appearanceBootstrap(),context)
 assert.deepEqual(dataset,{brandLayout:'ankhtech',brandIdentity:'ankh',appearancePending:'true',themeMode:'dark',theme:'dark'})
 data.set(LAYOUT_STORAGE_KEY,'postcapitalist-corporate');vm.runInNewContext(appearanceBootstrap(),context)
 assert.equal(dataset.theme,'light')
 context.localStorage.getItem=()=>{throw Error('blocked')};context.matchMedia=()=>({matches:true})
 vm.runInNewContext(appearanceBootstrap(),context)
 assert.equal(dataset.brandLayout,'postcapitalist-corporate');assert.equal(dataset.themeMode,'system');assert.equal(dataset.theme,'dark')
})

test('a legacy editor cannot restore retired layouts or replace a valid current default',()=>{
 const old={...appearanceFallback.brandThemes.themes[0],id:'botanical',name:'Botanical'}
 const config=normalizeAppearanceConfig({...appearanceFallback,brandThemes:{defaultTheme:'ankhtech',themes:[old,...appearanceFallback.brandThemes.themes]}})
 assert.equal(config.brandThemes.defaultTheme,'ankhtech')
 assert.deepEqual(config.brandThemes.themes.map(t=>t.id),['postcapitalist-corporate','ankhtech'])
})

test('server config supplies the current default before startup, preserving per-layout modes',async()=>{
 const {injectAppearance}=await import('../lib/lifetech-appearance.js')
 const {renderHomeBranding}=await import('../lib/home-branding.js')
 const config=structuredClone(appearanceFallback);config.brandThemes.defaultTheme='ankhtech'
 const source='<html><head><script id="lifetech-appearance-bootstrap">old()</script><style id="lifetech-appearance-colors">old</style></head><body>LifeTech</body></html>'
 const html=injectAppearance(source,config)
 const dataset={};const root={dataset,setAttribute(){},removeAttribute(){}}
 vm.runInNewContext(html.match(/<script id="lifetech-appearance-bootstrap">([\s\S]*?)<\/script>/)[1],{document:{documentElement:root},localStorage:{getItem:key=>key===modeStorageKey('ankhtech')?'dark':null},matchMedia:()=>({matches:false})})
 assert.equal(dataset.brandLayout,'ankhtech');assert.equal(dataset.theme,'dark');assert.equal(dataset.appearancePending,undefined)
 assert.match(html,/\.brand > img\{content:url/)
 assert.deepEqual(JSON.parse(html.match(/type="application\/json">([\s\S]*?)<\/script>/)[1]),config)
 const original=globalThis.fetch
 try {
  globalThis.fetch=async request=>{assert.equal(request.headers.get('x-forwarded-host'),'lifetech.fyi');return Response.json({portal:{feature_config:{...config,unrelated:'not embedded'}}})}
  const result=await renderHomeBranding(new Response(source,{headers:{'content-type':'text/html'}}),{ORG_API_ORIGIN:'https://org.example'},new URL('https://lifetech.fyi/'))
  const rendered=await result.text();assert.match(rendered,/let layout="ankhtech"/);assert.doesNotMatch(rendered,/not embedded/);assert.equal(result.headers.get('cache-control'),'no-store')
  globalThis.fetch=async()=>{throw Error('offline')}
  const fallback=await renderHomeBranding(new Response(source,{headers:{'content-type':'text/html'}}),{},new URL('https://lifetech.fyi/'))
  assert.equal(await fallback.text(),source)
 }finally{globalThis.fetch=original}
})

test('public branding names and imagery cannot break out of initial HTML',async()=>{
 const {injectAppearance}=await import('../lib/lifetech-appearance.js')
 const config=structuredClone(appearanceFallback);config.brandThemes.themes[0].name='</script><script>alert(1)</script>';config.nameBannerUrl='https://example.com/</style><script>alert(1)</script>'
 const source='<script id="lifetech-appearance-bootstrap"></script><style id="lifetech-appearance-colors"></style>'
 const html=injectAppearance(source,config)
 assert.doesNotMatch(html,/<script>alert/);assert.doesNotMatch(html,/<\/style><script>/)
 assert.match(html,/%3C\/style%3E/)
})
