import fallback from './lifetech-branding.json' with { type: 'json' }
import { parseOrganizationThemes, portalThemeColors, isThemeImage } from '../../OrgPortal/shared/organizationThemes.ts'

export const LAYOUT_STORAGE_KEY = 'orgportal.organization-theme.ef646755-9443-4c7b-ba4b-a7a29754f666'
export const modeStorageKey = layout => `lifetech.appearance.${layout}.mode`
export const appearanceFallback = fallback
export function normalizeAppearanceConfig(config) {
 const parsed = parseOrganizationThemes(config?.brandThemes)
 if (!parsed) return fallback
 const themes = parsed.themes.filter(theme => !['harbor', 'midnight', 'botanical'].includes(theme.id))
 if (!themes.length) return fallback
 return { nameBannerUrl:isThemeImage(config.nameBannerUrl)?config.nameBannerUrl:fallback.nameBannerUrl, brandThemes: { defaultTheme: themes.some(theme => theme.id === parsed.defaultTheme) ? parsed.defaultTheme : themes[0].id, themes } }
}
export function resolveAppearance(config, layout, mode, prefersDark = false) {
 const themes = parseOrganizationThemes(config.brandThemes) || fallback.brandThemes
 const theme = themes.themes.find(theme => theme.id === layout) || themes.themes.find(theme => theme.id === themes.defaultTheme)
 const selectedMode = ['light', 'dark', 'system'].includes(mode) ? mode : 'system'
 const resolved = selectedMode === 'system' ? (prefersDark ? 'dark' : 'light') : selectedMode
 return { theme, mode: selectedMode, resolved, colors: portalThemeColors(theme[resolved]) }
}
export function appearanceCss(config) {
 const themes = parseOrganizationThemes(config.brandThemes) || fallback.brandThemes
 return themes.themes.flatMap(theme => ['light', 'dark'].map(mode => {
  const colors = portalThemeColors(theme[mode])
  return `:root:root:root[data-site-brand="lifetech"][data-brand-layout="${theme.id}"][data-theme="${mode}"]{${Object.entries(colors).map(([key,value])=>`--${key}:${value};`).join('')}}`
 })).join('\n') + themes.themes.map(theme=>{
  const root=`:root[data-site-brand="lifetech"][data-brand-layout="${theme.id}"]`
  const image=(selector,url)=>url?`${root} ${selector}{content:url(${JSON.stringify(new URL(url,'https://lifetech.fyi').href)});}`:''
  return image('.brand > img',theme.imagery?.icon)+image('.hero-image',theme.imagery?.background)+image('.signature-wordmark',config.nameBannerUrl)
 }).join('\n') + ':root[data-appearance-pending] body{visibility:hidden}'
}
// Runs before the stylesheet to avoid flashing the old layout or wrong color mode.
export function appearanceBootstrap(config = fallback, resolved = false) {
 const defaultLayout = config.brandThemes.defaultTheme
 return `(()=>{let layout=${JSON.stringify(defaultLayout)},mode='system';try{const saved=localStorage.getItem(${JSON.stringify(LAYOUT_STORAGE_KEY)});if(${JSON.stringify(config.brandThemes.themes.map(t=>t.id))}.includes(saved))layout=saved;mode=localStorage.getItem('lifetech.appearance.'+layout+'.mode')||(layout==='ankhtech'?localStorage.getItem('lifetech.theme'):null)||'system'}catch{}if(!['light','dark','system'].includes(mode))mode='system';const root=document.documentElement;if(${resolved})delete root.dataset.appearancePending;else root.dataset.appearancePending='true';root.dataset.brandLayout=layout;root.dataset.brandIdentity=layout==='postcapitalist-corporate'?'bars':'ankh';if(layout==='postcapitalist-corporate')root.setAttribute('data-signature','');else root.removeAttribute('data-signature');root.dataset.themeMode=mode;root.dataset.theme=mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode})()`
}

// The Worker supplies the same validated public configuration to the bootstrap and app.
export function injectAppearance(html, config) {
 const safeJson=JSON.stringify(config).replaceAll('<','\\u003c').replaceAll('>','\\u003e')
 return html.replace(/<script id="lifetech-appearance-bootstrap">[\s\S]*?<\/script>/,()=>`<script id="lifetech-appearance-bootstrap">${appearanceBootstrap(config,true)}</script><script id="lifetech-appearance-config" type="application/json">${safeJson}</script>`)
  .replace(/<style id="lifetech-appearance-colors">[\s\S]*?<\/style>/,()=>`<style id="lifetech-appearance-colors">${appearanceCss(config)}</style>`)
}
