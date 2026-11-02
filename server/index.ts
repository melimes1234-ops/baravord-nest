import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApp } from './app'
import { createUser } from './auth'
import { openDbAuto } from './db'

const PORT = Number(process.env.PORT ?? 3000)
// The folder of the program (when it is the single-file build, `__dirname` is that folder; with tsx it is the working directory).
const BASE = typeof __dirname === 'string' && !__dirname.includes('node_modules') && !__dirname.endsWith('/server') ? __dirname : process.cwd()
// where the data lives (keep it outside the folder the web serves) and where the built web files are
const DATA_DIR = process.env.DATA_DIR ?? resolve(BASE, 'data')
const WEB_DIR = process.env.WEB_DIR ?? resolve(BASE, 'dist')

async function main() {
  const { db, engine } = await openDbAuto(resolve(DATA_DIR, 'baravord.sqlite'))
  console.log(`پایگاه داده: ${engine} — ${resolve(DATA_DIR, 'baravord.sqlite')}`)

  if ((db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n === 0) {
    const password = process.env.ADMIN_PASSWORD ?? randomBytes(9).toString('base64url')
    createUser(db, 'admin', password, 'admin')
    console.log('کاربر ادمین ساخته شد: نام کاربری «admin»')
    if (!process.env.ADMIN_PASSWORD) console.log(`رمز عبور اولیه (یک بار نمایش داده می‌شود، بعد از ورود عوضش کنید): ${password}`)
  }

  const root = new Hono()
  root.route('/', createApp(db))
  if (existsSync(WEB_DIR)) {
    // serveStatic wants a path relative to the working directory
    const rel = WEB_DIR.startsWith(process.cwd()) ? `.${WEB_DIR.slice(process.cwd().length)}` || '.' : WEB_DIR
    root.use('/*', serveStatic({ root: rel }))
    root.get('*', serveStatic({ path: `${rel}/index.html` }))
  } else {
    console.warn(`پوشه‌ی سایت پیدا نشد: ${WEB_DIR}`)
  }

  serve({ fetch: root.fetch, port: PORT }, i => console.log(`http://localhost:${i.port}`))
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
