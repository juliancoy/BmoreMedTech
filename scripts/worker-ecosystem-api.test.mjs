import {test} from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker.js'

for(const host of ['lifetech.fyi','medtech.social']){
 test(`${host} forwards ecosystem API requests to the portal binding before static assets`,async()=>{
  const url=`https://${host}/api/ecosystem/graph?org=org-1&nodeLimit=50&depth=2`
  let seen
  const response=await worker.fetch(new Request(url),{ORGPORTAL_WEB:{fetch:async request=>{seen=request.url;return Response.json({organizations:[],relationships:[],version:'fixture'})}},ASSETS:{fetch:()=>{throw Error('API must not fall through to static assets')}}})
  assert.equal(seen,url);assert.equal(response.status,200);assert.equal((await response.json()).version,'fixture')
 })
 test(`${host} preserves portal API status and query through the HTTP fallback`,async t=>{
  t.mock.method(globalThis,'fetch',async request=>{
   assert.equal(request.url,'https://portal.example/api/ecosystem/organizations?q=Maryland&limit=5')
   assert.equal(request.headers.get('x-forwarded-host'),host)
   return Response.json({error:'Evidence temporarily unavailable'},{status:503})
  })
  const response=await worker.fetch(new Request(`https://${host}/api/ecosystem/organizations?q=Maryland&limit=5`),{PORTAL_SITE_ORIGIN:'https://portal.example'})
  assert.equal(response.status,503);assert.equal((await response.json()).error,'Evidence temporarily unavailable')
 })
}
