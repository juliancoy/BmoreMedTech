import { createElement, Menu, MessageCircle, UserRound } from 'lucide';


let siteAccount = { user: null, token: null, pending: true }
let resolveAccountReady
export const accountReady = new Promise(resolve => { resolveAccountReady = resolve })
export function getSiteAccount() { return siteAccount }
function publishSiteAccount(user, token) {
  const changed = siteAccount.pending || siteAccount.user?.id !== user?.id || siteAccount.token !== token
  siteAccount = { user, token, pending: false }
  resolveAccountReady(siteAccount)
  if (changed) window.dispatchEvent(new Event('site-account-change'))
}

const THEME_STORAGE_KEY = 'lifetech.theme';
const VALID_MODES = new Set(['system', 'light', 'dark']);

function normalizeThemeMode(value) {
  return VALID_MODES.has(value) ? value : 'system';
}

function readThemeMode() {
  try {
    return normalizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeMode(mode) {
  const normalized = normalizeThemeMode(mode);
  const resolved = resolveTheme(normalized);
  document.documentElement.dataset.themeMode = normalized;
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, normalized);
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
  return { mode: normalized, resolved };
}

function setupThemeControls() {
  const controls = [...document.querySelectorAll('.theme-option[data-theme-mode]')];
  const state = applyThemeMode(readThemeMode());

  function updateControls(mode) {
    controls.forEach((control) => {
      control.setAttribute('aria-pressed', String(control.dataset.themeMode === mode));
    });
  }

  updateControls(state.mode);
  controls.forEach((control) => {
    control.addEventListener('click', () => {
      const nextState = applyThemeMode(control.dataset.themeMode);
      updateControls(nextState.mode);
    });
  });

  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', () => {
    const mode = readThemeMode();
    if (mode === 'system') {
      applyThemeMode(mode);
      updateControls(mode);
    }
  });

  window.__bmoreLifeTechTheme = {
    storageKey: THEME_STORAGE_KEY,
    readThemeMode,
    applyThemeMode,
  };
}

function upgradeProgressiveImages() {
  const images = [...document.querySelectorAll('img[data-full-src]')];
  images.forEach((img) => {
    if (img.dataset.progressiveBound === 'true') return;
    img.dataset.progressiveBound = 'true';
    const fullSrc = img.dataset.fullSrc;
    if (!fullSrc) return;
    const upgrade = () => {
      if (img.currentSrc === fullSrc || img.src === fullSrc) return;
      img.addEventListener('load', () => {
        img.removeAttribute('data-full-src');
        img.classList.add('is-loaded');
      }, { once: true });
      img.src = fullSrc;
    };
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(upgrade, { timeout: 900 });
    } else {
      window.setTimeout(upgrade, 150);
    }
  });
}

