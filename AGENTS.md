# Shared functionality

MedTech already uses OrgPortal in production. OrgPortal is not vendored in this
checkout; use the sibling checkout at `../OrgPortal` for the current shared
implementation.

OrgPortal owns organization, membership, identity, authorization, governance,
chat, personal calendars, event administration, and event provider integrations.
Use the existing portal interfaces for those capabilities. Do not implement a
parallel service, copy an adapter, or bypass the portal's permission and preview
flows in MedTech. Shared changes belong upstream in OrgPortal, followed by a
CodeCollective deployment when the shared portal bundle needs to be released.

MedTech owns medical datasets and their API, taxonomy/strategy analysis,
branding, and medical presentation/filtering of the existing public event feed.
Its static-site build and local regression harness remain local tooling.

See `README.md` and `docs/events-platform.md` for the ownership boundary and
event workflow. Deploying MedTech does not deploy the portal unless the
CodeCollective deploy wrapper is explicitly run.
