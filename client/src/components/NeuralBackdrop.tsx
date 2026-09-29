import { useMemo } from 'react'

// Same hues as the accent palette in index.css.
const HUES = ['#ff4d4d', '#ffd23f', '#ff6fb0', '#4d6bff', '#38d9ff', '#3ddc84']

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Decorative branching "neuron" field, generated procedurally (inspired by
 * the Colorpong reference in docs/UI_DIRECTION.md — none of that artwork is
 * used). Deterministic per seed, one <path> per hue, so it is cheap to render.
 * Purely ornamental: aria-hidden, no pointer events, kept at low opacity.
 */
export function NeuralBackdrop({ seed = 7, className = '' }: { seed?: number; className?: string }) {
  const { lines, dots } = useMemo(() => {
    const rand = rng(seed)
    const lines: string[] = HUES.map(() => '')
    const dots: string[] = HUES.map(() => '')
    const cx = 620
    const cy = 190

    function branch(x: number, y: number, angle: number, len: number, depth: number, hue: number) {
      const bend = (rand() - 0.5) * 0.9
      const mx = x + Math.cos(angle + bend) * len * 0.5
      const my = y + Math.sin(angle + bend) * len * 0.5
      const ex = x + Math.cos(angle) * len
      const ey = y + Math.sin(angle) * len
      lines[hue] += `M${x.toFixed(1)} ${y.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`
      if (depth === 0) {
        const r = 1.2 + rand() * 1.6
        dots[hue] += `M${(ex - r).toFixed(1)} ${ey.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`
        return
      }
      const kids = 2 + (rand() < 0.35 ? 1 : 0)
      for (let k = 0; k < kids; k++) {
        branch(ex, ey, angle + (rand() - 0.5) * 1.3, len * (0.62 + rand() * 0.2), depth - 1, rand() < 0.8 ? hue : Math.floor(rand() * HUES.length))
      }
    }

    const primaries = 11
    for (let i = 0; i < primaries; i++) {
      const angle = (i / primaries) * Math.PI * 2 + rand() * 0.4
      branch(cx, cy, angle, 70 + rand() * 40, 4, i % HUES.length)
    }
    return { lines, dots }
  }, [seed])

  return (
    <svg
      viewBox="0 0 1000 380"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
      className={`pointer-events-none select-none ${className}`}
    >
      {HUES.map((c, i) => (
        <g key={c}>
          <path d={lines[i]} stroke={c} strokeWidth="0.7" fill="none" opacity="0.55" />
          <path d={dots[i]} fill={c} opacity="0.9" />
        </g>
      ))}
    </svg>
  )
}
