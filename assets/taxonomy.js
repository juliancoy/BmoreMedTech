const DATA_URL = '/medtech-index.json';
const DATABASES_URL = '/taxonomy-databases.json';

const elements = {
  database: document.getElementById('taxonomy-database'),
  search: document.getElementById('taxonomy-search'),
  bodyPart: document.getElementById('taxonomy-body-part'),
  clear: document.getElementById('taxonomy-clear'),
  total: document.getElementById('taxonomy-total'),
  sourceName: document.getElementById('taxonomy-source-name'),
  sourceDescription: document.getElementById('taxonomy-source-description'),
  sourceSteward: document.getElementById('taxonomy-source-steward'),
  sourceLink: document.getElementById('taxonomy-source-link'),
  status: document.getElementById('taxonomy-status'),
  map: document.getElementById('taxonomy-map'),
  resultCount: document.getElementById('taxonomy-result-count'),
  inspector: document.getElementById('taxonomy-inspector'),
  inspectorTitle: document.getElementById('taxonomy-inspector-title'),
  inspectorSummary: document.getElementById('taxonomy-inspector-summary'),
  inspectorContent: document.getElementById('taxonomy-inspector-content'),
};

const state = {
  records: [],
  databases: [],
  selectedDatabase: 'medtech_index',
  selectedRecord: null,
};

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function selectedDatabase() {
  return state.databases.find(({ id }) => id === state.selectedDatabase) || state.databases[0];
}

function sourceGroups(record, databaseId) {
  if (databaseId === 'medtech_index') return [record.scientific_lineage[0]];
  return record.source_lenses?.[databaseId] || [];
}

function availableRecords() {
  if (state.selectedDatabase === 'medtech_index') return state.records;
  return state.records.filter((record) => sourceGroups(record, state.selectedDatabase).length > 0);
}

function matchesFilters(record) {
  const query = elements.search.value.trim().toLocaleLowerCase();
  const bodyPart = elements.bodyPart.value;
  if (bodyPart && !record.body_parts.includes(bodyPart)) return false;
  if (!query) return true;

  const searchable = [
    record.name,
    ...record.scientific_lineage,
    ...record.body_parts,
    ...record.subdisciplines,
    ...record.tags,
    ...Object.values(record.source_lenses || {}).flat(),
  ].join(' ').toLocaleLowerCase();
  return searchable.includes(query);
}

function syncUrl() {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  if (state.selectedDatabase === 'medtech_index') params.delete('framework');
  else params.set('framework', state.selectedDatabase);
  if (elements.search.value.trim()) params.set('q', elements.search.value.trim());
  else params.delete('q');
  if (elements.bodyPart.value) params.set('body', elements.bodyPart.value);
  else params.delete('body');
  if (state.selectedRecord) params.set('field', state.selectedRecord);
  else params.delete('field');
  window.history.replaceState(null, '', url);
}

function publishDiagnostics(overrides = {}) {
  window.__bmoreMedTechTaxonomyState = {
    ...(window.__bmoreMedTechTaxonomyState || {}),
    selectedRecord: state.selectedRecord,
    ...overrides,
  };
}

function updateSourcePanel() {
  const database = selectedDatabase();
  elements.sourceName.textContent = database.name;
  elements.sourceDescription.textContent = database.description;
  elements.sourceSteward.textContent = database.steward;
  elements.sourceLink.href = database.source_url;
  elements.sourceLink.textContent = database.source_label;
  elements.sourceLink.toggleAttribute('download', database.id === 'medtech_index');
  elements.sourceLink.target = database.id === 'medtech_index' ? '' : '_blank';
  elements.sourceLink.rel = database.id === 'medtech_index' ? '' : 'noreferrer';
}

function renderTagList(container, values, emptyLabel = 'None listed') {
  const list = createElement('div', 'taxonomy-tag-list');
  if (!values.length) {
    list.append(createElement('span', 'taxonomy-empty-tag', emptyLabel));
  } else {
    for (const value of values) list.append(createElement('span', 'taxonomy-tag', value));
  }
  container.append(list);
}

function relatedDisciplineList(ids) {
  const list = createElement('div', 'taxonomy-related-list');
  if (!ids.length) {
    list.append(createElement('span', 'taxonomy-empty-tag', 'None listed'));
    return list;
  }
  for (const id of ids) {
    const record = state.records.find((item) => item.id === id);
    if (!record) continue;
    const button = createElement('button', 'taxonomy-related', record.name);
    button.type = 'button';
    button.addEventListener('click', () => focusRecord(record.id, true));
    list.append(button);
  }
  return list;
}

function inspectorSection(title) {
  const section = createElement('section', 'taxonomy-inspector-section');
  section.append(createElement('h3', '', title));
  elements.inspectorContent.append(section);
  return section;
}

