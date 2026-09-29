import { useMemo } from 'react'

// Tints of white/red only, to stay inside the two-tone palette.
const TINTS = ['#ffffff', '#ffd9db', '#ffb8bc']

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Decorative branching field, generated procedurally (inspired by the
 * connectome reference in docs/UI_DIRECTION.md; none of that artwork is used).
 * Deterministic per seed, one <path> per tint. Ornamental only: aria-hidden.
 */
export function NeuralBackdrop({ seed = 7, className = '' }: { seed?: number; className?: string }) {
  const { lines, dots } = useMemo(() => {
    const rand = rng(seed)
    const lines: string[] = TINTS.map(() => '')
    const dots: string[] = TINTS.map(() => '')
    const cx = 620
    const cy = 250

    function branch(x: number, y: number, angle: number, len: number, depth: number, tint: number) {
      const bend = (rand() - 0.5) * 0.9
      const mx = x + Math.cos(angle + bend) * len * 0.5
      const my = y + Math.sin(angle + bend) * len * 0.5
      const ex = x + Math.cos(angle) * len
      const ey = y + Math.sin(angle) * len
      lines[tint] += `M${x.toFixed(1)} ${y.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`
      if (depth === 0) {
        const r = 1.5 + rand() * 2
        dots[tint] += `M${(ex - r).toFixed(1)} ${ey.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`
        return
      }
      const kids = 2 + (rand() < 0.35 ? 1 : 0)
      for (let k = 0; k < kids; k++) {
        branch(ex, ey, angle + (rand() - 0.5) * 1.3, len * (0.62 + rand() * 0.2), depth - 1, rand() < 0.75 ? tint : Math.floor(rand() * TINTS.length))
      }
    }

    const primaries = 12
    for (let i = 0; i < primaries; i++) {
      branch(cx, cy, (i / primaries) * Math.PI * 2 + rand() * 0.4, 90 + rand() * 50, 4, i % TINTS.length)
    }
    return { lines, dots }
  }, [seed])

  return (
    <svg viewBox="0 0 1000 500" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" className={`pointer-events-none select-none ${className}`}>
      {TINTS.map((c, i) => (
        <g key={c}>
          <path d={lines[i]} stroke={c} strokeWidth="0.9" fill="none" opacity="0.6" />
          <path d={dots[i]} fill={c} opacity="0.95" />
        </g>
      ))}
    </svg>
  )
}