function organizeNavigation() {
  const header = document.querySelector('.site-header')
  const nav = header?.querySelector('nav[aria-label="Primary navigation"]')
  if (!nav) return
  const destinations = [
    ['/org-events', 'Events'],
    ['/calendar.html', 'Calendar'],
    ['/map.html', 'Event map'],
    ['/taxonomy.html', 'Medical atlas'],
    ['/datasets.html', 'Datasets'],
    ['/branding', 'Brand guide'],
    ['/start.html', 'Get involved'],
    ['/ecosystem', 'LifeTech ecosystem'],
    ['/ecosystem/network', 'Relationship network'],
    ['/availability', 'Find a group meeting time'],
    ['/about.html', 'About Us'],
    ['/governance/roberts', "Robert’s Rules of Order"],
  ]
  const links = destinations.map(([path, label]) => {
    const matches = [...header.querySelectorAll('a[href]')]
      .filter((link) => new URL(link.href).pathname === path)
    const link = matches.shift() || document.createElement('a')
    matches.forEach((duplicate) => duplicate.remove())
    if (path === '/datasets.html') link.href = '/datasets.html'
    else link.href = path
    link.textContent = label
    link.removeAttribute('aria-current')
    const cleanPath = path.endsWith('.html') ? path.slice(0, -5) : path
    if (location.pathname === path || location.pathname.replace(/\/$/, '').replace(/\/index\.html$/, '') === cleanPath || (path === '/datasets.html' && location.pathname.startsWith('/datasets/'))) {
      link.setAttribute('aria-current', 'page')
    }
    return link
  })
  const groups = []
  function group(label, children) {
    const details = document.createElement('details')
    details.className = 'nav-group'
    const summary = document.createElement('summary')
    summary.textContent = label
    if (children.some((link) => link.hasAttribute('aria-current'))) details.classList.add('has-current')
    const list = document.createElement('div')
    list.className = 'nav-group-links'
    list.append(...children)
    details.append(summary, list)
    details.addEventListener('toggle', () => {
      if (details.open) groups.filter((other) => other !== details).forEach((other) => { other.open = false })
    })
    groups.push(details)
    return details
  }
  nav.prepend(links[0], links[1], group('Research', [...links.slice(3, 6), ...links.slice(7, 9)]), group('Community', [links[2], links[6], links[9], links[11]]), links[10])
  document.addEventListener('click', (event) => {
    groups.forEach((group) => { if (!group.contains(event.target) || event.target.closest('a')) group.open = false })
  })
  nav.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const open = groups.find((group) => group.open)
    if (!open) return
    event.stopPropagation()
    open.open = false
    open.querySelector('summary').focus()
  })
}

function setupPrimaryNavigation() {
  const header = document.querySelector('.site-header')
  const nav = header?.querySelector('nav[aria-label="Primary navigation"]')
  if (!header || !nav) return

  let toggle = header.querySelector('.nav-toggle')
  if (!nav.id) nav.id = 'primary-nav'
  if (!toggle) {
    toggle = document.createElement('button')
    toggle.className = 'nav-toggle'
    toggle.type = 'button'
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-controls', nav.id)
    toggle.innerHTML = '<span>Menu</span><span class="nav-toggle-lines" aria-hidden="true"></span>'
    nav.parentElement?.insertBefore(toggle, nav)
  }

  document.documentElement.classList.add('nav-enhanced')

  const setNavOpen = (open, { moveFocus = false } = {}) => {
    toggle.setAttribute('aria-expanded', String(open))
    toggle.classList.toggle('is-open', open)
    nav.classList.toggle('is-open', open)
    document.body.classList.toggle('nav-open', open)
    if (open && moveFocus) {
      requestAnimationFrame(() => nav.querySelector('summary, a, button')?.focus())
    }
  }

  setNavOpen(false)
  requestAnimationFrame(() => nav.classList.add('nav-interactive'))

  toggle.addEventListener('click', () => {
    setNavOpen(toggle.getAttribute('aria-expanded') !== 'true', { moveFocus: true })
  })

  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setNavOpen(false)
  })

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.site-header')) setNavOpen(false)
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      setNavOpen(false)
      toggle.focus()
    }
  })

  window.matchMedia?.('(min-width: 721px)').addEventListener?.('change', (event) => {
    if (event.matches) setNavOpen(false)
  })
}

