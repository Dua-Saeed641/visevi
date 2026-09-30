const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? 'https://visevi-api.onrender.com'
    : 'http://localhost:4000')

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init)

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(body || res.statusText, res.status)
  }

  return res.json() as Promise<T>
}

export interface HealthResponse {
  status: string
}

export interface Observation {
  activity: string | null
  objects: string[]
  tags: string[]
  caption: string | null
  confidence: number | null
  source: string
  analyzedAt: string
}

export interface VerificationCheck {
  id: 'content-claim' | 'project-theme' | 'duplicate' | 'capture-date' | 'provenance'
  label: string
  result: 'pass' | 'fail' | 'skipped'
  detail: string
}

export interface TransformationRecord {
  step: string
  cloudinary: string
  purpose: string
}

export interface AssetCapture {
  kind: 'nasa-worldview'
  layer: string
  lat: number
  lng: number
  halfDeg: number
  date: string
  provenance: 'verified' | 'system' | 'failed'
  note: string
}

export interface Asset {
  id: string
  cloudinaryPublicId: string
  cloudinaryUrl: string
  cloudinaryVersion?: string
  resourceType?: 'image' | 'video'
  projectName: string
  location: string
  stage?: string | null
  capturedAt?: string | null
  exifCapturedAt?: string | null
  verificationStatus?: 'UNVERIFIED' | 'VERIFIED' | 'FLAGGED'
  verificationNote?: string | null
  verification?: { checks: VerificationCheck[]; evaluatedAt: string } | null
  capture?: AssetCapture | null
  transformations?: TransformationRecord[]
  observation?: Observation | null
  observationError?: string
  match?: { score: number; expandedVia: string[] }
  createdAt: string
}

export interface CompareSide {
  id: string
  cloudinaryUrl: string
  cloudinaryPublicId: string
  cloudinaryVersion: string
  projectName: string
  location: string
  stage: string | null
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'FLAGGED'
  createdAt: string
  observation?: Observation | null
  capture?: AssetCapture | null
}

export interface ChangeSummary {
  comparability: { level: 'comparable' | 'limited' | 'not-comparable'; headline: string; reasons: string[] }
  time: { basis: 'capture-dates' | 'unavailable'; diffDays: number | null; label: string; beforeDate: string | null; afterDate: string | null }
  scene: { tier: 'same-footprint' | 'same-photo' | 'similar' | 'different' | 'unrelated' | 'unknown'; distance: number | null; bits: number; text: string }
  activity: { relation: 'same' | 'related' | 'different' | 'unknown'; before: string | null; after: string | null; text: string }
  themes: { shared: string[]; onlyBefore: string[]; onlyAfter: string[] }
  objects: { shared: string[]; onlyBefore: string[]; onlyAfter: string[] }
  overlap: { themes: number | null; objects: number | null; tags: number | null }
  visual: {
    measured: {
      before: { cloudPct: number; green: number; waterPct: number; brightness: number; clearPct: number }
      after: { cloudPct: number; green: number; waterPct: number; brightness: number; clearPct: number }
      commonClearPct: number
    }
    lines: string[]
    seasonNote: string | null
  } | null
  insights: string[]
  caveats: string[]
  narrative: string
  method: string
  timeSpanLabel: string
  diffDays: number | null
}

export interface CompareResult {
  before: CompareSide
  after: CompareSide
  sameProject: boolean
  comparison: ChangeSummary
}

export interface IndicatorResult {
  code: string
  goal: number
  title: string
  confidence: number
  status: 'asserted' | 'needs-review'
  backingAssetCount: number
  backingAssetIds: string[]
  matchedConcepts: string[]
  reason: string
}

export interface TimelineItem {
  id: string
  cloudinaryUrl: string
  cloudinaryPublicId: string
  cloudinaryVersion: string
  location: string
  stage: string | null
  status: string
  verificationNote: string | null
  observation?: Observation | null
  createdAt: string
}

