import { describe, expect, test } from "bun:test"
import { HeidiRerank } from "@/heidi/rerank"

describe("HeidiRerank", () => {
  test("should rerank results based on query relevance", () => {
    const query = "vector search implementation"
    const results = [
      { path: "/src/heidi/indexer.ts", context: "basic file indexing" },
      { path: "/src/heidi/vector.ts", context: "vector search with sqlite-vec implementation" },
      { path: "/src/heidi/state.ts", context: "FSM state management" },
      { path: "/src/heidi/rerank.ts", context: "reranking for search results" },
    ]

    const reranked = HeidiRerank.rerankResults(query, results, 3)

    expect(reranked.length).toBe(3)
    expect(reranked[0].path).toBe("/src/heidi/vector.ts") // Best match for "vector search"
  })

  test("should combine keyword and vector results", () => {
    const keywordResults = [
      { path: "/src/index.ts", score: 5 },
      { path: "/src/search.ts", score: 3 },
    ]

    const vectorResults = [
      { path: "/src/vector.ts", score: 0.9 },
      { path: "/src/index.ts", score: 0.7 },
    ]

    const combined = HeidiRerank.rerankHybrid(keywordResults, vectorResults, 3)

    expect(combined.length).toBeLessThanOrEqual(3)
    expect(combined[0].path).toBe("/src/index.ts") // Appears in both
  })
})
