// This isolated preload exposes no Node or desktop API to the web page.
const { ipcRenderer } = require('electron')
const origins = process.argv.find(value => value.startsWith('--lifetech-origins='))?.slice('--lifetech-origins='.length).split(',') || []
if (origins.includes(location.origin)) {
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]')
    if (!link) return
    const destination = new URL(link.href, location.href)
    if (!origins.includes(destination.origin) || !/^\/(?:p\/)?users\/login\/?$/.test(destination.pathname)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    ipcRenderer.send('lifetech:browser-sign-in')
  }, true)
  try {
    if (!localStorage.getItem('lifetech.theme')) localStorage.setItem('lifetech.theme', 'system')
  } catch { /* Storage may be unavailable on a failed navigation. */ }
}
