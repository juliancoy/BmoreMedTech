import { openPhotoTags } from './photo-tags.js'
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
 let folder, hidden = new Set(), view = 'carousel', busy = false, error = '', preferencesReady = false, sequence = 0
 const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
 let playing = !reducedMotion.matches, animation, resizeObserver, inView = false, speed = 1
 const authHeaders = () => ({ Authorization: `Bearer ${getSiteAccount().token}` })
 function button(label, action, onclick) {
  const b = element('button', label); b.type = 'button'; b.dataset.action = action; b.onclick = onclick
  return b
 }
 function updateAnimation() {
  if (!animation) return
  animation.playbackRate = speed
  if (playing && inView && !document.hidden && !root.contains(document.activeElement) && !busy && view === 'carousel') animation.play()
  else animation.pause()
 }
 async function hideImage(image) {
  const account = getSiteAccount()
  if (!account.user || !account.token) { location.href = '/users/login?next=' + encodeURIComponent('/#community-photos'); return }
  const operationSequence = sequence, actor = account.user.id, restoring = view === 'hidden'
  busy = true; error = ''; updateAnimation()
  root.querySelectorAll('button').forEach(b => { b.disabled = true })
  try {
   await json(await fetch(`${api}/me/hidden/${encodeURIComponent(image.id)}`, { method: restoring ? 'DELETE' : 'PUT', headers: authHeaders(), credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(10000) }))
   if (operationSequence !== sequence || getSiteAccount().user?.id !== actor) return
   if (restoring) hidden.delete(image.id); else hidden.add(image.id)
  } catch (e) { if (operationSequence === sequence) error = e.message }
  finally { if (operationSequence === sequence) { busy = false; render() } }
 }
 function render() {
  const focusedAction = root.contains(document.activeElement) ? document.activeElement.dataset.action : null
  animation?.cancel(); resizeObserver?.disconnect(); animation = undefined; speed = 1
  root.replaceChildren()
  const account = getSiteAccount()
  if (account.pending || !account.user) view = 'carousel'
  const controls = element('div', '', 'drive-carousel-tabs')
  for (const [key, label] of [['carousel', 'Photos'], ['hidden', `Hidden images (${hidden.size})`]]) {
   const b = button(label, key, () => { view = key; error = ''; render() })
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
  const images = folder.images.filter(image => view === 'hidden' ? hidden.has(image.id) : !hidden.has(image.id))
  if (!images.length) { root.append(element('p', view === 'hidden' ? 'You have no hidden photos.' : 'No photos to show. Restore a hidden photo or open the Drive folder.')); return }
  function card(image, index, duplicate = false) {
   const figure = element('figure', '', 'community-strip-card')
   const link = element('a'); link.href = image.driveUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `Open meetup photo ${index + 1} in Google Drive`)
   const img = element('img'); img.alt = `MedTech community meetup photo ${index + 1}`; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'
   img.src = image.imageUrl.replace(/=w\d+$/, '=w1000')
   img.onload = () => { figure.classList.add('loaded') }
   img.onerror = () => { img.alt = 'Preview unavailable. Open this photo in Google Drive.'; figure.classList.add('loaded') }
   link.append(img)
   const caption = element('figcaption')
   caption.append(element('span', `Photo ${index + 1} of ${images.length}`))
   const hide = button(view === 'hidden' ? 'Restore' : account.user ? 'Hide' : 'Sign in to hide', `hide-${image.id}`, () => void hideImage(image))
   hide.disabled = busy || account.pending || (!!account.user && !preferencesReady)
   const tags = button('People tags', `tags-${image.id}`, () => void openPhotoTags(image))
   tags.disabled = busy
   caption.append(tags, hide); figure.append(link, caption)
   if (duplicate) { link.tabIndex = -1; hide.tabIndex = -1; tags.tabIndex = -1 }
   return figure
  }
  if (view === 'hidden') {
   const grid = element('div', '', 'community-hidden-grid'); images.forEach((image, index) => grid.append(card(image, index))); root.append(grid)
  } else {
   const viewport = element('div', '', 'community-strip')
   const track = element('div', '', 'community-strip-track')
   const group = element('div', '', 'community-strip-group')
   images.forEach((image, index) => group.append(card(image, index)))
   const duplicate = element('div', '', 'community-strip-group'); duplicate.setAttribute('aria-hidden', 'true')
   images.forEach((image, index) => duplicate.append(card(image, index, true)))
   track.append(group, duplicate); viewport.append(track); root.append(viewport)
   function startAnimation() {
    const distance = group.getBoundingClientRect().width
    if (!distance) return
    const progress = animation ? Number(animation.currentTime || 0) / Number(animation.effect.getTiming().duration) % 1 : 0
    animation?.cancel()
    animation = track.animate([{ transform: 'translateX(0)' }, { transform: `translateX(-${distance}px)` }], { duration: Math.max(36000, distance / 60 * 1000), iterations: Infinity, easing: 'linear' })
    animation.currentTime = (1 + progress) * Number(animation.effect.getTiming().duration)
    updateAnimation()
   }
   startAnimation(); resizeObserver = new ResizeObserver(startAnimation); resizeObserver.observe(group)
   for (const [side, factor] of [['left', -6], ['right', 6]]) {
    const zone = element('div', '', `community-speed-zone ${side}`); zone.setAttribute('aria-hidden', 'true')
    const faster = () => { speed = factor; updateAnimation() }, normal = () => { speed = 1; updateAnimation() }
    zone.addEventListener('mouseenter', faster); zone.addEventListener('mouseleave', normal)
    zone.addEventListener('touchstart', faster, { passive: true }); zone.addEventListener('touchend', normal); zone.addEventListener('touchcancel', normal)
    viewport.append(zone)
   }
   const nav = element('div', '', 'drive-carousel-actions')
   for (const [label, delta] of [['Previous photos', -1], ['Next photos', 1]]) {
    nav.append(button(label, label.startsWith('Previous') ? 'previous' : 'next', () => {
     playing = false; const duration = Number(animation.effect.getTiming().duration); animation.currentTime = duration + ((Number(animation.currentTime || 0) + delta * 5000) % duration + duration) % duration; updateAnimation(); updatePlayLabel()
    }))
   }
   const play = button(playing ? 'Pause scrolling' : 'Play scrolling', 'play', () => {
    playing = !playing; play.blur(); updateAnimation(); updatePlayLabel()
   })
   function updatePlayLabel() { play.textContent = playing ? 'Pause scrolling' : 'Play scrolling'; play.setAttribute('aria-pressed', String(playing)) }
   nav.append(play); root.append(nav); updatePlayLabel()
   root.append(element('p', 'Hover or hold the edges to scroll faster in either direction. Use Pause to stop and choose a photo.', 'drive-carousel-status'))
  }
  if (focusedAction) {
   const nextFocus = root.querySelector(`[data-action="${CSS.escape(focusedAction)}"]`) || root.querySelector('[data-action="carousel"]')
   nextFocus?.focus({ preventScroll: true })
  }
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
  if (animation && !busy && ['ArrowLeft', 'ArrowRight'].includes(event.key) && !['INPUT', 'TEXTAREA'].includes(event.target.tagName)) {
   event.preventDefault(); root.querySelector(`[data-action="${event.key === 'ArrowLeft' ? 'previous' : 'next'}"]`)?.click()
  }
 })
 // Keep reverse playback away from the beginning of the animation timeline.
 setInterval(() => {
  if (!animation || animation.playState !== 'running') return
  const duration = Number(animation.effect.getTiming().duration), time = Number(animation.currentTime || 0)
  if (time < duration || time >= duration * 2) animation.currentTime = duration + ((time % duration) + duration) % duration
 }, 500)
 root.addEventListener('focusin', updateAnimation)
 root.addEventListener('focusout', () => queueMicrotask(updateAnimation))
 document.addEventListener('visibilitychange', updateAnimation)
 reducedMotion.addEventListener('change', () => { playing = !reducedMotion.matches; render() })
 new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; updateAnimation() }, { threshold: .1 }).observe(root)
 window.addEventListener('site-account-change', () => void load())
 void load()
}
