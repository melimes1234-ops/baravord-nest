import type { Batch, Catalog, Movement } from './core'

export type Role = 'admin' | 'operator' | 'viewer'
export interface User { id: number; username: string; role: Role }
export interface ServerState {
  user: User
  catalog: Catalog
  version: number
  movements: Movement[]
  batches: Batch[]
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'ارتباط با سرور برقرار نشد')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'خطا')
  return data as T
}