export interface ProjectReport {
  project: {
    id: string
    name: string
    description: string
    createdAt: string
  }
  stats: {
    totalAssets: number
    verifiedAssets: number
    flaggedAssets: number
    unverifiedAssets: number
    locationCount: number
    verifiedActivities: number
  }
  locations: { id: string; name: string }[]
  activities: { name: string; count: number; verified: number }[]
  indicators: IndicatorResult[]
  beforeAfter: {
    beforeId: string
    afterId: string
    beforeUrl: string
    beforeDate: string
    afterUrl: string
    afterDate: string
    sameSeason?: boolean
    summary: ChangeSummary
  } | null
  suggestedPairs: {
    location: string
    beforeId: string
    afterId: string
    beforeUrl: string
    afterUrl: string
    spanDays: number
    sameSeason?: boolean
  }[]
  timeline: TimelineItem[]
}

export interface GraphNode {
  id: string
  kind: 'project' | 'location' | 'asset' | 'theme' | 'indicator'
  label: string
  status?: string
  url?: string
  meta?: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: { source: string; target: string; kind: string }[]
}

export interface Overview {
  kpis: {
    totalAssets: number
    projects: number
    locations: number
    verified: number
    unverified: number
    flagged: number
    verifiedRate: number
    assertedIndicators: number
  }
  totalAssets: number
  perProject: { name: string; verified: number; unverified: number; flagged: number }[]
  points: { id: string; project: string; date: string; status: 'VERIFIED' | 'UNVERIFIED' | 'FLAGGED'; label: string | null }[]
  checks: { id: string; label: string; pass: number; fail: number; skipped: number }[]
  themes: { name: string; count: number }[]
  indicators: {
    project: string
    code: string
    title: string
    confidence: number
    status: 'asserted' | 'needs-review'
    backing: number
  }[]
}

export interface ProjectSimple {
  id: string
  name: string
  assetCount: number
}

export interface SearchParams {
  q?: string
  project?: string
  location?: string
  status?: string
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),

  listAssets: (params?: SearchParams) => {
    const query = new URLSearchParams()
    if (params?.q) query.set('q', params.q)
    if (params?.project) query.set('project', params.project)
    if (params?.location) query.set('location', params.location)
    if (params?.status) query.set('status', params.status)
    const queryString = query.toString()
    return request<Asset[]>(`/api/assets${queryString ? `?${queryString}` : ''}`)
  },

  uploadAsset: (
    file: File,
    meta: { project: string; location: string; stage?: string; capturedAt?: string; lat?: string; lng?: string },
  ) => {
    const form = new FormData()
    form.append('file', file)
    form.append('project', meta.project)
    form.append('location', meta.location)
    if (meta.stage) form.append('stage', meta.stage)
    if (meta.capturedAt) form.append('capturedAt', meta.capturedAt)
    if (meta.lat && meta.lng) {
      form.append('lat', meta.lat)
      form.append('lng', meta.lng)
    }

    return request<Asset>('/api/assets/upload', {
      method: 'POST',
      body: form,
    })
  },

  getCompareReport: (beforeId?: string, afterId?: string) => {
    const query = new URLSearchParams()
    if (beforeId) query.set('beforeId', beforeId)
    if (afterId) query.set('afterId', afterId)
    const qStr = query.toString()
    return request<CompareResult>(`/api/reports/compare${qStr ? `?${qStr}` : ''}`)
  },

  getProjectReport: (projectId: string) => {
    return request<ProjectReport>(`/api/reports/project/${encodeURIComponent(projectId)}`)
  },

  listProjects: () => {
    return request<ProjectSimple[]>('/api/reports/projects')
  },

  getAsset: (id: string) => request<Asset>(`/api/assets/${id}`),

  reverifyAsset: (id: string) => request<Asset>(`/api/assets/${id}/reverify`, { method: 'POST' }),

  reverifyAll: () =>
    request<{ total: number; VERIFIED: number; UNVERIFIED: number; FLAGGED: number }>(
      '/api/assets/reverify-all',
      { method: 'POST' },
    ),

  getOverview: () => request<Overview>('/api/reports/overview'),

  getGraph: () => request<GraphData>('/api/reports/graph'),
}

