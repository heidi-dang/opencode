import { Log } from "@/util/log"

const log = Log.create({ service: "heidi.rerank" })

export namespace HeidiRerank {
  interface SearchResult {
    path: string
    score?: number
    line?: number
    context?: string
  }

  // Simple TF-IDF based reranking
  export function rerankResults(
    query: string,
    results: SearchResult[],
    topK = 10,
  ): SearchResult[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2)

    if (queryTerms.length === 0 || results.length === 0) return results.slice(0, topK)

    const scored = results.map((r) => {
      const content = (r.context || r.path).toLowerCase()
      let score = r.score || 0

      // Boost score based on term frequency in context
      for (const term of queryTerms) {
        const count = (content.match(new RegExp(term, "g")) || []).length
        score += count * 10
      }

      // Boost exact path matches
      for (const term of queryTerms) {
        if (r.path.toLowerCase().includes(term)) {
          score += 50
        }
      }

      return { ...r, score }
    })

    return scored.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, topK)
  }

  // Rerank vector search results by combining with keyword scores
  export function rerankHybrid(
    keywordResults: SearchResult[],
    vectorResults: SearchResult[],
    topK = 10,
  ): SearchResult[] {
    const combined = new Map<string, SearchResult>()

    // Add keyword results with weight 1.0
    for (let i = 0; i < keywordResults.length; i++) {
      const r = keywordResults[i]
      const existing = combined.get(r.path)
      const score = (existing?.score || 0) + (r.score || 0) + (keywordResults.length - i)
      combined.set(r.path, { ...r, score })
    }

    // Add vector results with weight 0.8
    for (let i = 0; i < vectorResults.length; i++) {
      const r = vectorResults[i]
      const existing = combined.get(r.path)
      const score = (existing?.score || 0) + (r.score || 0) * 0.8 + (vectorResults.length - i) * 0.8
      combined.set(r.path, { ...r, score })
    }

    return Array.from(combined.values())
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, topK)
  }
}
