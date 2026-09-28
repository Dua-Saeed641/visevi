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

export interface Asset {
  id: string
  cloudinaryPublicId: string
  cloudinaryUrl: string
  projectName: string
  location: string
  createdAt: string
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),

  listAssets: () => request<Asset[]>('/api/assets'),

  uploadAsset: (file: File, meta: { project: string; location: string }) => {
    const form = new FormData()
    form.append('file', file)
    form.append('project', meta.project)
    form.append('location', meta.location)

    return request<Asset>('/api/assets/upload', {
      method: 'POST',
      body: form,
    })
  },
}
