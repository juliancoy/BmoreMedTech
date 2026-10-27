import { parseOrganizationThemes } from '../../OrgPortal/shared/organizationThemes.ts'
import { appearanceFallback, appearanceCss, normalizeAppearanceConfig, resolveAppearance, LAYOUT_STORAGE_KEY, modeStorageKey } from '../lib/lifetech-appearance.js'

export function setupLifeTechAppearance() {
 const root = document.documentElement
 if(root.dataset.appearanceReady === 'true')return
 root.dataset.appearanceReady='true'
 let config = appearanceFallback
 let layout = root.dataset.brandLayout || config.brandThemes.defaultTheme
 const media = window.matchMedia('(prefers-color-scheme: dark)')
 const read = key => { try { return localStorage.getItem(key) } catch { return null } }
 const write = (key,value) => { try { localStorage.setItem(key,value) } catch { /* Apply without storage. */ } }
 const readMode = () => read(modeStorageKey(layout)) || (layout === 'ankhtech' ? read('lifetech.theme') : null) || 'system'
 const controls = [...document.querySelectorAll('.theme-option[data-theme-mode]')]
 const container = document.querySelector('.theme-control')
 const label = document.createElement('label')
 label.className = 'branding-layout-control'
 label.append('Branding layout ')
 const select = document.createElement('select')
 select.setAttribute('aria-label','Branding layout')
 label.append(select)
 container?.setAttribute('aria-label','Color mode for selected branding layout')
 let style = document.getElementById('lifetech-appearance-colors')
 if (!style) { style = document.createElement('style'); style.id='lifetech-appearance-colors'; document.head.append(style) }
 const status = document.createElement('span')
 status.className = 'appearance-status'
 status.setAttribute('role','status')
 const menu = document.createElement('details')
 menu.className='appearance-control'
 const summary=document.createElement('summary');summary.textContent='Appearance'
 const panel=document.createElement('div');panel.className='appearance-panel'
 container?.before(menu);panel.append(label)
 if(container)panel.append(container)
 panel.append(status);menu.append(summary,panel)
 document.addEventListener('click',event=>{if(!menu.contains(event.target))menu.open=false})
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.open=false;summary.focus()}})
 function updateOptions() {
  select.replaceChildren(...config.brandThemes.themes.map(theme => {
   const option = document.createElement('option');option.value=theme.id;option.textContent=theme.name;return option
  }))
 }
 function apply(mode = readMode()) {
  const state = resolveAppearance(config,layout,mode,media.matches)
  layout = state.theme.id
  root.dataset.brandLayout = layout
  root.dataset.themeMode = state.mode
  root.dataset.theme = state.resolved
  // Preserve the earlier Signature presentation as part of the Corporate layout.
  root.toggleAttribute('data-signature',layout === 'postcapitalist-corporate')
  style.textContent = appearanceCss(config)
  select.value = layout
  controls.forEach(control => control.setAttribute('aria-pressed',String(control.dataset.themeMode === state.mode)))
  status.textContent = `${state.theme.name} · ${state.resolved === 'light' ? 'Light' : 'Dark'}${state.mode === 'system' ? ' (System)' : ''}`
  const setImage = (selector,url) => { if(url)document.querySelectorAll(selector).forEach(image=>{if(image.getAttribute('src')!==url){image.removeAttribute('data-full-src');image.src=url}}) }
  const corporate = layout === 'postcapitalist-corporate'
  setImage('.brand > img',state.theme.imagery?.icon)
  setImage('.hero-image',state.theme.imagery?.background)
  setImage('.signature-wordmark',config.nameBannerUrl)
  const icon = document.querySelector('link[rel="icon"]')
  if(icon && state.theme.imagery?.icon){icon.href=state.theme.imagery.icon;icon.removeAttribute('type')}
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',state.theme[state.resolved].surface)
  root.dataset.brandIdentity = corporate ? 'bars' : 'ankh'
  return state
 }
 updateOptions();apply()
 select.addEventListener('change',()=>{layout=select.value;write(LAYOUT_STORAGE_KEY,layout);apply()})
 controls.forEach(control=>control.addEventListener('click',()=>{write(modeStorageKey(layout),control.dataset.themeMode);apply()}))
 media.addEventListener('change',()=>{if(readMode()==='system')apply()})
 window.addEventListener('storage',event=>{
  if(event.key===LAYOUT_STORAGE_KEY){layout=read(LAYOUT_STORAGE_KEY)||config.brandThemes.defaultTheme;apply()}
  else if(event.key===modeStorageKey(layout))apply()
 })
 // The public projection contains only approved organization presentation settings.
 fetch('/api/org/api/network/orgs/public/lifetech/branding',{cache:'no-store',signal:AbortSignal.timeout(8000)})
  .then(async response=>{if(!response.ok)return;const data=await response.json();const next=data.portal?.feature_config;if(!next)return
   // Validate the whole configuration before it can reach generated CSS or image URLs.
   if(!parseOrganizationThemes(next.brandThemes))return
   config=normalizeAppearanceConfig({brandThemes:next.brandThemes,nameBannerUrl:typeof next.nameBannerUrl==='string'&&/^https:\/\//.test(next.nameBannerUrl)?next.nameBannerUrl:appearanceFallback.nameBannerUrl})
   root.dataset.appearanceSource='portal'
   layout=read(LAYOUT_STORAGE_KEY)||config.brandThemes.defaultTheme;updateOptions();apply()
  }).catch(()=>{/* The shipped snapshot keeps the public site usable offline. */})
 window.__bmoreLifeTechTheme={storageKey:modeStorageKey(layout),readThemeMode:readMode,applyThemeMode:mode=>{write(modeStorageKey(layout),mode);return apply(mode)}}
}
