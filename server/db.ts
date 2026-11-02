import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { openSqlJs } from './sqljs'

/** The small part of SQLite the server uses. node:sqlite has it as it is; the fallback for older Node (sql.js) implements it. */
export interface Stmt {
  run(...args: unknown[]): { changes?: number | bigint; lastInsertRowid?: number | bigint }
  get(...args: unknown[]): unknown
  all(...args: unknown[]): unknown[]
}
export interface Db {
  exec(sql: string): void
  prepare(sql: string): Stmt
}

export const SCHEMA = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      pass_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','operator','viewer')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS movements (id TEXT PRIMARY KEY, date TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, date TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS goods (id TEXT PRIMARY KEY, date TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, username TEXT NOT NULL,
      action TEXT NOT NULL, detail TEXT NOT NULL
    );
`

type NodeSqlite = { DatabaseSync: new (path: string) => Db }
/** node:sqlite exists from Node 22.5; on older Node this is undefined (and the pure-JS fallback is used). */
const nodeSqlite = (): NodeSqlite | undefined => {
  const get = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule
  return typeof get === 'function' ? (get('node:sqlite') as NodeSqlite | undefined) : undefined
}

/** Opens the database with node:sqlite (Node 22.5 or newer). Used by the tests. */
export function openDb(path: string): Db {
  const mod = nodeSqlite()
  if (!mod) throw new Error('node:sqlite در این نسخه‌ی Node نیست (Node 22.5 یا بالاتر لازم است)')
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new mod.DatabaseSync(path)
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; ${SCHEMA}`)
  return db
}

/**
 * Opens the database with the best engine this Node has: node:sqlite when it exists, otherwise sql.js (pure JavaScript,
 * no native parts, works on Node 18 and shared hosts). `WPC_DB=sqljs` forces the second one.
 */
export async function openDbAuto(path: string): Promise<{ db: Db; engine: 'node:sqlite' | 'sql.js' }> {
  if (process.env.WPC_DB !== 'sqljs' && nodeSqlite()) return { db: openDb(path), engine: 'node:sqlite' }
  return { db: await openSqlJs(path, SCHEMA), engine: 'sql.js' }
}

/** Runs fn in a transaction; rolls back if it throws. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
