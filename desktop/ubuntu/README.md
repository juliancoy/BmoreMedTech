# OrgPortal desktop app

The LifeTech desktop package is retired. The only maintained desktop app lives
in [OrgPortal](../../../OrgPortal/desktop/ubuntu/README.md). It opens the same
LifeTech website and keeps its existing layout and community features.

From the workspace, install its development dependencies with
`npm ci --prefix ../OrgPortal/desktop/ubuntu` (from this repository).
The existing `npm run dev:ubuntu` and `npm run build:ubuntu` commands delegate
to that app; there is no second desktop implementation here.

Existing users can choose the OrgPortal download from the migration notice in
LifeTech. Installing the replacement through apt prompts before removing the
old `lifetech` package. Saved LifeTech profiles are kept; no uninstall is forced.
