import { createElement, Menu, MessageCircle, UserRound } from 'lucide';

const THEME_STORAGE_KEY = 'bmore-medtech.theme';
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

  window.__bmoreMedTechTheme = {
    storageKey: THEME_STORAGE_KEY,
    readThemeMode,
    applyThemeMode,
  };
}

function organizeNavigation() {
  const header = document.querySelector('.site-header')
  const nav = header?.querySelector('nav[aria-label="Primary navigation"]')
  if (!nav) return
  const destinations = [
    ['/org-events', 'MedTech meetups'],
    ['/calendar.html', 'Community calendar'],
    ['/map.html', 'Event map'],
    ['/taxonomy.html', 'Medical atlas'],
    ['/datasets.html', 'Datasets'],
    ['/start.html', 'Get involved'],
  ]
  const links = destinations.map(([path, label]) => {
    const matches = [...header.querySelectorAll('a[href]')]
      .filter((link) => new URL(link.href).pathname === path)
    const link = matches.shift() || document.createElement('a')
    matches.forEach((duplicate) => duplicate.remove())
    link.href = path
    link.textContent = label
    link.removeAttribute('aria-current')
    if (location.pathname === path || (path === '/datasets.html' && location.pathname.startsWith('/datasets/'))) {
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
  nav.prepend(group('Events', links.slice(0, 3)), group('Research', links.slice(3, 5)), links[5])
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
  if (!login) return
  const controls = document.createElement('div')
  controls.className = 'account-controls'
  controls.setAttribute('role', 'group')
  controls.setAttribute('aria-label', 'Your account')
  controls.append(login)
  ;(header.querySelector('.site-header-inner') || header).append(controls)
  login.textContent = 'Login'
  login.className = 'button account-login'

  try {
    const response = await fetch('/pidp/auth/session-token', {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) return
    const session = await response.json()
    if (typeof session.access_token !== 'string' || !session.access_token.trim()) return
    const profileResponse = await fetch('/pidp/auth/me', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!profileResponse.ok) return
    const user = await profileResponse.json()
    if (!user.id || !user.email) return
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
    // An unavailable or non-JSON session endpoint must never imply a signed-in user.
  }
}

setupThemeControls();
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
