import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { Db } from './db'

export type Role = 'admin' | 'operator' | 'viewer'
export const ROLES: Role[] = ['admin', 'operator', 'viewer']

export interface User {
  id: number
  username: string
  role: Role
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

/** Only a hash of the token is stored, so a leaked database does not leak sessions. */
export function createSession(db: Db, userId: number): string {
  const token = randomBytes(32).toString('base64url')
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?,?,?)').run(
    sha(token), userId, new Date().toISOString(),
  )
  return token
}

const SESSION_DAYS = 30

export function userFromToken(db: Db, token: string | undefined): User | null {
  if (!token) return null
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.role, s.created_at AS at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .get(sha(token)) as { id: number; username: string; role: Role; at: string } | undefined
  if (!row) return null
  if (Date.now() - Date.parse(row.at) > SESSION_DAYS * 86_400_000) {
    destroySession(db, token)
    return null
  }
  return { id: row.id, username: row.username, role: row.role }
}

export function destroySession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token))
}

export function validatePassword(p: unknown): string | null {
  if (typeof p !== 'string' || p.length < 8) return 'رمز عبور باید حداقل ۸ نویسه باشد'
  if (p.length > 200) return 'رمز عبور بیش از حد طولانی است'
  return null
}

export function createUser(db: Db, username: string, password: string, role: Role): number {
  const r = db
    .prepare('INSERT INTO users (username, pass_hash, role, created_at) VALUES (?,?,?,?)')
    .run(username, hashPassword(password), role, new Date().toISOString())
  return Number(r.lastInsertRowid)
}
