const elements = {
  pageCount: document.getElementById('link-page-count'),
  edgeCount: document.getElementById('link-edge-count'),
  visibleCount: document.getElementById('link-visible-count'),
  viewMode: document.getElementById('link-view-mode'),
  sourceSelect: document.getElementById('link-source-select'),
  direction: document.getElementById('link-direction'),
  search: document.getElementById('link-search'),
  kindToggles: [...document.querySelectorAll('.link-kind-toggles input[type="checkbox"]')],
  repoToggles: [...document.querySelectorAll('.link-repo-toggles input[type="checkbox"]')],
  graph: document.getElementById('link-graph'),
  status: document.getElementById('link-graph-status'),
  inspector: document.getElementById('link-inspector-content'),
  edgeBody: document.getElementById('link-edge-body'),
}

const state = {
  inventory: null,
  mode: 'source',
  selectedSource: '',
  selectedLink: null,
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const NODE_WIDTH = 250
const NODE_HEIGHT = 58
const SOURCE_X = 70
const TARGET_X = 610
const TOP = 74
const ROW_GAP = 76
const ROUTE_LANES = [
  ['medtech', 'MedTech'],
  ['orgportal', 'OrgPortal'],
  ['pidp', 'PIdP'],
  ['external', 'External'],
]
const ROUTE_LANE_WIDTH = 220
const ROUTE_LANE_GAP = 30
const ROUTE_LEFT = 34

function createSvg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  return node
}

function text(value) {
  return value === null || value === undefined ? '' : String(value)
}

function labelForPage(path) {
  const [repo, sourcePath] = path.includes(':') ? path.split(/:(.*)/s).filter(Boolean) : ['', path]
  const label = sourcePath === 'index.html' ? 'Home' : sourcePath.replace(/\.html$/, '')
  return repo ? `${repo}:${label}` : label
}

function targetLabel(link) {
  if (link.kind === 'external-handoff') return link.origin || link.href
  if (link.kind === 'same-page-anchor') return `#${link.fragment}`
  if (link.kind === 'runtime-placeholder') return 'Runtime link'
  if (link.kind === 'portal-route') return link.target
  return link.fragment ? `${link.target}#${link.fragment}` : link.target
}

function kindLabel(kind) {
  return {
    'internal-page': 'Internal',
    'app-handoff': 'App handoff',
    'portal-route': 'Portal route',
    'same-page-anchor': 'Anchor',
    'external-handoff': 'External',
    'runtime-placeholder': 'Runtime',
  }[kind] || kind
}

function selectedKinds() {
  return new Set(elements.kindToggles.filter((input) => input.checked).map((input) => input.value))
}

function selectedRepos() {
  return new Set(elements.repoToggles.filter((input) => input.checked).map((input) => input.value))
}

function repoLabel(repo) {
  return ({
    medtech: 'MedTech',
    orgportal: 'OrgPortal',
    pidp: 'PIdP',
    external: 'External',
  })[repo] || repo || 'External'
}

function pathToRoute(repo, sourcePath) {
  if (repo === 'medtech') {
    if (sourcePath === 'index.html') return '/'
    if (sourcePath.endsWith('.html')) return `/${sourcePath}`
  }
  return sourcePath
}

function routeNodeId(repo, route) {
  return `${repo || 'external'}:${route || 'unknown'}`
}

function routeNodeForSource(link) {
  const route = pathToRoute(link.sourceRepo, link.sourcePath || link.source.replace(/^[^:]+:/, ''))
  return {
    id: routeNodeId(link.sourceRepo, route),
    repo: link.sourceRepo || 'external',
    route,
    label: route,
  }
}

function routeNodeForTarget(link) {
  if (link.kind === 'same-page-anchor') {
    const source = routeNodeForSource(link)
    return { ...source, id: routeNodeId(source.repo, `${source.route}#${link.fragment}`), route: `${source.route}#${link.fragment}`, label: `#${link.fragment}` }
  }
  if (link.kind === 'runtime-placeholder') return { id: routeNodeId(link.sourceRepo, 'runtime'), repo: link.sourceRepo, route: 'runtime', label: 'Runtime link' }
  if (link.kind === 'external-handoff' && !link.targetRepo) {
    const route = link.origin || link.href
    return { id: routeNodeId('external', route), repo: 'external', route, label: route }
  }
  const repo = link.targetRepo || link.sourceRepo || 'external'
  const route = link.kind === 'portal-route'
    ? link.target
    : link.kind === 'external-handoff'
      ? new URL(link.href).pathname || link.origin
      : link.target
        ? `/${link.target}`.replace(/^\/+/, '/')
        : targetLabel(link)
  return { id: routeNodeId(repo, route), repo, route, label: route }
}

