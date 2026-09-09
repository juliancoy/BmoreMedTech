# Historical formational event draft

`baltimore-medtech-formational-2026-09-29.json` prepares a change to the existing
external event record `evt-HcIBdMOolELnKgY`, not a duplicate creation. This file
is retained as historical planning context now that Baltimore MedTech events are
owned by OrgPortal.

The proposed date is September 29, 2026 at the same local time. The tint
`#0f6f8f` comes from `assets/styles.css`; configure approved covers and event
branding through OrgPortal, not a MedTech-specific adapter. No separate branding
page was found in this repository; verify any newer brand guide before execution.
Do not substitute the square favicon for a landscape cover.

**Palava Hut remains pending as collaborator metadata.** Resolve the exact
account email before adding a host with the user-approved access level and
visibility in OrgPortal.

The draft uses OrgPortal's shared event-plan format. Replace the placeholder
organization ID with the verified database ID before requesting a preview.
This local draft is not evidence that a portal write occurred. Use the deployed,
authenticated OrgPortal MCP server for event changes.

For MCP, resolve the native organization database ID, call
`preview_org_event_changes`, inspect the preview, and call
`apply_org_event_changes` with the returned one-use `previewId` and
`confirm: true`. Inspect uncertain results before retrying. Follow OrgPortal's
deployment handoff for configuration details.
