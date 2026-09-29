/**
 * Tiny in-process response cache for read endpoints.
 *
 * Every read hits MongoDB Atlas (~30ms per round trip), and most pages fire
 * several. Data only changes when something is uploaded or re-verified, so
 * results are kept until `bumpData()` is called by those writes. A TTL still
 * caps staleness in case the database is edited outside this process (e.g. the
 * seed --clean script). Single-instance by design: with several API instances,
 * replace this with a shared cache.
 */
const store = new Map<string, { version: number; at: number; value: unknown }>()
let version = 0

/** Call after any write that changes what reads would return. */
export function bumpData(): void {
  version++
}

export async function cached<T>(key: string, compute: () => Promise<T>, ttlMs = 60_000): Promise<T> {
  const hit = store.get(key)
  if (hit && hit.version === version && Date.now() - hit.at < ttlMs) return hit.value as T
  const startedAt = version // a write during compute() makes this entry stale on arrival
  const value = await compute()
  if (store.size > 300) store.clear()
  store.set(key, { version: startedAt, at: Date.now(), value })
  return value
}

import type { NextFunction, Request, Response } from 'express'

/**
 * Express middleware: serve repeat GETs from the cache and store fresh 200
 * responses. Keyed by full URL, so every query-string variant is its own entry.
 */
export function cacheGets(prefix: string, ttlMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next()
    const key = `${prefix}:${req.originalUrl}`
    const hit = store.get(key)
    if (hit && hit.version === version && Date.now() - hit.at < ttlMs) {
      res.json(hit.value)
      return
    }
    const startedAt = version
    const send = res.json.bind(res)
    res.json = (body: unknown) => {
      if (res.statusCode === 200) {
        if (store.size > 300) store.clear()
        store.set(key, { version: startedAt, at: Date.now(), value: body })
      }
      return send(body)
    }
    next()
  }
}
