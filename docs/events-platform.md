# Events through OrgPortal

MedTech already uses OrgPortal in the live deployment. OrgPortal is not vendored
in this checkout; the active local deployment checkout is
`../CodeCollective/portal`.

OrgPortal owns event providers, updates, collaborators, authorization, branding
application, previews, and operation auditing. MedTech's former event CLI,
provider registry, and external-provider adapter have been removed. Use the
existing portal for event administration. Shared event changes belong in
OrgPortal.

See `../CodeCollective/portal/docs/deployment/EVENTS_MCP.md` for MCP tools,
configuration, and verification. The presence of local code does not establish
which MCP features are enabled in the live deployment.

## Portal-owned events

The live portal-owned formational event is `medtech-formational-event`,
scheduled for September 29, 2026, 6:00-8:30 p.m. America/New_York.

For new portal-owned events, use OrgPortal's native MCP event tools:
`preview_org_event_changes`, then `apply_org_event_changes` with the returned
`previewId` and `confirm: true` after approval. Do not restore a MedTech-specific
provider client as a fallback.

`applyBranding` uses the portal's approved MedTech branding configuration.
OrgPortal accepts an already uploaded cover URL, not `coverFile`; upload and
approve assets through the portal/provider administration workflow before
setting shared branding configuration.

## Public MedTech views

The calendar and map continue to consume the existing Code Collective public
event feed. Medical relevance filtering, image presentation, and map rendering
are MedTech presentation concerns; they do not store or administer events.
