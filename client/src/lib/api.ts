const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

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
  id: 'content-claim' | 'project-theme' | 'duplicate' | 'capture-date'
  label: string
  result: 'pass' | 'fail' | 'skipped'
  detail: string
}

export interface TransformationRecord {
  step: string
  cloudinary: string
  purpose: string
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
}

export interface ChangeSummary {
  diffDays: number
  timeSpanLabel: string
  newTags: string[]
  removedTags: string[]
  newObjects: string[]
  removedObjects: string[]
  emergedThemes: string[]
  fadedThemes: string[]
  activityChange: string
  narrative: string
  method: string
  visualSummary: string
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
    summary: ChangeSummary
  } | null
  suggestedPairs: {
    location: string
    beforeId: string
    afterId: string
    beforeUrl: string
    afterUrl: string
    spanDays: number
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
  totalAssets: number
  perProject: { name: string; verified: number; unverified: number; flagged: number }[]
  themes: { name: string; count: number }[]
  months: { month: string; count: number }[]
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
    meta: { project: string; location: string; stage?: string; capturedAt?: string },
  ) => {
    const form = new FormData()
    form.append('file', file)
    form.append('project', meta.project)
    form.append('location', meta.location)
    if (meta.stage) form.append('stage', meta.stage)
    if (meta.capturedAt) form.append('capturedAt', meta.capturedAt)

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

/** Still image to show for an asset: the image itself, or a rendered frame for video. */
export function thumbUrl(asset: Pick<Asset, 'cloudinaryUrl' | 'resourceType'>): string {
  if (asset.resourceType !== 'video') return asset.cloudinaryUrl
  return asset.cloudinaryUrl.replace('/video/upload/', '/video/upload/so_1/').replace(/\.[a-z0-9]+$/i, '.jpg')
}
