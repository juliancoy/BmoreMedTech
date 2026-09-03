import { renderHorizontalBars } from './strategy-bars.js'
import { createChartSvg, element, externalLink, formatCompact, formatInteger, renderDataTable, svgElement } from './strategy-utils.js'
import { calculateNeedAvailabilityMetrics } from './need-availability-metrics.js'

const urls = ['/need-availability-distortions.json','/strategy-neurology.json','/strategy-oncology.json','/strategy-radiology.json','/strategy-genomics.json']
const state = { editorial: null, fields: [], result: null }
const byId = (id) => document.getElementById(id)
const signed = (value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`

function interpretation(id) {
  return state.editorial.interpretations.find((item) => item.id === id)
}

function renderHero() {
  const leader = state.result.leader
  byId('distortion-as-of').textContent = `Reviewed ${state.editorial.meta.as_of}`
  byId('distortion-leader-name').textContent = leader.name
  byId('distortion-leader-index').textContent = `${leader.distortionIndex.toFixed(1)} / 100`
  byId('distortion-leader-ratio').textContent = `${formatInteger(leader.peoplePerSpecialist)} need-proxy people per specialist proxy`
  byId('distortion-leader-gap').textContent = `${signed(leader.signedNeedAvailabilityGap)} normalized need–availability gap`
  byId('distortion-conclusion').textContent = state.editorial.meta.conclusion
}

function renderRanking() {
  const container = byId('distortion-ranking-cards')
  container.replaceChildren()
  for (const metric of state.result.records) {
    const note = interpretation(metric.id)
    const card = element('article', 'distortion-rank-card')
    card.dataset.field = metric.id
    card.innerHTML = `
      <div class="distortion-rank-card-top"><span>${String(metric.rank).padStart(2,'0')}</span><small>${metric.rank === 1 ? 'Largest shortfall signal' : 'Relative pressure signal'}</small></div>
      <h3>${metric.name}</h3><strong>${metric.distortionIndex.toFixed(1)}</strong><em>relative distortion index</em>
      <p>${note.headline}</p>
      <div><span>${formatInteger(metric.peoplePerSpecialist)} need-proxy people / specialist</span><span>${metric.entrantsPerThousandSpecialists.toFixed(1)} entrants / 1,000 specialists</span></div>`
    container.append(card)
  }
}

function renderQuadrant() {
  const container = byId('distortion-quadrant-chart')
  const width = 760, height = 500
  const margin = { top: 48, right: 92, bottom: 82, left: 82 }
  const innerW = width - margin.left - margin.right, innerH = height - margin.top - margin.bottom
  const x = (v) => margin.left + ((v - 20) / 80) * innerW
  const y = (v) => margin.top + innerH - ((v - 20) / 80) * innerH
  const svg = createChartSvg('Normalized patient need versus service availability proxy', `0 0 ${width} ${height}`)
  svg.append(svgElement('polygon', { points: `${x(20)},${y(100)} ${x(100)},${y(100)} ${x(20)},${y(20)}`, class: 'distortion-shortfall-zone' }))
  for (const tick of [20,40,60,80,100]) {
    svg.append(svgElement('line',{x1:x(tick),y1:margin.top,x2:x(tick),y2:margin.top+innerH,class:'strategy-chart-gridline'}))
    svg.append(svgElement('line',{x1:margin.left,y1:y(tick),x2:margin.left+innerW,y2:y(tick),class:'strategy-chart-gridline'}))
    svg.append(svgElement('text',{x:x(tick),y:height-margin.bottom+27,'text-anchor':'middle',class:'strategy-chart-tick'},String(tick)))
    svg.append(svgElement('text',{x:margin.left-13,y:y(tick)+4,'text-anchor':'end',class:'strategy-chart-tick'},String(tick)))
  }
  svg.append(svgElement('line',{x1:x(20),y1:y(20),x2:x(100),y2:y(100),class:'distortion-balance-line'}))
  svg.append(svgElement('text',{x:x(24),y:y(92),class:'distortion-zone-label'},'NEED OUTRUNS AVAILABILITY'))
  const offsets = { genomics:[14,-10], radiology:[-14,-12], oncology:[-12,20], neurology:[-12,-12] }
  for (const metric of state.result.records) {
    const [dx,dy] = offsets[metric.id]
    const group = svgElement('g',{class:'strategy-chart-series','data-field':metric.id})
    group.append(svgElement('circle',{cx:x(metric.availabilityScore),cy:y(metric.needScore),r:metric.rank===1?12:10,class:'distortion-quadrant-point'}))
    group.append(svgElement('text',{x:x(metric.availabilityScore)+dx,y:y(metric.needScore)+dy,'text-anchor':dx<0?'end':'start',class:'distortion-quadrant-label'},metric.name))
    svg.append(group)
  }
  svg.append(svgElement('text',{x:margin.left+innerW/2,y:height-20,'text-anchor':'middle',class:'distortion-axis-title'},'Service availability proxy score →'))
  svg.append(svgElement('text',{x:19,y:margin.top+innerH/2,'text-anchor':'middle',transform:`rotate(-90 19 ${margin.top+innerH/2})`,class:'distortion-axis-title'},'Patient need / demand proxy score →'))
  container.replaceChildren(svg)
}

function renderCharts() {
  renderHorizontalBars('distortion-index-chart', state.result.records.map((m)=>({id:m.id,label:m.name,value:m.distortionIndex,display:m.distortionIndex.toFixed(1)})), {label:'Relative need-to-availability distortion index',tickFormat:(v)=>v.toFixed(0)})
  renderHorizontalBars('distortion-ratio-chart', state.result.records.map((m)=>({id:m.id,label:m.name,value:m.peoplePerSpecialist,display:formatInteger(m.peoplePerSpecialist)})), {label:'Need or service-demand proxy per physician-specialist proxy',tickFormat:formatCompact})
  renderHorizontalBars('distortion-pipeline-chart', [...state.result.records].sort((a,b)=>b.entrantsPerThousandSpecialists-a.entrantsPerThousandSpecialists).map((m)=>({id:m.id,label:m.name,value:m.entrantsPerThousandSpecialists,display:m.entrantsPerThousandSpecialists.toFixed(1)})), {label:'Annual entrants per one thousand current specialists',tickFormat:(v)=>v.toFixed(0)})
  renderQuadrant()

  renderDataTable('distortion-data-table','Need–availability distortion inputs and outputs',[
    {key:'rank',label:'Rank'},{key:'field',label:'Field'},{key:'index',label:'Index',format:(v)=>v.toFixed(1)},
    {key:'need',label:'Need proxy'},{key:'needType',label:'Need definition'},{key:'workforce',label:'Workforce proxy'},
    {key:'pipeline',label:'Pipeline'},{key:'ratio',label:'Need / specialist',format:formatInteger},
    {key:'renewal',label:'Entrants / 1,000',format:(v)=>v.toFixed(1)},{key:'gap',label:'Need–availability gap',format:signed},
  ], state.result.records.map((m)=>({rank:m.rank,field:m.name,index:m.distortionIndex,need:m.field.need.display,needType:m.field.need.type,workforce:m.field.workforce.display,pipeline:m.field.pipeline.display,ratio:m.peoplePerSpecialist,renewal:m.entrantsPerThousandSpecialists,gap:m.signedNeedAvailabilityGap})))
}

function metric(label,value) {
  const node = element('div','distortion-field-metric')
  node.append(element('span','',label),element('strong','',value))
  return node
}

function statement(label,text,warning=false) {
  const node = element('div',`distortion-statement${warning?' is-warning':''}`)
  node.append(element('strong','',label),element('p','',text))
  return node
}

function renderProfiles() {
  const container = byId('distortion-field-profiles')
  container.replaceChildren()
  for (const m of state.result.records) {
    const note = interpretation(m.id)
    const card = element('article','distortion-field-card')
    card.dataset.field = m.id
    const header = element('header')
    const title = element('div')
    title.append(element('span','distortion-field-rank',`Rank ${m.rank}`),element('h3','',m.name))
    const link = element('a','distortion-field-link','Open field atlas')
    link.href = `/taxonomy.html?field=${encodeURIComponent(m.field.index_field_id)}#field-index`
    header.append(title,link); card.append(header)
    const score = element('div','distortion-field-score')
    score.append(element('strong','',m.distortionIndex.toFixed(1)),element('span','',note.headline)); card.append(score)
    const metrics = element('div','distortion-field-metrics')
    metrics.append(metric('Need / specialist',formatInteger(m.peoplePerSpecialist)),metric('Pipeline / 1,000',m.entrantsPerThousandSpecialists.toFixed(1)),metric('Need score',m.needScore.toFixed(1)),metric('Availability',m.availabilityScore.toFixed(1)))
    card.append(metrics,statement('Why it appears here',note.summary),statement('Strategic response',note.action),statement('Do not overread',note.caution,true))
    const footer = element('footer')
    footer.append(externalLink('Need source',m.field.need.source_url),externalLink('Workforce source',m.field.workforce.source_url),externalLink('Pipeline source',m.field.pipeline.source_url))
    card.append(footer); container.append(card)
  }
}

