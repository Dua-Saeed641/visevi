/** Two-tone chart tones shared by the dashboard components. */
export const TONE = {
  solid: '#d6111e',
  mid: '#e8646c',
  light: '#f6b6ba',
  pale: '#ffe2e3',
  ink: '#2a0b0e',
  dark: '#8f0b14',
} as const
export type Tone = keyof typeof TONE

export const levelTone = (level: string): 'solid' | 'mid' | 'pale' | 'outline' =>
  level === 'Severe' || level === 'emergency' ? 'solid' : level === 'High' || level === 'warning' ? 'mid' : level === 'Moderate' || level === 'watch' ? 'pale' : 'outline'
