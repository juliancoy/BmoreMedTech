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

setupThemeControls();

if (document.body.classList.contains('taxonomy-body')) {
  import('./semantic-flow.js')
    .then(() => import('./strategy-dashboard.js'))
    .catch((error) => {
      console.error('Unable to initialize the medical atlas enhancements.', error);
    });
}
