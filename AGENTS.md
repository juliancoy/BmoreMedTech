# Shared functionality

MedTech already uses OrgPortal in production. OrgPortal is not vendored in this
checkout; use the sibling checkout at `../OrgPortal` for the current shared
implementation.

OrgPortal owns organization, membership, domain authorization, governance,
chat, personal calendars, event administration, and event provider integrations.
Use the existing portal interfaces for those capabilities. Do not implement a
parallel service, copy an adapter, or bypass the portal's permission and preview
flows in MedTech. Shared changes belong upstream in OrgPortal, followed by a
CodeCollective deployment when the shared portal bundle needs to be released.

PIdP (`../pidp`) owns credentials, social sign-in, authentication sessions, core
identity profiles, reusable account-security UI, and OAuth consent/tokens.
OrgPortal owns tenant branding, sign-in entry points, member profiles, and
application routing, integrating PIdP rather than duplicating identity logic.
Preserve portal account namespaces; do not substitute owner login for member
login. Authentication and OAuth scopes never replace OrgPortal membership,
permission checks, or preview/apply receipts. See both upstream READMEs for the
account boundary and the browser-bound portal/MCP login handoff.

MedTech owns medical datasets and their API, taxonomy/strategy analysis,
branding, and medical presentation/filtering of the existing public event feed.
Its static-site build and local regression harness remain local tooling.

See `README.md` and `docs/events-platform.md` for the ownership boundary and
event workflow. Deploying MedTech from this repository must not deploy
OrgPortal, CodeCollective, PIdP, or chat; use the CodeCollective checkout for
the shared portal release path.
