/**
 * Concept lexicon shared by verification (consistency check), impact
 * indicator mapping, the change narrative and semantic search.
 *
 * Deterministic on purpose: this runs inside the deployed server with no
 * external LLM dependency, so the same input always yields the same output
 * and every decision is explainable ("matched concept X via term Y").
 * If an LLM is added later it should sit *behind* this interface
 * (`conceptsOf`), not replace the auditability.
 */

export interface Concept {
  id: string
  label: string
  /** Lowercase words/phrases. Matched after light stemming. */
  terms: string[]
}

export const CONCEPTS: Concept[] = [
  { id: 'solar-energy', label: 'Solar energy', terms: ['solar', 'photovoltaic', 'pv', 'panel', 'panels', 'rooftop', 'inverter', 'renewable', 'microgrid'] },
  { id: 'electricity', label: 'Electricity access', terms: ['electricity', 'electric', 'power', 'streetlight', 'lamp', 'streetlight', 'wiring', 'transformer', 'electrification', 'electrician'] },
  { id: 'wind-energy', label: 'Wind energy', terms: ['turbine', 'windmill', 'windfarm'] },
  { id: 'clean-cooking', label: 'Clean cooking', terms: ['stove', 'cookstove', 'biogas', 'cooking', 'kitchen', 'firewood'] },
  { id: 'water-supply', label: 'Water present', terms: ['water', 'borehole', 'pump', 'tap', 'pipeline', 'pipe', 'reservoir', 'tank', 'drinking', 'handpump', 'irrigation', 'canal'] },
  { id: 'drinking-water', label: 'Drinking water access', terms: ['drinking', 'potable', 'tap', 'taps', 'standpipe', 'borehole', 'handpump', 'pipeline'] },
  { id: 'sanitation', label: 'Sanitation', terms: ['toilet', 'latrine', 'sanitation', 'sewage', 'sewer', 'hygiene', 'handwashing', 'drainage'] },
  { id: 'agriculture', label: 'Agriculture', terms: ['farm', 'farmer', 'farming', 'crop', 'crops', 'harvest', 'seedling', 'soil', 'agriculture', 'agricultural', 'plough', 'plow', 'tractor', 'paddy', 'wheat', 'rice', 'orchard', 'greenhouse', 'livestock', 'cattle', 'goat'] },
  { id: 'reforestation', label: 'Tree planting & forests', terms: ['tree', 'trees', 'sapling', 'saplings', 'planting', 'plantation', 'reforestation', 'afforestation', 'nursery', 'seedling'] },
  { id: 'mangrove-coastal', label: 'Mangrove & coastal restoration', terms: ['mangrove', 'mangroves', 'coast', 'coastal', 'shore', 'shoreline', 'estuary', 'tidal', 'mudflat', 'wetland'] },
  { id: 'waste', label: 'Waste management', terms: ['waste', 'garbage', 'trash', 'litter', 'dump', 'landfill', 'rubbish', 'cleanup'] },
  { id: 'recycling', label: 'Recycling', terms: ['recycling', 'recycle', 'compost', 'composting', 'reuse', 'sorting'] },
  { id: 'education', label: 'Education', terms: ['school', 'classroom', 'student', 'students', 'teacher', 'learning', 'education', 'classroom', 'blackboard', 'desk', 'library', 'training', 'workshop'] },
  { id: 'health', label: 'Health services', terms: ['clinic', 'hospital', 'health', 'doctor', 'nurse', 'medical', 'vaccination', 'patient', 'medicine', 'checkup'] },
  { id: 'construction', label: 'Construction & infrastructure', terms: ['construction', 'building', 'build', 'scaffolding', 'cement', 'concrete', 'brick', 'bricks', 'worker', 'workers', 'excavator', 'foundation', 'roof', 'mason', 'infrastructure', 'installation', 'installing'] },
  { id: 'roads', label: 'Roads & transport', terms: ['road', 'roads', 'bridge', 'pavement', 'transport'] },
  { id: 'community', label: 'Community', terms: ['village', 'community', 'villager', 'villagers', 'household', 'residents', 'gathering'] },
  { id: 'livelihood', label: 'Livelihoods & women’s empowerment', terms: ['women', 'livelihood', 'weaving', 'handicraft', 'tailoring', 'market', 'vendor', 'cooperative', 'microfinance', 'artisan', 'stitching'] },
  { id: 'biodiversity', label: 'Biodiversity', terms: ['wildlife', 'bird', 'birds', 'animal', 'habitat', 'biodiversity', 'fish', 'fishing', 'reef', 'turtle'] },
  { id: 'forest-cover', label: 'Forest cover & land use', terms: ['forest', 'forests', 'deforestation', 'deforested', 'rainforest', 'canopy', 'logging', 'amazon', 'jungle', 'woodland', 'vegetation', 'fishbone'] },
  { id: 'glacier-ice', label: 'Glaciers & ice', terms: ['glacier', 'glaciers', 'glacial', 'ice', 'icefield', 'iceberg', 'snowfield', 'snow', 'moraine', 'meltwater', 'icecap'] },
  { id: 'water-body', label: 'Water bodies (lakes, rivers, seas)', terms: ['lake', 'lakes', 'sea', 'shoreline', 'basin', 'desiccation', 'seabed', 'reservoir', 'waterbody', 'river', 'rivers', 'wetland', 'drought'] },
  { id: 'heat-drought', label: 'Heat & drought signs', terms: ['drought', 'dry', 'dried', 'parched', 'cracked', 'arid', 'barren', 'scorched', 'wilted', 'desert', 'dust', 'dusty', 'heatwave', 'bare'] },
  { id: 'coastal-surge', label: 'Waves & storm surge', terms: ['wave', 'waves', 'surf', 'swell', 'surge', 'tide', 'tidal', 'breaker', 'breakers', 'seawall', 'inundation', 'flooded', 'storm'] },
  { id: 'wildfire', label: 'Fire & smoke', terms: ['fire', 'wildfire', 'smoke', 'burnt', 'burned', 'ash', 'blaze', 'flame', 'flames'] },
  { id: 'flood-climate', label: 'Climate resilience', terms: ['flood', 'floods', 'embankment', 'resilience', 'climate', 'drought', 'erosion', 'seawall', 'storm'] },
]

