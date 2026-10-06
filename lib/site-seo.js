import { canonicalPath, pageStructuredData } from '../../OrgPortal/web/seo.mjs'

// Medical-site content stays here; reusable rendering and schema construction live upstream.
export const importantPages = {
  '/': ['Baltimore Health, Medicine & Biotech Community', 'Connect with Baltimore clinicians, researchers, engineers, and founders. Discover LifeTech meetups, local organizations, and ideas for better care.', 'WebPage'],
  '/about': ['About Our Baltimore Medical Community', 'Learn how LifeTech brings Baltimore’s health, medicine, and biotech community together through events, shared resources, and collaboration.', 'AboutPage'],
  '/start': ['Get Involved in Baltimore Health & Biotech', 'Join LifeTech’s Baltimore community. Find a meetup, connect with medical collaborators, and explore local health and biotech resources.', 'WebPage'],
  '/org-events': ['Health, Medicine & Biotech Meetups in Baltimore', 'Find LifeTech-hosted events in Baltimore. Meet clinicians, researchers, engineers, and founders across health, medicine, and biotech.', 'CollectionPage'],
  '/calendar': ['Baltimore Medical & Biotech Events Calendar', 'Browse regional health, medicine, and biotech events in the LifeTech calendar, with LifeTech-hosted gatherings highlighted.', 'CollectionPage'],
  '/map': ['Baltimore Health & Biotech Event Map', 'Explore regional medical, health, and technology events on the LifeTech map. Find gatherings near you and connect with the Baltimore community.', 'CollectionPage'],
  '/ecosystem': ['Baltimore Health & Biotech Organization Directory', 'Explore Baltimore’s health, medicine, and biotech organizations, including local companies, research institutions, and documented relationships.', 'CollectionPage'],
  '/ecosystem/network': ['Baltimore Health & Biotech Relationship Network', 'Explore documented connections among Baltimore health, medicine, and biotech organizations, with sources for relationships and funding.', 'CollectionPage'],
  '/taxonomy': ['Medical Science & Technology Atlas', 'Explore medical science and technology fields with LifeTech’s atlas. Find specialties, research areas, and connections across health and biotech.', 'CollectionPage'],
  '/datasets': ['Medical & Healthcare Data Resources', 'Explore public medical and healthcare datasets, clinical code systems, workforce data, and regional research tools in the LifeTech data library.', 'CollectionPage'],
}

export function sitePageSeo(pathname, brand) {
  const path = canonicalPath(pathname)
  const page = importantPages[path]
  if (!page || brand.name !== 'LifeTech') return null
  const [label, description, type] = page
  const title = path === '/' ? `LifeTech | ${label}` : `${label} | LifeTech`
  const canonicalUrl = new URL(path, brand.origin).href
  return {
    title, description, canonicalUrl,
    robots: 'index,follow,max-image-preview:large',
    jsonLd: pageStructuredData({ title, description, canonicalUrl, type, siteName: brand.name, origin: brand.origin, logoUrl: new URL(brand.logo, brand.origin).href }),
  }
}
