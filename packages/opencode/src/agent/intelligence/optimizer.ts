export class TokenOptimizer {
  static optimize(content: string, targetLength: number = 2000): string {
    if (content.length <= targetLength) return content

    // 1. Remove comments (basic implementation)
    let optimized = content
      .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, "$1")
      .replace(/^\s*[\r\n]/gm, "") // Remove empty lines

    if (optimized.length <= targetLength) return optimized

    // 2. If still too long, preserve only important structures (signatures)
    // This is a heuristic: keep exports, classes, and function signatures
    const lines = optimized.split("\n")
    const preservedLines: string[] = []
    let currentLength = 0

    for (const line of lines) {
      const isSignature = /^(export|class|function|interface|type|enum|namespace|import)/.test(line.trim())
      if (isSignature || currentLength < targetLength / 2) {
        preservedLines.push(line)
        currentLength += line.length + 1
      }
      if (currentLength > targetLength) break
    }

    if (preservedLines.length < lines.length) {
      preservedLines.push("\n// ... (content pruned for token efficiency) ...")
    }

    return preservedLines.join("\n")
  }
}
