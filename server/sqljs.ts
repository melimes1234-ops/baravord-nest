import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import initSqlJs from 'sql.js/dist/sql-wasm-inline.js'
import type { Database } from 'sql.js'
import type { Db, Stmt } from './db'

type Param = string | number | null | Uint8Array

const bindable = (a: unknown[]): Param[] =>
  a.map(v => (v === undefined ? null : typeof v === 'bigint' ? Number(v) : typeof v === 'boolean' ? (v ? 1 : 0) : (v as Param)))

/**
 * SQLite in pure JavaScript (sql.js), for Node versions without node:sqlite. The database lives in memory and the whole file is
 * written (to a temporary file, then renamed) after every change, so a crash never leaves a half-written file. The data is small,
 * so this is fast enough. Only ONE server process may use the file.
 */
export async function openSqlJs(path: string, schema: string): Promise<Db> {
  const SQL = await initSqlJs()
  const file = path !== ':memory:'
  if (file) mkdirSync(dirname(path), { recursive: true })
  const raw: Database = file && existsSync(path) ? new SQL.Database(readFileSync(path)) : new SQL.Database()
  let inTx = false
  const persist = () => {
    if (!file) return
    const tmp = `${path}.tmp`
    writeFileSync(tmp, Buffer.from(raw.export()))
    renameSync(tmp, path)
  }

  const exec = (sql: string) => {
    const s = sql.trim().toUpperCase()
    raw.exec(sql)
    if (s.startsWith('BEGIN')) inTx = true
    else if (s.startsWith('COMMIT')) { inTx = false; persist() }
    else if (s.startsWith('ROLLBACK')) inTx = false
    else if (!inTx) persist()
  }

  const prepare = (sql: string): Stmt => ({
    run(...args) {
      const st = raw.prepare(sql)
      try {
        st.run(bindable(args))
      } finally {
        st.free()
      }
      const changes = raw.getRowsModified()
      const last = raw.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0]
      if (!inTx) persist()
      return { changes, lastInsertRowid: Number(last ?? 0) }
    },
    get(...args) {
      const st = raw.prepare(sql)
      try {
        st.bind(bindable(args))
        return st.step() ? st.getAsObject() : undefined
      } finally {
        st.free()
      }
    },
    all(...args) {
      const st = raw.prepare(sql)
      try {
        st.bind(bindable(args))
        const rows: unknown[] = []
        while (st.step()) rows.push(st.getAsObject())
        return rows
      } finally {
        st.free()
      }
    },
  })

  raw.exec('PRAGMA foreign_keys = ON;')
  raw.exec(schema)
  persist()
  return { exec, prepare }
}
