import {injectHomeTagline} from './home-tagline.js'
import {normalizeAppearanceConfig,injectAppearance,appearanceFallback} from './lifetech-appearance.js'

/** Resolve the public brand before returning homepage HTML, never from account data. */
export async function renderHomeBranding(response,env,url) {
 if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))return response
 try {
  const branding=await fetch(new Request(`${env.ORG_API_ORIGIN||'https://org-codecollective.jcloiacon.workers.dev'}/api/network/orgs/public/lifetech/branding`,{headers:{'x-forwarded-host':url.host,'x-forwarded-proto':'https'},cache:'no-store',signal:AbortSignal.timeout(2000)}))
  if(!branding.ok)return response
  const portal=(await branding.json()).portal
  let features=portal?.feature_config
  if(typeof features==='string'){try{features=JSON.parse(features)}catch{features=null}}
  let html=injectHomeTagline(await response.clone().text(),portal?.tagline)
  if(features?.brandThemes){
   const config=normalizeAppearanceConfig({brandThemes:features.brandThemes,nameBannerUrl:typeof features.nameBannerUrl==='string'&&features.nameBannerUrl.startsWith('https://')?features.nameBannerUrl:appearanceFallback.nameBannerUrl})
   html=injectAppearance(html,config)
  }
  const headers=new Headers(response.headers)
  for(const key of ['content-length','content-encoding','etag'])headers.delete(key)
  headers.set('cache-control','no-store')
  return new Response(html,{status:response.status,headers})
 }catch{return response}
}