function renderMethod() {
  const meta = state.editorial.meta
  byId('distortion-method-formula').textContent = meta.formula
  byId('distortion-method-availability').textContent = meta.availability_definition
  byId('distortion-method-scaling').textContent = meta.scaling
  byId('distortion-method-gap').textContent = meta.signed_gap_note
  byId('distortion-method-guardrail').textContent = meta.comparability_guardrail
  const sources = byId('distortion-source-register'), seen = new Set()
  sources.replaceChildren()
  for (const field of state.fields) for (const [label,url,kind] of [[field.need.source_label,field.need.source_url,'need'],[field.workforce.source_label,field.workforce.source_url,'workforce'],[field.pipeline.source_label,field.pipeline.source_url,'pipeline']]) {
    if (!url || seen.has(url)) continue
    seen.add(url)
    const row = element('div','distortion-source')
    row.append(externalLink(label,url),element('p','',`${field.name} ${kind} proxy`)); sources.append(row)
  }
}

async function initialize() {
  const status = byId('distortion-status')
  try {
    const responses = await Promise.all(urls.map((url)=>fetch(url)))
    if (responses.some((response)=>!response.ok)) throw new Error('The need–availability distortion data could not be loaded.')
    const [editorial,...fields] = await Promise.all(responses.map((response)=>response.json()))
    state.editorial=editorial; state.fields=fields; state.result=calculateNeedAvailabilityMetrics(fields)
    renderHero(); renderRanking(); renderCharts(); renderProfiles(); renderMethod(); status.hidden=true
    window.__bmoreMedTechNeedAvailability={ready:true,fields:state.result.records.length,leader:state.result.leader.id,leaderIndex:state.result.leader.distortionIndex,charts:document.querySelectorAll('.distortion-page .strategy-chart-svg').length}
  } catch (error) {
    status.classList.add('is-error'); status.textContent=error instanceof Error?error.message:'The need–availability distortion data could not be loaded.'
    window.__bmoreMedTechNeedAvailability={ready:false,error:status.textContent}
  }
}
initialize()
