import { parseOrganizationThemes } from '../../OrgPortal/shared/organizationThemes.ts'
import { appearanceFallback, appearanceCss, normalizeAppearanceConfig, resolveAppearance, LAYOUT_STORAGE_KEY, modeStorageKey } from '../lib/lifetech-appearance.js'

export function setupLifeTechAppearance({getAccount = () => ({token:null})} = {}) {
 const root = document.documentElement
 if(root.dataset.appearanceReady === 'true')return
 root.dataset.appearanceReady='true'
 let config = appearanceFallback, serverReady=false
 try { const initial=JSON.parse(document.getElementById('lifetech-appearance-config')?.textContent||'null');if(parseOrganizationThemes(initial?.brandThemes)){config=normalizeAppearanceConfig(initial);serverReady=true;root.dataset.appearanceSource='portal'} } catch { /* Use the shipped snapshot if unavailable. */ }
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
 const menu = document.createElement('section')
 menu.className='appearance-control'
 menu.setAttribute('aria-label','Theme settings')
 const summary=document.createElement('p');summary.className='appearance-title';summary.textContent='Theme preview'
 const panel=document.createElement('div');panel.className='appearance-panel'
 container?.before(menu);panel.append(label)
 if(container)panel.append(container)
 const note=document.createElement('p');note.className='appearance-note';note.textContent='Preview for this browser. The site default stays unchanged.'
 const reset=document.createElement('button');reset.type='button';reset.className='appearance-reset';reset.textContent='Use site default'
 const save=document.createElement('button');save.type='button';save.className='appearance-save';save.textContent='Make default layout';save.hidden=true
 const saveStatus=document.createElement('p');saveStatus.className='appearance-note';saveStatus.setAttribute('role','status')
 panel.append(status,note,reset,save,saveStatus);menu.append(summary,panel)
 let canManage=false,permissionSequence=0
 const orgId='ef646755-9443-4c7b-ba4b-a7a29754f666'
 async function checkManagement() {
  const sequence=++permissionSequence,account=getAccount();canManage=false;save.hidden=true;saveStatus.textContent=''
  if(!account.token)return
  const options={headers:{Authorization:`Bearer ${account.token}`},cache:'no-store',signal:AbortSignal.timeout(8000)}
  const [membership,operator]=await Promise.allSettled([
   fetch(`/api/org/api/network/orgs/${orgId}/membership`,options).then(async r=>r.ok?r.json():null),
   fetch('/api/org/api/admin/me',options).then(async r=>r.ok?r.json():null)
  ])
  if(sequence!==permissionSequence||getAccount().token!==account.token)return
  const member=membership.status==='fulfilled'?membership.value:null,admin=operator.status==='fulfilled'?operator.value:null
  canManage=Boolean((member?.status==='active'&&['owner','administrator'].includes(member.role))||admin?.is_sysadmin===true)
  save.hidden=!canManage
 }
 window.addEventListener('site-account-change',()=>void checkManagement())
 void checkManagement()
 reset.addEventListener('click',()=>{try{localStorage.removeItem(LAYOUT_STORAGE_KEY)}catch{};layout=config.brandThemes.defaultTheme;apply()})
 save.addEventListener('click',async()=>{
  const account=getAccount(),selectedLayout=layout;if(!canManage||!account.token)return
  save.disabled=true;saveStatus.textContent='Saving site default…'
  const base=`/api/org/api/network/orgs/${orgId}/portal`,headers={Authorization:`Bearer ${account.token}`,'Content-Type':'application/json'}
  try {
   // Read the latest authorized settings first so content, features and domains survive.
   const response=await fetch(base,{headers,cache:'no-store'});if(!response.ok)throw Error('Unable to read saved branding. Check your admin access.')
   const current=(await response.json()).portal;if(!current)throw Error('Saved branding is unavailable.')
   let features=current.feature_config;if(typeof features==='string')features=JSON.parse(features)
   const themes=parseOrganizationThemes(features?.brandThemes);if(!themes)throw Error('Saved themes are unavailable. Reload and try again.')
   const selected=themes.themes.find(theme=>theme.id===selectedLayout);if(!selected)throw Error('This layout is no longer available. Reload and try again.')
   if(getAccount().token!==account.token)throw Error('Your account changed. Sign in again before saving.')
   const body={...current,brandThemes:{...themes,defaultTheme:selectedLayout},accent_color:selected.light.primary,brand_image_path:selected.imagery?.icon||current.brand_image_path,home_image_url:selected.imagery?.background||current.home_image_url}
   const saved=await fetch(base,{method:'PUT',headers,body:JSON.stringify(body)})
   if(!saved.ok)throw Error(saved.status===403?'Only organization admins can change the site default.':'Could not save the site default. Try again.')
   config={...config,brandThemes:{...config.brandThemes,defaultTheme:selectedLayout}};saveStatus.textContent=`${selected.name} is now the site default.`
  }catch(error){saveStatus.textContent=error.message}finally{save.disabled=false}
 })

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
 if(!serverReady)fetch('/api/org/api/network/orgs/public/lifetech/branding',{cache:'no-store',signal:AbortSignal.timeout(8000)})
  .then(async response=>{if(!response.ok)return;const data=await response.json();const next=data.portal?.feature_config;if(!next)return
   // Validate the whole configuration before it can reach generated CSS or image URLs.
   if(!parseOrganizationThemes(next.brandThemes))return
   config=normalizeAppearanceConfig({brandThemes:next.brandThemes,nameBannerUrl:typeof next.nameBannerUrl==='string'&&/^https:\/\//.test(next.nameBannerUrl)?next.nameBannerUrl:appearanceFallback.nameBannerUrl})
   root.dataset.appearanceSource='portal'
   layout=read(LAYOUT_STORAGE_KEY)||config.brandThemes.defaultTheme;updateOptions();apply()
  }).catch(()=>{/* The shipped snapshot keeps the public site usable offline. */}).finally(()=>{delete root.dataset.appearancePending})
 if(serverReady)delete root.dataset.appearancePending
 window.__bmoreLifeTechTheme={storageKey:modeStorageKey(layout),readThemeMode:readMode,applyThemeMode:mode=>{write(modeStorageKey(layout),mode);return apply(mode)}}
}
