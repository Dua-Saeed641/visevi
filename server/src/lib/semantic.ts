import { CONCEPTS, conceptsOf, stem, tokenize } from './lexicon.js'

export interface SearchDoc {
  id: string
  text: string
}

export interface SearchHit {
  id: string
  score: number
  /** Concept labels the query was expanded through, for "why this result". */
  expandedVia: string[]
}

/**
 * Concept-aware ranked search: TF-IDF over each asset's observation text,
 * with the query expanded through the shared concept lexicon so a natural-
 * language query like "people working on rooftop power" also finds an asset
 * described as "workers installing solar panels" even though they share no
 * literal word. Not an embedding model — it recognises the concepts in the
 * lexicon, and says which ones it used (`expandedVia`).
 */
export function semanticSearch(docs: SearchDoc[], query: string): SearchHit[] {
  const qTokens = tokenize(query)
  if (qTokens.length === 0) return []

  const weights = new Map<string, number>()
  for (const t of qTokens) weights.set(t, Math.max(weights.get(t) ?? 0, 1))

  const queryConcepts = conceptsOf(query)
  for (const qc of queryConcepts) {
    const concept = CONCEPTS.find((c) => c.id === qc.conceptId)!
    for (const term of concept.terms) {
      for (const part of term.split('-')) {
        const s = stem(part)
        if (!weights.has(s)) weights.set(s, 0.4)
      }
    }
  }
  const expandedVia = queryConcepts.map((q) => CONCEPTS.find((c) => c.id === q.conceptId)!.label)

  const tokenised = docs.map((d) => ({ id: d.id, tokens: tokenize(d.text) }))
  const df = new Map<string, number>()
  for (const d of tokenised) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1)
  const N = docs.length

  const hits: SearchHit[] = []
  for (const d of tokenised) {
    if (d.tokens.length === 0) continue
    const tf = new Map<string, number>()
    for (const t of d.tokens) tf.set(t, (tf.get(t) ?? 0) + 1)

    let score = 0
    for (const [term, w] of weights) {
      let count = tf.get(term) ?? 0
      let weight = w
      if (count === 0 && term.length >= 3) {
        // Prefix match so partially typed words still hit (e.g. "solar" ~ "solarpanel").
        for (const [dt, n] of tf) if (dt.startsWith(term)) { count += n; weight = w * 0.6 }
      }
      if (count === 0) continue
      const idf = Math.log(1 + N / (1 + (df.get(term) ?? 0)))
      score += weight * idf * (1 + Math.log(count))
    }
    if (score > 0) {
      hits.push({ id: d.id, score: Math.round((score / Math.sqrt(d.tokens.length)) * 1000) / 1000, expandedVia })
    }
  }
  return hits.sort((a, b) => b.score - a.score)
}