/**
 * Resized delivery URL for previews. Cloudinary generates and caches the
 * smaller rendition on first request (c_limit never upscales, q_auto/f_auto
 * pick quality and format), so cards load a few KB instead of the full image.
 * Video gets a rendered still frame.
 */
export function thumbUrl(asset: Pick<Asset, 'cloudinaryUrl'> & { resourceType?: string }, width = 640): string {
  const url = asset.cloudinaryUrl
  if (asset.resourceType === 'video' || url.includes('/video/upload/')) {
    return url
      .replace('/video/upload/', `/video/upload/so_1,w_${width},c_limit,q_auto/`)
      .replace(/.[a-z0-9]+$/i, '.jpg')
  }
  return url.replace('/image/upload/', `/image/upload/w_${width},c_limit,q_auto,f_auto/`)
}

/* ── Disaster watch: temperature signals -> alerts -> Cloudinary evidence ── */

export type HazardType = 'heatwave' | 'coldwave' | 'highwaves'
export type HazardSeverity = 'watch' | 'warning' | 'emergency'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved'

export interface SiteReading {
  tempC: number
  feelsLikeC: number | null
  humidity: number | null
  condition: string | null
  normalC: number | null
  anomalyC: number | null
  waveHeightM: number | null
  seaTempC: number | null
  seaLevelM: number | null
  source: string
  sourceLabel: string
  observedAt: string
}

export interface NaturalEvent {
  id: string
  title: string
  category: string
  categoryId: string
  lat: number
  lng: number
  date: string
  link: string
}

export interface MonitoredSite {
  locationId: string
  name: string
  projectName: string
  lat: number
  lng: number
  assetCount: number
  alerting: boolean
  absoluteCalibrated: boolean
  latest: SiteReading | null
  openAlerts: number
  worstSeverity: HazardSeverity | null
}

export interface SitesResponse {
  sites: MonitoredSite[]
  unmonitored: number
  provider: 'google-maps-weather' | 'open-meteo'
  pollMinutes: number
  thresholds: { type: HazardType; severity: HazardSeverity; limit: number }[]
  waveThresholds: { type: HazardType; severity: HazardSeverity; limit: number }[]
  anomalyTiers: { severity: HazardSeverity; minDeltaC: number; minZ: number }[]
  calibratedMaxAbsLat: number
}

export interface AlertSummary {
  id: string
  locationId: string
  location: string
  projectName: string
  lat: number | null
  lng: number | null
  type: HazardType
  severity: HazardSeverity
  status: AlertStatus
  trigger: {
    value: number
    unit: '°C' | 'm'
    basis: 'absolute' | 'anomaly'
    threshold: number
    normal: number | null
    feelsLikeC: number | null
    source: string
    sourceLabel: string
    observedAt: string
  }
  peakValue: number
  latestValue: number
  unit: '°C' | 'm'
  readingCount: number
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  capture: { status: 'pending' | 'captured' | 'cloudy' | 'failed'; assetId: string | null; date?: string; note: string; at: string } | null
  confirmation: { status: 'confirmed' | 'not-confirmed' | 'inconclusive'; reasons: string[]; baselineAssetId: string | null; baselineDate?: string; at: string } | null
  notifiedAt: string | null
}

export interface AlertEvidenceSide {
  id: string
  cloudinaryUrl: string
  cloudinaryPublicId: string
  cloudinaryVersion: string
  resourceType: 'image' | 'video'
  capturedAt: string
  stage: string | null
  caption: string | null
}

