import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ApiError, type Role, type ServerState } from '../api'
import type { Backend } from '../backend'
import { seedCatalog, type Catalog } from '../core'

declare global {
  interface Window {
    /** Set in config.js next to index.html, so the built site can be pointed at a project without rebuilding. */
    WPC_CONFIG?: { supabaseUrl?: string; supabaseAnonKey?: string }
  }
}

export function supabaseConfig(): { url: string; key: string } | null {
  const w = typeof window !== 'undefined' ? window.WPC_CONFIG : undefined
  const url = w?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL
  const key = w?.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY
  return url && key ? { url, key } : null
}

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  if (!client) {
    const cfg = supabaseConfig()
    if (!cfg) throw new Error('Supabase تنظیم نشده است')
    client = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } })
  }
  return client
}

/** Turns a Supabase/Postgres error into the app's error type (401 = sign in again). */
function fail(error: { message: string; code?: string; status?: number }): never {
  const notSignedIn = error.code === '28000' || error.code === 'PGRST301' || error.status === 401
  if (notSignedIn) throw new ApiError(401, 'ابتدا وارد شوید')
  if (error.code === '42501') throw new ApiError(403, 'دسترسی لازم را ندارید')
  if (error.code === '40001') throw new ApiError(409, error.message)
  throw new ApiError(error.status ?? 400, error.message)
}

export async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(name, args)
  if (error) fail(error)
  return data as T
}

export const supabaseBackend: Backend = {
  kind: 'supabase',
  identityLabel: 'ایمیل',
  async loadState() {
    const { data: s } = await supabase().auth.getSession()
    if (!s.session) throw new ApiError(401, 'ابتدا وارد شوید')
    type Raw = { role: Role; email: string } & Omit<ServerState, 'user' | 'catalog'> & { catalog: Catalog | null }
    let st = await rpc<Raw>('get_state')
    if (!st.catalog) {
      // First run: the project has no catalog yet. The first admin to sign in creates the starting one.
      if (st.role !== 'admin') throw new ApiError(503, 'سیستم هنوز راه‌اندازی نشده؛ ادمین باید یک بار وارد شود')
      await rpc('init_catalog', { p_catalog: seedCatalog() })
      st = await rpc<Raw>('get_state')
    }
    return {
      user: { id: 0, username: st.email, role: st.role },
      catalog: st.catalog as Catalog,
      version: st.version,
      movements: st.movements,
      batches: st.batches,
    }
  },
  async login(email, password) {
    const { error } = await supabase().auth.signInWithPassword({ email, password })
    if (error) throw new ApiError(401, 'ایمیل یا رمز عبور اشتباه است')
  },
  async logout() {
    await supabase().auth.signOut()
  },
  saveCatalog: (catalog, version) => rpc<number>('save_catalog', { p_catalog: catalog, p_version: version }),
  async addMovement(m) {
    await rpc('add_movement', { p: m })
  },
  async addBatch(b) {
    await rpc('add_batch', { p: b })
  },
}
