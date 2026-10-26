import test from 'node:test'
import assert from 'node:assert/strict'
import { allLifeTechEvents } from '../assets/medical-events.js'
import { publicEvents, renderHomeEvent } from '../lib/public-discovery.js'
test('browser homepage retrieves every hosted event beyond the first feed page',async()=>{
 const calls=[]
 const rows=await allLifeTechEvents(async path=>{
  const url=new URL(path,'https://lifetech.fyi');calls.push(url)
  assert.match(url.pathname,/\/orgs\/public\/lifetech\/events$/)
  assert.equal(url.searchParams.get('hosted_only'),'true')
  const offset=Number(url.searchParams.get('offset')||0)
  return Response.json(Array.from({length:offset===0?120:3},(_,i)=>({id:String(offset+i)})))
 })
 assert.equal(rows.length,123);assert.equal(rows[122].id,'122');assert.equal(calls.length,2)
 assert.equal(calls[1].searchParams.get('offset'),'120')
 await assert.rejects(()=>allLifeTechEvents(async()=>Response.json({error:'unavailable'})),/Invalid/)
})
test('server homepage and discovery retrieve every page using the same hosted scope',async t=>{
 const calls=[]
 t.mock.method(globalThis,'fetch',async request=>{
  const url=new URL(request.url);calls.push(url)
  assert.equal(url.searchParams.get('hosted_only'),'true')
  assert.equal(url.searchParams.get('upcoming_only'),'true')
  const offset=Number(url.searchParams.get('offset'))
  return Response.json(Array.from({length:offset===0?200:1},(_,i)=>({id:String(offset+i)})))
 })
 const rows=await publicEvents({},new URL('https://lifetech.fyi/'))
 assert.equal(rows.length,201);assert.equal(rows[200].id,'200');assert.equal(calls.length,2)
})


test('server-rendered homepage includes each associated cover or gallery image safely', async t => {
 t.mock.method(globalThis,'fetch',async()=>Response.json([
  {slug:'cover',title:'Cover event',starts_at:'2099-11-17T23:00:00Z',image_url:'https://images.example/cover.png?width=800&height=800'},
  {slug:'gallery',title:'Gallery event',starts_at:'2099-11-18T23:00:00Z',image_url:'javascript:alert(1)',media:[{url:'https://images.example/gallery.webp'}]},
  {slug:'no-cover',title:'No cover',starts_at:'2099-11-19T23:00:00Z'},
 ]))
 const response=await renderHomeEvent(new Response('<article id="next-medtech-event"></article>',{headers:{'content-type':'text/html'}}),{},new URL('https://lifetech.fyi/'))
 const html=await response.text()
 assert.equal((html.match(/<img /g)||[]).length,2)
 assert.match(html,/src="https:\/\/images.example\/cover.png\?width=800&amp;height=800"/)
 assert.match(html,/src="https:\/\/images.example\/gallery.webp"/)
 assert.equal((html.match(/class="hero-event-card has-image"/g)||[]).length,2)
 assert.match(html,/loading="eager"/)
 assert.match(html,/href="\/events\/no-cover"/)
 assert.doesNotMatch(html,/javascript:/)
})
