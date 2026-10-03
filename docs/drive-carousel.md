# Community photo carousel

The MedTech homepage displays images from the public Google Drive folder
[20260929 PH3 Photos](https://drive.google.com/drive/folders/1PoJ9KQvInRhJeoY91ODJ-915_eGuPAmb).
The shared OrgPortal API reads Google's public folder view and caches its image
manifest for two minutes. HEIC files use Google's JPEG previews; videos are
excluded from the photo manifest. The featured 3.43-second group greeting is
served locally at `/assets/videos/medtech-community.mp4`, with a poster, English
captions, and sound-enabled native playback controls. Its public source is
[the original Drive clip](https://drive.google.com/file/d/1IoIN2F9zSsiDDvP5qIxGLWJMFjdyomtw/view).
No Drive credentials, file mutations, or sharing changes are involved.

The photo carousel supports previous/next buttons, thumbnails, arrow keys,
and touch swipes. Adjacent photos preload. The five-second slideshow pauses
while the carousel is hovered, keyboard navigation is active, or the carousel
is outside the viewport. Reduced-motion users start with the slideshow paused.
Public photos load independently of sign-in; account preferences remain in
OrgPortal. Loading failures expose a retry action and the original Drive link.

Hide is a personal account preference. Signed-in users remove an image from their
own carousel; other visitors still see it. The carousel's Hidden images view and
`/profile#hidden-community-photos` let that same user view or restore their photos.
Preferences persist in OrgPortal D1 by tenant, authenticated user, carousel, and
Drive file ID. Public profile pages never render the private account panel.
Hiding does not make the original image private: the source Drive folder remains
public. If the owner removes a source file, it also disappears from the carousel
and hidden-image view.

OrgPortal owns `/api/media/carousels/medtech-photos`, its authenticated `/me`
preferences, and the private profile panel. MedTech proxies these through its
existing `/api/org` gateway and reuses its existing PIdP session hydration.
LifeTech does not display this folder, and the API rejects other tenants.

Release the exact upstream migration
`org-worker/migrations/0048_user_hidden_carousel_images.sql` before releasing
OrgPortal's worker. Deploy the shared worker and portal bundle from CodeCollective;
deploy only the MedTech static bundle from this checkout. Do not apply unrelated
pending migrations as part of this release.
