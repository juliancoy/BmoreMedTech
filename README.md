# Baltimore MedTech

MedTech's public site contains medical datasets, taxonomy and strategy views,
and medical event discovery. Organization services in the live deployment are
provided by [OrgPortal](https://github.com/juliancoy/OrgPortal). The active
local deployment checkout is `../CodeCollective/portal`; this repository no
longer vendors OrgPortal as a submodule.

```sh
npm ci
npm run build
npm run dev
```

The static site builds independently of OrgPortal's services. Shared portal work
belongs in `../CodeCollective/portal` or upstream OrgPortal, and production
portal deployment is handled through the CodeCollective deployment flow.

## Ownership

| Capability | Owner |
| --- | --- |
| Organizations, membership, identity, permissions, governance, chat, personal calendars, and event administration/provider integrations | OrgPortal and its services |
| Medical datasets and APIs, clinical taxonomy, workforce/strategy analysis, branding, and medical filtering/presentation of the public event feed | MedTech |
| MedTech static build and local site/Selenium harness | MedTech |

Reuse the existing portal for shared capabilities. Implement shared behavior in
OrgPortal/CodeCollective; do not copy its services or build another provider
adapter here.

See [event administration and draft migration](docs/events-platform.md).
