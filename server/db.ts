import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type Db = DatabaseSync

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
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
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, username TEXT NOT NULL,
      action TEXT NOT NULL, detail TEXT NOT NULL
    );
  `)
  return db
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
