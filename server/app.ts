import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { bodyLimit } from 'hono/body-limit'
import {
  consumeBatch, currentPrices, seedCatalog, stockLevels,
  type Batch, type Catalog, type ItemRef, type Movement,
} from '../src/core'
import {
  ROLES, createSession, createUser, destroySession, hashPassword, userFromToken,
  validatePassword, verifyPassword, type Role, type User,
} from './auth'
import { tx, type Db } from './db'

type Env = { Variables: { user: User } }

const CATALOG_KEY = 'catalog'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const USERNAME = /^[A-Za-z0-9_.؀-ۿ-]{3,32}$/

class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 429, message: string) {
    super(message)
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, max = 1e9): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max
const str = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

/** Structural check of an uploaded catalog: wrong shapes would break every price calculation. */
export function validateCatalogShape(c: unknown): asserts c is Catalog {
  const bad = (m: string): never => {
    throw new HttpError(400, `داده کاتالوگ معتبر نیست: ${m}`)
  }
  if (!isObj(c)) return bad('ساختار')
  for (const k of ['materials', 'recipes', 'colors', 'products'] as const) if (!isObj(c[k])) bad(k)
  if (!Array.isArray(c.tariffs) || c.tariffs.length === 0) bad('tariffs')
  if (!isObj(c.config)) return bad('config')
  const items = (list: unknown, where: string) => {
    if (!Array.isArray(list)) return bad(where)
    for (const i of list as unknown[]) {
      if (!isObj(i) || !isObj(i.ref) || !str(i.ref.id) || (i.ref.kind !== 'material' && i.ref.kind !== 'recipe') || !num(i.qtyKg, 1e6)) {
        bad(`${where}: جزء نامعتبر`)
      }
    }
  }
  for (const [id, m] of Object.entries(c.materials as Record<string, unknown>)) {
    if (!isObj(m) || m.id !== id || !str(m.name) || (m.pricePerKg !== null && !num(m.pricePerKg, 1e12))) bad(`ماده ${id}`)
  }
  for (const [id, r] of Object.entries(c.recipes as Record<string, unknown>)) {
    if (!isObj(r) || r.id !== id || !str(r.name)) bad(`فرمول ${id}`)
    items((r as Record<string, unknown>).items, `فرمول ${id}`)
  }
  for (const [id, r] of Object.entries(c.colors as Record<string, unknown>)) {
    if (!isObj(r) || r.id !== id || !str(r.name)) bad(`رنگ ${id}`)
    items((r as Record<string, unknown>).items, `رنگ ${id}`)
  }
  for (const [id, p] of Object.entries(c.products as Record<string, unknown>)) {
    if (!isObj(p) || p.id !== id || !str(p.name) || !str(p.baseRecipeId) || typeof p.colorable !== 'boolean') bad(`محصول ${id}`)
    const w = (p as Record<string, unknown>).weightPer3mG
    if (w !== null && !num(w, 1e6)) bad(`وزن محصول ${id}`)
  }
  for (const t of c.tariffs as unknown[]) {
    if (!isObj(t) || !str(t.id) || !str(t.name) || !num(t.marginPct, 1000)) bad('تعرفه')
  }
  const cfg = c.config
  if (!Array.isArray(cfg.monthlyCosts) || !Array.isArray(cfg.perBatchCosts)) bad('config.costs')
  for (const l of [...(cfg.monthlyCosts as unknown[]), ...(cfg.perBatchCosts as unknown[])]) {
    if (!isObj(l) || typeof l.name !== 'string' || !num(l.amount, 1e13)) bad('ردیف هزینه')
  }
  if (!num(cfg.monthlyProductionKg, 1e9) || !num(cfg.batchKg, 1e9) || !num(cfg.wastePct, 99.99) || !num(cfg.roundTo, 1e6) || !num(cfg.defaultTolerancePct, 1000)) {
    bad('config')
  }
  if (!isObj(cfg.toleranceByMaterial)) bad('config.toleranceByMaterial')
}

