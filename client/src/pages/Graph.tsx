import { useEffect, useMemo, useRef, useState } from 'react'
import { AssetDetail } from '../components/AssetDetail'
import { api, thumbUrl, type Asset, type GraphData, type GraphNode } from '../lib/api'

const W = 1400
const H = 860

const kindColor: Record<GraphNode['kind'], string> = {
  project: 'var(--color-accent-cyan)',
  location: 'var(--color-accent-blue)',
  asset: 'var(--color-text-muted)',
  theme: 'var(--color-accent-yellow)',
  indicator: 'var(--color-accent-pink)',
}
const kindRadius: Record<GraphNode['kind'], number> = { project: 16, location: 11, asset: 26, theme: 10, indicator: 12 }
const statusColor: Record<string, string> = {
  VERIFIED: 'var(--color-accent-green)',
  FLAGGED: 'var(--color-accent-red)',
  UNVERIFIED: 'var(--color-text-muted)',
}

interface Placed extends GraphNode {
  x: number
  y: number
}
interface View {
  x: number
  y: number
  w: number
  h: number
}
const FULL: View = { x: 0, y: 0, w: W, h: H }

/** Deterministic force layout with collision avoidance so photo nodes never overlap. */
function layout(data: GraphData): Placed[] {
  const n = data.nodes.length
  const nodes: Placed[] = data.nodes.map((node, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2
    const ring = node.kind === 'project' ? 80 : node.kind === 'theme' || node.kind === 'indicator' ? 380 : 240
    return { ...node, x: W / 2 + Math.cos(angle) * ring, y: H / 2 + Math.sin(angle) * ring }
  })
  const index = new Map(nodes.map((nd, i) => [nd.id, i]))
  const edges = data.edges.flatMap((e) => {
    const a = index.get(e.source)
    const b = index.get(e.target)
    return a === undefined || b === undefined ? [] : [[a, b] as const]
  })
  const vx = new Float64Array(n)
  const vy = new Float64Array(n)
  let seed = 42
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5

  for (let step = 0; step < 320; step++) {
    const cooling = 1 - step / 320
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = nodes[i].x - nodes[j].x
        let dy = nodes[i].y - nodes[j].y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) { dx = rnd(); dy = rnd(); d2 = 1 }
        const d = Math.sqrt(d2)
        let f = (5200 / d2) * cooling
        const minD = kindRadius[nodes[i].kind] + kindRadius[nodes[j].kind] + 14
        if (d < minD) f += (minD - d) * 0.35 // hard-ish collision push
        vx[i] += (dx / d) * f; vy[i] += (dy / d) * f
        vx[j] -= (dx / d) * f; vy[j] -= (dy / d) * f
      }
    }
    for (const [a, b] of edges) {
      const dx = nodes[b].x - nodes[a].x
      const dy = nodes[b].y - nodes[a].y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (d - 120) * 0.018 * cooling
      vx[a] += (dx / d) * f; vy[a] += (dy / d) * f
      vx[b] -= (dx / d) * f; vy[b] -= (dy / d) * f
    }
    for (let i = 0; i < n; i++) {
      vx[i] += (W / 2 - nodes[i].x) * 0.003
      vy[i] += (H / 2 - nodes[i].y) * 0.003
      nodes[i].x = Math.min(W - 40, Math.max(40, nodes[i].x + vx[i]))
      nodes[i].y = Math.min(H - 40, Math.max(40, nodes[i].y + vy[i]))
      vx[i] *= 0.6; vy[i] *= 0.6
    }
  }
  return nodes
}

function ZoomButton({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="h-8 w-8 cursor-pointer rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/90 text-sm text-[var(--color-text-muted)] hover:text-white"
    >
      {label}
    </button>
  )
}

