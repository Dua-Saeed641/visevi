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
  createdAt: Date
}

export type VerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'FLAGGED'

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

  capturedAt: Date | null
  stage: string | null

  // Null until Cloudinary AI analysis has actually run (M2).
  observation: Observation | null

  verificationStatus: VerificationStatus
  verificationNote: string | null
  perceptualHash: string | null

  createdAt: Date
  updatedAt: Date
}
