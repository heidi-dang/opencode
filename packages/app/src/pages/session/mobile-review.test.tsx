import { describe, expect, test } from "bun:test"
import type { FileDiff } from "@opencode-ai/sdk/v2"
import { mobileReviewItems, mobileReviewMode, mobileReviewOpen } from "./mobile-review"

const labels = {
  open: "Open file",
  added: "Added",
  removed: "Removed",
  modified: "Modified",
  loading: "Loading changes...",
}

const diff = (file: string, extra?: Partial<FileDiff>): FileDiff => ({
  file,
  before: "before",
  after: "after",
  additions: 3,
  deletions: 1,
  status: "modified",
  ...extra,
})

describe("MobileReview", () => {
  test("builds mobile review card metadata and opens selected files", () => {
    const items = mobileReviewItems(
      [diff("src/pages/session.tsx"), diff("README.md", { additions: 1, deletions: 0, status: "added" })],
      labels,
    )

    expect(items).toEqual([
      {
        file: "src/pages/session.tsx",
        name: "session.tsx",
        dir: "src/pages",
        status: "Modified",
        additions: 3,
        deletions: 1,
      },
      {
        file: "README.md",
        name: "README.md",
        dir: undefined,
        status: "Added",
        additions: 1,
        deletions: 0,
      },
    ])

    const calls: string[] = []
    mobileReviewOpen((file: string) => calls.push(file), "src/pages/session.tsx")()
    expect(calls).toEqual(["src/pages/session.tsx"])
  })

  test("returns loading and empty mobile states", () => {
    expect(mobileReviewMode(true, [])).toBe("loading")
    expect(mobileReviewMode(false, [])).toBe("empty")
    expect(mobileReviewMode(false, [diff("src/pages/session.tsx")])).toBe("ready")
  })
})
