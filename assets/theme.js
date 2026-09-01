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
  const select = document.getElementById('theme-mode');
  const state = applyThemeMode(readThemeMode());
  if (select) {
    select.value = state.mode;
    select.addEventListener('change', () => {
      applyThemeMode(select.value);
    });
  }

  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', () => {
    const mode = readThemeMode();
    if (mode === 'system') applyThemeMode(mode);
  });

  window.__bmoreMedTechTheme = {
    storageKey: THEME_STORAGE_KEY,
    readThemeMode,
    applyThemeMode,
  };
}

setupThemeControls();
