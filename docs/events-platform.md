# Events through OrgPortal

MedTech already uses OrgPortal in the live deployment. The pinned
[`OrgPortal` submodule](../OrgPortal) makes that shared implementation available
in this checkout; it does not create a separate portal deployment.

OrgPortal owns event providers, updates, collaborators, authorization, branding
application, previews, and operation auditing. MedTech's former event CLI,
provider registry, and Luma adapter have been removed. Use the existing portal
for event administration. Shared event changes belong in OrgPortal.

See [OrgPortal's event integration documentation](../OrgPortal/docs/deployment/EVENTS_MCP.md)
for its MCP tools, configuration, and verification. The presence of that code
does not establish which MCP features are enabled in the live deployment.

## Formational event draft

[`events/baltimore-medtech-formational-2026-09-29.json`](../events/baltimore-medtech-formational-2026-09-29.json)
now uses OrgPortal's event-plan format for `preview_event_changes`. Replace
`MEDTECH_ORGANIZATION_DATABASE_ID` with the existing MedTech organization's
database ID. The proposed schedule remains September 29, 2026, 6–8:30 p.m.
America/New_York; verify it against the live event.

If the shared MCP integration is enabled, submit this draft to
`preview_event_changes`, review the result, then use `apply_event_changes` with
the same changes, the returned `previewId`, and `confirm: true` after approval.
Otherwise, administer the event through the existing portal. Do not restore a
MedTech-specific provider client as a fallback.

`applyBranding` uses the portal's approved MedTech branding configuration.
The proposed local cover remains
[`assets/images/baltimore-medtech-social-preview.png`](../assets/images/baltimore-medtech-social-preview.png).
OrgPortal accepts an already uploaded cover URL, not `coverFile`; upload and
approve the asset through the provider's administration workflow before setting
the shared branding configuration. This draft does not perform that upload.

The old draft proposed Palava Hut as a visible manager using
`daniel.kai@palavahut.co`. That address has not been verified as the intended
Luma account, so it is retained here as a pending detail rather than an executable
invitation. Once verified, use OrgPortal's `collaborator` field with the agreed
email, `accessLevel`, and `isVisible` values.

## Public MedTech views

The calendar and map continue to consume the existing Code Collective public
event feed. Medical relevance filtering, image presentation, and map rendering
are MedTech presentation concerns; they do not store or administer events.
