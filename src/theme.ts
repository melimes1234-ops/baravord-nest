export type Theme = 'light' | 'dark'

const KEY = 'baravord-nest/theme'

/** Light unless the user picked dark on this device. */
export function initialTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'dark' || t === 'light') return t
  } catch {
    // storage blocked: use the default
  }
  return 'light'
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    // storage blocked: the choice lasts until the page closes
  }
}
