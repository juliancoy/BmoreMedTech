# LifeTech search discovery

LifeTech owns the stable `/favicon.ico`, `/favicon.png`, `/apple-touch-icon.png`
and manifest routes. These must never fall back to another tenant. All HTML
uses `/favicon.ico`; the icon bytes come from the local LifeTech logo asset.
The legacy `/codecollective_logo.png` URL also serves LifeTech’s logo, so browsers
with a cached permanent favicon redirect do not retain the old branding.

The homepage renders its next upcoming hosted event from the public OrgPortal
API, with a 1.5-second timeout and a browse-events fallback. The client keeps
successfully rendered event content instead of replacing it with a loading state.
No member credentials are sent for these public reads.

`/sitemap.xml` indexes separate page, event and organization maps. The event map
uses the public API’s latest 200 hosted events. The organization map paginates
all public directory records in batches of 500. Maps cache at the edge for one
hour. API failures return 503 with Retry-After rather than publishing empty maps.
The organization map has an eight-second request budget and a 45,000-record cap;
partition it before the directory reaches that cap.

## Cloudflare crawler access

Zone: lifetech.fyi. Configuration ruleset `82032db749614c6ba1f52c56e8edba39`,
rule ref `lifetech_public_discovery_bic`, disables Browser Integrity Check only
for GET/HEAD requests to public pages, icons, manifests, sitemaps and static
assets. It does not apply to APIs, login, administration or write requests.
The zone-level Browser Integrity Check setting remains enabled. Bot Fight Mode
and AI crawler blocking were disabled when inspected on October 20, 2026.
The exact rule is recorded in `config/lifetech-crawler-rule.json`.

## Release verification

Run `npm run test:events`, `npm run build:lifetech`, and
`npx wrangler deploy --env lifetech --dry-run` before the LifeTech-only release.
Check homepage HTML without JavaScript, favicon bytes, manifest identity,
all four sitemap endpoints and access with a non-browser user agent afterward.
Do not deploy sibling services as part of this release.

Google may retain an old favicon until it recrawls the homepage and icon.
Submit `/sitemap.xml` and request homepage indexing in Google Search Console
when access to the verified property is available. A successful HTTP fetch
with a Googlebot user agent is not proof of a verified Google crawl.
