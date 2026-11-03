import test from 'node:test'
import assert from 'node:assert/strict'
import {injectHomeTagline,applyHomeTagline} from '../lib/home-tagline.js'
import {renderHomeBranding} from '../lib/home-branding.js'
import {renderSiteBrand,siteBrand} from '../lib/site-brand.js'
import {readFileSync} from 'node:fs'
const source='<html><head></head><body><small data-portal-tagline>Old header</small><p class="eyebrow" data-portal-tagline>Old <span>hero</span></p><h1>Separate homepage heading</h1></body></html>'
const response=()=>new Response(source,{headers:{'content-type':'text/html','etag':'old','content-length':'123'}})

test('each homepage request renders the current public tagline even without theme settings',async()=>{
 const original=globalThis.fetch
 let tagline='Advancing medicine in Baltimore',calls=0
 try {
  globalThis.fetch=async request=>{
   calls++;assert.equal(new URL(request.url).pathname,'/api/network/orgs/public/lifetech/branding')
   assert.equal(request.headers.get('x-forwarded-host'),'lifetech.fyi')
   assert.equal(request.headers.get('authorization'),null)
   assert.equal(request.cache,'no-store')
   return Response.json({portal:{tagline}})
  }
  for(const next of [tagline,'A newly saved tagline']){
   tagline=next
   const result=await renderHomeBranding(response(),{ORG_API_ORIGIN:'https://org.example'},new URL('https://lifetech.fyi/'))
   const html=await result.text()
   assert.equal(html.split(next).length-1,2)
   assert.ok(html.includes('<h1>Separate homepage heading</h1>'))
   assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.headers.get('etag'),null)
  }
  assert.equal(calls,2)
 }finally{globalThis.fetch=original}
})

test('public copy is escaped as text and a deliberately empty tagline clears stale copy',()=>{
 const html=injectHomeTagline(source,'<img src=x onerror=alert(1)> & "care"')
 assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&amp;'))
 assert.ok(!injectHomeTagline(source,'').includes('Old'))
 assert.equal(injectHomeTagline(source,undefined),source)
 const elements=[{textContent:'old'},{textContent:'old'}]
 applyHomeTagline('<b>Plain text</b>',{querySelectorAll:()=>elements})
 assert.ok(elements.every(element=>element.textContent==='<b>Plain text</b>'))
})

test('unavailable or malformed branding retains the shipped homepage',async()=>{
 const original=globalThis.fetch
 try {
  for(const reply of [()=>{throw Error('offline')},()=>new Response('Unavailable',{status:503}),()=>new Response('not json')]){
   globalThis.fetch=reply
   const result=await renderHomeBranding(response(),{},new URL('https://lifetech.fyi/'))
   assert.equal(await result.text(),source)
  }
 }finally{globalThis.fetch=original}
})

test('only LifeTech replaces its shipped tagline; MedTech keeps independent copy',()=>{
 const template=readFileSync(new URL('../index.html',import.meta.url),'utf8')
 const life=renderSiteBrand(template,siteBrand('lifetech'))
 const med=renderSiteBrand(template,siteBrand('medtech'))
 assert.match(life,/<small data-portal-tagline>Advancing medicine in Baltimore<\/small>/)
 assert.match(life,/<p class="eyebrow" data-portal-tagline>Advancing medicine in Baltimore<\/p>/)
 assert.match(med,/<small data-portal-tagline>Health × Medicine × Biotech<\/small>/)
})


test('homepage Worker preserves dynamic freshness and bypasses the static asset validator',async()=>{
 const {default:worker}=await import('../worker.js')
 const original=globalThis.fetch
 try {
  globalThis.fetch=async()=>Response.json({portal:{tagline:'Current saved tagline'}})
  const result=await worker.fetch(new Request('https://lifetech.fyi/',{headers:{'if-none-match':'old-asset','if-modified-since':'Wed, 01 Jan 2025 00:00:00 GMT'}}),{
   SITE_BRAND:'lifetech',ORG_API_ORIGIN:'https://org.example',ASSETS:{fetch:async request=>{
    assert.equal(request.headers.get('if-none-match'),null)
    assert.equal(request.headers.get('if-modified-since'),null)
    return response()
   }},
  })
  assert.equal(result.status,200)
  assert.equal(result.headers.get('cache-control'),'no-store')
  assert.match(await result.text(),/Current saved tagline/)
 }finally{globalThis.fetch=original}
})