function allRouteEdges() {
  if (!state.inventory) return []
  const grouped = new Map()
  for (const link of state.inventory.links) {
    const sourceNode = routeNodeForSource(link)
    const targetNode = routeNodeForTarget(link)
    const key = [sourceNode.id, targetNode.id, link.kind, link.href].join('\t')
    const existing = grouped.get(key)
    if (existing) {
      existing.count += 1
      if (!existing.textRole && link.textRole) existing.textRole = link.textRole
    } else {
      grouped.set(key, {
        ...link,
        source: sourceNode.id,
        target: targetNode.id,
        sourceRoute: sourceNode.route,
        targetRoute: targetNode.route,
        sourceRepo: sourceNode.repo,
        targetRepo: targetNode.repo,
        sourceNode,
        targetNode,
        count: 1,
      })
    }
  }
  return [...grouped.values()]
}

function routeFocusOptions() {
  const nodes = new Map()
  for (const edge of allRouteEdges()) {
    nodes.set(edge.sourceNode.id, edge.sourceNode)
    nodes.set(edge.targetNode.id, edge.targetNode)
  }
  return [...nodes.values()].sort((a, b) => `${a.repo} ${a.route}`.localeCompare(`${b.repo} ${b.route}`))
}

function linksForSource() {
  if (!state.inventory) return []
  const query = elements.search.value.trim().toLocaleLowerCase()
  const kinds = selectedKinds()
  const repos = selectedRepos()
  const matching = state.inventory.links.filter((link) => {
    if (link.source !== state.selectedSource) return false
    if (!kinds.has(link.kind)) return false
    if (link.targetRepo && !repos.has(link.targetRepo)) return false
    if (!query) return true
    return [link.href, link.source, link.sourcePath, link.sourceRepo, link.targetRepo, link.target, link.fragment, link.origin, link.textRole, kindLabel(link.kind)]
      .some((value) => text(value).toLocaleLowerCase().includes(query))
  })
  const grouped = new Map()
  for (const link of matching) {
    const key = [link.source, link.kind, link.href, link.target || '', link.fragment || '', link.origin || ''].join('\t')
    const existing = grouped.get(key)
    if (existing) {
      existing.count += 1
      if (!existing.textRole && link.textRole) existing.textRole = link.textRole
    } else {
      grouped.set(key, { ...link, count: 1 })
    }
  }
  return [...grouped.values()]
}

function routeLinksForFocus() {
  const query = elements.search.value.trim().toLocaleLowerCase()
  const kinds = selectedKinds()
  const repos = selectedRepos()
  const direction = elements.direction.value
  return allRouteEdges().filter((link) => {
    if (!kinds.has(link.kind)) return false
    if (link.targetRepo && !repos.has(link.targetRepo)) return false
    if (link.sourceRepo && !repos.has(link.sourceRepo)) return false
    if (direction === 'incoming' && link.target !== state.selectedSource) return false
    if (direction === 'outgoing' && link.source !== state.selectedSource) return false
    if (direction === 'all' && link.source !== state.selectedSource && link.target !== state.selectedSource) return false
    if (!query) return true
    return [link.href, link.sourceRoute, link.targetRoute, link.sourceRepo, link.targetRepo, link.textRole, kindLabel(link.kind)]
      .some((value) => text(value).toLocaleLowerCase().includes(query))
  })
}

function setInspector(link) {
  state.selectedLink = link
  elements.inspector.replaceChildren()
  const rows = link
    ? [
        ['Kind', kindLabel(link.kind)],
        ['From', link.sourceRoute || link.source],
        ['Source', repoLabel(link.sourceRepo)],
        ['To', link.targetRoute || targetLabel(link)],
        ['Target', repoLabel(link.targetRepo)],
        ['Href', link.href],
        ['Count', String(link.count || 1)],
        ['Label', link.textRole || ''],
      ]
    : [['Status', 'Select a node or row.']]
  for (const [term, description] of rows) {
    const dt = document.createElement('dt')
    dt.textContent = term
    const dd = document.createElement('dd')
    dd.textContent = description || 'None'
    elements.inspector.append(dt, dd)
  }
}

