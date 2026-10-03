import { accountReady, getSiteAccount } from './theme.js'
const root = document.getElementById('drive-carousel')
const api = '/api/org/api/media/carousels/medtech-photos'
function element(tag, text, className) { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node }
async function json(response) { if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to manage your hidden photos.' : 'Unable to load or save your photos. Please try again.'); return response.json() }
if (root) {
 root.tabIndex = 0
 let folder, hidden = new Set(), view = 'carousel', position = 0, busy = false, error = '', preferencesReady = false, sequence = 0
 const authHeaders = () => ({ Authorization: `Bearer ${getSiteAccount().token}` })
 function render() {
  root.replaceChildren()
  const account = getSiteAccount()
  const controls = element('div', '', 'drive-carousel-tabs')
  const tabs = [['carousel', 'Carousel'], ['hidden', `Hidden images (${hidden.size})`]]
  for (const [key, label] of tabs) {
   const button = element('button', label); button.type = 'button'; button.disabled = busy || (key === 'hidden' && !account.user); button.setAttribute('aria-pressed', String(view === key))
   button.onclick = () => { view = key; position = 0; error = ''; render() }; controls.append(button)
  }
  if (account.user) { const link = element('a', 'My hidden photos'); link.href = '/profile#hidden-community-photos'; controls.append(link) }
  root.append(controls)
  if (error) { const alert = element('p', error); alert.setAttribute('role', 'alert'); root.append(alert); const retry=element('button','Retry');retry.type='button';retry.onclick=()=>void load();root.append(retry) }
  if (!folder) { root.append(element('p', error ? 'The folder is temporarily unavailable.' : 'Loading community photos…')); return }
  if (account.pending || (account.user && !preferencesReady)) { root.append(element('p', 'Loading your photo preferences…')); return }
  const images = folder.images.filter(image => view === 'hidden' ? hidden.has(image.id) : !hidden.has(image.id))
  if (!images.length) { root.append(element('p', view === 'hidden' ? 'You have no hidden photos.' : 'No photos to show. Find hidden photos in your account or check the Drive folder.')); return }
  position = (position + images.length) % images.length
  const image = images[position]
  const figure = element('figure', '', 'drive-carousel-slide')
  const link = element('a'); link.href = image.driveUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `Open ${image.name} in Google Drive`)
  const img = element('img'); img.src = image.imageUrl; img.alt = `Community photo: ${image.name}`; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.onerror=()=>{img.alt='Preview unavailable. Open this photo in Google Drive.'}; link.append(img)
  const caption = element('figcaption', `${position + 1} of ${images.length} · ${image.name}`); caption.setAttribute('aria-live','polite'); figure.append(link, caption); root.append(figure)
  const actions = element('div', '', 'drive-carousel-actions')
  for (const [label,delta] of [['Previous',-1],['Next',1]]) { const b=element('button',label);b.type='button';b.disabled=busy||images.length<2;b.onclick=()=>{position+=delta;render()};actions.append(b) }
  const button = element('button', view === 'hidden' ? 'Restore to carousel' : 'Hide'); button.type = 'button'; button.disabled = busy
  button.onclick = async () => {
   const account = getSiteAccount()
   if (!account.user || !account.token) { location.href = '/users/login?next=' + encodeURIComponent('/#community-photos'); return }
   const operationSequence = sequence, actor = account.user.id, restoring = view === 'hidden'
   busy = true; error = ''; render()
   try {
    await json(await fetch(`${api}/me/hidden/${encodeURIComponent(image.id)}`, { method: restoring ? 'DELETE' : 'PUT', headers: authHeaders(), credentials: 'include', cache:'no-store' }))
    if (operationSequence !== sequence || getSiteAccount().user?.id !== actor) return
    if (restoring) hidden.delete(image.id); else hidden.add(image.id)
   } catch (e) { if (operationSequence === sequence) error = e.message }
   finally { if (operationSequence === sequence) { busy = false; render() } }
  }
  actions.append(button); root.append(actions)
  root.onkeydown = event => { if (!busy && ['ArrowLeft','ArrowRight'].includes(event.key) && !['INPUT','TEXTAREA'].includes(event.target.tagName)) { event.preventDefault();position += event.key==='ArrowLeft'?-1:1;render() } }
 }
 async function load() {
  const current = ++sequence
  hidden = new Set(); preferencesReady = false; busy = false; error = '';view='carousel';position=0;render()
  try {
   const manifest = await json(await fetch(api,{cache:'no-store'}))
   await accountReady
   if (current !== sequence) return
   folder = manifest
   const account = getSiteAccount()
   if (account.user && account.token) { const state=await json(await fetch(`${api}/me`,{headers:authHeaders(),credentials:'include',cache:'no-store'}));if(current!==sequence)return;hidden=new Set(state.hiddenImageIds) }
   preferencesReady = true
  } catch(e) { if(current!==sequence)return;error=e.message }
  if(current===sequence)render()
 }
 window.addEventListener('site-account-change',()=>void load())
 void load()
}
