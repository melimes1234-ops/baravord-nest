import { useCallback, useState } from 'react'
import { seedCatalog } from './core'
import type { AppState, Session, Update } from './store'

/** Build flag: the demo has no server, data stays in this browser. */
export const DEMO = import.meta.env.VITE_DEMO === '1'

const KEY = 'baravord-nest/demo-v1'
const fresh = (): AppState => ({ catalog: seedCatalog(), movements: [], batches: [] })

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as AppState
  } catch {
    // storage blocked: run from memory
  }
  return fresh()
}

const save = (s: AppState) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage blocked: keep working in memory
  }
}

export function useDemoSession() {
  const [state, setState] = useState<AppState>(load)

  const update: Update = useCallback(fn => {
    setState(prev => {
      const next = structuredClone(prev)
      fn(next)
      save(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    const s = fresh()
    save(s)
    setState(s)
  }, [])

  const session: Session = { status: 'ready', user: { id: 0, username: 'نسخه نمایشی', role: 'admin' }, state }
  return {
    session,
    error: '',
    clearError: () => {},
    login: async () => {},
    logout: async () => {},
    update,
    refresh: async () => {},
    reset,
  }
}
