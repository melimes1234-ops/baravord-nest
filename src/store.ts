import { useCallback, useEffect, useRef, useState } from 'react'
import type { Batch, Catalog, Movement } from './core'
import { api, ApiError, type ServerState, type User } from './api'

export interface AppState {
  catalog: Catalog
  movements: Movement[]
  batches: Batch[]
}

/** Mutates a draft copy of the state; changes are saved to the server afterwards. */
export type Update = (fn: (draft: AppState) => void) => void

export type Session =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'ready'; user: User; state: AppState }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function useSession() {
  const [session, setSession] = useState<Session>({ status: 'loading' })
  const [error, setError] = useState('')
  const version = useRef(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const dirtyCatalog = useRef<Catalog | null>(null)

  const apply = useCallback((s: ServerState) => {
    version.current = s.version
    setSession({ status: 'ready', user: s.user, state: { catalog: s.catalog, movements: s.movements, batches: s.batches } })
  }, [])

  const refresh = useCallback(async () => {
    try {
      apply(await api<ServerState>('GET', '/api/state'))
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSession({ status: 'anonymous' })
      else setError((e as Error).message)
    }
  }, [apply])

  useEffect(() => { void refresh() }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    await api('POST', '/api/login', { username, password })
    setError('')
    await refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    await api('POST', '/api/logout', {}).catch(() => {})
    setSession({ status: 'anonymous' })
  }, [])

  const flushCatalog = useCallback(async () => {
    const catalog = dirtyCatalog.current
    if (!catalog) return
    dirtyCatalog.current = null
    try {
      const r = await api<{ version: number }>('PUT', '/api/catalog', { catalog, version: version.current })
      version.current = r.version
      setError('')
    } catch (e) {
      setError((e as Error).message)
      await refresh() // show what the server really has
    }
  }, [refresh])

  // Side effects (network) must not run inside a setState updater: React may call it twice.
  const current = useRef<Session>(session)
  useEffect(() => { current.current = session }, [session])

  const update: Update = useCallback(fn => {
    const prev = current.current
    if (prev.status !== 'ready') return
    const next: AppState = structuredClone(prev.state)
    fn(next)

    if (!same(next.catalog, prev.state.catalog)) {
      dirtyCatalog.current = next.catalog
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void flushCatalog(), 700)
    }
    // New records go to the server one by one. The server also writes stock consumption itself,
    // so consumption movements created locally for a batch are not sent.
    const batchIds = new Set(prev.state.batches.map(b => b.id))
    const moveIds = new Set(prev.state.movements.map(m => m.id))
    const newBatches = next.batches.filter(b => !batchIds.has(b.id))
    const newMoves = next.movements.filter(m => !moveIds.has(m.id) && m.type !== 'out')

    // Records are only shown once the server has accepted them, so keep the old lists until refresh().
    const shown: AppState = newBatches.length || newMoves.length
      ? { ...next, batches: prev.state.batches, movements: prev.state.movements }
      : next
    const updated: Session = { ...prev, state: shown }
    current.current = updated
    setSession(updated)

    if (newBatches.length || newMoves.length) {
      void (async () => {
        try {
          for (const m of newMoves) await api('POST', '/api/movements', m)
          for (const b of newBatches) await api('POST', '/api/batches', b)
          setError('')
        } catch (e) {
          setError((e as Error).message)
        }
        await refresh()
      })()
    }
  }, [flushCatalog, refresh])

  return { session, error, clearError: () => setError(''), login, logout, update, refresh }
}
