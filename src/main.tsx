import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, initialTheme } from './theme'

applyTheme(initialTheme())

// Clicking or tabbing into any text/number box selects its whole content, so typing replaces it.
document.addEventListener('focusin', e => {
  const el = e.target
  if (el instanceof HTMLInputElement && !el.readOnly && ['text', 'number', 'search', 'tel', 'email', ''].includes(el.type)) {
    setTimeout(() => { if (document.activeElement === el) el.select() }, 0)
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
