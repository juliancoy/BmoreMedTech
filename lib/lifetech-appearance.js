import fallback from './lifetech-branding.json' with { type: 'json' }
import { parseOrganizationThemes, portalThemeColors } from '../../OrgPortal/shared/organizationThemes.ts'

export const LAYOUT_STORAGE_KEY = 'orgportal.organization-theme.ef646755-9443-4c7b-ba4b-a7a29754f666'
export const modeStorageKey = layout => `lifetech.appearance.${layout}.mode`
export const appearanceFallback = fallback
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
 })).join('\n')
}
// Runs before the stylesheet to avoid flashing the old layout or wrong color mode.
export function appearanceBootstrap(config = fallback) {
 const defaultLayout = config.brandThemes.defaultTheme
 return `(()=>{let layout=${JSON.stringify(defaultLayout)},mode='system';try{const saved=localStorage.getItem(${JSON.stringify(LAYOUT_STORAGE_KEY)});if(${JSON.stringify(config.brandThemes.themes.map(t=>t.id))}.includes(saved))layout=saved;mode=localStorage.getItem('lifetech.appearance.'+layout+'.mode')||(layout==='ankhtech'?localStorage.getItem('lifetech.theme'):null)||'system'}catch{}if(!['light','dark','system'].includes(mode))mode='system';const root=document.documentElement;root.dataset.brandLayout=layout;root.dataset.themeMode=mode;root.dataset.theme=mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode})()`
}
