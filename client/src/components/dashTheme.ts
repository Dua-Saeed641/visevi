/** Two-tone chart tones shared by the dashboard components. */
export const TONE = {
  solid: '#a8242b',
  mid: '#cc5a61',
  light: '#e5b3b6',
  pale: '#f3e5e6',
  ink: '#221b1c',
  dark: '#7a181d',
} as const
export type Tone = keyof typeof TONE

export const levelTone = (level: string): 'solid' | 'mid' | 'pale' | 'outline' =>
  level === 'Severe' || level === 'emergency' ? 'solid' : level === 'High' || level === 'warning' ? 'mid' : level === 'Moderate' || level === 'watch' ? 'pale' : 'outline'
