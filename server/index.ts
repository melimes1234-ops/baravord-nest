import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApp } from './app'
import { createUser } from './auth'
import { openDb } from './db'

const PORT = Number(process.env.PORT ?? 3000)
const DATA_DIR = process.env.DATA_DIR ?? resolve('data')
const db = openDb(resolve(DATA_DIR, 'baravord.sqlite'))

if ((db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n === 0) {
  const password = process.env.ADMIN_PASSWORD ?? randomBytes(9).toString('base64url')
  createUser(db, 'admin', password, 'admin')
  console.log('کاربر ادمین ساخته شد: نام کاربری «admin»')
  if (!process.env.ADMIN_PASSWORD) console.log(`رمز عبور اولیه (یک بار نمایش داده می‌شود، بعد از ورود عوضش کنید): ${password}`)
}

const root = new Hono()
root.route('/', createApp(db))
const dist = resolve('dist')
if (existsSync(dist)) {
  root.use('/*', serveStatic({ root: './dist' }))
  root.get('*', serveStatic({ path: './dist/index.html' }))
}

serve({ fetch: root.fetch, port: PORT }, i => console.log(`http://localhost:${i.port}`))
