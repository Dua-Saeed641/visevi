/*
 * Shared chart constants. Two-tone (red / white), so the three verification
 * states are told apart by fill pattern as well as shade:
 *   Verified = solid red, Unverified = light red, Flagged = white with hatching.
 */
export const C = {
  brand: '#a8242b',
  dark: '#7a181d',
  light: '#e5b3b6',
  ink: '#221b1c',
  muted: '#6b5859',
  grid: '#e2d5d6',
}

export type Tip = { x: number; y: number; title: string; lines: string[] } | null

export const STATUS_LEGEND = [
  { label: 'Verified', kind: 'solid' as const },
  { label: 'Unverified', kind: 'light' as const },
  { label: 'Flagged', kind: 'hatch' as const },
]
