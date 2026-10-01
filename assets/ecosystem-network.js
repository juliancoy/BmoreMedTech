import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force'
import { orgDetails } from '../lib/ecosystem-view.js'
const $ = s => document.querySelector(s)
const colors = { ecosystem:0x16847d, company:0x357db7, health:0xc76e57, university:0x8564b3, funding:0xad7b26, general:0x77878c }
const relationshipColors = { funding:0xad7b26, affiliation:0x8564b3, incubation:0x357db7, acceleration:0x357db7, collaboration:0x16847d }
const selectedCategories = () => new Set([...document.querySelectorAll('[name=node-category]:checked')].map(c=>c.value))
const selectedRelationships = () => new Set([...document.querySelectorAll('[name=relationship]:checked')].map(c=>c.value))
const host = $('#network-canvas'), labels = $('#network-labels'), status = $('#network-status')
let data, selected = null, scene, camera, renderer, controls, group, nodes=[], edges=[], meshes=[], labelItems=[], frame=0
let webgl = false
const radius = n => 5 + (n.proximity ?? 35) / 12
function applyTable() {
 const scope = $('#table-scope').value
 document.querySelectorAll('.eco-table tbody tr').forEach(row => {
  row.hidden = scope === 'selected' ? !selected || (row.dataset.source !== selected && row.dataset.target !== selected) : Boolean(scope && row.dataset.kind !== scope && row.dataset.relationship !== scope)
 })
}
function select(id) {
 const org = data.organizations.find(o=>o.id===id); if (!org) return
 selected = id; $('#neighbors').disabled=false
 $('#network-detail').innerHTML = orgDetails(org,data)
 const u = new URL(location.href); u.searchParams.set('org',id); history.replaceState(null,'',u)
 applyTable(); rebuild()
}
function search() {
 const q = $('#network-search').value.trim().toLowerCase()
 const result = $('#network-results'); result.replaceChildren()
 const matches = data.organizations.filter(o=>!q || `${o.name} ${o.type}`.toLowerCase().includes(q))
 for (const org of matches.slice(0,q ? 20 : 5)) { const b=document.createElement('button'); b.type='button'; b.textContent=org.name; b.addEventListener('click',()=>select(org.id)); result.append(b) }
 if (!matches.length) result.textContent='No matching organization.'
}
function clearGraph() {
 labels.replaceChildren(); labelItems=[]; meshes=[]
 if (group) { group.traverse(o=>{o.geometry?.dispose(); if (Array.isArray(o.material)) o.material.forEach(m=>m.dispose()); else o.material?.dispose()}); scene.remove(group) }
 group = new THREE.Group(); scene.add(group)
}
function rebuild() {
 if (!data) return
 const cats=selectedCategories(), rels=selectedRelationships(), context=$('#include-context').checked
 let visible=data.organizations.filter(n=>cats.has(n.category))
 let visibleIds=new Set(visible.map(n=>n.id))
 edges=data.relationships.filter(e=>e.source && e.target && visibleIds.has(e.source) && visibleIds.has(e.target) && rels.has(e.relationship) && (!e.kind || e.kind==='transfer' || (context && e.kind==='capitalization')))
 if ($('#neighbors').checked && selected) {
  const neighbors=new Set([selected]); edges.forEach(e=>{if(e.source===selected)neighbors.add(e.target);if(e.target===selected)neighbors.add(e.source)})
  visible=visible.filter(n=>neighbors.has(n.id)); visibleIds=new Set(visible.map(n=>n.id)); edges=edges.filter(e=>visibleIds.has(e.source)&&visibleIds.has(e.target))
 }
 nodes=visible.map(n=>({...n})); edges=edges.map(e=>({...e}))
 status.textContent=`${nodes.length} organizations · ${edges.length} links${webgl ? '' : ' · Table view (WebGL unavailable)'}`
 if(!webgl) return
 clearGraph()
 const classKeys=Object.keys(colors), clusters=classKeys.length, spread=230
 const center=n=>{const i=classKeys.indexOf(n.category),a=i/clusters*Math.PI*2;return {x:Math.cos(a)*spread,y:Math.sin(a)*spread}}
 const sim=forceSimulation(nodes).force('link',forceLink(edges).id(n=>n.id).distance(110).strength(.12))
  .force('charge',forceManyBody().strength(-220)).force('collision',forceCollide(n=>radius(n)+20).iterations(3))
  .force('x',forceX(n=>center(n).x).strength(.15)).force('y',forceY(n=>center(n).y).strength(.15)).stop()
 for(let i=0;i<250;i++) sim.tick()
 for(const n of nodes) {
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius(n),16,12),new THREE.MeshBasicMaterial({color:n.id===selected?0xe56d3c:colors[n.category]}))
  mesh.position.set(n.x,n.y,0);mesh.userData.node=n;group.add(mesh);meshes.push(mesh)
  const button=document.createElement('button');button.type='button';button.textContent=n.name;button.title=n.name;button.setAttribute('aria-pressed',String(n.id===selected));button.addEventListener('click',()=>select(n.id));labels.append(button);labelItems.push({button,n})
 }
 const parallel=new Map()
 for(const edge of edges) {
  const a=new THREE.Vector3(edge.source.x,edge.source.y,0),b=new THREE.Vector3(edge.target.x,edge.target.y,0)
  const pair=`${edge.source.id}-${edge.target.id}`,idx=parallel.get(pair)||0;parallel.set(pair,idx+1)
  const dir=b.clone().sub(a).normalize(),normal=new THREE.Vector3(-dir.y,dir.x,0)
  const start=a.clone().addScaledVector(dir,radius(edge.source)+2),end=b.clone().addScaledVector(dir,-radius(edge.target)-3)
  const midpoint=start.clone().add(end).multiplyScalar(.5).addScaledVector(normal,15+idx*18)
  const curve=new THREE.QuadraticBezierCurve3(start,midpoint,end),points=curve.getPoints(36),color=relationshipColors[edge.relationship]
  if(edge.relationship==='funding') {
   const width=edge.kind==='transfer' && edge.amount ? .55+Math.max(0,Math.log10(edge.amount)-4)*.35 : .8
   group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,36,width,4,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5})))
  } else {
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color,dashSize:edge.relationship==='affiliation'?8:3,gapSize:5,transparent:true,opacity:.65}));line.computeLineDistances();group.add(line)
  }
  const tangent=curve.getTangent(1).normalize(),arrow=new THREE.ArrowHelper(tangent,end.clone().addScaledVector(tangent,-8),8,color,7,4);group.add(arrow)
 }
 fit(); requestRender()
}
function fit() {
 if(!webgl) return
 const box=new THREE.Box3().setFromObject(group),center=new THREE.Vector3(),size=new THREE.Vector3()
 if(nodes.length) {box.getCenter(center);box.getSize(size)}
 const aspect=host.clientWidth/host.clientHeight
 const view=Math.max(size.y+100,(size.x+100)/aspect,200)
 camera.left=-view*aspect/2;camera.right=view*aspect/2;camera.top=view/2;camera.bottom=-view/2;camera.zoom=1
 camera.position.set(center.x,center.y,1000);controls.target.copy(center);camera.updateProjectionMatrix();controls.update();requestRender()
}
function render() {
 frame=0; if(!webgl)return
 renderer.render(scene,camera)
 const positions=[]
 const priority=[...labelItems].sort((a,b)=>(b.n.id===selected)-(a.n.id===selected)||(b.n.proximity??0)-(a.n.proximity??0))
 for(const item of priority) {
  const p=new THREE.Vector3(item.n.x,item.n.y,0).project(camera),x=(p.x*.5+.5)*host.clientWidth,y=(-p.y*.5+.5)*host.clientHeight
  const width=Math.min(155,item.n.name.length*5.5+10)
  const overlapping=positions.some(r=>Math.abs(x-r.x)<(width+r.width)/2+8&&Math.abs(y-r.y)<28)
  item.button.hidden=p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1||(overlapping&&item.n.id!==selected)
  if(!item.button.hidden){item.button.style.left=`${x}px`;item.button.style.top=`${y}px`;positions.push({x,y,width})}
 }
}
function requestRender(){if(!frame)frame=requestAnimationFrame(render)}
function initWebgl() {
 try {
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(host.clientWidth,host.clientHeight);host.prepend(renderer.domElement)
  scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-500,500,400,-400,1,5000);camera.position.z=1000
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN};controls.minZoom=.35;controls.maxZoom=6;controls.maxPolarAngle=Math.PI*.8;controls.addEventListener('change',requestRender)
  webgl=true
  new ResizeObserver(()=>{renderer.setSize(host.clientWidth,host.clientHeight);fit()}).observe(host)
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2()
  const hit=event=>{const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);return ray.intersectObjects(meshes)[0]?.object.userData.node}
  let down=null
  renderer.domElement.addEventListener('pointerdown',ev=>{down={x:ev.clientX,y:ev.clientY}})
  renderer.domElement.addEventListener('pointerup',ev=>{if(down&&Math.hypot(ev.clientX-down.x,ev.clientY-down.y)<6){const n=hit(ev);if(n)select(n.id)}down=null})
  renderer.domElement.addEventListener('pointermove',ev=>{const n=hit(ev),tip=$('#network-tooltip');tip.hidden=!n;if(n)tip.textContent=`${n.name} · ${n.proximity==null?'Not scored':`${n.proximity}/100 proximity`}`;renderer.domElement.style.cursor=n?'pointer':'grab'})
  renderer.domElement.addEventListener('pointerleave',()=>{$('#network-tooltip').hidden=true})
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();webgl=false;labels.replaceChildren();status.textContent='Graphics unavailable. Use search, details and the relationship table below.'})
 } catch { host.hidden=true;webgl=false }
}
async function start(){
 try {
  const response=await fetch('/ecosystem.json');if(!response.ok)throw new Error('Data unavailable');data=await response.json()
  initWebgl();search()
  $('#network-search').addEventListener('input',search)
  document.querySelectorAll('[name=node-category],[name=relationship],#include-context,#neighbors').forEach(el=>el.addEventListener('change',rebuild))
  $('#table-scope').addEventListener('change',applyTable)
  $('#network-fit').addEventListener('click',fit)
  for(const [id,factor] of [['#zoom-in',1.25],['#zoom-out',.8]]) $(id).addEventListener('click',()=>{if(!webgl)return;camera.zoom=Math.max(.35,Math.min(6,camera.zoom*factor));camera.updateProjectionMatrix();requestRender()})
  $('#network-reset').addEventListener('click',()=>{selected=null;document.querySelectorAll('[name=node-category],[name=relationship]').forEach(c=>c.checked=true);$('#include-context').checked=false;$('#neighbors').checked=false;$('#neighbors').disabled=true;$('#network-search').value='';$('#table-scope').value='';$('#network-detail').innerHTML='<h2>Select an organization</h2><p>Search or select a graph label to explore its evidence.</p>';history.replaceState(null,'',location.pathname);search();applyTable();rebuild()})
  const initial=new URL(location.href).searchParams.get('org');if(initial&&data.organizations.some(n=>n.id===initial)){select(initial)}else rebuild()
 }catch(error){status.textContent='Interactive data unavailable. The full relationship table and directory remain readable.';host.hidden=true;console.error(error)}
}
start()
