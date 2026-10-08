import { api, type ServerState } from '../api'
import type { Backend } from '../backend'

export const serverBackend: Backend = {
  kind: 'server',
  identityLabel: 'نام کاربری',
  loadState: () => api<ServerState>('GET', '/api/state'),
  login: async (username, password) => {
    await api('POST', '/api/login', { username, password })
  },
  logout: async () => {
    await api('POST', '/api/logout', {}).catch(() => {})
  },
  saveCatalog: async (catalog, version) =>
    (await api<{ version: number }>('PUT', '/api/catalog', { catalog, version })).version,
  addMovement: async m => {
    await api('POST', '/api/movements', m)
  },
  addBatch: async b => {
    await api('POST', '/api/batches', b)
  },
}