const STOP = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'with', 'for', 'is', 'are', 'was', 'were', 'being',
  'this', 'that', 'it', 'its', 'by', 'from', 'as', 'be', 'shown', 'image', 'photo', 'picture', 'appears', 'there',
  'their', 'some', 'several', 'large', 'small', 'view', 'showing', 'visible', 'up', 'over', 'into', 'near', 'while',
])

/** Very light stemmer — enough to fold plurals/gerunds together. */
export function stem(word: string): string {
  let w = word.toLowerCase()
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y'
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  return w
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem)
}

// stem(term) -> concept ids, built once. Hyphenated terms are indexed both
// whole and by their parts so "solar-panels" and "solar panels" both hit.
const termIndex = new Map<string, Set<string>>()
function indexTerm(term: string, conceptId: string) {
  const s = stem(term)
  if (!termIndex.has(s)) termIndex.set(s, new Set())
  termIndex.get(s)!.add(conceptId)
}
for (const c of CONCEPTS) {
  for (const t of c.terms) {
    indexTerm(t, c.id)
    if (t.includes('-')) t.split('-').forEach((part) => indexTerm(part, c.id))
  }
}

export interface ConceptMatch {
  conceptId: string
  /** The text tokens that triggered this concept — for explainability. */
  via: string[]
}

/** Which concepts a piece of text expresses, and which words triggered them. */
export function conceptsOf(text: string): ConceptMatch[] {
  const hits = new Map<string, Set<string>>()
  // Hyphenated tags ("solar-panels") are tokenised on the hyphen too.
  for (const token of tokenize(text)) {
    for (const id of termIndex.get(token) ?? []) {
      if (!hits.has(id)) hits.set(id, new Set())
      hits.get(id)!.add(token)
    }
  }
  return [...hits].map(([conceptId, via]) => ({ conceptId, via: [...via] }))
}

/**
 * Concepts that describe *where/who*, not *what is happening*. A project called
 * "Solar Village" names a place (community) and an activity (solar); a photo that
 * merely mentions people or a village must not count as matching the activity.
 * These never satisfy a content check on their own.
 */
export const WEAK_CONCEPTS = new Set(['community'])

export function conceptLabel(id: string): string {
  return CONCEPTS.find((c) => c.id === id)?.label ?? id
}

/** Flattens an observation into one searchable string. */
export function observationText(obs: {
  activity: string | null
  objects: string[]
  tags: string[]
  caption: string | null
} | null | undefined): string {
  if (!obs) return ''
  return [obs.activity, obs.caption, ...obs.objects, ...obs.tags].filter(Boolean).join(' ')
}
