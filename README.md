# LifeTech

LifeTech's public site contains medical datasets, taxonomy and strategy views,
and medical event discovery. Organization services in the live deployment are
provided by [OrgPortal](https://github.com/juliancoy/OrgPortal). The active
local deployment checkout is `../OrgPortal`; this repository no
longer vendors OrgPortal as a submodule.

```sh
npm ci
npm run build
npm run dev
```

For the Docker local stack, `python run.py` defaults to `start`. The full stack
requires the sibling PIdP checkout's `pidp_editme.py` configuration. To run only
the MedTech site and Selenium harness:

```sh
python run.py start --medtech-only
```

Local portal branding comes from OrgPortal's domain registry. Set the registered
tenant hostname with `--tenant-host`, `PORTAL_TENANT_HOST`, or a single line in
`.local/tenant-host` (kept outside Git). The launcher forwards it only for the
portal tenant lookup; OrgPortal remains responsible for branding and permissions.

## Link Inventory

The repository intentionally does not generate an exhaustive click-through
hierarchy. Static pages, in-page anchors, runtime-populated dataset links,
portal handoffs, and map share URLs do not form a useful complete tree.

Use the bounded link inventory check instead:

```sh
npm run test:links
npm run build:links
node scripts/validate-link-inventory.mjs --json
```

The check verifies LifeTech checked-in HTML links, same-page and cross-page
anchors, known external handoffs, and the small set of runtime-populated
placeholder links. The generated visualization also includes bounded link
surfaces from the sibling OrgPortal and PIdP checkouts. Run the site and open
`/clickthrough.html` to visualize `/link-inventory.json` as a source-page graph.

The static site builds independently of OrgPortal's services. Shared portal work
belongs in `../OrgPortal`, and production
portal deployment is handled through the CodeCollective deployment flow.

## Deployment

Deploying this repository only publishes the LifeTech static
site/Worker at `lifetech.fyi`:

```sh
./deploy.sh
```

This deploy path intentionally does not deploy OrgPortal, PIdP, chat, or the
CodeCollective site bundle. Deploy shared portal changes from the CodeCollective
repository so there is one OrgPortal production release path.

## Ownership

| Capability | Owner |
| --- | --- |
| Credentials, social sign-in, sessions, core identity profiles, account security, and OAuth consent/tokens | PIdP, consumed through shared portal interfaces |
| Organizations, membership, domain permissions, member profiles, governance, chat, personal calendars, and event administration/provider integrations including gallery storage | OrgPortal |
| Medical datasets and APIs, clinical taxonomy, workforce/strategy analysis, branding, and medical filtering/presentation of the public event feed | LifeTech |
| LifeTech static build and local site/Selenium harness | LifeTech |

Reuse the existing portal for shared capabilities. Implement shared behavior in
OrgPortal/CodeCollective; do not copy its services or build another provider
adapter here.

OrgPortal owns branded sign-in entry points and application routing; reusable
authentication and account-security behavior belongs in PIdP. Neither an OAuth
grant nor a successful login creates organization membership or event-management
permission. Preserve the existing portal account context, permission checks, and
preview/apply workflow for image uploads. LifeTech must not implement another
login, token issuer, membership service, or event-media store.

See the [OrgPortal account boundary](../OrgPortal/README.md#account-and-service-boundaries)
and [PIdP account boundary](../pidp/README.md#account-boundaries).

See [event administration and draft migration](docs/events-platform.md).

### Separate MedTech and LifeTech sites

The two sites share presentation code here, but use separate static builds and
Cloudflare Workers. OrgPortal still owns each organization's branding, membership,
and permissions; PIdP owns authentication. No accounts or memberships are copied
between organizations by this build.

`sites.json` configures each site's name, canonical origin, original imagery, and
local theme preference key. The default `npm run build` produces MedTech in `dist`;
`npm run build:lifetech` produces LifeTech in `dist-lifetech`. Build both after shared
changes. Deploy MedTech with `npm run deploy`, and LifeTech with
`npm run deploy:lifetech`. The domain assignments live in `wrangler.jsonc`.

A separate LifeTech repository is unnecessary unless the sites need independent
code ownership or release workflows. Their deployments are already separate.
