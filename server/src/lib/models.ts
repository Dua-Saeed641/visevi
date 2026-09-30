import type { ObjectId } from 'mongodb'

/**
 * MongoDB document shapes for VisEvi's three collections. This is
 * documentation, not a schema enforced by the database (Mongo is
 * schema-less by design — see README.md § Notes on the MongoDB setup).
 * Keep this file in sync with reality by hand; it's the single place that
 * describes what's actually stored.
 */

export interface ProjectDocument {
  _id: ObjectId
  name: string
  description?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface LocationDocument {
  _id: ObjectId
  projectId: ObjectId
  name: string
  /** Optional site coordinates. A location with coordinates becomes a
   * monitored site: temperature signals are matched to it (see lib/hazards.ts). */
  lat?: number | null
  lng?: number | null
  /** Cached "what is normal here": per-UTC-hour temperature mean and spread
   * for one calendar month over the last ~10 years (Open-Meteo archive). */
  climatology?: { month: number; years: number; hourMean: number[]; hourSd: number[]; fetchedAt: Date } | null
  /** Cached long-run hazard exposure decoded from NASA SEDAC hazard maps (static data). */
  exposure?: { readings: { hazard: string; score: number; klass: { position: number; of: number } | null }[]; fetchedAt: Date } | null
  createdAt: Date
}

export type ReadingSource = 'google-maps-weather' | 'open-meteo' | 'sensor-webhook' | 'demo-simulator' | 'historical-replay'

/** One reading for a monitored site: temperature, and marine data if coastal. */
export interface ReadingDocument {
  _id: ObjectId
  locationId: ObjectId
  tempC: number
  feelsLikeC: number | null
  humidity: number | null
  condition: string | null
  /** Normal temperature for this month and hour, and the departure from it. */
  normalC: number | null
  anomalyC: number | null
  /** Marine values; null for inland sites or where the model has no data. */
  waveHeightM: number | null
  seaTempC: number | null
  seaLevelM: number | null
  source: ReadingSource
  observedAt: Date
  createdAt: Date
}

export type HazardType = 'heatwave' | 'coldwave' | 'highwaves'
export type HazardSeverity = 'watch' | 'warning' | 'emergency'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved'

/**
 * A disaster-management issue raised when a temperature signal crosses a
 * hazard threshold at a monitored site. The assessment (Cloudinary-backed
 * before/after comparison, visual corroboration, actions) is computed on
 * read from the site's evidence, so newly uploaded field media is reflected
 * without re-raising the alert.
 */
export interface AlertDocument {
  _id: ObjectId
  locationId: ObjectId
  type: HazardType
  severity: HazardSeverity
  status: AlertStatus
  /** The reading that first crossed the threshold. `value` is in `unit`
   * (degrees C for heat/cold, metres for waves). `basis` says what tripped it:
   * a fixed limit, or a departure from what is normal for this place and month. */
  trigger: {
    value: number
    unit: '°C' | 'm'
    basis: 'absolute' | 'anomaly'
    /** Absolute limit crossed, or the departure (°C) for an anomaly. */
    threshold: number
    /** Normal temperature at that hour, for anomaly alerts. */
    normal: number | null
    feelsLikeC: number | null
    source: ReadingSource
    observedAt: Date
  }
  peakValue: number
  latestValue: number
  readingCount: number
  /** The automatic satellite capture triggered by this alert (see lib/pipeline.ts). */
  capture?: {
    status: 'pending' | 'captured' | 'cloudy' | 'failed'
    assetId?: ObjectId
    date?: string
    note: string
    at: Date
  } | null
  /** Whether the fresh capture, compared with a baseline, confirms the hazard. */
  confirmation?: {
    status: 'confirmed' | 'not-confirmed' | 'inconclusive'
    reasons: string[]
    baselineAssetId?: ObjectId
    baselineDate?: string
    changedPct?: number | null
    at: Date
  } | null
  notifiedAt?: Date | null
  createdAt: Date
  updatedAt: Date
  resolvedAt?: Date | null
}

/** A person responsible for one or more sites, told when an alert is confirmed. */
export interface ContactDocument {
  _id: ObjectId
  name: string
  role: string
  email?: string | null
  /** ntfy.sh topic: free push notifications to the ntfy phone app, no account or key. */
  ntfyTopic?: string | null
  /** Empty = all sites. */
  locationIds: ObjectId[]
  minSeverity: HazardSeverity
  createdAt: Date
}

export interface NotificationDocument {
  _id: ObjectId
  alertId: ObjectId
  contactId: ObjectId
  contactName: string
  channel: 'email' | 'ntfy' | 'log'
  status: 'sent' | 'failed' | 'logged'
  subject: string
  body: string
  detail: string
  createdAt: Date
}

export type VerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'FLAGGED'

/** One explainable check contributing to an asset's verification status. */
export interface VerificationCheck {
  id: 'content-claim' | 'project-theme' | 'duplicate' | 'capture-date' | 'provenance'
  label: string
  /** skipped = not enough data to judge; never counted as a pass. */
  result: 'pass' | 'fail' | 'skipped'
  detail: string
}

export interface VerificationResult {
  checks: VerificationCheck[]
  evaluatedAt: Date
}

/** A Cloudinary transformation applied to the source media, for traceability. */
export interface TransformationRecord {
  step: string
  cloudinary: string
  purpose: string
}

/**
 * AI-derived structured observation for an asset. Every field is nullable
 * on purpose: if Cloudinary's analysis can't determine something (or hasn't
 * run yet), that's represented as absence, not a guess. See
 * REQUIREMENTS.md § Design Specifications for the metadata shape this is
 * derived from, and ARCHITECTURE.md § Impact Indicator Mapping for how
 * `tags`/`activity` feed later stages.
 */
export interface Observation {
  activity: string | null
  objects: string[]
  tags: string[]
  caption: string | null
  /** Only set when the Cloudinary response provides one — never invented. */
  confidence: number | null
  /** Which Cloudinary capability produced this (e.g. "cld-ai-vision-analyze"),
   * for traceability back to how the observation was derived. */
  source: string
  analyzedAt: Date
}

export interface AssetDocument {
  _id: ObjectId

