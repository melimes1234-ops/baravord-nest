import { useCallback, useEffect, useState } from 'react'
import { seedCatalog, type Batch, type Catalog, type Movement } from './core'

export interface AppState {
  catalog: Catalog
  movements: Movement[]
  batches: Batch[]
}

const KEY = 'baravord-nest/v1'

const fresh = (): AppState => ({ catalog: seedCatalog(), movements: [], batches: [] })

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as AppState
  } catch {
    // blocked or corrupt storage: start from the seed
  }
  return fresh()
}

export type Update = (fn: (draft: AppState) => void) => void

export function useAppState() {
  const [state, setState] = useState<AppState>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // storage unavailable: keep working in memory
    }
  }, [state])

  const update: Update = useCallback(fn => {
    setState(prev => {
      const next = structuredClone(prev)
      fn(next)
      return next
    })
  }, [])

  const reset = useCallback(() => setState(fresh()), [])
  return { state, update, reset }
}
