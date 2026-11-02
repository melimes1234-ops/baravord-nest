import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { createUser } from './auth'
import { SCHEMA, tx } from './db'
import { openSqlJs } from './sqljs'

const PW = 'password123'
const json = (method: string, body?: unknown, cookie?: string) => ({
  method,
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
})

describe('the pure-JavaScript database (Node versions without node:sqlite)', () => {
  it('runs the API, keeps rolled-back changes out, and the file survives a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wpc-'))
    const file = join(dir, 'data', 'a.sqlite')
    try {
      let db = await openSqlJs(file, SCHEMA)
      createUser(db, 'admin', PW, 'admin')
      let app = createApp(db)
      const login = async () => {
        const r = await app.request('/api/login', json('POST', { username: 'admin', password: PW }))
        expect(r.status).toBe(200)
        return r.headers.get('set-cookie')!.split(';')[0]
      }
      let cookie = await login()
      const state = async () => (await (await app.request('/api/state', { headers: { cookie } })).json()) as any
      const s0 = await state()
      expect(Object.keys(s0.catalog.products).length).toBeGreaterThan(20)

      const mv = await app.request('/api/movements', json('POST', { type: 'in', date: '2026-10-04', materialId: 'wax', kg: 10, pricePerKg: 700_000 }, cookie))
      expect(mv.status).toBe(200)
      // a transaction that fails leaves nothing behind
      expect(() => tx(db, () => { db.prepare('DELETE FROM movements').run(); throw new Error('boom') })).toThrow('boom')
      expect((await state()).movements).toHaveLength(1)
      // a unique-name clash is an error, not a crash
      expect((await app.request('/api/users', json('POST', { username: 'admin', password: PW, role: 'viewer' }, cookie))).status).toBe(409)

      // a restore of everything
      const backup = { catalog: s0.catalog, movements: [], batches: [], goods: [] }
      expect((await app.request('/api/restore', json('POST', backup, cookie))).status).toBe(200)
      expect((await state()).movements).toHaveLength(0)
      await app.request('/api/movements', json('POST', { type: 'in', date: '2026-10-05', materialId: 'wood', kg: 7 }, cookie))

      // restart: the same file, a new process
      db = await openSqlJs(file, SCHEMA)
      app = createApp(db)
      cookie = await login()
      const s1 = await state()
      expect(s1.movements).toHaveLength(1)
      expect(s1.movements[0]).toMatchObject({ materialId: 'wood', kg: 7 })
      expect(s1.user.username).toBe('admin')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
