# Baltimore MedTech

MedTech's public site contains medical datasets, taxonomy and strategy views,
and medical event discovery. Organization services in the live deployment are
provided by [OrgPortal](https://github.com/juliancoy/OrgPortal), pinned here as
the [`OrgPortal/`](OrgPortal) Git submodule.

```sh
git submodule update --init OrgPortal
npm ci
npm run build
npm run dev
```

The static site builds independently of OrgPortal's services. The submodule is
the shared source reference, not a second deployment. Initialize OrgPortal's
nested submodules only when developing services that need them, following its
own documentation.

## Ownership

| Capability | Owner |
| --- | --- |
| Organizations, membership, identity, permissions, governance, chat, personal calendars, and event administration/provider integrations | OrgPortal and its services |
| Medical datasets and APIs, clinical taxonomy, workforce/strategy analysis, branding, and medical filtering/presentation of the public event feed | MedTech |
| MedTech static build and local site/Selenium harness | MedTech |

Reuse the existing portal for shared capabilities. Implement shared behavior in
OrgPortal and update the submodule pin after that change is committed upstream;
do not copy its services or build another provider adapter here.

See [event administration and draft migration](docs/events-platform.md).
