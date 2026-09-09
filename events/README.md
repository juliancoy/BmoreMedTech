# Formational event change plan

`baltimore-medtech-formational-2026-09-29.json` prepares a change to the existing
Luma event `evt-HcIBdMOolELnKgY`, not a duplicate creation. Read-only verification
found it in calendar `cal-eYi1l5x4I4xigDE` (Baltimore MedTech), currently on
September 17, 2026, 6–8:30 p.m. Eastern.

The proposed date is September 29, 2026 at the same local time. The tint
`#0f6f8f` comes from `assets/styles.css`; configure the approved cover from the
homepage's `baltimore-medtech-social-preview-v2.jpg` social image, available in
`assets/data/assets/images/`. The draft uses OrgPortal's `applyBranding` setting,
not a local file upload or MedTech-specific adapter. No separate
branding page was found in this repository; verify any newer brand guide before
execution. Do not substitute the square favicon for the landscape cover.

**Palava Hut remains pending.** The previous plan included an unverified public
contact address. It has been removed so executing the date/branding plan cannot
grant permissions to an assumed Luma account. Resolve the exact account email
before adding a host with the user-approved access level and visibility.

The draft uses OrgPortal's shared event-plan format. Replace the placeholder
organization ID with the verified database ID before requesting a preview.
This plan has not been executed. The public OrgPortal MCP routes returned HTTP
501 (`Endpoint is not implemented in the Cloudflare org worker`) during this
task. The connected Luma tools expose reads only. Connect the deployed,
authenticated OrgPortal MCP server before attempting the user's requested MCP
write; a stored draft is not evidence that an MCP write occurred.

For MCP, upload the approved cover through Luma's supported image API first,
then use its returned CDN URL in the organization's approved branding config.
Resolve the native organization database ID, call `preview_event_changes`,
inspect the preview, and call `apply_event_changes` with the same proposal,
`confirm: true`, and the returned one-use `previewId`. Inspect uncertain results
before retrying. Follow OrgPortal's deployment handoff for configuration details.
