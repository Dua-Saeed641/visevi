/**
 * Place name -> coordinates via OpenStreetMap Nominatim (free, no key).
 * Nominatim's usage policy asks for: an identifying User-Agent, at most one
 * request per second, and cached results. Browsers cannot set a User-Agent,
 * which is why this runs on the server rather than in the client.
 */
export interface GeocodeHit {
  lat: number
  lng: number
  displayName: string
}

const cache = new Map<string, GeocodeHit | null>()
let queue: Promise<unknown> = Promise.resolve()
let lastCall = 0

export function geocode(query: string): Promise<GeocodeHit | null> {
  const key = query.trim().toLowerCase()
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null)

  // Serialise calls and space them >= 1.1s apart.
  const run = queue.then(async () => {
    const wait = lastCall + 1100 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCall = Date.now()
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VisEvi/1.0 (hackathon evidence platform)', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`Geocoder responded ${res.status}`)
    const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[]
    const hit = rows[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon), displayName: rows[0].display_name } : null
    if (cache.size > 500) cache.clear()
    cache.set(key, hit)
    return hit
  })
  queue = run.catch(() => undefined)
  return run
}
