/** Only explicitly marked LifeTech tagline slots consume public portal copy. */
export function injectHomeTagline(html, tagline) {
 if(typeof tagline !== 'string')return html
 const escaped=tagline.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')
 return html.replace(/(<(p|small)\b[^>]*\bdata-portal-tagline(?:="[^"]*")?[^>]*>)[\s\S]*?(<\/\2>)/g,(_match,opening,_tag,closing)=>opening+escaped+closing)
}

export function applyHomeTagline(tagline, root=document) {
 if(typeof tagline !== 'string')return
 for(const element of root.querySelectorAll('[data-portal-tagline]'))element.textContent=tagline
}
