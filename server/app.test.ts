import { beforeEach, describe, expect, it } from 'vitest'
import { productItems, type Catalog } from '../src/core'
import { createApp } from './app'
import { createUser } from './auth'
import { openDb } from './db'

const PW = 'password123'

function setup() {
  const db = openDb(':memory:')
  createUser(db, 'admin', PW, 'admin')
  createUser(db, 'op', PW, 'operator')
  createUser(db, 'view', PW, 'viewer')
  const app = createApp(db)

  async function login(username: string) {
    const r = await app.request('/api/login', json('POST', { username, password: PW }))
    expect(r.status).toBe(200)
    return r.headers.get('set-cookie')!.split(';')[0]
  }
  const call = async (cookie: string | null, method: string, path: string, body?: unknown) => {
    const r = await app.request(path, { ...json(method, body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } })
    return { status: r.status, body: await r.json().catch(() => null) as any }
  }
  return { app, db, login, call }
}
const json = (method: string, body?: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

describe('auth', () => {
  it('rejects anonymous access and wrong passwords', async () => {
    const { app, call } = setup()
    expect((await call(null, 'GET', '/api/state')).status).toBe(401)
    const r = await app.request('/api/login', json('POST', { username: 'admin', password: 'nope-nope' }))
    expect(r.status).toBe(401)
    expect((await call(null, 'POST', '/api/login', { username: 'ghost', password: 'whatever1' })).status).toBe(401)
  })

  it('cookie is HttpOnly + SameSite=Strict and logout kills the session', async () => {
    const { app, login, call } = setup()
    const r = await app.request('/api/login', json('POST', { username: 'admin', password: PW }))
    const sc = r.headers.get('set-cookie')!
    expect(sc).toMatch(/HttpOnly/i)
    expect(sc).toMatch(/SameSite=Strict/i)
    const cookie = await login('admin')
    expect((await call(cookie, 'GET', '/api/me')).body.user.role).toBe('admin')
    await call(cookie, 'POST', '/api/logout', {})
    expect((await call(cookie, 'GET', '/api/me')).status).toBe(401)
  })

  it('locks out after repeated failures', async () => {
    const { call } = setup()
    for (let i = 0; i < 8; i++) await call(null, 'POST', '/api/login', { username: 'admin', password: 'bad-bad-bad' })
    expect((await call(null, 'POST', '/api/login', { username: 'admin', password: PW })).status).toBe(429)
  })

  it('refuses non-JSON mutations (CSRF)', async () => {
    const { app, login } = setup()
    const cookie = await login('admin')
    const r = await app.request('/api/users', { method: 'POST', headers: { cookie, 'content-type': 'text/plain' }, body: '{}' })
    expect(r.status).toBe(400)
  })
})

describe('roles', () => {
  let ctx: ReturnType<typeof setup>
  let admin: string, op: string, view: string
  let catalog: Catalog, version: number
  beforeEach(async () => {
    ctx = setup()
    ;[admin, op, view] = await Promise.all([ctx.login('admin'), ctx.login('op'), ctx.login('view')])
    const s = (await ctx.call(admin, 'GET', '/api/state')).body
    catalog = s.catalog; version = s.version
  })

  it('only admin can change the catalog or users', async () => {
    expect((await ctx.call(op, 'PUT', '/api/catalog', { catalog, version })).status).toBe(403)
    expect((await ctx.call(view, 'PUT', '/api/catalog', { catalog, version })).status).toBe(403)
    expect((await ctx.call(op, 'GET', '/api/users')).status).toBe(403)
    expect((await ctx.call(admin, 'PUT', '/api/catalog', { catalog, version })).status).toBe(200)
  })

  it('catalog update uses optimistic versioning', async () => {
    const ok = await ctx.call(admin, 'PUT', '/api/catalog', { catalog, version })
    expect(ok.body.version).toBe(version + 1)
    expect((await ctx.call(admin, 'PUT', '/api/catalog', { catalog, version })).status).toBe(409)
  })

  it('rejects malformed or negative catalog data', async () => {
    const bad = structuredClone(catalog)
    bad.materials.wax.pricePerKg = -5
    expect((await ctx.call(admin, 'PUT', '/api/catalog', { catalog: bad, version })).status).toBe(400)
    const bad2 = structuredClone(catalog) as any
    bad2.config.wastePct = 100
    expect((await ctx.call(admin, 'PUT', '/api/catalog', { catalog: bad2, version })).status).toBe(400)
  })

  it('viewer cannot write anything', async () => {
    const m = { type: 'in', date: '2026-10-04', materialId: 'wax', kg: 10 }
    expect((await ctx.call(view, 'POST', '/api/movements', m)).status).toBe(403)
    expect((await ctx.call(view, 'POST', '/api/batches', {})).status).toBe(403)
  })

  it('operator purchase updates the stock and the material price (weighted average)', async () => {
    const buy = (kg: number, price: number) => ctx.call(op, 'POST', '/api/movements', { type: 'in', date: '2026-10-04', materialId: 'wax', kg, pricePerKg: price })
    expect((await buy(100, 200)).status).toBe(200)
    expect((await buy(100, 300)).status).toBe(200)
    const s = (await ctx.call(op, 'GET', '/api/state')).body
    expect(s.catalog.materials.wax.pricePerKg).toBe(250)
    expect(s.version).toBe(version + 2)
  })

  it('only admin may adjust stock, and not below zero', async () => {
    const adj = { type: 'adjust', date: '2026-10-04', materialId: 'wax', kg: -5 }
    expect((await ctx.call(op, 'POST', '/api/movements', adj)).status).toBe(403)
    expect((await ctx.call(admin, 'POST', '/api/movements', adj)).status).toBe(409)
  })

  const stockAll = async (kg: number) => {
    for (const id of Object.keys(catalog.materials)) {
      await ctx.call(op, 'POST', '/api/movements', { type: 'in', date: '2026-10-01', materialId: id, kg })
    }
  }
  const flexBatch = (over: Record<string, number> = {}) => ({
    date: '2026-10-04', productId: 'flex', colorId: 'n1',
    items: productItems(catalog.products.flex, 'n1', catalog).map(i => ({ ref: i.ref, stdQty: i.qtyKg, actualQty: over[i.ref.id] ?? i.qtyKg })),
    changes: [{ by: 'hacker', what: 'wax 3', reason: 'test' }],
  })

  it('a batch consumes stock on the server, freezes server prices and ignores client "by"', async () => {
    await stockAll(1000)
    const r = await ctx.call(op, 'POST', '/api/batches', { ...flexBatch({ wax: 3 }), frozenPrices: { wax: 1 } })
    expect(r.status).toBe(200)
    expect(r.body.batch.frozenPrices.wax).toBe(catalog.materials.wax.pricePerKg)
    expect(r.body.batch.changes[0].by).toBe('op')
    const s = (await ctx.call(op, 'GET', '/api/state')).body
    const wax = s.movements.filter((m: any) => m.materialId === 'wax')
    expect(wax.reduce((t: number, m: any) => t + m.kg, 0)).toBeCloseTo(997, 9)
    expect(s.batches).toHaveLength(1)
  })

  it('refuses a batch when stock is short and writes nothing', async () => {
    const r = await ctx.call(op, 'POST', '/api/batches', flexBatch())
    expect(r.status).toBe(409)
    const s = (await ctx.call(op, 'GET', '/api/state')).body
    expect(s.batches).toHaveLength(0)
    expect(s.movements).toHaveLength(0)
  })

  it('validates batch input', async () => {
    await stockAll(1000)
    const b = flexBatch()
    expect((await ctx.call(op, 'POST', '/api/batches', { ...b, productId: 'nope' })).status).toBe(400)
    expect((await ctx.call(op, 'POST', '/api/batches', { ...b, colorId: 'zzz' })).status).toBe(400)
    expect((await ctx.call(op, 'POST', '/api/batches', { ...b, items: [{ ref: { kind: 'material', id: 'wax' }, stdQty: 1, actualQty: -1 }] })).status).toBe(400)
    expect((await ctx.call(op, 'POST', '/api/batches', { ...b, items: [{ ref: { kind: 'material', id: 'ghost' }, stdQty: 1, actualQty: 1 }] })).status).toBe(400)
  })
})

describe('user management', () => {
  it('admin manages users but cannot remove or demote the last admin / self', async () => {
    const { login, call } = setup()
    const admin = await login('admin')
    expect((await call(admin, 'POST', '/api/users', { username: 'new1', password: 'short', role: 'viewer' })).status).toBe(400)
    const ok = await call(admin, 'POST', '/api/users', { username: 'new1', password: 'longenough1', role: 'operator' })
    expect(ok.status).toBe(200)
    expect((await call(admin, 'POST', '/api/users', { username: 'new1', password: 'longenough1', role: 'operator' })).status).toBe(409)
    const me = (await call(admin, 'GET', '/api/me')).body.user.id
    expect((await call(admin, 'DELETE', `/api/users/${me}`)).status).toBe(409)
    expect((await call(admin, 'PATCH', `/api/users/${me}`, { role: 'viewer' })).status).toBe(409)
    expect((await call(admin, 'DELETE', `/api/users/${ok.body.id}`)).status).toBe(200)
  })

  it('changing a password signs that user out', async () => {
    const { login, call } = setup()
    const admin = await login('admin')
    const op = await login('op')
    const id = (await call(op, 'GET', '/api/me')).body.user.id
    expect((await call(admin, 'PATCH', `/api/users/${id}`, { password: 'brand-new-pass' })).status).toBe(200)
    expect((await call(op, 'GET', '/api/me')).status).toBe(401)
  })
})