async function setupAuthNavigation() {
  const header = document.querySelector('.site-header')
  const login = header?.querySelector('a[href*="/users/login"]')
  if (!login) { publishSiteAccount(null, null); return }
  const controls = document.createElement('div')
  controls.className = 'account-controls'
  controls.setAttribute('role', 'group')
  controls.setAttribute('aria-label', 'Your account')
  controls.append(login)
  ;(header.querySelector('.site-header-inner') || header).append(controls)
  login.textContent = 'Login'
  login.className = 'button account-login'

  const entryLinks = [...document.querySelectorAll('a[href]')]
    .filter(link => link !== login && new URL(link.href).pathname === '/users/login')
    .map(link => ({ link, href: link.getAttribute('href'), text: link.textContent }))
  function updateEntryLinks(signedIn) {
    for (const {link, href, text} of entryLinks) { link.setAttribute('href', signedIn ? '/profile' : href); link.textContent = signedIn ? 'My account' : text }
  }
  let sequence = 0
  let renderedUserId = null
  async function hydrateAccount() {
   const current = ++sequence
   try {
    let token = null
    try { token = localStorage.getItem('orgportal.auth.accessToken')?.trim() || null } catch { /* Storage may be disabled. */ }
    const response = await fetch('/pidp/auth/session-token', {
      credentials: 'include',
      cache: 'no-store',
    })
    if (response.ok) {
      const session = await response.json()
      if (typeof session.access_token === 'string' && session.access_token.trim()) token = session.access_token.trim()
    }
    if (!token) {
      if (current === sequence) publishSiteAccount(null, null)
      if (response.status === 401 && current === sequence) { controls.replaceChildren(login); header.classList.remove('has-account'); renderedUserId = null; updateEntryLinks(false) }
      return
    }
    const profileResponse = await fetch('/pidp/auth/me', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (current !== sequence) return
    if (!profileResponse.ok) {
      publishSiteAccount(null, null)
      if (profileResponse.status === 401 || profileResponse.status === 403) {
        try { localStorage.removeItem('orgportal.auth.accessToken') } catch { /* Storage may be disabled. */ }
        controls.replaceChildren(login); header.classList.remove('has-account'); renderedUserId = null; updateEntryLinks(false)
      }
      return
    }
    const user = await profileResponse.json()
    if (current !== sequence) return
    if (!user.id || !user.email) { publishSiteAccount(null, null); return }
    publishSiteAccount(user, token)
    if (renderedUserId === user.id) return
    renderedUserId = user.id
    const name = user.identity_data?.display_name || user.full_name || user.email
    const icon = (node) => createElement(node, { width: 20, height: 20, 'aria-hidden': 'true' })
    const profile = document.createElement('a')
    profile.href = '/profile'
    profile.className = 'account-icon account-avatar'
    profile.title = `Profile: ${name}`
    profile.setAttribute('aria-label', profile.title)
    profile.append(icon(UserRound))
    const avatar = user.identity_data?.avatar_url || user.avatar_url
    if (typeof avatar === 'string' && avatar.trim()) {
      let url
      try { url = new URL(avatar, location.origin) } catch { /* Keep the fallback avatar. */ }
      if (url && (url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === location.origin))) {
        const img = document.createElement('img')
        img.alt = ''
        img.referrerPolicy = 'no-referrer'
        img.onload = () => profile.replaceChildren(img)
        img.src = url.href
      }
    }
    const messages = document.createElement('a')
    messages.href = '/chat'
    messages.className = 'account-icon'
    messages.title = 'Messages'
    messages.setAttribute('aria-label', 'Messages')
    messages.append(icon(MessageCircle))
    const menu = document.createElement('details')
    menu.className = 'account-menu'
    const summary = document.createElement('summary')
    summary.className = 'account-icon'
    summary.title = 'Account menu'
    summary.setAttribute('aria-label', 'Account menu')
    summary.append(icon(Menu))
    const items = document.createElement('div')
    items.className = 'account-menu-items'
    const mobileLinks = document.createElement('div')
    mobileLinks.className = 'account-mobile-links'
    for (const link of header.querySelectorAll('nav .nav-group-links a, nav > a')) {
      mobileLinks.append(link.cloneNode(true))
    }
    items.append(mobileLinks)
    for (const [label, href] of [['My profile', '/profile'], ['Dashboard', '/users/dashboard']]) {
      const link = document.createElement('a')
      link.textContent = label
      link.href = href
      items.append(link)
    }
    const logout = document.createElement('button')
    logout.type = 'button'
    logout.textContent = 'Sign out'
    const error = document.createElement('p')
    error.setAttribute('role', 'alert')
    error.hidden = true
    logout.addEventListener('click', async () => {
      logout.disabled = true
      error.hidden = true
      try {
        const result = await fetch('/pidp/auth/session/logout', { method: 'POST', credentials: 'include' })
        if (!result.ok) throw new Error('Sign out failed')
        try { localStorage.removeItem('orgportal.auth.accessToken') } catch { /* Storage may be disabled. */ }
        publishSiteAccount(null, null)
        location.reload()
      } catch {
        error.textContent = 'Unable to sign out. Please try again.'
        error.hidden = false
        logout.disabled = false
      }
    })
    items.append(logout, error)
    menu.append(summary, items)
    controls.replaceChildren(profile, messages, menu)
    header.classList.add('has-account')
    updateEntryLinks(true)
    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target)) menu.open = false
    })
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        menu.open = false
        summary.focus()
        event.stopPropagation()
      }
    })

   } catch {
     if (current === sequence) publishSiteAccount(null, null)
    // A transient request failure keeps the last validated account display.
   }
  }
  void hydrateAccount()
  window.addEventListener('pageshow', () => void hydrateAccount())
  window.addEventListener('focus', () => void hydrateAccount())
  window.addEventListener('storage', (event) => { if (event.key === 'orgportal.auth.accessToken') void hydrateAccount() })
}

