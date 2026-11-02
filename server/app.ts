import { randomBytes, timingSafeEqual } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { bodyLimit } from 'hono/body-limit'
import {
  buildSitePrices, catalogChanges, consumeBatch, currentPrices, defaultSiteTariff, seedCatalog, stockLevels, todayIso,
  type Batch, type Catalog, type GoodsMove, goodsKey, goodsStock, type ItemRef, type Movement,
} from '../src/core'
import {
  ROLES, createSession, createUser, destroySession, hashPassword, userFromToken,
  validatePassword, verifyPassword, type Role, type User,
} from './auth'
import { tx, type Db } from './db'

type Env = { Variables: { user: User } }

const CATALOG_KEY = 'catalog'
/** Settings for handing the prices to the company website: { key, tariffId }. Kept apart from the catalog so a restore or a viewer never touches the key. */
const SITE_KEY = 'site_sync'
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
    const oh = (r as Record<string, unknown>).overheadPerKg
    if (oh !== undefined && !num(oh, 1e9)) bad(`هزینه‌ی مرحله‌ی ${id}`)
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
  if (cfg.chequeSurchargePct !== undefined && !num(cfg.chequeSurchargePct, 1000)) bad('config.chequeSurchargePct')
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

  const readGoods = (): GoodsMove[] =>
    (db.prepare('SELECT json FROM goods ORDER BY date, rowid').all() as { json: string }[]).map(r => JSON.parse(r.json))

  const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'خطای داخلی سرور' }, 500)
  })

  // a full restore carries the whole history, so it may be bigger than any other request
  const limitBig = bodyLimit({ maxSize: 60 * 1024 * 1024, onError: c => c.json({ error: 'حجم فایل زیاد است' }, 413) })
  const limitSmall = bodyLimit({ maxSize: 5 * 1024 * 1024, onError: c => c.json({ error: 'حجم درخواست زیاد است' }, 413) })
  app.use('/api/*', (c, next) => (c.req.path === '/api/restore' ? limitBig(c, next) : limitSmall(c, next)))

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

  // ---- prices for the company website (needs the secret key, not a login) ----
  interface SiteSync { key: string; tariffId: string }
  const readSite = (): SiteSync => {
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(SITE_KEY) as { value: string } | undefined
    try {
      const v = row ? JSON.parse(row.value) : {}
      return { key: typeof v.key === 'string' ? v.key : '', tariffId: typeof v.tariffId === 'string' ? v.tariffId : '' }
    } catch {
      return { key: '', tariffId: '' }
    }
  }
  const writeSite = (v: SiteSync) =>
    db.prepare('INSERT INTO kv (key, value, version) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(SITE_KEY, JSON.stringify(v))
  const sameKey = (a: string, b: string): boolean => {
    const x = Buffer.from(a)
    const y = Buffer.from(b)
    return x.length === y.length && timingSafeEqual(x, y)
  }
  app.get('/api/public/prices', c => {
    const site = readSite()
    c.header('Cache-Control', 'no-store')
    if (!site.key) throw new HttpError(404, 'اتصال به سایت فعال نیست')
    const auth = c.req.header('authorization') ?? ''
    const given = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (c.req.header('x-site-key') ?? c.req.query('key') ?? '')
    if (!sameKey(given, site.key)) throw new HttpError(401, 'کلید نادرست است')
    const { catalog } = readCatalog()
    const tariff = catalog.tariffs.find(t => t.id === site.tariffId) ?? defaultSiteTariff(catalog)
    if (!tariff) throw new HttpError(409, 'تعرفه‌ای تعریف نشده')
    return c.json(buildSitePrices(catalog, tariff, todayIso()))
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
    return c.json({ user: c.get('user'), catalog, version, movements: readMovements(), batches: readBatches(), goods: readGoods() })
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
      audit(user.username, 'catalog.update', { from: cur.version, to: next, changes: catalogChanges(cur.catalog, body.catalog as Catalog) })
      return next
    })
    return c.json({ version })
  })

  // ---- connection to the company website (admin) ----
  const siteView = () => {
    const { catalog } = readCatalog()
    const site = readSite()
    const tariff = catalog.tariffs.find(t => t.id === site.tariffId) ?? defaultSiteTariff(catalog)
    return { enabled: !!site.key, key: site.key, tariffId: tariff?.id ?? '' }
  }
  app.get('/api/site-sync', c => {
    need(c, 'admin')
    return c.json(siteView())
  })
  app.put('/api/site-sync', async c => {
    const user = need(c, 'admin')
    const body = await c.req.json().catch(() => null)
    if (!isObj(body)) throw new HttpError(400, 'درخواست نامعتبر')
    const cur = readSite()
    const next: SiteSync = { ...cur }
    if (body.tariffId !== undefined) {
      if (typeof body.tariffId !== 'string' || !readCatalog().catalog.tariffs.some(t => t.id === body.tariffId)) throw new HttpError(400, 'تعرفه پیدا نشد')
      next.tariffId = body.tariffId
    }
    if (body.action === 'enable' && !next.key) next.key = randomBytes(24).toString('hex')
    if (body.action === 'regenerate') next.key = randomBytes(24).toString('hex')
    if (body.action === 'disable') next.key = ''
    writeSite(next)
    audit(user.username, 'site-sync', { action: body.action ?? 'tariff', tariffId: next.tariffId })
    return c.json(siteView())
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

  // ---- finished goods ----
  app.post('/api/goods', async c => {
    const user = need(c, 'admin', 'operator')
    const b = await c.req.json().catch(() => null)
    if (!isObj(b)) throw new HttpError(400, 'درخواست نامعتبر')
    const type = b.type
    if (type !== 'in' && type !== 'out' && type !== 'scrap') throw new HttpError(400, 'نوع نامعتبر')
    if (typeof b.date !== 'string' || !ISO_DATE.test(b.date)) throw new HttpError(400, 'تاریخ نامعتبر')
    const text = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined)
    const g = tx(db, () => {
      const { catalog } = readCatalog()
      const rec: GoodsMove = { id: uid('G'), date: b.date as string, type, note: text(b.note, 200), batchId: text(b.batchId, 40) }
      if (b.productId != null) {
        if (typeof b.productId !== 'string' || !catalog.products[b.productId]) throw new HttpError(400, 'محصول پیدا نشد')
        rec.productId = b.productId
      }
      if (type === 'scrap') {
        if (!num(b.kg, 1e6) || (b.kg as number) <= 0) throw new HttpError(400, 'وزن ضایعات نامعتبر')
        rec.kg = b.kg as number
        rec.returned = b.returned === true
      } else {
        const product = rec.productId ? catalog.products[rec.productId] : undefined
        if (!product) throw new HttpError(400, 'محصول پیدا نشد')
        const colorId = b.colorId == null ? null : b.colorId
        if (colorId !== null && (typeof colorId !== 'string' || !catalog.colors[colorId] || !product.colorable)) throw new HttpError(400, 'رنگ نامعتبر')
        if (!num(b.lengthM, 20) || (b.lengthM as number) < 0.1) throw new HttpError(400, 'طول نامعتبر')
        if (!Number.isInteger(b.sticks) || (b.sticks as number) < 1 || (b.sticks as number) > 1e6) throw new HttpError(400, 'تعداد شاخه نامعتبر')
        rec.colorId = colorId
        rec.lengthM = b.lengthM as number
        rec.sticks = b.sticks as number
        if (type === 'out') {
          rec.reason = b.reason === 'sample' || b.reason === 'other' ? b.reason : 'sale'
          rec.party = text(b.party, 100)
          const have = goodsStock(readGoods()).find(r => r.key === goodsKey(rec.productId!, colorId, rec.lengthM!))?.sticks ?? 0
          if (rec.sticks > have) throw new HttpError(409, `موجودی کافی نیست؛ فقط ${have} شاخه داریم`)
        }
      }
      db.prepare('INSERT INTO goods (id, date, json) VALUES (?,?,?)').run(rec.id, rec.date, JSON.stringify(rec))
      audit(user.username, 'goods.add', rec)
      return rec
    })
    return c.json({ goods: g })
  })

  app.delete('/api/goods/:id', c => {
    const user = need(c, 'admin')
    const id = c.req.param('id')
    tx(db, () => {
      const rec = readGoods().find(g => g.id === id)
      if (!rec) throw new HttpError(404, 'این مورد پیدا نشد')
      db.prepare('DELETE FROM goods WHERE id = ?').run(id)
      if (rec.type === 'in' && rec.productId && rec.lengthM) {
        const left = goodsStock(readGoods()).find(r => r.key === goodsKey(rec.productId!, rec.colorId, rec.lengthM!))?.sticks ?? 0
        if (left < 0) throw new HttpError(409, 'بعد از این ثبت، چند شاخه از همین محصول خارج شده؛ اول آن خروج‌ها را حذف کنید')
      }
      if (rec.type === 'scrap' && rec.returned && rec.kg) {
        // take the returned waste out of the materials store again
        insertMovement({ id: uid('M'), date: rec.date, materialId: 'waste', kg: -rec.kg, type: 'adjust', note: 'حذف ضایعات برگشتیِ ثبت‌شده' })
        if (stockLevels(readMovements()).waste.qtyKg < -1e-9) throw new HttpError(409, 'ضایعات برگشتی قبلاً در پارت‌ها مصرف شده و حذفش ممکن نیست')
      }
      audit(user.username, 'goods.delete', rec)
    })
    return c.json({ ok: true })
  })

  // ---- full restore (admin): moves everything from a backup file, e.g. from another installation ----
  app.post('/api/restore', async c => {
    const user = need(c, 'admin')
    const b = await c.req.json().catch(() => null)
    if (!isObj(b)) throw new HttpError(400, 'فایل پشتیبان معتبر نیست')
    validateCatalogShape(b.catalog)
    const list = (v: unknown, what: string): Record<string, unknown>[] => {
      if (v === undefined) return []
      if (!Array.isArray(v) || v.length > 500_000) throw new HttpError(400, `فهرست ${what} در فایل معتبر نیست`)
      const ids = new Set<string>()
      for (const r of v) {
        if (!isObj(r) || typeof r.id !== 'string' || !r.id || r.id.length > 100 || ids.has(r.id) || typeof r.date !== 'string' || !ISO_DATE.test(r.date)) {
          throw new HttpError(400, `یکی از ردیف‌های ${what} در فایل معتبر نیست`)
        }
        ids.add(r.id)
      }
      return v as Record<string, unknown>[]
    }
    const movements = list(b.movements, 'انبار')
    const batches = list(b.batches, 'پارت‌ها')
    const goods = list(b.goods, 'محصول ساخته‌شده')
    for (const m of movements) {
      if (typeof m.materialId !== 'string' || typeof m.kg !== 'number' || !Number.isFinite(m.kg) || !['in', 'out', 'waste_in', 'adjust'].includes(String(m.type))) {
        throw new HttpError(400, 'یکی از ردیف‌های انبار در فایل معتبر نیست')
      }
    }
    for (const x of batches) if (typeof x.productId !== 'string' || !Array.isArray(x.items)) throw new HttpError(400, 'یکی از پارت‌های فایل معتبر نیست')
    for (const g of goods) if (!['in', 'out', 'scrap'].includes(String(g.type))) throw new HttpError(400, 'یکی از ردیف‌های محصول ساخته‌شده در فایل معتبر نیست')

    const version = tx(db, () => {
      db.prepare('DELETE FROM movements').run()
      db.prepare('DELETE FROM batches').run()
      db.prepare('DELETE FROM goods').run()
      for (const m of movements) db.prepare('INSERT INTO movements (id, date, json) VALUES (?,?,?)').run(m.id, m.date, JSON.stringify(m))
      for (const x of batches) db.prepare('INSERT INTO batches (id, date, json) VALUES (?,?,?)').run(x.id, x.date, JSON.stringify(x))
      for (const g of goods) db.prepare('INSERT INTO goods (id, date, json) VALUES (?,?,?)').run(g.id, g.date, JSON.stringify(g))
      const cur = db.prepare('SELECT version FROM kv WHERE key = ?').get(CATALOG_KEY) as { version: number } | undefined
      const next = (cur?.version ?? 0) + 1
      if (cur) db.prepare('UPDATE kv SET value = ?, version = ? WHERE key = ?').run(JSON.stringify(b.catalog), next, CATALOG_KEY)
      else db.prepare('INSERT INTO kv (key, value, version) VALUES (?,?,?)').run(CATALOG_KEY, JSON.stringify(b.catalog), next)
      audit(user.username, 'restore', { movements: movements.length, batches: batches.length, goods: goods.length })
      return next
    })
    return c.json({ version, movements: movements.length, batches: batches.length, goods: goods.length })
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
