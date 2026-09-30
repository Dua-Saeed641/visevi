import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { GIBS_LAYERS, gibsLegendUrl, gibsTileUrl, isoDaysAgo, type GibsLayer } from '../lib/gibs'
import type { MonitoredSite, NaturalEvent } from '../lib/api'

/**
 * All monitored sites on one map, with switchable NASA GIBS overlays: live
 * hot/cold/rain layers and historical disaster-prone zones. The base is
 * OpenStreetMap (attribution shown), desaturated so it sits in the app's
 * red-and-white palette. The NASA overlays keep NASA's own colour scales, so
 * each shows its legend. Site markers carry state in the text and fill,
 * never colour alone.
 */
const FILL = {
  emergency: 'background:#a8242b;color:#fff;border-color:#7a181d',
  warning: 'background:#f3e5e6;color:#7a181d;border-color:#a8242b',
  watch: 'background:#fff;color:#221b1c;border-color:#a8242b',
  none: 'background:#fff;color:#221b1c;border-color:#221b1c',
} as const

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function LayerButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`border-2 px-3 py-1.5 text-base font-bold ${active ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink hover:border-brand'}`}
    >
      {children}
    </button>
  )
}

/** One letter per event kind, so a marker never relies on colour alone. */
const EVENT_GLYPH: Record<string, string> = {
  wildfires: 'F', severeStorms: 'S', floods: 'W', volcanoes: 'V', tempExtremes: 'T',
  drought: 'D', dustHaze: 'H', earthquakes: 'E', landslides: 'L', snow: 'N', seaLakeIce: 'I', manmade: 'M',
}

export function SitesMap({ sites, events = [] }: { sites: MonitoredSite[]; events?: NaturalEvent[] }) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.TileLayer | null>(null)
  const [layerId, setLayerId] = useState<string>('')
  const [date, setDate] = useState<string>('')
  const [showEvents, setShowEvents] = useState(true)
  const eventsRef = useRef<L.LayerGroup | null>(null)

  const layer: GibsLayer | undefined = GIBS_LAYERS.find((l) => l.id === layerId)

  // Map + base layer + site markers.
  useEffect(() => {
    if (!el.current || sites.length === 0) return
    const map = L.map(el.current, { scrollWheelZoom: true, worldCopyJump: true })
    mapRef.current = map
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      className: 'osm-muted',
    }).addTo(map)

    const points: L.LatLngTuple[] = []
    for (const s of sites) {
      const label = s.latest ? `${Math.round(s.latest.tempC)}°` : '–'
      const icon = L.divIcon({
        className: '',
        html: `<div style="${FILL[s.worstSeverity ?? 'none']};border:3px solid;padding:2px 8px;font:700 15px Helvetica,Arial,sans-serif;white-space:nowrap;transform:translate(-50%,-50%)">${label}</div>`,
        iconSize: [0, 0],
      })
      const popup =
        `<strong>${esc(s.name)}</strong><br>${esc(s.projectName)}<br>` +
        (s.latest ? `${s.latest.tempC.toFixed(1)} °C, ${esc(s.latest.sourceLabel)}` : 'No reading yet') +
        (s.worstSeverity ? `<br>Alert: ${s.worstSeverity}` : '')
      L.marker([s.lat, s.lng], { icon, title: s.name, zIndexOffset: 1000 }).addTo(map).bindPopup(popup)
      points.push([s.lat, s.lng])
    }
    map.fitBounds(L.latLngBounds(points).pad(0.3), { maxZoom: 6 })
    return () => {
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [sites])

  // NASA GIBS overlay: swapped when the layer or date changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    overlayRef.current?.remove()
    overlayRef.current = null
    if (!layer) return
    overlayRef.current = L.tileLayer(gibsTileUrl(layer, date || isoDaysAgo(layer.lagDays)), {
      opacity: 0.7,
      maxNativeZoom: layer.maxNativeZoom,
      maxZoom: 18,
      zIndex: 5,
      attribution: `${layer.source} via <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>`,
    }).addTo(map)
  }, [layer, date, sites])

  // Live NASA EONET events, drawn below the site markers.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    eventsRef.current?.remove()
    eventsRef.current = null
    if (!showEvents || events.length === 0) return
    const group = L.layerGroup()
    for (const e of events) {
      const glyph = EVENT_GLYPH[e.categoryId] ?? '?'
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#2a0b0e;color:#fff;width:20px;height:20px;line-height:20px;text-align:center;font:700 12px Helvetica,Arial,sans-serif;transform:translate(-50%,-50%)">${glyph}</div>`,
        iconSize: [0, 0],
      })
      L.marker([e.lat, e.lng], { icon, title: e.title, zIndexOffset: 200 })
        .bindPopup(`<strong>${esc(e.title)}</strong><br>${esc(e.category)}<br>${esc(new Date(e.date).toLocaleDateString())}<br><a href="${esc(e.link)}" target="_blank" rel="noreferrer">NASA EONET</a>`)
        .addTo(group)
    }
    group.addTo(map)
    eventsRef.current = group
  }, [events, showEvents, sites])

  const pick = (l: GibsLayer | undefined) => {
    setLayerId(l?.id ?? '')
    setDate(l && !l.static ? isoDaysAgo(l.lagDays) : '')
  }

  return (
    <div>
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-44 text-base font-bold">Live conditions</span>
          <LayerButton active={!layer} onClick={() => pick(undefined)}>No overlay</LayerButton>
          {GIBS_LAYERS.filter((l) => l.group === 'live').map((l) => (
            <LayerButton key={l.id} active={layerId === l.id} onClick={() => pick(l)}>{l.label}</LayerButton>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-44 text-base font-bold">Live events</span>
          <LayerButton active={showEvents} onClick={() => setShowEvents((v) => !v)}>{`NASA EONET events (${events.length})`}</LayerButton>
          <span className="text-sm text-muted">F fire, S storm, W flood, V volcano, T temperature extreme, D drought, E earthquake, L landslide</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-44 text-base font-bold">Disaster-prone zones</span>
          {GIBS_LAYERS.filter((l) => l.group === 'prone').map((l) => (
            <LayerButton key={l.id} active={layerId === l.id} onClick={() => pick(l)}>{l.label}</LayerButton>
          ))}
        </div>
      </div>

      <div ref={el} className="h-[28rem] w-full border-2 border-line" role="region" aria-label="Map of monitored sites" />

      {layer && (
        <div className="mt-3 grid gap-4 border-l-4 border-brand bg-tint px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-lg font-bold">{layer.label}</p>
            <p className="text-base">{layer.purpose}</p>
            <p className="mt-1 text-sm text-muted">
              {layer.static
                ? `${layer.source}. A historical map, not a live reading or a forecast.`
                : `${layer.source}. A satellite observation from the chosen day, usually ${layer.lagDays} or more days behind, with gaps under cloud. If the map is empty, try an earlier date.`}
            </p>
            {!layer.static && (
              <label className="mt-2 inline-flex items-center gap-2 text-base font-bold">
                Date
                <input
                  type="date" className="input !w-auto !py-1" value={date} max={isoDaysAgo(0)}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            )}
          </div>
          <img src={gibsLegendUrl(layer)} alt={`Colour scale for ${layer.label}`} className="h-auto w-full max-w-sm bg-white p-2" />
        </div>
      )}
    </div>
  )
}