setupThemeControls();
upgradeProgressiveImages();
window.addEventListener('bmoremedtech:progressive-images', upgradeProgressiveImages);
organizeNavigation();
setupPrimaryNavigation();
setupAuthNavigation();

if (document.querySelector('.taxonomy-page')) {
  import('./semantic-flow.js')
    .then(() => import('./strategy-dashboard.js'))
    .then(() => import('./strategy-distortion-link.js'))
    .catch((error) => {
      console.error('Unable to initialize the medical atlas enhancements.', error);
    });
}

// The public LifeTech landing page shares the portal's live group access boundary.
function setupOrganizationViews() {
  if (document.querySelector('.brand strong')?.textContent.trim() !== 'LifeTech') return
  const nav = document.querySelector('#primary-nav')
  if (!nav) return
  const label = document.createElement('label')
  label.textContent = 'View as '
  const select = document.createElement('select')
  select.setAttribute('aria-label', 'Organization view')
  for (const value of ['public', 'attendees', 'volunteers', 'members', 'organizers']) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = value[0].toUpperCase() + value.slice(1)
    option.disabled = value === 'members' || value === 'organizers'
    select.append(option)
  }
  label.append(select)
  nav.append(label)
  select.addEventListener('change', () => {
    window.location.assign(select.value === 'public' ? '/?view=public' : `/orgs/lifetech?view=${select.value}`)
  })
  let sequence = 0
  async function refresh() {
    const current = ++sequence
    select.value = 'public'
    select.querySelector('[value="members"]').disabled = true
    select.querySelector('[value="organizers"]').disabled = true
    const { token } = getSiteAccount()
    if (!token) return
    try {
      const response = await fetch('/api/org/api/network/orgs/public/lifetech', { cache: 'no-store' })
      if (!response.ok) return
      const group = await response.json()
      const membershipResponse = await fetch(`/api/org/api/network/orgs/${encodeURIComponent(group.id)}/membership`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
      if (!membershipResponse.ok || current !== sequence) return
      const membership = await membershipResponse.json()
      if (current !== sequence || membership.status !== 'active') return
      const organizer = ['owner', 'administrator'].includes(membership.role)
      select.querySelector('[value="members"]').disabled = false
      select.querySelector('[value="organizers"]').disabled = !organizer
      if (organizer && window.location.pathname === '/' && new URLSearchParams(window.location.search).get('view') !== 'public') window.location.replace('/orgs/lifetech?view=organizers')
    } catch { /* Keep public navigation available when membership cannot be checked. */ }
  }
  window.addEventListener('site-account-change', () => void refresh())
  void accountReady.then(refresh)
}
setupOrganizationViews()