function routeNodeTitle(node) {
  const label = node.label || node.route || node.id
  return label.length > 28 ? `${label.slice(0, 27)}...` : label
}

function drawNode(group, { x, y, title, meta, kind, repo, link }) {
  const node = createSvg('g', {
    class: 'link-node',
    tabindex: '0',
    role: 'button',
    'data-kind': kind,
    'data-repo': repo || '',
    transform: `translate(${x} ${y})`,
  })
  node.append(createSvg('rect', { width: NODE_WIDTH, height: NODE_HEIGHT }))

  const titleText = createSvg('text', { x: 14, y: 24 })
  titleText.textContent = title.length > 31 ? `${title.slice(0, 30)}...` : title
  const metaText = createSvg('text', { x: 14, y: 44, class: 'link-node-meta' })
  metaText.textContent = meta
  node.append(titleText, metaText)

  if (link) {
    node.addEventListener('click', () => setInspector(link))
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        setInspector(link)
      }
    })
  }
  group.append(node)
}

function renderGraph(links) {
  elements.graph.replaceChildren()
  const height = Math.max(590, TOP + Math.max(links.length, 1) * ROW_GAP + 80)
  const width = 940
  elements.graph.setAttribute('viewBox', `0 0 ${width} ${height}`)
  elements.graph.setAttribute('height', String(height))

  const title = createSvg('title', { id: 'link-graph-title' })
  title.textContent = `Outgoing links from ${state.selectedSource}`
  elements.graph.append(title)

  const defs = createSvg('defs')
  const marker = createSvg('marker', {
    id: 'link-arrow',
    viewBox: '0 0 10 10',
    refX: '8',
    refY: '5',
    markerWidth: '7',
    markerHeight: '7',
    orient: 'auto-start-reverse',
  })
  marker.append(createSvg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'currentColor' }))
  defs.append(marker)
  elements.graph.append(defs)

  const edgeLayer = createSvg('g')
  const nodeLayer = createSvg('g')
  elements.graph.append(edgeLayer, nodeLayer)

  const sourceY = Math.max(TOP, TOP + ((links.length - 1) * ROW_GAP) / 2)
  drawNode(nodeLayer, {
    x: SOURCE_X,
    y: sourceY,
    title: labelForPage(state.selectedSource),
    meta: `${repoLabel(links[0]?.sourceRepo || state.inventory.links.find((link) => link.source === state.selectedSource)?.sourceRepo)} source`,
    kind: 'source',
    repo: state.inventory.links.find((link) => link.source === state.selectedSource)?.sourceRepo,
  })

  if (links.length === 0) {
    const empty = createSvg('text', { x: TARGET_X, y: TOP + 36 })
    empty.textContent = 'No links match the current filters.'
    elements.graph.append(empty)
    return
  }

  links.forEach((link, index) => {
    const targetY = TOP + index * ROW_GAP
    const startX = SOURCE_X + NODE_WIDTH
    const startY = sourceY + NODE_HEIGHT / 2
    const endX = TARGET_X
    const endY = targetY + NODE_HEIGHT / 2
    const midX = startX + (endX - startX) * 0.52
    const path = createSvg('path', {
      class: 'link-edge',
      'data-kind': link.kind,
      'data-repo': link.targetRepo || link.sourceRepo || '',
      d: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
      'marker-end': 'url(#link-arrow)',
    })
    edgeLayer.append(path)
    drawNode(nodeLayer, {
      x: TARGET_X,
      y: targetY,
      title: targetLabel(link),
      meta: `${repoLabel(link.targetRepo || link.sourceRepo)} · ${kindLabel(link.kind)}${link.count > 1 ? ` x${link.count}` : ''}`,
      kind: link.kind,
      repo: link.targetRepo || link.sourceRepo,
      link,
    })
  })
}

