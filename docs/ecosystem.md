# LifeTech ecosystem

MedTech owns `/ecosystem` and `/ecosystem/network`. They are Vite multi-page
HTML assets, routed explicitly by the existing Worker. OrgPortal/PIdP and their
APIs, roles, sessions and deployments are unchanged.

## Source and publication

`npm run sync:ecosystem` reads the four fixed public LifeTech Associates tabs
on the build machine using Google CSV exports. The export preserves blank rows
so evidence row numbers match the source. It validates expected headers and
writes only normalized allowlisted fields to `assets/data/ecosystem.json`.
No Google credentials are required or shipped. There is no browser-to-Google
request, generic sheet proxy, source-workbook download or client-selectable URL.
Do not commit raw exports: they include personal contacts and relationship status.

The existing deployment workflow refreshes the snapshot before building and
fails closed if the source is unavailable or malformed. The normal local build
uses the checked-in snapshot for repeatability; `npm run sync:ecosystem` refreshes
it explicitly. The deployed snapshot date is visible. Sheet edits appear on the
next deployment, not instantly. `npm run build:ecosystem` renders the full
organization directory and complete evidence tables before Vite runs.

Only organization role mailboxes matching the organization's website domain are
published. Named contact columns and personal addresses are withheld because
publication permission and accuracy cannot be inferred for every contact.
Do not broaden publication automatically when the sheet gains new columns.

## Identity and financing

`lib/ecosystem-registry.json` is the persistent identity/alias registry. Keep IDs
when labels change; add aliases there. Distinct funds, programs and their parent
institutions retain distinct IDs. In particular, JHTV, FastForward, Pava and
Hexcite are not merged; UMB/UM Ventures has one explicit directory identity while
The GRID remains a distinct program. Unknown new organizations receive an initial
slug ID; register that ID before renaming them. Duplicate directory rows merge
without inheriting a later category from another section.

Directory section labels remain in `sourceCategory`; the UI additionally maps
entries to six browsing classes. Dashboard contributions are a separate array.
Financing records remain separate from Funding Network relationships. Matching
by source, amount and organization attaches evidence rather than summing records.

Five financial meanings are retained: documented funding/awards, per-company
terms, fund capitalization, portfolio aggregates and co-investment aggregates.
Awards and commitments are not necessarily cash disbursements. Amounts can overlap
and are never totaled. An unnamed portfolio, generic cohort company or collective
funding source has a null organization endpoint; its exact label and full edge
remain in the table. Such a scope is never invented as a company or assigned to
one investor. Directory affiliation edges cite the relevant program website.

## Interaction and accessibility

D3 force/link/collision layout clusters nodes by class. Three.js renders spheres,
curved funding tubes and directional arrows; OrbitControls handles pan, zoom and
orbit, and raycasting implements pointer selection. Labels are real keyboard
buttons, prioritized to avoid collisions. Proximity controls node size; a log
scale controls disclosed funding width. Selection can isolate one-hop neighbors.
Capitalization is opt-in; aggregate/program scopes remain in the table.

Search covers every organization, including labels hidden for readability.
The directory and both evidence tables are pre-rendered without JavaScript.
WebGL failure preserves search/details and the table. No continuous physics or
animation loop runs after layout; redraw happens only on interaction/resize.

## Verification

- `npm run test:ecosystem`: normalization, explicit alias identity, privacy,
  escaping, finance semantics, CSV edge cases, Worker routes/HEAD/404, static HTML.
- `npm run build`: all existing data/event/link tests plus ecosystem tests and Vite.
- `npm run deploy:dry-run`: Worker/assets packaging.
- No lint or TypeScript command was configured in this JavaScript repository.
  New JavaScript modules are syntax checked with `node --check`.
- Use the normal GitHub main deployment or `npm run deploy` with existing
  Cloudflare credentials. Do not deploy shared OrgPortal services here.

The existing Docker/Selenium harness cannot start in the Work container (Docker
and Selenium Python dependencies are absent). Deployment browser verification
uses Work's browser instead; this is not a passing Selenium result.