  // Cloudinary identity — the traceability anchor back to the source media.
  cloudinaryPublicId: string
  cloudinaryAssetId?: string | null
  cloudinaryUrl: string
  cloudinaryVersion: string
  resourceType: 'image' | 'video'

  // Organizational references (still normalized — see README.md for why).
  projectId: ObjectId
  locationId: ObjectId | null

  /** Capture date claimed by the uploader. */
  capturedAt: Date | null
  /** Capture date read from the file's own EXIF (via Cloudinary), if any. */
  exifCapturedAt?: Date | null
  stage: string | null

  // Null until Cloudinary AI analysis has actually run (M2).
  observation: Observation | null

  verificationStatus: VerificationStatus
  verificationNote: string | null
  verification?: VerificationResult | null
  perceptualHash: string | null
  /** Incoming transformations applied at upload — transformation history.
   * They are baked into the stored asset (Cloudinary "incoming
   * transformation"); the perceptual hash is taken from the raw bytes
   * before this step. */
  transformations?: TransformationRecord[]

  /**
   * Set for satellite snapshots captured from NASA Worldview. Such an asset has
   * no uploader "claim" to test, so it is verified by provenance instead:
   * `verified` = the server re-requested the same snapshot from NASA and the
   * uploaded image matched it; `system` = VisEvi fetched it itself; `failed` =
   * it was presented as a NASA snapshot but did not match.
   */
  capture?: {
    kind: 'nasa-worldview'
    layer: string
    lat: number
    lng: number
    halfDeg: number
    date: string
    provenance: 'verified' | 'system' | 'failed'
    note: string
  } | null

  createdAt: Date
  updatedAt: Date
}
