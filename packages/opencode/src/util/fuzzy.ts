function levenshtein(a: string, b: string): number {
  if (a === "" || b === "") return Math.max(a.length, b.length)
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost)
    }
  }
  return matrix[a.length][b.length]
}

export function normalizeLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n")
}

export function detectLineEnding(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") ? "\r\n" : "\n"
}

export function convertToLineEnding(text: string, ending: "\n" | "\r\n"): string {
  if (ending === "\n") return text
  return text.replaceAll("\n", "\r\n")
}


export type Replacer = (content: string, find: string) => Generator<string, void, unknown>

const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.0
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.3

export const SimpleReplacer: Replacer = function* (_content, find) {
  yield find
}

export const LineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n")
  const searchLines = find.split("\n")
  if (searchLines[searchLines.length - 1] === "") searchLines.pop()
  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trim() !== searchLines[j].trim()) {
        matches = false
        break
      }
    }
    if (matches) {
      let matchStartIndex = 0
      for (let k = 0; k < i; k++) matchStartIndex += originalLines[k].length + 1
      let matchEndIndex = matchStartIndex
      for (let k = 0; k < searchLines.length; k++) {
        matchEndIndex += originalLines[i + k].length
        if (k < searchLines.length - 1) matchEndIndex += 1
      }
      yield content.substring(matchStartIndex, matchEndIndex)
    }
  }
}

export const BlockAnchorReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n")
  const searchLines = find.split("\n")
  if (searchLines.length < 3) return
  if (searchLines[searchLines.length - 1] === "") searchLines.pop()
  const firstLineSearch = searchLines[0].trim()
  const lastLineSearch = searchLines[searchLines.length - 1].trim()
  const searchBlockSize = searchLines.length
  const candidates: Array<{ startLine: number; endLine: number }> = []
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() !== firstLineSearch) continue
    for (let j = i + 2; j < originalLines.length; j++) {
      if (originalLines[j].trim() === lastLineSearch) {
        candidates.push({ startLine: i, endLine: j })
        break
      }
    }
  }
  if (candidates.length === 0) return
  if (candidates.length === 1) {
    const { startLine, endLine } = candidates[0]
    const actualBlockSize = endLine - startLine + 1
    let similarity = 0
    let linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2)
    if (linesToCheck > 0) {
      for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
        const originalLine = originalLines[startLine + j].trim()
        const searchLine = searchLines[j].trim()
        const maxLen = Math.max(originalLine.length, searchLine.length)
        if (maxLen === 0) continue
        const distance = levenshtein(originalLine, searchLine)
        similarity += (1 - distance / maxLen) / linesToCheck
        if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) break
      }
    } else similarity = 1.0
    if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
      let matchStartIndex = 0
      for (let k = 0; k < startLine; k++) matchStartIndex += originalLines[k].length + 1
      let matchEndIndex = matchStartIndex
      for (let k = startLine; k <= endLine; k++) {
        matchEndIndex += originalLines[k].length
        if (k < endLine) matchEndIndex += 1
      }
      yield content.substring(matchStartIndex, matchEndIndex)
    }
    return
  }
  let bestMatch: { startLine: number; endLine: number } | null = null
  let maxSimilarity = -1
  for (const candidate of candidates) {
    const { startLine, endLine } = candidate
    const actualBlockSize = endLine - startLine + 1
    let similarity = 0
    let linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2)
    if (linesToCheck > 0) {
      for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
        const originalLine = originalLines[startLine + j].trim()
        const searchLine = searchLines[j].trim()
        const maxLen = Math.max(originalLine.length, searchLine.length)
        if (maxLen === 0) continue
        const distance = levenshtein(originalLine, searchLine)
        similarity += 1 - distance / maxLen
      }
      similarity /= linesToCheck
    } else similarity = 1.0
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity
      bestMatch = candidate
    }
  }
  if (maxSimilarity >= MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD && bestMatch) {
    const { startLine, endLine } = bestMatch
    let matchStartIndex = 0
    for (let k = 0; k < startLine; k++) matchStartIndex += originalLines[k].length + 1
    let matchEndIndex = matchStartIndex
    for (let k = startLine; k <= endLine; k++) {
      matchEndIndex += originalLines[k].length
      if (k < endLine) matchEndIndex += 1
    }
    yield content.substring(matchStartIndex, matchEndIndex)
  }
}

export const WhitespaceNormalizedReplacer: Replacer = function* (content, find) {
  const normalizeWhitespace = (text: string) => text.replace(/\s+/g, " ").trim()
  const normalizedFind = normalizeWhitespace(find)
  const lines = content.split("\n")
  for (let i = 0; i < lines.length; i++) {
    if (normalizeWhitespace(lines[i]) === normalizedFind) yield lines[i]
    else if (normalizeWhitespace(lines[i]).includes(normalizedFind)) {
      const words = find.trim().split(/\s+/)
      if (words.length > 0) {
        const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")
        try {
          const regex = new RegExp(pattern)
          const match = lines[i].match(regex)
          if (match) yield match[0]
        } catch {}
      }
    }
  }
  const findLines = find.split("\n")
  if (findLines.length > 1) {
    for (let i = 0; i <= lines.length - findLines.length; i++) {
      const block = lines.slice(i, i + findLines.length).join("\n")
      if (normalizeWhitespace(block) === normalizedFind) yield block
    }
  }
}