function renderRouteGraph(links) {
  elements.graph.replaceChildren()
  const nodes = new Map()
  for (const link of links) {
    nodes.set(link.sourceNode.id, link.sourceNode)
    nodes.set(link.targetNode.id, link.targetNode)
  }
  if (!nodes.has(state.selectedSource)) {
    const focus = routeFocusOptions().find((node) => node.id === state.selectedSource)
    if (focus) nodes.set(focus.id, focus)
  }

  const laneNodes = new Map(ROUTE_LANES.map(([repo]) => [repo, []]))
  for (const node of nodes.values()) {
    const repo = laneNodes.has(node.repo) ? node.repo : 'external'
    laneNodes.get(repo).push(node)
  }
  for (const list of laneNodes.values()) {
    list.sort((a, b) => {
      if (a.id === state.selectedSource) return -1
      if (b.id === state.selectedSource) return 1
      return a.route.localeCompare(b.route)
    })
  }

  const maxRows = Math.max(1, ...[...laneNodes.values()].map((list) => list.length))
  const height = Math.max(590, TOP + maxRows * ROW_GAP + 92)
  const width = ROUTE_LEFT * 2 + ROUTE_LANES.length * ROUTE_LANE_WIDTH + (ROUTE_LANES.length - 1) * ROUTE_LANE_GAP
  elements.graph.setAttribute('viewBox', `0 0 ${width} ${height}`)
  elements.graph.setAttribute('height', String(height))

  const title = createSvg('title', { id: 'link-graph-title' })
  title.textContent = `Route ownership graph for ${state.selectedSource}`
  elements.graph.append(title)

  const defs = createSvg('defs')
  const marker = createSvg('marker', { id: 'link-arrow', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' })
  marker.append(createSvg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'currentColor' }))
  defs.append(marker)
  elements.graph.append(defs)

  const laneLayer = createSvg('g')
  const edgeLayer = createSvg('g')
  const nodeLayer = createSvg('g')
  elements.graph.append(laneLayer, edgeLayer, nodeLayer)

  const positions = new Map()
  ROUTE_LANES.forEach(([repo, label], laneIndex) => {
    const x = ROUTE_LEFT + laneIndex * (ROUTE_LANE_WIDTH + ROUTE_LANE_GAP)
    const lane = createSvg('g', { class: 'link-swimlane', 'data-repo': repo })
    lane.append(createSvg('rect', { x, y: 40, width: ROUTE_LANE_WIDTH, height: height - 66 }))
    const laneText = createSvg('text', { x: x + 14, y: 64 })
    laneText.textContent = label
    lane.append(laneText)
    laneLayer.append(lane)

    laneNodes.get(repo).forEach((node, rowIndex) => {
      const y = TOP + 26 + rowIndex * ROW_GAP
      positions.set(node.id, { x, y, repo })
      drawNode(nodeLayer, {
        x,
        y,
        title: routeNodeTitle(node),
        meta: node.id === state.selectedSource ? `${label} focus` : label,
        kind: node.id === state.selectedSource ? 'source' : 'route',
        repo,
        link: links.find((link) => link.source === node.id || link.target === node.id),
      })
    })
  })

  if (links.length === 0) {
    const empty = createSvg('text', { x: ROUTE_LEFT + ROUTE_LANE_WIDTH + ROUTE_LANE_GAP, y: TOP + 62 })
    empty.textContent = 'No connected routes match the current filters.'
    elements.graph.append(empty)
    return
  }

  for (const link of links) {
    const start = positions.get(link.source)
    const end = positions.get(link.target)
    if (!start || !end) continue
    const startX = start.x + ROUTE_LANE_WIDTH
    const startY = start.y + NODE_HEIGHT / 2
    const endX = end.x
    const endY = end.y + NODE_HEIGHT / 2
    const midX = startX + (endX - startX) * 0.5
    const path = createSvg('path', {
      class: 'link-edge',
      'data-kind': link.kind,
      'data-repo': link.targetRepo || link.sourceRepo || 'external',
      d: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
      'marker-end': 'url(#link-arrow)',
    })
    path.addEventListener('click', () => setInspector(link))
    edgeLayer.append(path)
  }
}

function renderTable(links) {
  elements.edgeBody.replaceChildren()
  for (const link of links) {
    const row = document.createElement('tr')
    row.className = 'link-edge-row'
    row.addEventListener('click', () => setInspector(link))

    const kind = document.createElement('td')
    const badge = document.createElement('span')
    badge.className = 'link-kind-badge'
    badge.dataset.kind = link.kind
    badge.textContent = kindLabel(link.kind)
    kind.append(badge)
    row.append(kind)

    for (const value of [link.sourceRoute || link.source, `${repoLabel(link.targetRepo)} · ${link.targetRoute || targetLabel(link)}`, link.href]) {
      const cell = document.createElement('td')
      cell.textContent = value
      if (value === link.href) cell.style.overflowWrap = 'anywhere'
      row.append(cell)
    }
    if (link.count > 1) {
      row.lastElementChild.textContent = `${link.href} (${link.count} occurrences)`
    }
    elements.edgeBody.append(row)
  }
}

