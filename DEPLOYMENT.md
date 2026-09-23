# Deployment Map

This repository is the Baltimore MedTech deployment root. It does not vendor or
directly release the shared portal, identity provider, organization API, or chat
services. Those live in sibling repositories and are deployed through their own
release paths.

## Public Surfaces

| Surface | Production URL | Owning checkout | Deployment path |
| --- | --- | --- | --- |
| MedTech static site and Worker | `https://medtech.social` | `bmoremedtech` | `npm run build`, then `npx wrangler deploy` from this repository |
| Shared portal frontend bundle | `https://codecollective.us/p/` and `https://codecollective.us/__portal_root/` | `../OrgPortal/web`, released by `../CodeCollective` | `../CodeCollective/cloudflare/scripts/build_cloudflare_site.sh`, then `npx wrangler deploy` from `../CodeCollective` |
| MedTech portal routes | `https://medtech.social/branding`, `/org-events`, `/users/login`, etc. | OrgPortal UI, proxied by the MedTech Worker | CodeCollective must first publish the shared portal bundle; MedTech Worker then proxies tenant routes to `__portal_root` |
| OrgPortal organization API | `https://org-codecollective.jcloiacon.workers.dev` | `../OrgPortal/org-worker` | Deploy from `../OrgPortal/org-worker` only when backend/API code or migrations change |
| PIdP identity provider | `https://id.codecollective.us` and serverless proxy | `../pidp` | Deploy from the PIdP checkout; MedTech only proxies `/pidp/*` |
| Chat service | `https://chat-codecollective.jcloiacon.workers.dev` | `../OrgPortal/chat-worker` | Deploy from `../OrgPortal/chat-worker` only when chat backend code changes |

## MedTech Worker Responsibilities

The MedTech Worker owns the `medtech.social` custom domain and decides whether a
request is served from MedTech static assets, proxied to OrgPortal, proxied to
PIdP, or proxied to the OrgPortal APIs.

MedTech-owned routes and assets are served from this repository's Vite build.
Portal-owned routes such as `/branding`, `/org-events`, `/users/*`,
`/resources`, `/tools`, `/chat`, and MedTech tenant organization routes proxy to
the shared OrgPortal bundle published by CodeCollective at `__portal_root`.

Because social crawlers and browser tab titles read the initial HTML before the
React app runs, the MedTech Worker also rewrites initial portal-navigation HTML
metadata for `medtech.social`. This prevents tenant pages such as `/branding`
from exposing generic Code Collective titles, icons, or social-preview text while
still using the shared OrgPortal application bundle.

## Shared Portal Release Flow

Shared OrgPortal UI changes are made and committed in `../OrgPortal`.

To publish those UI changes for CodeCollective and tenant roots:

```bash
cd ../CodeCollective
ORGPORTAL_DIR=/home/julian/Documents/OrgPortal ./cloudflare/scripts/build_cloudflare_site.sh
WRANGLER_SEND_METRICS=false npx wrangler deploy --dry-run
WRANGLER_SEND_METRICS=false npx wrangler deploy
```

That build creates two portal frontend artifacts:

- `/p/` for `https://codecollective.us/p/`
- `/__portal_root/` for root-mounted tenant domains and reverse-proxied tenants

MedTech does not deploy this shared bundle from the MedTech repository.

## MedTech Release Flow

Use this path for MedTech static pages, the MedTech Worker, dataset APIs,
MedTech-specific proxy routing, and MedTech tenant metadata rewrites:

```bash
npm run build
CLOUDFLARE_ACCOUNT_ID=42d86bec91224cb6ef236aff4db81d30 WRANGLER_SEND_METRICS=false npx wrangler deploy --dry-run
CLOUDFLARE_ACCOUNT_ID=42d86bec91224cb6ef236aff4db81d30 WRANGLER_SEND_METRICS=false npx wrangler deploy
```

After deployment, smoke-test:

```bash
curl -I https://medtech.social/
curl -s https://medtech.social/branding | grep -E '<title>|og:title|og:site_name'
```

## Backend Release Boundaries

OrgPortal backend, PIdP, and chat deployments are separate backend work. Do not
run migrations, rotate secrets, or deploy those Workers from the MedTech checkout.
If a MedTech request requires backend behavior, make and test the change upstream
in the owning checkout, then deploy that service through its documented path.

## Dirty Worktrees

The sibling checkouts may contain unrelated local changes. Do not reset or
overwrite those changes to make a deployment look clean. Deploy the exact intended
workspace state, commit only files changed for the task, and call out unrelated
dirty files in the handoff.
