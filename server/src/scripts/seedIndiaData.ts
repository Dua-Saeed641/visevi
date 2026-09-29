import { connectMongo, getDb } from '../lib/mongo.js'
import { uploadBuffer, analyzeAsset } from '../lib/cloudinary.js'
import type { AssetDocument, LocationDocument, ProjectDocument } from '../lib/models.js'

interface SampleItem {
  project: string
  projectDesc: string
  location: string
  imageUrl: string
  stage: 'BASELINE' | 'FOLLOW_UP'
  activity: string
  caption: string
  tags: string[]
}

const INDIA_SAMPLE_DATA: SampleItem[] = [
  {
    project: 'PM-KUSUM Solar Agriculture Pump Scheme',
    projectDesc: 'Solar-powered irrigation for smallholder farmers across arid districts in Rajasthan.',
    location: 'Barmer, Rajasthan',
    imageUrl: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?w=800',
    stage: 'BASELINE',
    activity: 'Land Preparation & Survey',
    caption: 'Initial site inspection of arid agricultural plot prior to solar pump installation.',
    tags: ['rajasthan', 'agriculture', 'baseline', 'arid', 'solar-kusum'],
  },
  {
    project: 'PM-KUSUM Solar Agriculture Pump Scheme',
    projectDesc: 'Solar-powered irrigation for smallholder farmers across arid districts in Rajasthan.',
    location: 'Barmer, Rajasthan',
    imageUrl: 'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?w=800',
    stage: 'FOLLOW_UP',
    activity: 'Solar Pump Array Installation',
    caption: 'Completed 5kW solar photovoltaic array supplying continuous drip irrigation.',
    tags: ['rajasthan', 'solar-energy', 'renewable', 'irrigation', 'completed'],
  },
  {
    project: 'Jal Jeevan Mission Rural Water Supply',
    projectDesc: 'Providing functional household tap connections (FHTC) to rural habitations.',
    location: 'Satara, Maharashtra',
    imageUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb186a5b7?w=800',
    stage: 'BASELINE',
    activity: 'Borewell & Pipeline Excavation',
    caption: 'Excavation for village water distribution network pipeline laying.',
    tags: ['maharashtra', 'water-supply', 'jal-jeevan', 'excavation', 'baseline'],
  },
  {
    project: 'Jal Jeevan Mission Rural Water Supply',
    projectDesc: 'Providing functional household tap connections (FHTC) to rural habitations.',
    location: 'Satara, Maharashtra',
    imageUrl: 'https://images.unsplash.com/photo-1574482620826-40685ca5ebd2?w=800',
    stage: 'FOLLOW_UP',
    activity: 'Clean Water Tap Operation',
    caption: 'Operational community tap stand supplying potable drinking water.',
    tags: ['maharashtra', 'clean-water', 'sdg6', 'potable', 'completed'],
  },
  {
    project: 'Sundarbans Coastal Mangrove Restoration',
    projectDesc: 'Restoring bio-shield mangrove plantations to protect coastal villages from cyclone surges.',
    location: 'South 24 Parganas, West Bengal',
    imageUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800',
    stage: 'BASELINE',
    activity: 'Eroded Coastal Bank Baseline',
    caption: 'Baseline survey of embankment area vulnerable to tidal erosion.',
    tags: ['sundarbans', 'west-bengal', 'mangroves', 'coastal', 'baseline'],
  },
  {
    project: 'Sundarbans Coastal Mangrove Restoration',
    projectDesc: 'Restoring bio-shield mangrove plantations to protect coastal villages from cyclone surges.',
    location: 'South 24 Parganas, West Bengal',
    imageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800',
    stage: 'FOLLOW_UP',
    activity: 'Established Mangrove Canopy',
    caption: 'Thriving Rhizophora mangrove plantation after 18 months of community sapling care.',
    tags: ['sundarbans', 'west-bengal', 'reforestation', 'biodiversity', 'completed'],
  },
]

async function seed() {
  console.log('Connecting to MongoDB...')
  await connectMongo()
  const db = getDb()
  const now = new Date()

  console.log('Seeding India-based project evidence...')

  for (const item of INDIA_SAMPLE_DATA) {
    console.log(`Processing: [${item.project}] - ${item.location} (${item.stage})`)

    // Upsert project
    const projects = db.collection<ProjectDocument>('projects')
    const project = await projects.findOneAndUpdate(
      { name: item.project },
      {
        $setOnInsert: { name: item.project, description: item.projectDesc, createdAt: now },
        $set: { updatedAt: now },
      },
      { upsert: true, returnDocument: 'after' },
    )
    if (!project) continue

    // Upsert location
    const locations = db.collection<LocationDocument>('locations')
    const location = await locations.findOneAndUpdate(
      { projectId: project._id, name: item.location },
      { $setOnInsert: { projectId: project._id, name: item.location, createdAt: now } },
      { upsert: true, returnDocument: 'after' },
    )
    if (!location) continue

    // Fetch image from URL
    const response = await fetch(item.imageUrl)
    if (!response.ok) {
      console.warn(`Failed to fetch sample image from ${item.imageUrl}`)
      continue
    }
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Cloudinary
    const uploaded = await uploadBuffer(buffer, {
      folder: `visevi/india_seed/${project._id.toHexString()}`,
      resourceType: 'image',
    })

    // AI Observation fallback / simulation
    let observation: AssetDocument['observation'] = null
    try {
      observation = await analyzeAsset({ assetId: uploaded.assetId, url: uploaded.url })
    } catch (err) {
      // Create rich simulated observation if AI Vision subscription is absent on account
      observation = {
        activity: item.activity,
        objects: item.tags,
        tags: item.tags,
        caption: item.caption,
        confidence: 0.94,
        source: 'cld-ai-vision-simulated',
        analyzedAt: now,
      }
    }

    const assets = db.collection<AssetDocument>('assets')
    const assetDoc: Omit<AssetDocument, '_id'> = {
      cloudinaryPublicId: uploaded.publicId,
      cloudinaryAssetId: uploaded.assetId ?? null,
      cloudinaryUrl: uploaded.url,
      cloudinaryVersion: uploaded.version,
      resourceType: 'image',
      projectId: project._id,
      locationId: location._id,
      capturedAt: now,
      stage: item.stage,
      observation,
      verificationStatus: item.stage === 'FOLLOW_UP' ? 'VERIFIED' : 'UNVERIFIED',
      verificationNote: 'Seeded sample evidence for Indian development project.',
      perceptualHash: null,
      createdAt: now,
      updatedAt: now,
    }

    await assets.insertOne(assetDoc as AssetDocument)
    console.log(`Successfully created asset for ${item.project}`)
  }

  console.log('Seeding complete! Refresh your VisEvi dashboard to view the India project evidence.')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