export function createApp(db: Db) {
  const app = new Hono<Env>()

  const audit = (user: string, action: string, detail: unknown) =>
    db.prepare('INSERT INTO audit (at, username, action, detail) VALUES (?,?,?,?)').run(
      new Date().toISOString(), user, action, JSON.stringify(detail).slice(0, 2000),
    )

  const readCatalog = (): { catalog: Catalog; version: number } => {
    const row = db.prepare('SELECT value, version FROM kv WHERE key = ?').get(CATALOG_KEY) as { value: string; version: number } | undefined
    if (row) return { catalog: JSON.parse(row.value), version: row.version }
    const catalog = seedCatalog()
    db.prepare('INSERT INTO kv (key, value, version) VALUES (?,?,1)').run(CATALOG_KEY, JSON.stringify(catalog))
    return { catalog, version: 1 }
  }
  const readMovements = (): Movement[] =>
    (db.prepare('SELECT json FROM movements ORDER BY date, rowid').all() as { json: string }[]).map(r => JSON.parse(r.json))
  const readBatches = (): Batch[] =>
    (db.prepare('SELECT json FROM batches ORDER BY date DESC, rowid DESC').all() as { json: string }[]).map(r => JSON.parse(r.json))
  const insertMovement = (m: Movement) =>
    db.prepare('INSERT INTO movements (id, date, json) VALUES (?,?,?)').run(m.id, m.date, JSON.stringify(m))

  const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'خطای داخلی سرور' }, 500)
  })

  app.use('/api/*', bodyLimit({ maxSize: 5 * 1024 * 1024, onError: c => c.json({ error: 'حجم درخواست زیاد است' }, 413) }))

  // Mutations must be JSON: a cross-site form post cannot send that content type.
  app.use('/api/*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'DELETE' && !c.req.header('content-type')?.startsWith('application/json')) {
      throw new HttpError(400, 'نوع درخواست نامعتبر است')
    }
    await next()
  })

  app.get('/api/health', c => c.json({ ok: true }))

  // ---- login ----
  const attempts = new Map<string, { n: number; until: number }>()
  app.post('/api/login', async c => {
    const body = await c.req.json().catch(() => null)
    if (!isObj(body) || typeof body.username !== 'string' || typeof body.password !== 'string') {
      throw new HttpError(400, 'نام کاربری و رمز عبور را وارد کنید')
    }
    const key = `${body.username.toLowerCase()}|${c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'local'}`
    const rec = attempts.get(key)
    if (rec && rec.n >= 8 && rec.until > Date.now()) throw new HttpError(429, 'تلاش‌های ناموفق زیاد بود؛ چند دقیقه بعد دوباره تلاش کنید')
    const row = db.prepare('SELECT id, username, role, pass_hash FROM users WHERE username = ?').get(body.username) as
      | { id: number; username: string; role: Role; pass_hash: string } | undefined
    // Always run the hash so response time does not reveal whether the user exists.
    const ok = verifyPassword(body.password, row?.pass_hash ?? hashPassword('x'.repeat(12))) && !!row
    if (!ok || !row) {
      attempts.set(key, { n: (rec && rec.until > Date.now() ? rec.n : 0) + 1, until: Date.now() + 15 * 60_000 })
      throw new HttpError(401, 'نام کاربری یا رمز عبور اشتباه است')
    }
    attempts.delete(key)
    const token = createSession(db, row.id)
    const secure = c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:'
    setCookie(c, 'sid', token, { httpOnly: true, sameSite: 'Strict', secure, path: '/', maxAge: 30 * 86400 })
    audit(row.username, 'login', {})
    return c.json({ user: { id: row.id, username: row.username, role: row.role } })
  })

  app.post('/api/logout', c => {
    const token = getCookie(c, 'sid')
    if (token) destroySession(db, token)
    deleteCookie(c, 'sid', { path: '/' })
    return c.json({ ok: true })
  })

  // ---- everything below needs a session ----
  app.use('/api/*', async (c, next) => {
    const user = userFromToken(db, getCookie(c, 'sid'))
    if (!user) throw new HttpError(401, 'ابتدا وارد شوید')
    c.set('user', user)
    await next()
  })

  const need = (c: Context<Env>, ...roles: Role[]): User => {
    const u = c.get('user')
    if (!roles.includes(u.role)) throw new HttpError(403, 'دسترسی لازم را ندارید')
    return u
  }

  app.get('/api/me', c => c.json({ user: c.get('user') }))

  app.get('/api/state', c => {
    const { catalog, version } = readCatalog()
    return c.json({ user: c.get('user'), catalog, version, movements: readMovements(), batches: readBatches() })
  })

  app.put('/api/catalog', async c => {
    const user = need(c, 'admin')
    const body = await c.req.json().catch(() => null)
    if (!isObj(body) || typeof body.version !== 'number') throw new HttpError(400, 'درخواست نامعتبر')
    validateCatalogShape(body.catalog)
    const version = tx(db, () => {
      const cur = readCatalog()
      if (cur.version !== body.version) throw new HttpError(409, 'کاتالوگ توسط کاربر دیگری تغییر کرده؛ صفحه را تازه کنید')
      const next = cur.version + 1
      db.prepare('UPDATE kv SET value = ?, version = ? WHERE key = ?').run(JSON.stringify(body.catalog), next, CATALOG_KEY)
      audit(user.username, 'catalog.update', { from: cur.version, to: next })
      return next
    })
    return c.json({ version })
  })

  // ---- inventory ----
  app.post('/api/movements', async c => {
    const user = need(c, 'admin', 'operator')
    const b = await c.req.json().catch(() => null)
    if (!isObj(b)) throw new HttpError(400, 'درخواست نامعتبر')
    const type = b.type
    if (type !== 'in' && type !== 'waste_in' && type !== 'adjust') throw new HttpError(400, 'نوع حرکت نامعتبر')
    if (type === 'adjust') need(c, 'admin')
    if (typeof b.date !== 'string' || !ISO_DATE.test(b.date)) throw new HttpError(400, 'تاریخ نامعتبر')
    if (typeof b.kg !== 'number' || !Number.isFinite(b.kg) || b.kg === 0 || Math.abs(b.kg) > 1e7) throw new HttpError(400, 'مقدار نامعتبر')
    if (type !== 'adjust' && b.kg < 0) throw new HttpError(400, 'مقدار ورودی باید مثبت باشد')
    if (b.pricePerKg !== undefined && !num(b.pricePerKg, 1e12)) throw new HttpError(400, 'قیمت نامعتبر')
    const result = tx(db, () => {
      const { catalog, version } = readCatalog()
      if (typeof b.materialId !== 'string' || !catalog.materials[b.materialId]) throw new HttpError(400, 'ماده پیدا نشد')
      const m: Movement = {
        id: uid('M'), date: b.date as string, materialId: b.materialId, kg: b.kg as number, type,
        pricePerKg: type === 'in' ? (b.pricePerKg as number | undefined) : undefined,
        note: typeof b.note === 'string' ? b.note.slice(0, 200) : undefined,
      }
      insertMovement(m)
      if (m.type === 'adjust' && stockLevels(readMovements())[m.materialId].qtyKg < -1e-9) {
        throw new HttpError(409, 'تعدیل موجودی را منفی می‌کند')
      }
      // A priced purchase moves the material price to the weighted average of the stock.
      let newVersion = version
      if (m.type === 'in' && m.pricePerKg != null) {
        const avg = stockLevels(readMovements())[m.materialId].avgPrice
        if (avg != null) {
          catalog.materials[m.materialId].pricePerKg = avg
          newVersion = version + 1
          db.prepare('UPDATE kv SET value = ?, version = ? WHERE key = ?').run(JSON.stringify(catalog), newVersion, CATALOG_KEY)
        }
      }
      audit(user.username, 'movement.add', m)
      return { id: m.id, version: newVersion }
    })
    return c.json(result)
  })

  // ---- batches ----
  app.post('/api/batches', async c => {
    const user = need(c, 'admin', 'operator')
    const b = await c.req.json().catch(() => null)
    if (!isObj(b)) throw new HttpError(400, 'درخواست نامعتبر')
    if (typeof b.date !== 'string' || !ISO_DATE.test(b.date)) throw new HttpError(400, 'تاریخ نامعتبر')
    if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 200) throw new HttpError(400, 'اجزای پارت نامعتبر')
    const batch = tx(db, () => {
      const { catalog } = readCatalog()
      const product = typeof b.productId === 'string' ? catalog.products[b.productId] : undefined
      if (!product) throw new HttpError(400, 'محصول پیدا نشد')
      const colorId = b.colorId == null ? null : b.colorId
      if (colorId !== null && (typeof colorId !== 'string' || !catalog.colors[colorId] || !product.colorable)) {
        throw new HttpError(400, 'رنگ نامعتبر')
      }
      const items = (b.items as unknown[]).map(i => {
        if (!isObj(i) || !isObj(i.ref) || !num(i.stdQty, 1e6) || !num(i.actualQty, 1e6)) throw new HttpError(400, 'جزء پارت نامعتبر')
        const ref = i.ref as unknown as ItemRef
        const exists = ref.kind === 'material' ? catalog.materials[ref.id] : ref.kind === 'recipe' ? catalog.recipes[ref.id] : undefined
        if (!exists) throw new HttpError(400, 'ماده یا فرمول پیدا نشد')
        return { ref: { kind: ref.kind, id: ref.id } as ItemRef, stdQty: i.stdQty, actualQty: i.actualQty }
      })
      const changes = (Array.isArray(b.changes) ? b.changes : []).slice(0, 500).filter(isObj).map(ch => ({
        at: new Date().toISOString(),
        by: user.username, // never trust the client for who made a change
        what: String(ch.what ?? '').slice(0, 200),
        reason: ch.reason == null ? undefined : String(ch.reason).slice(0, 300),
      }))
      const saved: Batch = {
        id: uid('B'), date: b.date as string, productId: product.id, colorId, items,
        frozenPrices: currentPrices(catalog), // prices are frozen by the server, not the client
        note: typeof b.note === 'string' ? b.note.slice(0, 300) : undefined,
        changes,
      }
      let moves: Movement[]
      try {
        moves = consumeBatch(saved, catalog, readMovements())
      } catch (e) {
        throw new HttpError(409, (e as Error).message)
      }
      db.prepare('INSERT INTO batches (id, date, json) VALUES (?,?,?)').run(saved.id, saved.date, JSON.stringify(saved))
      for (const m of moves.slice(readMovements().length)) insertMovement(m)
      audit(user.username, 'batch.add', { id: saved.id, productId: saved.productId, colorId })
      return saved
    })
    return c.json({ batch })
  })

  // ---- users (admin) ----
  app.get('/api/users', c => {
    need(c, 'admin')
    return c.json({ users: db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id').all() })
  })

  app.post('/api/users', async c => {
    const admin = need(c, 'admin')
    const b = await c.req.json().catch(() => null)
    if (!isObj(b) || typeof b.username !== 'string' || !USERNAME.test(b.username)) throw new HttpError(400, 'نام کاربری باید ۳ تا ۳۲ نویسه (حرف، عدد، _ . -) باشد')
    const pwErr = validatePassword(b.password)
    if (pwErr) throw new HttpError(400, pwErr)
    if (!ROLES.includes(b.role as Role)) throw new HttpError(400, 'نقش نامعتبر')
    try {
      const id = createUser(db, b.username, b.password as string, b.role as Role)
      audit(admin.username, 'user.add', { username: b.username, role: b.role })
      return c.json({ id })
    } catch {
      throw new HttpError(409, 'این نام کاربری قبلاً ثبت شده')
    }
  })

  const adminCount = () => (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number }).n

  app.patch('/api/users/:id', async c => {
    const admin = need(c, 'admin')
    const id = Number(c.req.param('id'))
    const b = await c.req.json().catch(() => null)
    const target = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(id) as { id: number; username: string; role: Role } | undefined
    if (!target || !isObj(b)) throw new HttpError(404, 'کاربر پیدا نشد')
    tx(db, () => {
      if (b.role !== undefined) {
        if (!ROLES.includes(b.role as Role)) throw new HttpError(400, 'نقش نامعتبر')
        if (target.role === 'admin' && b.role !== 'admin' && adminCount() <= 1) throw new HttpError(409, 'آخرین ادمین را نمی‌توان تنزل داد')
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role as string, id)
      }
      if (b.password !== undefined) {
        const pwErr = validatePassword(b.password)
        if (pwErr) throw new HttpError(400, pwErr)
        db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(b.password as string), id)
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id) // force re-login everywhere
      }
      audit(admin.username, 'user.update', { username: target.username, role: b.role, passwordChanged: b.password !== undefined })
    })
    return c.json({ ok: true })
  })

  app.delete('/api/users/:id', c => {
    const admin = need(c, 'admin')
    const id = Number(c.req.param('id'))
    const target = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(id) as { id: number; username: string; role: Role } | undefined
    if (!target) throw new HttpError(404, 'کاربر پیدا نشد')
    if (target.id === admin.id) throw new HttpError(409, 'نمی‌توانید خودتان را حذف کنید')
    db.prepare('DELETE FROM users WHERE id = ?').run(id)
    audit(admin.username, 'user.delete', { username: target.username })
    return c.json({ ok: true })
  })

  app.get('/api/audit', c => {
    need(c, 'admin')
    return c.json({ rows: db.prepare('SELECT at, username, action, detail FROM audit ORDER BY id DESC LIMIT 200').all() })
  })

  return app
}
