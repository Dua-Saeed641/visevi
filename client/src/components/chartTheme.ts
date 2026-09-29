/*
 * Shared chart constants. Two-tone (red / white), so the three verification
 * states are told apart by fill pattern as well as shade:
 *   Verified = solid red, Unverified = light red, Flagged = white with hatching.
 */
export const C = {
  brand: '#d6111e',
  dark: '#8f0b14',
  light: '#f6b6ba',
  ink: '#2a0b0e',
  muted: '#7a5257',
  grid: '#efd3d4',
}

export type Tip = { x: number; y: number; title: string; lines: string[] } | null

export const STATUS_LEGEND = [
  { label: 'Verified', kind: 'solid' as const },
  { label: 'Unverified', kind: 'light' as const },
  { label: 'Flagged', kind: 'hatch' as const },
]
