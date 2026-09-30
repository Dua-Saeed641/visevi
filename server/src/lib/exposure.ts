import sharp from 'sharp'

/**
 * Structural exposure: how hazard-prone a place is, in the long run, read from
 * NASA SEDAC "Natural Disaster Hotspots" layers served by GIBS. These are
 * historical frequency/distribution maps (drought 1980-2000, flood 1985-2003,
 * cyclone 1980-2000, landslide 2000), so they describe where hazards have
 * concentrated, not what is happening today.
 *
 * The class at a coordinate is decoded from the map tile's own pixel colour
 * using NASA's published colour map for that layer, so the number is sourced,
 * not invented.
 */
export type ExposureHazard = 'drought' | 'flood' | 'cyclone' | 'landslide'

const LAYERS: Record<ExposureHazard, string> = {
  drought: 'NDH_Drought_Hazard_Frequency_Distribution_1980-2000',
  flood: 'NDH_Flood_Hazard_Frequency_Distribution_1985-2003',
  cyclone: 'NDH_Cyclone_Hazard_Frequency_Distribution_1980-2000',
  landslide: 'NDH_Landslide_Hazard_Distribution_2000',
}

const Z = 7 // GoogleMapsCompatible_Level7
const BASE = 'https://gibs.earthdata.nasa.gov'

interface Classes {
  rgb: [number, number, number][]
}
const classCache = new Map<string, Promise<Classes>>()

/** Ordered hazard classes (lowest to highest) from NASA's colour map for the layer. */
function loadClasses(layer: string): Promise<Classes> {
  let p = classCache.get(layer)
  if (!p) {
    p = fetch(`${BASE}/colormaps/v1.3/${layer}.xml`, { signal: AbortSignal.timeout(20_000) })
      .then(async (r) => {
        if (!r.ok) throw new Error(`colormap ${r.status}`)
        const xml = await r.text()
        // The file holds a "No Data" colour map and the real one; take the real one (most entries).
        const maps = [...xml.matchAll(/<ColorMap title="([^"]*)">([\s\S]*?)<\/ColorMap>/g)]
          .filter((m) => m[1] !== 'No Data')
          .map((m) => [...m[2].matchAll(/<ColorMapEntry rgb="(\d+),(\d+),(\d+)"[^>]*?transparent="(true|false)"/g)]
            .filter((e) => e[4] === 'false')
            .map((e) => [Number(e[1]), Number(e[2]), Number(e[3])] as [number, number, number]))
          .sort((a, b) => b.length - a.length)
        if (!maps[0]?.length) throw new Error('colormap had no classes')
        return { rgb: maps[0] }
      })
      .catch((e) => {
        classCache.delete(layer)
        throw e
      })
    classCache.set(layer, p)
  }
  return p
}

function tileAt(lat: number, lng: number) {
  const n = 2 ** Z
  const x = ((lng + 180) / 360) * n
  const rad = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  return { tx: Math.floor(x), ty: Math.floor(y), px: (x - Math.floor(x)) * 256, py: (y - Math.floor(y)) * 256 }
}

export interface ExposureReading {
  hazard: ExposureHazard
  /** 0 to 1: 0 = no hazard recorded; otherwise 0.3 for the lowest class rising to 1 for the highest. */
  score: number
  /** Class position and total (e.g. 7 of 12), or null when NASA records no hazard there. */
  klass: { position: number; of: number } | null
  source: string
}

async function sample(hazard: ExposureHazard, lat: number, lng: number): Promise<ExposureReading> {
  const layer = LAYERS[hazard]
  const source = 'NASA SEDAC Natural Disaster Hotspots via GIBS'
  const [{ rgb }, res] = await Promise.all([
    loadClasses(layer),
    (async () => {
      const t = tileAt(lat, lng)
      const r = await fetch(`${BASE}/wmts/epsg3857/best/${layer}/default/GoogleMapsCompatible_Level7/${Z}/${t.ty}/${t.tx}.png`, { signal: AbortSignal.timeout(20_000) })
      if (!r.ok) throw new Error(`tile ${r.status}`)
      return { t, buf: Buffer.from(await r.arrayBuffer()) }
    })(),
  ])
  const { data, info } = await sharp(res.buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  // A small window around the point: layer cells are several km wide and a coordinate can sit on an edge.
  const found: number[] = []
  const cx = Math.round(res.t.px)
  const cy = Math.round(res.t.py)
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= info.width || y >= info.height) continue
      const i = (y * info.width + x) * 4
      if (data[i + 3] < 200) continue
      let best = 0
      let bestD = Infinity
      for (let k = 0; k < rgb.length; k++) {
        const d = (rgb[k][0] - data[i]) ** 2 + (rgb[k][1] - data[i + 1]) ** 2 + (rgb[k][2] - data[i + 2]) ** 2
        if (d < bestD) {
          bestD = d
          best = k
        }
      }
      if (bestD < 900) found.push(best) // must be a real class colour, not anti-aliasing
    }
  }
  if (found.length === 0) return { hazard, score: 0, klass: null, source }
  found.sort((a, b) => a - b)
  const position = found[Math.floor(found.length / 2)] + 1 // median class, 1-based
  // A recorded hazard counts even in the lowest class (floor 0.3); the rest scales with the class.
  // The scale is global, so a low class can still be a real regional exposure (Bay of Bengal
  // cyclones sit low on a scale dominated by West Pacific typhoons).
  return { hazard, score: 0.3 + 0.7 * (position / rgb.length), klass: { position, of: rgb.length }, source }
}

export async function readExposure(lat: number, lng: number): Promise<ExposureReading[]> {
  const out = await Promise.allSettled((Object.keys(LAYERS) as ExposureHazard[]).map((h) => sample(h, lat, lng)))
  return out.flatMap((o) => (o.status === 'fulfilled' ? [o.value] : []))
}
