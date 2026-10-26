// Old installed clients already mark their document with data-desktop. The
// maintained OrgPortal client adds data-desktop-app="orgportal" as well.
const preference = 'lifetech.orgportal-migration-v3.dismissed'
export function offerDesktopMigration(document, storage) {
  const root = document.documentElement
  if (root.dataset.desktop !== 'true' || root.dataset.desktopApp === 'orgportal' || document.querySelector('#desktop-migration')) return
  try { if (storage.getItem(preference)) return } catch {}
  const notice = document.createElement('aside')
  notice.id = 'desktop-migration'
  notice.setAttribute('aria-label', 'OrgPortal desktop replacement')
  notice.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;max-width:640px;margin:auto;z-index:2147483646;padding:20px;background:#fff;color:#183b3a;border:2px solid #155e59;border-radius:16px;box-shadow:0 8px 32px #0005;font:16px/1.5 system-ui'
  const heading = document.createElement('strong')
  heading.textContent = 'LifeTech desktop is now OrgPortal'
  const message = document.createElement('p')
  message.textContent = 'OrgPortal is the maintained app, with the same LifeTech view. You can choose to install it and remove LifeTech. Nothing will be uninstalled automatically. You may need to sign in again.'
  const link = document.createElement('a')
  link.href = 'https://github.com/juliancoy/OrgPortal/releases/tag/desktop-v3.0.0'
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = 'Get OrgPortal and installation instructions'
  link.style.color = '#155e59'
  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.textContent = 'Keep using LifeTech for now'
  dismiss.style.cssText = 'display:block;margin-top:16px;padding:10px 14px;font:inherit;border:1px solid #155e59;border-radius:8px;background:#fff;color:#155e59;cursor:pointer'
  dismiss.addEventListener('click', () => {
    try { storage.setItem(preference, 'true') } catch {}
    notice.remove()
  })
  notice.append(heading, message, link, dismiss)
  document.body.append(notice)
}
if (typeof document !== 'undefined') {
  const offer = () => {
    let storage
    try { storage = localStorage } catch {}
    offerDesktopMigration(document, storage)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', offer, { once: true })
  else offer()
  new MutationObserver(offer).observe(document.documentElement, { attributes: true, attributeFilter: ['data-desktop', 'data-desktop-app'] })
}
