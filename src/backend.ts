import type { Batch, Catalog, GoodsMove, Movement } from './core'
import type { ServerState } from './api'

/** What the app needs from a data store. Two implementations: own Node server, or Supabase. */
export interface Backend {
  kind: 'server' | 'supabase'
  /** Label of the login identifier shown on the login form. */
  identityLabel: string
  /** Throws ApiError(401) when nobody is signed in. */
  loadState(): Promise<ServerState>
  login(identity: string, password: string): Promise<void>
  logout(): Promise<void>
  /** Returns the new catalog version. */
  saveCatalog(catalog: Catalog, version: number, note?: string): Promise<number>
  addMovement(m: Movement): Promise<void>
  addBatch(b: Batch): Promise<void>
  addGoods(g: GoodsMove): Promise<void>
  deleteGoods(id: string): Promise<void>
}
