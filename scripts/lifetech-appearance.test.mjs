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
 const context={document:{documentElement:{dataset}},localStorage:{getItem:key=>data.get(key)},matchMedia:()=>({matches:false})}
 vm.runInNewContext(appearanceBootstrap(),context)
 assert.deepEqual(dataset,{brandLayout:'ankhtech',themeMode:'dark',theme:'dark'})
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