export interface AlertDetail {
  alert: AlertSummary
  priority: 'monitor' | 'respond' | 'escalate'
  priorityReason: string
  insights: string[]
  corroboration: { level: 'corroborated' | 'uncorroborated' | 'no-imagery'; analysed: number; supporting: number; themes: string[]; text: string }
  nearbyEvents: { id: string; title: string; category: string; km: number; date: string; link: string }[]
  actions: string[]
  evidence: {
    assetCount: number
    before: AlertEvidenceSide | null
    after: AlertEvidenceSide | null
    boardUrl: string | null
    compareLink: string | null
    comparison: { caveats: string[]; method: string } | null
  }
  readings: SiteReading[]
  notifications: { id: string; contactName: string; channel: 'email' | 'ntfy' | 'log'; status: 'sent' | 'failed' | 'logged'; detail: string; subject: string; createdAt: string }[]
}

export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Severe'
export interface RiskFactor {
  id: 'exposure' | 'live' | 'forecast' | 'history' | 'events' | 'visual'
  label: string
  weight: number
  value: number | null
  points: number
  confidence: number
  detail: string
  source: string
}
export interface SiteRisk {
  locationId: string
  name: string
  score: number
  level: RiskLevel
  confidence: number
  dominant: { hazard: string; driver: string }
  factors: RiskFactor[]
}
export interface RiskResponse {
  computedAt: string
  sites: SiteRisk[]
  weights: Record<string, number>
  levels: { level: RiskLevel; min: number }[]
  formula: string
}

export interface Contact {
  id: string
  name: string
  role: string
  email: string | null
  ntfyTopic: string | null
  locationIds: string[]
  minSeverity: HazardSeverity
}

export interface PollResult {
  polled: number
  results: {
    locationId: string
    name: string
    tempC: number | null
    source: string | null
    alert: { id: string; severity: string; type: string; created: boolean; escalated: boolean } | null
    error?: string
  }[]
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const signalsApi = {
  sites: () => request<SitesResponse>('/api/signals/sites'),
  alerts: () => request<AlertSummary[]>('/api/signals/alerts'),
  alert: (id: string) => request<AlertDetail>(`/api/signals/alerts/${id}`),
  poll: () => request<PollResult>('/api/signals/poll', { method: 'POST' }),
  events: () => request<NaturalEvent[]>('/api/signals/events'),
  risk: (refresh = false) => request<RiskResponse>(`/api/signals/risk${refresh ? '?refresh=1' : ''}`),
  contacts: () => request<{ contacts: Contact[]; channels: { email: boolean; ntfy: boolean } }>('/api/signals/contacts'),
  addContact: (c: { name: string; role?: string; email?: string; ntfyTopic?: string; minSeverity: HazardSeverity; locationIds: string[] }) =>
    request<Contact>('/api/signals/contacts', json(c)),
  deleteContact: (id: string) => request<{ ok: boolean }>(`/api/signals/contacts/${id}`, { method: 'DELETE' }),
  runCapture: (id: string) => request<{ ok: boolean }>(`/api/signals/alerts/${id}/capture`, { method: 'POST' }),
  simulate: (locationId: string, temperatureC: number, waveHeightM?: number) =>
    request<{ alert: AlertSummary | null; alerts: AlertSummary[]; created: boolean; escalated: boolean }>(
      '/api/signals/ingest',
      json({ locationId, temperatureC, waveHeightM, source: 'demo-simulator' }),
    ),
  geocode: (q: string) => request<{ lat: number; lng: number; displayName: string }>(`/api/signals/geocode?q=${encodeURIComponent(q)}`),
  setStatus: (id: string, status: AlertStatus) => request<{ ok: boolean }>(`/api/signals/alerts/${id}/status`, json({ status })),
  setCoordinates: (locationId: string, lat: number, lng: number) =>
    request<{ ok: boolean }>(`/api/signals/sites/${locationId}`, { ...json({ lat, lng }), method: 'PUT' }),
}