function renderInspector(record) {
  elements.inspectorTitle.textContent = record.name;
  elements.inspectorSummary.textContent = record.scientific_lineage.join(' → ');
  elements.inspectorContent.replaceChildren();

  renderTagList(inspectorSection('Body parts and biological scale'), record.body_parts, 'Not anatomy-specific');
  renderTagList(inspectorSection('Tags'), record.tags);

  const relationships = inspectorSection('Discipline relationships');
  relationships.append(createElement('h4', '', 'Parents'));
  relationships.append(relatedDisciplineList(record.parent_disciplines));
  relationships.append(createElement('h4', '', 'Children / subdisciplines'));
  relationships.append(relatedDisciplineList(record.child_disciplines));

  const crosswalk = inspectorSection('Framework crosswalk');
  for (const database of state.databases.filter(({ id }) => id !== 'medtech_index')) {
    const values = record.source_lenses?.[database.id];
    if (!values?.length) continue;
    const row = createElement('div', 'taxonomy-crosswalk-row');
    row.append(createElement('strong', '', database.name));
    renderTagList(row, values);
    crosswalk.append(row);
  }
}

function focusRecord(id, scrollIntoView = false) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  state.selectedRecord = id;
  renderInspector(record);
  for (const node of elements.map.querySelectorAll('.taxonomy-node')) {
    node.classList.toggle('is-selected', node.dataset.recordId === id);
  }
  publishDiagnostics();
  syncUrl();
  if (scrollIntoView) {
    const node = elements.map.querySelector(`[data-record-id="${CSS.escape(id)}"]`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    elements.inspector.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function groupRecords(records) {
  const groups = new Map();
  for (const record of records) {
    for (const groupName of sourceGroups(record, state.selectedDatabase)) {
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName).push(record);
    }
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function renderMap() {
  const available = availableRecords();
  const visible = available.filter(matchesFilters);
  const groups = groupRecords(visible);
  elements.map.replaceChildren();
  elements.status.hidden = true;
  elements.map.hidden = false;
  elements.resultCount.textContent = `${visible.length} of ${available.length} fields shown`;

  if (!visible.length) {
    const empty = createElement('div', 'taxonomy-empty');
    empty.append(createElement('strong', '', 'No fields match these filters.'));
    empty.append(createElement('p', '', 'Try a broader search or clear the body-part filter.'));
    elements.map.append(empty);
    syncUrl();
    return;
  }

  groups.forEach(([groupName, records], groupIndex) => {
    const group = createElement('section', 'taxonomy-cluster');
    group.style.setProperty('--cluster-index', groupIndex);
    const heading = createElement('div', 'taxonomy-cluster-heading');
    heading.append(createElement('h3', '', groupName));
    heading.append(createElement('span', '', String(records.length)));
    group.append(heading);

    const nodes = createElement('div', 'taxonomy-node-cloud');
    records.sort((left, right) => left.name.localeCompare(right.name));
    for (const record of records) {
      const button = createElement('button', 'taxonomy-node', record.name);
      button.type = 'button';
      button.dataset.recordId = record.id;
      button.title = `${record.name} — ${record.scientific_lineage.join(' / ')}`;
      button.classList.toggle('has-children', record.child_disciplines.length > 0);
      button.classList.toggle('is-selected', record.id === state.selectedRecord);
      button.addEventListener('click', () => focusRecord(record.id));
      nodes.append(button);
    }
    group.append(nodes);
    elements.map.append(group);
  });
  syncUrl();
  publishDiagnostics({
    database: state.selectedDatabase,
    totalRecords: state.records.length,
    availableRecords: available.length,
    visibleRecords: visible.length,
    groups: groups.map(([name, records]) => ({ name, count: records.length })),
  });
}

function populateControls() {
  for (const database of state.databases) {
    const option = new Option(database.name, database.id);
    elements.database.add(option);
  }

  const parts = [...new Set(state.records.flatMap(({ body_parts }) => body_parts))].sort();
  for (const part of parts) elements.bodyPart.add(new Option(part, part));

  const params = new URLSearchParams(window.location.search);
  const framework = params.get('framework');
  if (state.databases.some(({ id }) => id === framework)) state.selectedDatabase = framework;
  elements.database.value = state.selectedDatabase;
  elements.search.value = params.get('q') || '';
  const body = params.get('body') || '';
  if (parts.includes(body)) elements.bodyPart.value = body;
  const field = params.get('field');
  if (state.records.some(({ id }) => id === field)) state.selectedRecord = field;
}

function bindEvents() {
  elements.database.addEventListener('change', () => {
    state.selectedDatabase = elements.database.value;
    updateSourcePanel();
    renderMap();
  });
  elements.search.addEventListener('input', renderMap);
  elements.bodyPart.addEventListener('change', renderMap);
  elements.clear.addEventListener('click', () => {
    elements.search.value = '';
    elements.bodyPart.value = '';
    renderMap();
    elements.search.focus();
  });
}

async function initialize() {
  try {
    const [recordsResponse, databasesResponse] = await Promise.all([fetch(DATA_URL), fetch(DATABASES_URL)]);
    if (!recordsResponse.ok || !databasesResponse.ok) throw new Error('The taxonomy data could not be loaded.');
    [state.records, state.databases] = await Promise.all([recordsResponse.json(), databasesResponse.json()]);
    elements.total.textContent = state.records.length.toLocaleString();
    populateControls();
    bindEvents();
    updateSourcePanel();
    renderMap();
    if (state.selectedRecord) renderInspector(state.records.find(({ id }) => id === state.selectedRecord));
    window.__bmoreMedTechTaxonomyReady = true;
  } catch (error) {
    elements.status.textContent = error instanceof Error ? error.message : 'The taxonomy data could not be loaded.';
    elements.status.classList.add('is-error');
    window.__bmoreMedTechTaxonomyReady = false;
  }
}

initialize();
