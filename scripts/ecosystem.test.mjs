import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { normalizeWorkbook, financeKind, parseCsv, safeUrl } from '../lib/ecosystem.js'
import { orgDetails, relationshipTable } from '../lib/ecosystem-view.js'
import worker from '../worker.js'
const snapshot = JSON.parse(await readFile(new URL('../assets/data/ecosystem.json', import.meta.url)))
function fixture() { return {
 Sheet1:[['LifeTech / MedTech Ecosystem','Point of Contact'],['Example','Private Person','private@example.org; info@example.org; info@other.org','https://example.org','MedTech network','Core','90'],['Example alias','Private Person','private@example.org','https://example.org','MedTech network','Core','90']],
 Dashboard:[['Title'],['Organization','Proximity Score','Category','Primary Contribution'],['Example','90','Ecosystem','Founder support','PRIVATE STATUS']],
 'Financing & Money Flows':[['headers'],['Example','Donor','$100','2026','Grant','Into listed organization','Primary source','Note','https://example.org/evidence']],
 'Funding Network':[['Title'],['headers'],['Donor','Example','$100','Grant','2026','Funding','https://example.org/evidence']],
} }
const registry=[{id:'example-stable',name:'Example',aliases:['Example alias']},{id:'donor-stable',name:'Donor',category:'funding',supplemental:true}]
test('normalization deduplicates explicit aliases and excludes private/unrecognized fields',()=>{
 const book=fixture();book.Secret=[['token','secret']]
 const d=normalizeWorkbook(book,registry,'2026-10-01');assert.equal(d.organizations.length,2)
 const o=d.organizations.find(o=>o.id==='example-stable');assert.deepEqual(o.sourceRows,[2,3]);assert.deepEqual(o.publicEmails,['info@example.org'])
 assert.equal(d.relationships[0].target,'example-stable');assert.equal(d.relationships[0].evidence,'Primary source')
 assert.equal(d.dashboard[0].contribution,'Founder support');assert.doesNotMatch(JSON.stringify(d),/Private Person|private@example|PRIVATE STATUS|secret|info@other/)
 book.Sheet1[1][0]='Example alias';assert.equal(normalizeWorkbook(book,registry,'today').organizations[0].id,'example-stable')
})
test('rejects missing/malformed sources and conflicting registry aliases',()=>{
 assert.throws(()=>normalizeWorkbook({},registry,''),/Missing worksheet/)
 assert.throws(()=>normalizeWorkbook(fixture(),[...registry,{id:'other',name:'Example'}],''),/Ambiguous alias/)
})
test('financing semantics preserve non-transaction amounts',()=>{
 for(const [text,kind] of [['Founding grant','transfer'],['Per participating company','terms'],['1501 Health cohort company up to','terms'],['VC fund raise','capitalization'],['LP commitment','capitalization'],['Current reported total','portfolio'],['Portfolio companies','portfolio'],['Co-investment portfolio','coinvestment'],['Johns Hopkins research initiatives cumulative','portfolio']]) assert.equal(financeKind(text),kind,text)
})
test('CSV handles escaped quotes, embedded newlines and trailing blank fields',()=>{
 assert.deepEqual(parseCsv('"a,b","c""d"\r\n"line\nbreak",\r\n'),[['a,b','c"d'],['line\nbreak','']])
 assert.throws(()=>parseCsv('"unfinished'),/Unclosed/)
})
test('unsafe URLs and HTML are never executable in rendered data',()=>{
 assert.equal(safeUrl('javascript:alert(1)'),'');assert.equal(safeUrl('https://user:pass@example.org'),'')
 const d=normalizeWorkbook(fixture(),registry,'');d.organizations[0].name='<img onerror=alert(1)>'
 assert.doesNotMatch(orgDetails(d.organizations[0],d),/<img onerror/)
 d.relationships[0].sourceUrl='javascript:alert(1)';assert.doesNotMatch(relationshipTable(d),/href="javascript:/)
})
test('real snapshot retains separate programs, stable edges and aggregate scopes',()=>{
 const ids=new Set(snapshot.organizations.map(o=>o.id));assert.equal(ids.size,snapshot.organizations.length)
 for(const r of snapshot.relationships){if(r.source)assert.ok(ids.has(r.source));if(r.target)assert.ok(ids.has(r.target));assert.ok(r.sourceUrl)}
 assert.equal(snapshot.organizations.filter(o=>o.name.startsWith('Hexcite')).length,1)
 assert.deepEqual(snapshot.organizations.find(o=>o.name==='Amplify MedTech').sourceRows,[4])
 for(const name of ['Pava','FastForward','Johns Hopkins Technology Ventures','The GRID','University of Maryland, Baltimore / UM Ventures']) assert.ok(snapshot.organizations.some(o=>o.name.startsWith(name)))
 assert.ok(snapshot.relationships.some(e=>e.kind==='terms'&&e.target===null))
 assert.ok(snapshot.relationships.some(e=>e.kind==='portfolio'&&e.target===null))
 assert.ok(snapshot.relationships.some(e=>e.kind==='coinvestment'))
 for(const kind of ['transfer','terms','capitalization','portfolio','coinvestment'])assert.ok(snapshot.financing.some(f=>f.kind===kind))
})
test('ecosystem routes use static assets and preserve HEAD, query and 404 behavior',async()=>{
 for(const path of ['/ecosystem','/ecosystem/','/ecosystem/network','/ecosystem/network/']) for(const method of ['GET','HEAD']) {
  let seen
  const response=await worker.fetch(new Request(`https://lifetech.fyi${path}?org=example`,{method}),{ASSETS:{fetch:async req=>{seen=req;return new Response(method==='HEAD'?null:'readable',{headers:{'content-type':'text/html'}})}}})
  assert.equal(response.status,200);assert.equal(seen.method,method);assert.equal(new URL(seen.url).pathname,path.includes('network')?'/ecosystem/network':'/ecosystem/');assert.equal(new URL(seen.url).search,'?org=example')
 }
 const missing=await worker.fetch(new Request('https://lifetech.fyi/ecosystem'),{ASSETS:{fetch:async()=>new Response('missing',{status:404})}});assert.equal(missing.status,404)
 const post=await worker.fetch(new Request('https://lifetech.fyi/ecosystem',{method:'POST'}),{});assert.equal(post.status,405)
})
test('generated pages contain useful content without scripts',async()=>{
 const directory=await readFile(new URL('../ecosystem/index.html',import.meta.url),'utf8'),network=await readFile(new URL('../ecosystem/network.html',import.meta.url),'utf8')
 assert.match(directory,/Amplify MedTech/);assert.match(directory,/LifeTech proximity/);assert.match(network,/<table/);assert.match(network,/Stephen &amp; Renee Bisciotti Foundation/)
 for(const html of [directory,network])assert.doesNotMatch(html,/docs\.google\.com|oauth_token|private@example/)
})

test('proximity chart ranks scores and distinguishes zero from missing with accessible detail links', async()=>{
 const { proximityChart } = await import('../lib/ecosystem-view.js')
 const html = proximityChart([
  {id:'missing',name:'Unknown',category:'general',proximity:null},
  {id:'zero',name:'Zero',category:'general',proximity:0},
  {id:'high',name:'High <score>',category:'ecosystem',proximity:95}
 ])
 assert.ok(html.indexOf('data-org="high"') < html.indexOf('data-org="zero"'))
 assert.ok(html.indexOf('data-org="zero"') < html.indexOf('data-org="missing"'))
 assert.match(html,/href="#high"/); assert.match(html,/High &lt;score&gt;/)
 assert.match(html,/width:0%/); assert.match(html,/>0\/100</)
 assert.match(html,/eco-bar-missing">Not scored/)
})


test('every directory organization has a direct first-class portal page link', async () => {
 const directory = await readFile(new URL('../ecosystem/index.html',import.meta.url),'utf8')
 for (const org of snapshot.organizations.filter(org => org.directory)) {
  const path = `/orgs/${encodeURIComponent(org.id.replace(/^org-/, ''))}`
  assert.ok(directory.includes(`href="${path}"`), `${org.name}: missing organization page`)
  assert.ok(orgDetails(org,snapshot).includes(`href="${path}"`), `${org.name}: missing network detail page`)
 }
})
