import { getSiteAccount } from './theme.js'

const root = document.getElementById('drive-carousel')
const api = '/api/org/api/media/carousels/medtech-photos'
function element(tag, text, className) {
 const node = document.createElement(tag)
 if (text) node.textContent = text
 if (className) node.className = className
 return node
}
async function json(response) {
 if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to manage your hidden photos.' : 'Unable to load or save photos. Please try again.')
 return response.json()
}
if (root) {
 root.tabIndex = 0
 let folder, hidden = new Set(), view = 'carousel', position = 0, busy = false, error = '', preferencesReady = false, sequence = 0
 let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches, visible = false, hovering = false
 const authHeaders = () => ({ Authorization: `Bearer ${getSiteAccount().token}` })
 const imagesForView = () => (folder?.images || []).filter(image => view === 'hidden' ? hidden.has(image.id) : !hidden.has(image.id))
 const previewCache = new Map()
 function preload(image) {
  if (!image || previewCache.has(image.imageUrl)) return
  const img = new Image(); img.referrerPolicy = 'no-referrer'; img.src = image.imageUrl
  previewCache.set(image.imageUrl, img)
 }
 function button(label, action, onclick) {
  const b = element('button', label); b.type = 'button'; b.dataset.action = action; b.onclick = onclick
  return b
 }
 function move(delta) { position += delta; render() }
 function render() {
  const focusedAction = root.contains(document.activeElement) ? document.activeElement.dataset.action : null
  root.replaceChildren()
  const account = getSiteAccount()
  if (account.pending || !account.user) view = 'carousel'
  const controls = element('div', '', 'drive-carousel-tabs')
  for (const [key, label] of [['carousel', 'Photos'], ['hidden', `Hidden images (${hidden.size})`]]) {
   const b = button(label, key, () => { view = key; position = 0; error = ''; render() })
   b.disabled = busy || (key === 'hidden' && (!account.user || !preferencesReady)); b.setAttribute('aria-pressed', String(view === key)); controls.append(b)
  }
  if (account.user) { const link = element('a', 'My hidden photos'); link.href = '/profile#hidden-community-photos'; controls.append(link) }
  root.append(controls)
  if (error) {
   const alert = element('p', error); alert.setAttribute('role', 'alert'); root.append(alert)
   root.append(button('Retry', 'retry', () => void load()))
  }
  if (!folder) { const status = element('p', error ? 'The folder is temporarily unavailable. Use the Drive folder link above.' : 'Loading community photos…'); status.setAttribute('role', 'status'); root.append(status); return }
  if (account.user && !preferencesReady) { root.append(element('p', error ? 'Your photo preferences could not load. Retry to view your photos.' : 'Loading your photo preferences…')); return }
  const images = imagesForView()
  if (!images.length) { root.append(element('p', view === 'hidden' ? 'You have no hidden photos.' : 'No photos to show. Restore a hidden photo or open the Drive folder.')); return }
  position = (position + images.length) % images.length
  const image = images[position]
  preload(images[(position + 1) % images.length]); preload(images[(position + images.length - 1) % images.length])
  const nav = element('div', '', 'drive-carousel-navigation')
  for (const [label, delta] of [['Previous', -1], ['Next', 1]]) {
   const b = button(label, label.toLowerCase(), () => move(delta)); b.disabled = busy || images.length < 2; nav.append(b)
  }
  const play = button(playing ? 'Pause slideshow' : 'Play slideshow', 'play', () => { playing = !playing; render() })
  play.disabled = images.length < 2 || view === 'hidden'; nav.insertBefore(play, nav.lastChild); root.append(nav)
  const stage = element('div', '', 'drive-carousel-stage')
  const figure = element('figure', '', 'drive-carousel-slide')
  const link = element('a'); link.href = image.driveUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `Open photo ${position + 1} in Google Drive`)
  const img = element('img'); img.alt = `MedTech community meetup photo ${position + 1}`; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'
  const status = element('p', 'Loading photo…', 'drive-carousel-status'); status.setAttribute('role', 'status')
  img.onload = () => { status.textContent = '' }
  img.onerror = () => { status.textContent = 'This preview could not load. Open the photo in Google Drive or try another photo.' }
  img.src = image.imageUrl
  link.append(img)
  const caption = element('figcaption', `${position + 1} of ${images.length} · Community meetup`)
  caption.setAttribute('aria-live', playing ? 'off' : 'polite'); figure.append(link, caption); stage.append(figure, status); root.append(stage)
  const thumbnails = element('div', '', 'drive-carousel-thumbnails'); thumbnails.setAttribute('aria-label', 'Choose a photo')
  images.forEach((item, index) => {
   const b = button('', `photo-${item.id}`, () => { position = index; playing = false; render() }); b.disabled = busy; b.setAttribute('aria-label', `Show photo ${index + 1}`); b.setAttribute('aria-current', String(index === position))
   const thumb = element('img'); thumb.alt = ''; thumb.loading = 'lazy'; thumb.referrerPolicy = 'no-referrer'; thumb.src = item.imageUrl.replace(/=w\d+$/, '=w160'); b.append(thumb); thumbnails.append(b)
  })
  root.append(thumbnails)
  thumbnails.scrollLeft = Math.max(0, position * 80 - thumbnails.clientWidth / 2 + 40)
  const actions = element('div', '', 'drive-carousel-actions')
  const hide = button(view === 'hidden' ? 'Restore to carousel' : account.user ? 'Hide this photo' : 'Sign in to hide photos', 'hide', async () => {
   const actorAccount = getSiteAccount()
   if (!actorAccount.user || !actorAccount.token) { location.href = '/users/login?next=' + encodeURIComponent('/#community-photos'); return }
   const operationSequence = sequence, actor = actorAccount.user.id, restoring = view === 'hidden'
   busy = true; error = ''; render()
   try {
    await json(await fetch(`${api}/me/hidden/${encodeURIComponent(image.id)}`, { method: restoring ? 'DELETE' : 'PUT', headers: authHeaders(), credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(10000) }))
    if (operationSequence !== sequence || getSiteAccount().user?.id !== actor) return
    if (restoring) hidden.delete(image.id); else hidden.add(image.id)
   } catch (e) { if (operationSequence === sequence) error = e.message }
   finally { if (operationSequence === sequence) { busy = false; render() } }
  })
  hide.disabled = busy || account.pending || (!!account.user && !preferencesReady); actions.append(hide); root.append(actions)
  if (focusedAction) root.querySelector(`[data-action="${CSS.escape(focusedAction)}"]`)?.focus({ preventScroll: true })
 }
 async function load() {
  const current = ++sequence
  hidden = new Set(); preferencesReady = false; busy = false; error = ''; view = 'carousel'; render()
  try {
   if (!folder) folder = await json(await fetch(api, { cache: 'no-store', signal: AbortSignal.timeout(10000) }))
   if (current !== sequence) return
   render()
   const account = getSiteAccount()
   if (account.user && account.token) {
    const state = await json(await fetch(`${api}/me`, { headers: authHeaders(), credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(10000) }))
    if (current !== sequence) return
    hidden = new Set(state.hiddenImageIds)
   }
   preferencesReady = true
  } catch (e) { if (current !== sequence) return; error = e.message }
  if (current === sequence) render()
 }
 root.addEventListener('keydown', event => {
  if (!busy && ['ArrowLeft', 'ArrowRight'].includes(event.key) && !['INPUT', 'TEXTAREA'].includes(event.target.tagName)) { event.preventDefault(); playing = false; move(event.key === 'ArrowLeft' ? -1 : 1) }
 })
 root.addEventListener('mouseenter', () => { hovering = true })
 root.addEventListener('mouseleave', () => { hovering = false })
 let touchX
 root.addEventListener('touchstart', event => { touchX = event.touches[0].clientX }, { passive: true })
 root.addEventListener('touchend', event => {
  if (touchX === undefined || busy) return
  const delta = event.changedTouches[0].clientX - touchX; touchX = undefined
  if (Math.abs(delta) > 50) { playing = false; move(delta < 0 ? 1 : -1) }
 }, { passive: true })
 new IntersectionObserver(([entry]) => { visible = entry.isIntersecting }, { threshold: .2 }).observe(root)
 setInterval(() => {
  if (playing && visible && !hovering && !document.hidden && (!root.contains(document.activeElement) || document.activeElement.dataset.action === 'play') && !busy && view === 'carousel' && imagesForView().length > 1) move(1)
 }, 5000)
 window.addEventListener('site-account-change', () => void load())
 void load()
}
