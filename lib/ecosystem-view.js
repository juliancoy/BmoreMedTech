import { categories, semantics, safeUrl } from './ecosystem.js'
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const e = escapeHtml
export const evidenceLink = (url, label = 'View source ↗') => safeUrl(url) ? `<a href="${e(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : '<span>Source not supplied</span>'
export function orgDetails(org, data) {
  const relations = data.relationships.filter(r => r.source === org.id || r.target === org.id)
  const money = data.financing.filter(f => f.funderId === org.id || f.recipientId === org.id)
  const dashboard = data.dashboard.find(d => d.organizationId === org.id)
  return `<p class="eco-eyebrow">${e(categories[org.category])}</p><h2>${e(org.name)}</h2><p>${e(org.type)}</p>
  <p>${e(org.relevance || 'Included in the documented funding network; proximity has not been scored.')}</p>
  <p><strong>LifeTech proximity:</strong> ${org.proximity == null ? 'Not scored' : `${org.proximity}/100`}</p>
  ${dashboard ? `<p><strong>Dashboard contribution:</strong> ${e(dashboard.contribution)}</p>` : ''}
  <p>${org.website ? evidenceLink(org.website, 'Organization website ↗') : 'Website not listed'}</p>
  ${org.publicEmails.map(email => `<p><a href="mailto:${e(email)}">${e(email)}</a></p>`).join('')}
  <h3>Documented relationships <span>${relations.length}</span></h3>
  ${relations.length ? `<ul class="eco-relations">${relations.map(r => `<li><strong>${e(r.sourceLabel)} → ${e(r.targetLabel)}</strong><span>${e(r.type)}${r.amountLabel ? ` · ${e(r.amountLabel)}` : ''}</span><small>${e(semantics[r.kind] || r.relationship)}${r.date ? ` · ${e(r.date)}` : ''}</small><p>${e(r.notes || r.description)}</p>${evidenceLink(r.sourceUrl)}<small>${e(r.evidence)} · ${e(r.provenance.sheet)}${r.provenance.row ? `, row ${r.provenance.row}` : ''}</small></li>`).join('')}</ul>` : '<p>No relationship recorded. This does not mean none exists.</p>'}
  <h3>Financing & money flows <span>${money.length}</span></h3>
  ${money.length ? `<ul class="eco-relations">${money.map(f => `<li><strong>${e(f.funder)} → ${e(f.recipient)}</strong><span>${e(f.amountLabel)} · ${e(f.type)}</span><small>${e(semantics[f.kind])} · ${e(f.date)}</small><p>${e(f.notes)}</p>${evidenceLink(f.sourceUrl)}<small>${e(f.evidence)} · Financing & Money Flows, row ${f.provenance.row}</small></li>`).join('')}</ul>` : '<p>No separate financing record supplied.</p>'}
  <p class="eco-note">Source: LifeTech Associates${org.sourceRows.length ? `, directory rows ${org.sourceRows.join(', ')}` : ', Funding Network'}. Personal contact columns are withheld; only matching organization role mailboxes are published.</p>`
}
export function relationshipTable(data) {
 return `<div class="eco-table-scroll"><table class="eco-table"><caption>All source relationships, including program terms and aggregate scopes</caption><thead><tr><th scope="col">Source → recipient / scope</th><th scope="col">Relationship</th><th scope="col">Amount / meaning</th><th scope="col">Evidence</th></tr></thead><tbody>${data.relationships.map(r=>`<tr data-source="${e(r.source || '')}" data-target="${e(r.target || '')}" data-kind="${e(r.kind || r.relationship)}" data-relationship="${e(r.relationship)}"><td>${e(r.sourceLabel)}<br>→ ${e(r.targetLabel)}</td><td>${e(r.type)}<small>${e(r.date)}</small></td><td>${e(r.amountLabel || '—')}<small>${e(semantics[r.kind] || r.relationship)}</small>${r.notes ? `<small>${e(r.notes)}</small>` : ''}</td><td>${evidenceLink(r.sourceUrl)}<small>${e(r.evidence)}</small><small>${e(r.provenance.sheet)}${r.provenance.row ? ` · row ${r.provenance.row}` : ''}</small></td></tr>`).join('')}</tbody></table></div>`
}
export function financingTable(data) {
 return `<div class="eco-table-scroll"><table class="eco-table"><caption>Financing & Money Flows — separate source records, not an additive transaction ledger</caption><thead><tr><th scope="col">Funder → recipient / vehicle</th><th scope="col">Amount / classification</th><th scope="col">Period & scope</th><th scope="col">Evidence & caveats</th></tr></thead><tbody>${data.financing.map(f=>`<tr><td>${e(f.funder)}<br>→ ${e(f.recipient)}</td><td><strong>${e(f.amountLabel)}</strong><small>${e(semantics[f.kind])}</small><small>${e(f.type)}</small></td><td>${e(f.date)}<small>${e(f.scope)}</small></td><td>${evidenceLink(f.sourceUrl)}<small>${e(f.evidence)} · row ${f.provenance.row}</small><small>${e(f.notes)}</small></td></tr>`).join('')}</tbody></table></div>`
}
