const elements = {
  pageCount: document.getElementById('link-page-count'),
  edgeCount: document.getElementById('link-edge-count'),
  visibleCount: document.getElementById('link-visible-count'),
  sourceSelect: document.getElementById('link-source-select'),
  search: document.getElementById('link-search'),
  kindToggles: [...document.querySelectorAll('.link-kind-toggles input[type="checkbox"]')],
  graph: document.getElementById('link-graph'),
  status: document.getElementById('link-graph-status'),
  inspector: document.getElementById('link-inspector-content'),
  edgeBody: document.getElementById('link-edge-body'),
}

const state = {
  inventory: null,
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

function createSvg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  return node
}

function text(value) {
  return value === null || value === undefined ? '' : String(value)
}

function labelForPage(path) {
  return path === 'index.html' ? 'Home' : path.replace(/\.html$/, '')
}

function targetLabel(link) {
  if (link.kind === 'external-handoff') return link.origin || link.href
  if (link.kind === 'same-page-anchor') return `#${link.fragment}`
  if (link.kind === 'runtime-placeholder') return 'Runtime link'
  return link.fragment ? `${link.target}#${link.fragment}` : link.target
}

function kindLabel(kind) {
  return {
    'internal-page': 'Internal',
    'same-page-anchor': 'Anchor',
    'external-handoff': 'External',
    'runtime-placeholder': 'Runtime',
  }[kind] || kind
}

function selectedKinds() {
  return new Set(elements.kindToggles.filter((input) => input.checked).map((input) => input.value))
}

function linksForSource() {
  if (!state.inventory) return []
  const query = elements.search.value.trim().toLocaleLowerCase()
  const kinds = selectedKinds()
  const matching = state.inventory.links.filter((link) => {
    if (link.source !== state.selectedSource) return false
    if (!kinds.has(link.kind)) return false
    if (!query) return true
    return [link.href, link.source, link.target, link.fragment, link.origin, link.textRole, kindLabel(link.kind)]
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

function setInspector(link) {
  state.selectedLink = link
  elements.inspector.replaceChildren()
  const rows = link
    ? [
        ['Kind', kindLabel(link.kind)],
        ['From', link.source],
        ['To', targetLabel(link)],
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

function drawNode(group, { x, y, title, meta, kind, link }) {
  const node = createSvg('g', {
    class: 'link-node',
    tabindex: '0',
    role: 'button',
    'data-kind': kind,
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
    meta: 'Source page',
    kind: 'source',
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
      d: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
      'marker-end': 'url(#link-arrow)',
    })
    edgeLayer.append(path)
    drawNode(nodeLayer, {
      x: TARGET_X,
      y: targetY,
      title: targetLabel(link),
      meta: `${kindLabel(link.kind)}${link.count > 1 ? ` x${link.count}` : ''}`,
      kind: link.kind,
      link,
    })
  })
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

    for (const value of [link.source, targetLabel(link), link.href]) {
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
  const links = linksForSource()
  elements.visibleCount.textContent = String(links.length)
  elements.status.hidden = true
  renderGraph(links)
  renderTable(links)
  if (!links.includes(state.selectedLink)) setInspector(links[0] || null)
}

async function initialize() {
  try {
    const response = await fetch('/link-inventory.json')
    if (!response.ok) throw new Error('The link inventory JSON has not been generated.')
    state.inventory = await response.json()
    state.selectedSource = state.inventory.pages.includes('index.html') ? 'index.html' : state.inventory.pages[0]

    for (const page of state.inventory.pages) {
      const option = document.createElement('option')
      option.value = page
      option.textContent = page
      elements.sourceSelect.append(option)
    }
    elements.sourceSelect.value = state.selectedSource

    elements.pageCount.textContent = String(state.inventory.pages.length)
    elements.edgeCount.textContent = String(state.inventory.linkCount)
    elements.sourceSelect.addEventListener('change', () => {
      state.selectedSource = elements.sourceSelect.value
      setInspector(null)
      render()
    })
    elements.search.addEventListener('input', render)
    for (const input of elements.kindToggles) input.addEventListener('change', render)
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