export const IndentationFlexibleReplacer: Replacer = function* (content, find) {
  const removeIndentation = (text: string) => {
    const lines = text.split("\n")
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
    if (nonEmptyLines.length === 0) return text
    const minIndent = Math.min(...nonEmptyLines.map((line) => line.match(/^(\s*)/)?.[1]?.length ?? 0))
    return lines.map((line) => (line.trim().length === 0 ? line : line.slice(minIndent))).join("\n")
  }
  const normalizedFind = removeIndentation(find)
  const contentLines = content.split("\n")
  const findLines = find.split("\n")
  for (let i = 0; i <= contentLines.length - findLines.length; i++) {
    const block = contentLines.slice(i, i + findLines.length).join("\n")
    if (removeIndentation(block) === normalizedFind) yield block
  }
}

export const EscapeNormalizedReplacer: Replacer = function* (content, find) {
  const unescapeString = (str: string): string => {
    return str.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (_, c) =>
      c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c
    )
  }
  const unescapedFind = unescapeString(find)
  if (content.includes(unescapedFind)) yield unescapedFind
  const lines = content.split("\n")
  const findLines = unescapedFind.split("\n")
  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n")
    if (unescapeString(block) === unescapedFind) yield block
  }
}

export const MultiOccurrenceReplacer: Replacer = function* (content, find) {
  let startIndex = 0
  while (true) {
    const index = content.indexOf(find, startIndex)
    if (index === -1) break
    yield find
    startIndex = index + find.length
  }
}

export const TrimmedBoundaryReplacer: Replacer = function* (content, find) {
  const trimmedFind = find.trim()
  if (trimmedFind === find) return
  if (content.includes(trimmedFind)) yield trimmedFind
  const lines = content.split("\n")
  const findLines = find.split("\n")
  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n")
    if (block.trim() === trimmedFind) yield block
  }
}

export const ContextAwareReplacer: Replacer = function* (content, find) {
  const findLines = find.split("\n")
  if (findLines.length < 3) return
  if (findLines[findLines.length - 1] === "") findLines.pop()
  const contentLines = content.split("\n")
  const firstLine = findLines[0].trim()
  const lastLine = findLines[findLines.length - 1].trim()
  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() !== firstLine) continue
    for (let j = i + 2; j < contentLines.length; j++) {
      if (contentLines[j].trim() === lastLine) {
        const blockLines = contentLines.slice(i, j + 1)
        if (blockLines.length === findLines.length) {
          let matchingLines = 0
          let totalNonEmptyLines = 0
          for (let k = 1; k < blockLines.length - 1; k++) {
            const blockLine = blockLines[k].trim()
            const findLine = findLines[k].trim()
            if (blockLine.length > 0 || findLine.length > 0) {
              totalNonEmptyLines++
              if (blockLine === findLine) matchingLines++
            }
          }
          if (totalNonEmptyLines === 0 || matchingLines / totalNonEmptyLines >= 0.5) {
            yield blockLines.join("\n")
            break
          }
        }
        break
      }
    }
  }
}

export function replace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
  before = "",
  after = "",
): string {
  const find = before + oldString + after
  if (find === newString) throw new Error("No changes to apply: oldString and newString are identical.")
  let notFound = true

  const replacers = [
    SimpleReplacer,
    LineTrimmedReplacer,
    BlockAnchorReplacer,
    WhitespaceNormalizedReplacer,
    IndentationFlexibleReplacer,
    EscapeNormalizedReplacer,
    TrimmedBoundaryReplacer,
    ContextAwareReplacer,
    MultiOccurrenceReplacer,
  ]

  for (const replacer of replacers) {
    for (const search of replacer(content, find)) {
      const index = content.indexOf(search)
      if (index === -1) continue
      notFound = false
      if (replaceAll) return content.replaceAll(search, newString)
      const lastIndex = content.lastIndexOf(search)
      if (index !== lastIndex) continue
      const prefix = content.substring(0, index + before.length)
      const suffix = content.substring(index + before.length + oldString.length)
      return prefix + newString + suffix
    }
  }

  if (notFound) {
    throw new Error(
      "Could not find oldString in the file. It must match exactly, including whitespace, indentation, and line endings.",
    )
  }
  throw new Error("Found multiple matches for oldString. Provide more surrounding context to make the match unique.")
}

export function fuzzyReplace(content: string, search: string, next: string, anchor?: string): string {
  if (anchor) {
    const idx = content.indexOf(anchor)
    if (idx < 0) throw new Error("Anchor not found")
    const start = Math.max(0, idx - 1000)
    const end = Math.min(content.length, idx + anchor.length + 1000)
    const region = content.slice(start, end)
    const updated = replace(region, search, next)
    return content.slice(0, start) + updated + content.slice(end)
  }
  return replace(content, search, next)
}
