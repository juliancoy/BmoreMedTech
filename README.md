# Baltimore MedTech

MedTech's public site contains medical datasets, taxonomy and strategy views,
and medical event discovery. Organization services in the live deployment are
provided by [OrgPortal](https://github.com/juliancoy/OrgPortal). The active
local deployment checkout is `../OrgPortal`; this repository no
longer vendors OrgPortal as a submodule.

```sh
npm ci
npm run build
npm run dev
```

## Link Inventory

The repository intentionally does not generate an exhaustive click-through
hierarchy. Static pages, in-page anchors, runtime-populated dataset links,
portal handoffs, and map share URLs do not form a useful complete tree.

Use the bounded link inventory check instead:

```sh
npm run test:links
node scripts/validate-link-inventory.mjs --json
```

The check verifies checked-in HTML links, same-page and cross-page anchors,
known external handoffs, and the small set of runtime-populated placeholder
links.

The static site builds independently of OrgPortal's services. Shared portal work
belongs in `../OrgPortal`, and production
portal deployment is handled through the CodeCollective deployment flow.

## Deployment

Deploying this repository only publishes the Baltimore MedTech static
site/Worker at `medtech.social`:

```sh
./deploy.sh
```

This deploy path intentionally does not deploy OrgPortal, PIdP, chat, or the
CodeCollective site bundle. Deploy shared portal changes from the CodeCollective
repository so there is one OrgPortal production release path.

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
