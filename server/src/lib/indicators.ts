import { conceptLabel, conceptsOf, observationText } from './lexicon.js'
import type { AssetDocument } from './models.js'

/**
 * UN SDG target lookup: which detected concepts count as evidence toward
 * which indicator. Codes/titles are the official SDG target numbers
 * (https://unstats.un.org/sdgs/indicators/indicators-list/), abbreviated.
 * This is a curated table, deliberately — a mapping an auditor can read.
 */
export interface IndicatorDef {
  code: string
  goal: number
  title: string
  concepts: string[]
}

export const INDICATORS: IndicatorDef[] = [
  { code: '7.1', goal: 7, title: 'Universal access to affordable, reliable, modern energy', concepts: ['electricity', 'solar-energy', 'clean-cooking'] },
  { code: '7.2', goal: 7, title: 'Increase the share of renewable energy', concepts: ['solar-energy', 'wind-energy'] },
  { code: '13.2', goal: 13, title: 'Integrate climate action into planning and policy', concepts: ['solar-energy', 'wind-energy', 'reforestation', 'mangrove-coastal', 'flood-climate', 'glacier-ice'] },
  { code: '13.1', goal: 13, title: 'Strengthen resilience and adaptive capacity to climate-related hazards', concepts: ['flood-climate', 'heat-drought', 'wildfire'] },
  { code: '6.1', goal: 6, title: 'Safe and affordable drinking water for all', concepts: ['drinking-water'] },
  { code: '6.2', goal: 6, title: 'Access to adequate sanitation and hygiene', concepts: ['sanitation'] },
  { code: '2.3', goal: 2, title: 'Double agricultural productivity of small-scale producers', concepts: ['agriculture'] },
  { code: '15.2', goal: 15, title: 'Halt deforestation, increase afforestation and reforestation', concepts: ['reforestation', 'forest-cover'] },
  { code: '6.6', goal: 6, title: 'Protect and restore water-related ecosystems (lakes, rivers, wetlands)', concepts: ['water-body'] },
  { code: '14.2', goal: 14, title: 'Protect and restore marine and coastal ecosystems', concepts: ['mangrove-coastal'] },
  { code: '15.5', goal: 15, title: 'Protect biodiversity and natural habitats', concepts: ['biodiversity'] },
  { code: '11.6', goal: 11, title: 'Reduce environmental impact of cities, incl. waste management', concepts: ['waste'] },
  { code: '12.5', goal: 12, title: 'Substantially reduce waste through recycling and reuse', concepts: ['recycling'] },
  { code: '4.a', goal: 4, title: 'Build and upgrade inclusive education facilities', concepts: ['education'] },
  { code: '3.8', goal: 3, title: 'Access to quality essential health-care services', concepts: ['health'] },
  { code: '9.1', goal: 9, title: 'Develop quality, reliable, resilient infrastructure', concepts: ['construction', 'roads'] },
  { code: '5.a', goal: 5, title: 'Women’s economic resources and livelihoods', concepts: ['livelihood'] },
]

/** Below this, an indicator is surfaced as "needs review", never asserted. */
export const ASSERT_THRESHOLD = 0.5

export interface IndicatorResult {
  code: string
  goal: number
  title: string
  /** Evidence score in [0,1] — see scoreIndicator; NOT a model probability. */
  confidence: number
  status: 'asserted' | 'needs-review'
  backingAssetCount: number
  backingAssetIds: string[]
  /** Concept labels that actually triggered the mapping. */
  matchedConcepts: string[]
  reason: string
}

type IndicatorAsset = Pick<AssetDocument, '_id' | 'observation' | 'verificationStatus'>

/**
 * Evidence score = 0.7 * volume + 0.3 * coverage, where
 *   volume   = min(backing, 5) / 5      (more independent assets -> stronger)
 *   coverage = backing / analysed       (how much of the project shows it)
 * Backing assets flagged by verification don't count (unverifiable evidence
 * can't support a claim); unverified ones count at 0.7 weight, verified at 1.
 * A single photo alone therefore never reaches the 0.5 threshold (max 0.44):
 * an indicator needs at least two supporting assets to be asserted.
 */
export function mapIndicators(assets: IndicatorAsset[]): IndicatorResult[] {
  const analysed = assets.filter((a) => a.observation && a.verificationStatus !== 'FLAGGED')
  if (analysed.length === 0) return []

  const conceptsByAsset = analysed.map((a) => ({
    asset: a,
    ids: new Map(conceptsOf(observationText(a.observation)).map((c) => [c.conceptId, c])),
  }))

  const results: IndicatorResult[] = []
  for (const ind of INDICATORS) {
    const backing = conceptsByAsset.filter((c) => ind.concepts.some((id) => c.ids.has(id)))
    if (backing.length === 0) continue

    const weighted = backing.reduce((sum, b) => sum + (b.asset.verificationStatus === 'VERIFIED' ? 1 : 0.7), 0)
    const volume = Math.min(weighted, 5) / 5
    const coverage = weighted / analysed.length
    const confidence = Math.round((0.7 * volume + 0.3 * Math.min(coverage, 1)) * 100) / 100

    const matched = [...new Set(backing.flatMap((b) => ind.concepts.filter((id) => b.ids.has(id))))]
    const status = confidence >= ASSERT_THRESHOLD ? 'asserted' : 'needs-review'
    results.push({
      code: ind.code,
      goal: ind.goal,
      title: ind.title,
      confidence,
      status,
      backingAssetCount: backing.length,
      backingAssetIds: backing.map((b) => b.asset._id.toHexString()),
      matchedConcepts: matched.map(conceptLabel),
      reason:
        status === 'asserted'
          ? `${backing.length} of ${analysed.length} analysed assets show ${matched.map(conceptLabel).join(', ')}.`
          : `Only ${backing.length} of ${analysed.length} analysed assets support this (${matched.map(conceptLabel).join(', ')}) — not enough to assert without review.`,
    })
  }
  return results.sort((a, b) => b.confidence - a.confidence)
}