export function Graph() {
  const [data, setData] = useState<GraphData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<Placed | null>(null)
  const [detail, setDetail] = useState<Asset | null>(null)

  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ q: string; matches: Map<string, number>; understood: string[] } | null>(null)
  // Derived, so clearing the box drops the highlight without a state reset in an effect.
  const matches = query.trim() && result?.q === query.trim() ? result.matches : null
  const understood = matches && result ? result.understood : []
  const searching = query.trim() !== '' && result?.q !== query.trim()

  const [view, setView] = useState<View>(FULL)
  const target = useRef<View>(FULL)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ px: number; py: number; moved: number } | null>(null)
  const [grabbing, setGrabbing] = useState(false)

  useEffect(() => {
    api.getGraph().then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load graph'))
  }, [])

  const placed = useMemo(() => (data ? layout(data) : []), [data])
  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed])

  // ── camera: ease the viewBox toward `target` ──
  const flyTo = (v: View) => {
    target.current = v
  }
  useEffect(() => {
    let raf = 0
    const tick = () => {
      setView((cur) => {
        const t = target.current
        const k = 0.16
        const next = { x: cur.x + (t.x - cur.x) * k, y: cur.y + (t.y - cur.y) * k, w: cur.w + (t.w - cur.w) * k, h: cur.h + (t.h - cur.h) * k }
        const settled = Math.abs(next.x - t.x) + Math.abs(next.y - t.y) + Math.abs(next.w - t.w) < 0.5
        return settled ? t : next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ── search: reuse the ranked semantic search, then fly to the matching photos ──
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      flyTo(FULL)
      return
    }
    let ignore = false
    const t = setTimeout(() => {
      api
        .listAssets({ q })
        .then((hits) => {
          if (ignore) return
          const m = new Map(hits.map((h) => ['a:' + h.id, h.match?.score ?? 0]))
          setResult({ q, matches: m, understood: hits[0]?.match?.expandedVia ?? [] })
          const pts = [...m.keys()].map((id) => byId.get(id)).filter((p): p is Placed => !!p)
          if (pts.length === 0) return flyTo(FULL)
          const pad = 90
          const minX = Math.min(...pts.map((p) => p.x)) - pad
          const maxX = Math.max(...pts.map((p) => p.x)) + pad
          const minY = Math.min(...pts.map((p) => p.y)) - pad
          const maxY = Math.max(...pts.map((p) => p.y)) + pad
          // Keep the canvas aspect ratio, and never zoom in closer than ~300 units wide.
          let w = Math.max(maxX - minX, 300)
          let h = Math.max(maxY - minY, 300 * (H / W))
          if (w / h > W / H) h = w * (H / W)
          else w = h * (W / H)
          flyTo({ x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h })
        })
        .catch(() => {})
    }, 350)
    return () => {
      ignore = true
      clearTimeout(t)
    }
  }, [query, byId])

  // ── wheel zoom (non-passive so the page doesn't scroll) ──
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const t = target.current
      const scale = Math.min(Math.max(e.deltaY > 0 ? 1.15 : 1 / 1.15, 0.2), 5)
      const w = Math.min(W * 1.2, Math.max(180, t.w * scale))
      const h = w * (H / W)
      const fx = (e.clientX - rect.left) / rect.width
      const fy = (e.clientY - rect.top) / rect.height
      flyTo({ x: t.x + (t.w - w) * fx, y: t.y + (t.h - h) * fy, w, h })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [data])

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { px: e.clientX, py: e.clientY, moved: 0 }
    setGrabbing(true)
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const dx = ((e.clientX - d.px) / rect.width) * view.w
    const dy = ((e.clientY - d.py) / rect.height) * view.h
    d.moved += Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py)
    d.px = e.clientX
    d.py = e.clientY
    const v = { ...target.current, x: target.current.x - dx, y: target.current.y - dy }
    target.current = v
    setView(v)
  }
  const onPointerUp = () => {
    setGrabbing(false)
    // keep `moved` readable for the click that follows a drag; cleared on next pointerdown
    if (drag.current) drag.current = { ...drag.current, px: 0, py: 0 }
  }

  const lit = useMemo(() => {
    if (matches) {
      const set = new Set(matches.keys())
      // keep each match's context (location, project, themes) visible too
      for (const e of data?.edges ?? []) {
        if (matches.has(e.source)) set.add(e.target)
        if (matches.has(e.target)) set.add(e.source)
      }
      return set
    }
    if (!hover || !data) return null
    const set = new Set([hover.id])
    for (const e of data.edges) {
      if (e.source === hover.id) set.add(e.target)
      if (e.target === hover.id) set.add(e.source)
    }
    return set
  }, [hover, data, matches])

  const openAsset = (node: Placed) => {
    if (node.kind === 'asset' && (drag.current?.moved ?? 0) < 5) {
      api.getAsset(node.id.slice(2)).then(setDetail).catch(() => {})
    }
  }

  const zoomed = view.w < W * 0.55
  const zoomBy = (f: number) => {
    const t = target.current
    const w = Math.min(W * 1.2, Math.max(180, t.w * f))
    const h = w * (H / W)
    flyTo({ x: t.x + (t.w - w) / 2, y: t.y + (t.h - h) / 2, w, h })
  }
  const onZoomIn = () => zoomBy(1 / 1.4)
  const onZoomOut = () => zoomBy(1.4)
  const onReset = () => flyTo(FULL)

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs uppercase tracking-wider text-[var(--color-accent-cyan)]">Evidence Graph</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">How the evidence connects</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-muted)]">
          Each photo is a node, ringed by its verification status and linked to its location, the themes detected in
          it, and the SDG indicators it supports. Search to zoom straight to matching evidence; scroll to zoom, drag to
          pan, click a photo for its full record.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--color-accent-red)]/30 bg-[var(--color-accent-red)]/10 p-5 text-sm text-[var(--color-accent-red)]">
          {error}
        </div>
      )}
      {!data && !error && <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">Building graph…</div>}
      {data && data.nodes.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] p-12 text-center text-sm text-[var(--color-text-muted)]">
          Nothing to show yet — upload evidence and the graph builds itself from it.
        </div>
      )}

      {data && data.nodes.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Search the graph, e.g. "solar panels on a roof"'
              className="min-w-[260px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent-cyan)] focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="cursor-pointer rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-white"
              >
                Clear
              </button>
            )}
            <span className="text-xs text-[var(--color-text-muted)]" aria-live="polite">
              {searching
                ? 'Searching…'
                : matches
                  ? matches.size === 0
                    ? 'No matching evidence'
                    : `${matches.size} match${matches.size === 1 ? '' : 'es'}${understood.length ? ' • understood as ' + understood.join(', ') : ''}`
                  : ''}
            </span>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <svg
              ref={svgRef}
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              className="w-full touch-none select-none"
              style={{ cursor: grabbing ? 'grabbing' : 'grab' }}
              role="img"
              aria-label="Evidence graph"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              <defs>
                {placed.filter((p) => p.kind === 'asset').map((p) => (
                  <clipPath key={p.id} id={`clip-${p.id}`}>
                    <rect x={p.x - kindRadius.asset} y={p.y - kindRadius.asset} width={kindRadius.asset * 2} height={kindRadius.asset * 2} rx={9} />
                  </clipPath>
                ))}
              </defs>

              {data.edges.map((e, i) => {
                const a = byId.get(e.source)
                const b = byId.get(e.target)
                if (!a || !b) return null
                const on = !lit || (lit.has(e.source) && lit.has(e.target))
                const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.12
                const my = (a.y + b.y) / 2 + (b.x - a.x) * 0.12
                const stroke =
                  e.kind === 'supports' ? 'var(--color-accent-pink)' : e.kind === 'shows' ? 'var(--color-accent-yellow)' : 'var(--color-accent-blue)'
                return (
                  <path
                    key={i}
                    d={`M${a.x} ${a.y}Q${mx} ${my} ${b.x} ${b.y}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={on && lit ? 1.6 : 0.9}
                    opacity={on ? (lit ? 0.85 : 0.35) : 0.04}
                  />
                )
              })}

              {placed.map((p) => {
                const r = kindRadius[p.kind]
                const dim = lit && !lit.has(p.id)
                const isMatch = matches?.has(p.id)
                return (
                  <g
                    key={p.id}
                    opacity={dim ? 0.1 : 1}
                    style={{ transition: 'opacity 250ms' }}
                    onPointerEnter={() => setHover(p)}
                    onPointerLeave={() => setHover(null)}
                    onClick={() => openAsset(p)}
                    className={p.kind === 'asset' ? 'cursor-pointer' : ''}
                  >
                    {p.kind === 'asset' && p.url ? (
                      <>
                        {isMatch && (
                          <rect x={p.x - r - 5} y={p.y - r - 5} width={r * 2 + 10} height={r * 2 + 10} rx={13} fill="none" stroke="var(--color-accent-cyan)" strokeWidth={2} opacity={0.9} />
                        )}
                        <image
                          href={thumbUrl({ cloudinaryUrl: p.url, resourceType: p.url.includes('/video/upload/') ? 'video' : 'image' })}
                          x={p.x - r} y={p.y - r} width={r * 2} height={r * 2}
                          clipPath={`url(#clip-${p.id})`}
                          preserveAspectRatio="xMidYMid slice"
                        />
                        <rect x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} rx={9} fill="none" stroke={statusColor[p.status ?? 'UNVERIFIED']} strokeWidth={2.5} />
                        {(zoomed || isMatch) && p.label && (
                          <text x={p.x} y={p.y + r + 14} textAnchor="middle" fontSize={11} fill="var(--color-text)">
                            {p.label.length > 26 ? p.label.slice(0, 25) + '…' : p.label}
                          </text>
                        )}
                      </>
                    ) : (
                      <>
                        <circle cx={p.x} cy={p.y} r={r} fill={kindColor[p.kind]} opacity={0.9} />
                        <text x={p.x} y={p.y + r + 13} textAnchor="middle" fontSize={p.kind === 'project' ? 14 : 11} fill="var(--color-text)">
                          {p.label}
                        </text>
                      </>
                    )}
                  </g>
                )
              })}
            </svg>

            <div className="absolute right-3 top-3 flex flex-col gap-1">
              <ZoomButton label="+" title="Zoom in" onClick={onZoomIn} />
              <ZoomButton label="−" title="Zoom out" onClick={onZoomOut} />
              <ZoomButton label="⤢" title="Reset view" onClick={onReset} />
            </div>

            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-lg bg-[var(--color-bg)]/80 px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
              {(['project', 'location', 'theme', 'indicator'] as const).map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: kindColor[k] }} />
                  {k}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-[3px] border-2" style={{ borderColor: statusColor.VERIFIED }} />verified
                <span className="ml-2 inline-block h-2.5 w-2.5 rounded-[3px] border-2" style={{ borderColor: statusColor.FLAGGED }} />flagged
              </span>
            </div>

            {hover && (
              <div className="pointer-events-none absolute left-4 top-4 max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/95 p-3 text-xs shadow-xl">
                <p className="font-semibold text-[var(--color-text)]">{hover.label}</p>
                <p className="uppercase tracking-wider text-[var(--color-text-muted)]">
                  {hover.kind}{hover.status ? ` • ${hover.status}` : ''}
                </p>
                {hover.meta && <p className="mt-1 text-[var(--color-text-muted)]">{hover.meta}</p>}
              </div>
            )}
          </div>
        </>
      )}

      {detail && <AssetDetail asset={detail} onClose={() => setDetail(null)} onChanged={setDetail} />}
    </div>
  )
}
