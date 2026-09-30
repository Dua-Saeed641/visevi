import { Router } from 'express'
import { ObjectId, type Db } from 'mongodb'
import { cacheGets } from '../lib/cache.js'
import { INDICATORS, mapIndicators } from '../lib/indicators.js'
import { conceptLabel, conceptsOf, observationText } from '../lib/lexicon.js'
import { getDb } from '../lib/mongo.js'
import { describeChange } from '../lib/narrative.js'
import { measureFootprint } from '../lib/compare.js'
import type { AssetDocument, LocationDocument, ProjectDocument } from '../lib/models.js'

export const reportsRouter = Router()
reportsRouter.use(cacheGets('reports'))

const when = (a: Pick<AssetDocument, 'capturedAt' | 'createdAt'>) => (a.capturedAt ?? a.createdAt).getTime()

function serializeSide(
  asset: AssetDocument,
  project: ProjectDocument | null,
  location: LocationDocument | null,
) {
  return {
    id: asset._id.toHexString(),
    cloudinaryUrl: asset.cloudinaryUrl,
    cloudinaryPublicId: asset.cloudinaryPublicId,
    cloudinaryVersion: asset.cloudinaryVersion,
    projectName: project?.name ?? 'Unknown',
    location: location?.name ?? 'Unknown',
    stage: asset.stage,
    verificationStatus: asset.verificationStatus,
    createdAt: (asset.capturedAt ?? asset.createdAt).toISOString(),
    observation: asset.observation,
    capture: asset.capture ?? null,
  }
}

async function projectAndLocation(db: Db, asset: AssetDocument) {
  return Promise.all([
    db.collection<ProjectDocument>('projects').findOne({ _id: asset.projectId }),
    asset.locationId ? db.collection<LocationDocument>('locations').findOne({ _id: asset.locationId }) : null,
  ])
}

const DAY = 86_400_000

/**
 * The most meaningful before/after pair among assets of ONE site: a pair a year
 * (or whole years) apart is the same season, so it shows lasting change rather
 * than the calendar; among those, the longest span wins. If no same-season pair
 * exists it falls back to the earliest and latest. `assets` must be one site,
 * sorted by time.
 */
function bestPair(assets: AssetDocument[]) {
  let best: { a: AssetDocument; b: AssetDocument; spanDays: number; sameSeason: boolean } | null = null
  for (let i = 0; i < assets.length; i++) {
    for (let j = i + 1; j < assets.length; j++) {
      const spanDays = (when(assets[j]) - when(assets[i])) / DAY
      const off = ((spanDays % 365.25) + 365.25) % 365.25
      const sameSeason = spanDays >= 300 && Math.min(off, 365.25 - off) <= 45
      const better = !best || (sameSeason && !best.sameSeason) || (sameSeason === best.sameSeason && sameSeason && spanDays > best.spanDays)
      if (better) best = { a: assets[i], b: assets[j], spanDays, sameSeason }
    }
  }
  if (best && !best.sameSeason && assets.length >= 2) {
    const a = assets[0]
    const b = assets[assets.length - 1]
    best = { a, b, spanDays: (when(b) - when(a)) / DAY, sameSeason: false }
  }
  return best
}

/**
 * GET /api/reports/compare?beforeId=...&afterId=...
 * Two assets -> visual pair + a description of what changed between them.
 * With no ids, falls back to the two oldest assets (demo convenience).
 * The earlier capture is always treated as "before".
 */