function render() {
  const links = state.mode === 'route' ? routeLinksForFocus() : linksForSource()
  elements.visibleCount.textContent = String(links.length)
  elements.status.hidden = true
  if (state.mode === 'route') renderRouteGraph(links)
  else renderGraph(links)
  renderTable(links)
  if (!links.includes(state.selectedLink)) setInspector(links[0] || null)
}

function populateFocusSelect() {
  elements.sourceSelect.replaceChildren()
  const options = state.mode === 'route'
    ? routeFocusOptions().map((node) => ({ value: node.id, label: `${repoLabel(node.repo)} · ${node.route}` }))
    : state.inventory.pages.map((page) => ({ value: page, label: labelForPage(page) }))
  for (const optionData of options) {
    const option = document.createElement('option')
    option.value = optionData.value
    option.textContent = optionData.label
    elements.sourceSelect.append(option)
  }
  if (!options.some((option) => option.value === state.selectedSource)) {
    state.selectedSource = state.mode === 'route'
      ? routeNodeId('medtech', '/')
      : state.inventory.pages.includes('medtech:index.html') ? 'medtech:index.html' : state.inventory.pages[0]
  }
  elements.sourceSelect.value = state.selectedSource
}

function setMode(mode) {
  state.mode = mode
  state.selectedLink = null
  state.selectedSource = mode === 'route'
    ? routeNodeId('medtech', '/')
    : state.inventory.pages.includes('medtech:index.html') ? 'medtech:index.html' : state.inventory.pages[0]
  elements.direction.disabled = mode !== 'route'
  populateFocusSelect()
  render()
}

function syncUrl() {
  const params = new URLSearchParams(window.location.search)
  params.set('mode', state.mode)
  params.set('focus', state.selectedSource)
  if (state.mode === 'route') params.set('direction', elements.direction.value)
  else params.delete('direction')
  const next = `${window.location.pathname}?${params.toString()}`
  window.history.replaceState(null, '', next)
}

async function initialize() {
  try {
    const response = await fetch('/link-inventory.json')
    if (!response.ok) throw new Error('The link inventory JSON has not been generated.')
    state.inventory = await response.json()
    const params = new URLSearchParams(window.location.search)
    state.mode = params.get('mode') === 'route' ? 'route' : 'source'
    elements.viewMode.value = state.mode
    elements.direction.value = ['incoming', 'outgoing', 'all'].includes(params.get('direction')) ? params.get('direction') : 'outgoing'
    state.selectedSource = params.get('focus') || (state.mode === 'route'
      ? routeNodeId('medtech', '/')
      : state.inventory.pages.includes('medtech:index.html') ? 'medtech:index.html' : state.inventory.pages[0])
    populateFocusSelect()

    elements.pageCount.textContent = String(state.inventory.pages.length)
    elements.edgeCount.textContent = String(state.inventory.linkCount)
    elements.direction.disabled = state.mode !== 'route'
    elements.viewMode.addEventListener('change', () => {
      setMode(elements.viewMode.value)
      syncUrl()
    })
    elements.sourceSelect.addEventListener('change', () => {
      state.selectedSource = elements.sourceSelect.value
      setInspector(null)
      render()
      syncUrl()
    })
    elements.direction.addEventListener('change', () => {
      render()
      syncUrl()
    })
    elements.search.addEventListener('input', render)
    for (const input of elements.kindToggles) input.addEventListener('change', render)
    for (const input of elements.repoToggles) input.addEventListener('change', render)
    render()
    window.__bmoreMedTechLinkInventory = {
      ready: true,
      pages: state.inventory.pages.length,
      links: state.inventory.linkCount,
    }
  } catch (error) {
    elements.status.textContent = error instanceof Error ? error.message : 'The link inventory could not be loaded.'
    elements.status.classList.add('is-error')
    window.__bmoreMedTechLinkInventory = { ready: false, error: elements.status.textContent }
  }
}

initialize()
