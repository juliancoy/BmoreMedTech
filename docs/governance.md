# Robert's Rules of Order

Open **Events → Robert’s Rules of Order**, or `/governance/roberts`, to use
OrgPortal's existing shared motion workflow. OrgPortal owns the pages and API;
LifeTech provides navigation and proxies requests using its existing portal and
organization API interfaces. Both `/api/governance` (the Robert's Rules pages)
and `/api/org/api/governance` (general governance) reach the shared org Worker.

The existing system supports proposing and seconding motions, discussion,
amendments, voting, quorum results, tabling, and withdrawal. It is a shared
governance workflow, not a separate LifeTech meeting or tenant-private motion
database. The current shared governance API does not filter motions by tenant.

## Earlier implementation

CodeCollective added the motion domain and state machine in `6529de1b`, UI
pages in `d81dd173`, and the original FastAPI backend in `c773e627`. These were
merged in `ce3686c7` on March 29, 2026. OrgPortal's initial import (`e411d9e`)
and later governance changes (`cb72be7`, `4fe805d`, `f872eb9`) retain and extend
that implementation. The current production API implementation lives in
`../OrgPortal/org-worker/src/index.ts`; do not revive the old backend in LifeTech.

This repository's navigation and proxy changes need only a LifeTech static
site/Worker release. Changes to motion rules, permissions, or storage belong in
OrgPortal and use CodeCollective's shared release path.