reportsRouter.get('/compare', async (req, res, next) => {
  try {
    const db = getDb()
    const assets = db.collection<AssetDocument>('assets')
    const { beforeId, afterId } = req.query

    let a: AssetDocument | null
    let b: AssetDocument | null
    if (!beforeId || !afterId) {
      const sample = await assets.find({}).sort({ createdAt: 1 }).limit(2).toArray()
      if (sample.length < 2) {
        res.status(400).json({ error: 'Need at least 2 assets in the database to compare' })
        return
      }
      ;[a, b] = sample
    } else {
      if (!ObjectId.isValid(String(beforeId)) || !ObjectId.isValid(String(afterId))) {
        res.status(400).json({ error: 'beforeId and afterId must be valid asset ids' })
        return
      }
      ;[a, b] = await Promise.all([
        assets.findOne({ _id: new ObjectId(String(beforeId)) }),
        assets.findOne({ _id: new ObjectId(String(afterId)) }),
      ])
    }
    if (!a || !b) {
      res.status(404).json({ error: 'One or both assets could not be found' })
      return
    }

    const [before, after] = when(a) <= when(b) ? [a, b] : [b, a]
    const [[bp, bl], [ap, al]] = await Promise.all([projectAndLocation(db, before), projectAndLocation(db, after)])

    // Same footprint is a fact from capture metadata (see lib/compare.ts); only then is a
    // pixel-by-pixel comparison valid.
    const { sameFootprint, pixels } = await measureFootprint(before, after)
    const change = describeChange(before, after, {
      sameProject: before.projectId.equals(after.projectId),
      sameLocation: !!before.locationId && !!after.locationId && before.locationId.equals(after.locationId),
      beforeProject: bp?.name,
      afterProject: ap?.name,
      sameFootprint,
      pixels,
    })
    res.json({
      before: serializeSide(before, bp, bl),
      after: serializeSide(after, ap, al),
      sameProject: before.projectId.equals(after.projectId),
      comparison: change,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/reports/project/:projectId
 * Aggregated visual impact report for one project (id, or name as fallback).
 */
reportsRouter.get('/project/:projectId', async (req, res, next) => {
  try {
    const db = getDb()
    const idOrName = req.params.projectId
    let project: ProjectDocument | null = null

    if (ObjectId.isValid(idOrName)) {
      project = await db.collection<ProjectDocument>('projects').findOne({ _id: new ObjectId(idOrName) })
    }
    if (!project) {
      // Fallback: by name, else the first project (report page opens with no selection)
      project =
        (await db.collection<ProjectDocument>('projects').findOne({ name: idOrName })) ??
        (await db.collection<ProjectDocument>('projects').findOne({}))
    }
    if (!project) {
      res.status(404).json({ error: 'No project found to generate report' })
      return
    }

    const [assetRows, locations] = await Promise.all([
      db.collection<AssetDocument>('assets').find({ projectId: project._id }).toArray(),
      db.collection<LocationDocument>('locations').find({ projectId: project._id }).toArray(),
    ])
    const assets = assetRows.sort((x, y) => when(x) - when(y))
    const locName = new Map(locations.map((l) => [l._id.toHexString(), l.name]))

    // Activity breakdown. A "verified activity" is an activity seen on at
    // least one VERIFIED asset — the number the report headlines.
    const activityCounts: Record<string, { count: number; verified: number }> = {}
    const verifiedActivities = new Set<string>()
    let verifiedCount = 0
    let flaggedCount = 0
    for (const a of assets) {
      if (a.verificationStatus === 'VERIFIED') verifiedCount++
      if (a.verificationStatus === 'FLAGGED') flaggedCount++
      const activity = a.observation?.activity ?? 'Unclassified Activity'
      const row = (activityCounts[activity] ??= { count: 0, verified: 0 })
      row.count++
      if (a.verificationStatus === 'VERIFIED') {
        row.verified++
        if (a.observation?.activity) verifiedActivities.add(a.observation.activity.toLowerCase())
      }
    }

    // Suggested pairs and the featured before/after: per site, the best same-season pair.
    const usable = assets.filter((a) => a.verificationStatus !== 'FLAGGED')
    const suggestedPairs = locations
      .map((loc) => {
        const here = usable.filter((a) => a.locationId?.equals(loc._id))
        const pair = here.length >= 2 ? bestPair(here) : null
        if (!pair) return null
        return {
          location: loc.name,
          beforeId: pair.a._id.toHexString(),
          afterId: pair.b._id.toHexString(),
          beforeUrl: pair.a.cloudinaryUrl,
          afterUrl: pair.b.cloudinaryUrl,
          spanDays: Math.round(pair.spanDays),
          sameSeason: pair.sameSeason,
          pair,
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)

    // Featured: the site whose pair is same-season and longest.
    const featured = [...suggestedPairs].sort((x, y) => Number(y.sameSeason) - Number(x.sameSeason) || y.spanDays - x.spanDays)[0]
    let beforeAfter = null
    if (featured) {
      const first = featured.pair.a
      const last = featured.pair.b
      const m = await measureFootprint(first, last)
      beforeAfter = {
        beforeId: first._id.toHexString(),
        afterId: last._id.toHexString(),
        beforeUrl: first.cloudinaryUrl,
        beforeDate: (first.capturedAt ?? first.createdAt).toISOString(),
        afterUrl: last.cloudinaryUrl,
        afterDate: (last.capturedAt ?? last.createdAt).toISOString(),
        sameSeason: featured.sameSeason,
        summary: describeChange(first, last, {
          sameProject: true,
          sameLocation: !!first.locationId && !!last.locationId && first.locationId.equals(last.locationId),
          beforeProject: project.name,
          afterProject: project.name,
          sameFootprint: m.sameFootprint,
          pixels: m.pixels,
        }),
      }
    }

    const indicators = mapIndicators(assets)

    res.json({
      project: {
        id: project._id.toHexString(),
        name: project.name,
        description: project.description ?? 'Impact and Sustainability Field Project',
        createdAt: project.createdAt.toISOString(),
      },
      stats: {
        totalAssets: assets.length,
        verifiedAssets: verifiedCount,
        flaggedAssets: flaggedCount,
        unverifiedAssets: assets.length - (verifiedCount + flaggedCount),
        locationCount: locations.length,
        verifiedActivities: verifiedActivities.size,
      },
      locations: locations.map((loc) => ({ id: loc._id.toHexString(), name: loc.name })),
      activities: Object.entries(activityCounts).map(([name, v]) => ({ name, count: v.count, verified: v.verified })),
      indicators,
      beforeAfter,
      suggestedPairs: suggestedPairs.map(({ pair: _pair, ...rest }) => rest),
      timeline: assets.map((a) => ({
        id: a._id.toHexString(),
        cloudinaryUrl: a.cloudinaryUrl,
        cloudinaryPublicId: a.cloudinaryPublicId,
        cloudinaryVersion: a.cloudinaryVersion,
        location: a.locationId ? (locName.get(a.locationId.toHexString()) ?? 'Unknown') : 'Unknown',
        stage: a.stage,
        status: a.verificationStatus,
        verificationNote: a.verificationNote,
        observation: a.observation,
        createdAt: (a.capturedAt ?? a.createdAt).toISOString(),
      })),
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/reports/projects — projects with asset counts, for pickers. */
reportsRouter.get('/projects', async (_req, res, next) => {
  try {
    const db = getDb()
    const [projects, counts] = await Promise.all([
      db.collection<ProjectDocument>('projects').find({}).sort({ createdAt: 1 }).toArray(),
      db
        .collection<AssetDocument>('assets')
        .aggregate<{ _id: ObjectId; n: number }>([{ $group: { _id: '$projectId', n: { $sum: 1 } } }])
        .toArray(),
    ])
    const n = new Map(counts.map((c) => [c._id.toHexString(), c.n]))
    res.json(projects.map((p) => ({ id: p._id.toHexString(), name: p.name, assetCount: n.get(p._id.toHexString()) ?? 0 })))
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/reports/graph
 * Evidence Graph built from real data: projects -> locations -> assets ->
 * detected themes (concepts), plus indicator nodes linked to their backing
 * assets. Nothing decorative — every node/edge exists because of a stored
 * record or a lexicon match on a real observation.
 */
reportsRouter.get('/graph', async (_req, res, next) => {
  try {
    const db = getDb()
    const [projects, locations, assets] = await Promise.all([
      db.collection<ProjectDocument>('projects').find({}).toArray(),
      db.collection<LocationDocument>('locations').find({}).toArray(),
      db.collection<AssetDocument>('assets').find({}).toArray(),
    ])

    type Node = { id: string; kind: 'project' | 'location' | 'asset' | 'theme' | 'indicator'; label: string; status?: string; url?: string; meta?: string }
    type Edge = { source: string; target: string; kind: string }
    const nodes: Node[] = []
    const edges: Edge[] = []
    const themes = new Set<string>()

    for (const p of projects) nodes.push({ id: `p:${p._id}`, kind: 'project', label: p.name })
    for (const l of locations) {
      nodes.push({ id: `l:${l._id}`, kind: 'location', label: l.name })
      edges.push({ source: `p:${l.projectId}`, target: `l:${l._id}`, kind: 'has-location' })
    }
    for (const a of assets) {
      nodes.push({
        id: `a:${a._id}`,
        kind: 'asset',
        label: a.observation?.activity ?? a.cloudinaryPublicId.split('/').pop() ?? 'asset',
        status: a.verificationStatus,
        url: a.cloudinaryUrl,
        meta: a.observation?.caption ?? undefined,
      })
      edges.push({
        source: a.locationId ? `l:${a.locationId}` : `p:${a.projectId}`,
        target: `a:${a._id}`,
        kind: 'evidence',
      })
      for (const c of conceptsOf(observationText(a.observation))) {
        themes.add(c.conceptId)
        edges.push({ source: `a:${a._id}`, target: `t:${c.conceptId}`, kind: 'shows' })
      }
    }
    for (const id of themes) nodes.push({ id: `t:${id}`, kind: 'theme', label: conceptLabel(id) })

    for (const p of projects) {
      const projectAssets = assets.filter((a) => a.projectId.equals(p._id))
      for (const ind of mapIndicators(projectAssets)) {
        if (ind.status !== 'asserted') continue
        const nodeId = `i:${p._id}:${ind.code}`
        nodes.push({ id: nodeId, kind: 'indicator', label: `SDG ${ind.code}`, meta: `${ind.title} (score ${ind.confidence})` })
        edges.push({ source: `p:${p._id}`, target: nodeId, kind: 'supports' })
      }
    }

    res.json({ nodes, edges })
  } catch (err) {
    next(err)
  }
})

/** GET /api/reports/indicator-table — the SDG lookup table itself (transparency). */
reportsRouter.get('/indicator-table', (_req, res) => {
  res.json(
    INDICATORS.map((i) => ({ code: i.code, goal: i.goal, title: i.title, concepts: i.concepts.map(conceptLabel) })),
  )
})

/**
 * GET /api/reports/overview
 * Library-wide numbers behind the analytics page: KPIs, verification per
 * project, per-asset capture points (for the timeline), how often each check
 * passes/fails, detected themes, and indicator scores per project.
 */
reportsRouter.get('/overview', async (_req, res, next) => {
  try {
    const db = getDb()
    const [projects, locations, assets] = await Promise.all([
      db.collection<ProjectDocument>('projects').find({}).sort({ createdAt: 1 }).toArray(),
      db.collection<LocationDocument>('locations').find({}).toArray(),
      db.collection<AssetDocument>('assets').find({}).toArray(),
    ])
    const projectName = new Map(projects.map((p) => [p._id.toHexString(), p.name]))

    const count = (st: string) => assets.filter((a) => a.verificationStatus === st).length
    const perProject = projects.map((p) => {
      const mine = assets.filter((a) => a.projectId.equals(p._id))
      return {
        name: p.name,
        verified: mine.filter((a) => a.verificationStatus === 'VERIFIED').length,
        unverified: mine.filter((a) => a.verificationStatus === 'UNVERIFIED').length,
        flagged: mine.filter((a) => a.verificationStatus === 'FLAGGED').length,
      }
    })

    const points = assets.map((a) => ({
      id: a._id.toHexString(),
      project: projectName.get(a.projectId.toHexString()) ?? 'Unknown',
      date: (a.capturedAt ?? a.createdAt).toISOString(),
      status: a.verificationStatus,
      label: a.observation?.caption ?? a.observation?.activity ?? null,
    }))

    // Per check: how many assets passed / failed / were skipped for lack of data.
    const checkMap = new Map<string, { id: string; label: string; pass: number; fail: number; skipped: number }>()
    for (const a of assets) {
      for (const c of a.verification?.checks ?? []) {
        const row = checkMap.get(c.id) ?? { id: c.id, label: c.label, pass: 0, fail: 0, skipped: 0 }
        row[c.result]++
        checkMap.set(c.id, row)
      }
    }

    const themeCounts = new Map<string, number>()
    for (const a of assets) {
      for (const c of conceptsOf(observationText(a.observation))) {
        themeCounts.set(c.conceptId, (themeCounts.get(c.conceptId) ?? 0) + 1)
      }
    }
    const themes = [...themeCounts]
      .map(([id, n]) => ({ name: conceptLabel(id), count: n }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const indicators = projects
      .flatMap((p) =>
        mapIndicators(assets.filter((a) => a.projectId.equals(p._id))).map((ind) => ({
          project: p.name,
          code: ind.code,
          title: ind.title,
          confidence: ind.confidence,
          status: ind.status,
          backing: ind.backingAssetCount,
        })),
      )
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 14)

    const total = assets.length
    res.json({
      kpis: {
        totalAssets: total,
        projects: projects.length,
        locations: locations.length,
        verified: count('VERIFIED'),
        unverified: count('UNVERIFIED'),
        flagged: count('FLAGGED'),
        verifiedRate: total ? Math.round((count('VERIFIED') / total) * 100) : 0,
        assertedIndicators: indicators.filter((i) => i.status === 'asserted').length,
      },
      totalAssets: total,
      perProject,
      points,
      checks: [...checkMap.values()],
      themes,
      indicators,
    })
  } catch (err) {
    next(err)
  }
})
