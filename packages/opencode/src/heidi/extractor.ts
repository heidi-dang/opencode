import { Filesystem } from "@/util/filesystem"
import path from "path"
import { Log } from "@/util/log"

const log = Log.create({ service: "heidi.extractor" })

export namespace HeidiExtractor {
  export interface Symbol {
    name: string
    type: "function" | "class" | "interface" | "variable" | "other"
    line: number
  }

  export interface Import {
    module: string
    items: string[]
    line: number
  }

  export interface Route {
    method: string
    path: string
    line: number
  }

  export interface Test {
    name: string
    line: number
  }

  // Extract symbols using regex (simplified AST)
  export function extractSymbols(content: string): Symbol[] {
    const syms: Symbol[] = []
    const lines = content.split("\n")

    const patterns = [
      { regex: /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/g, type: "function" as const },
      { regex: /(?:export\s+)?class\s+(\w+)/g, type: "class" as const },
      { regex: /(?:export\s+)?interface\s+(\w+)/g, type: "interface" as const },
      { regex: /(?:export\s+)?(?:const|let|var)\s+(\w+)/g, type: "variable" as const },
    ]

    for (const { regex, type } of patterns) {
      let match
      const text = content
      while ((match = regex.exec(text)) !== null) {
        const lineNum = text.substring(0, match.index).split("\n").length
        syms.push({ name: match[1], type, line: lineNum })
      }
    }

    return syms
  }

  // Extract imports
  export function extractImports(content: string): Import[] {
    const imports: Import[] = []

    const importRegex = /import\s+(?:{([^}]+)}\s+from\s+)?['"]([^'"]+)['"]/g

    let match
    while ((match = importRegex.exec(content)) !== null) {
      const items = match[1] ? match[1].split(",").map((s) => s.trim()).filter(Boolean) : []
      imports.push({
        module: match[2],
        items,
        line: content.substring(0, match.index).split("\n").length,
      })
    }

    return imports
  }

  // Extract Fastify routes
  export function extractRoutes(content: string): Route[] {
    const routes: Route[] = []
    const routeRegex = /(?:fastify|app|server)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g

    let match
    while ((match = routeRegex.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        line: content.substring(0, match.index).split("\n").length,
      })
    }

    return routes
  }

  // Extract Bun tests
  export function extractTests(content: string): Test[] {
    const tests: Test[] = []
    const testRegex = /(?:test|it)\s*\(\s*['"]([^'"]+)['"]/g

    let match
    while ((match = testRegex.exec(content)) !== null) {
      tests.push({
        name: match[1],
        line: content.substring(0, match.index).split("\n").length,
      })
    }

    return tests
  }

  // Extract all features from a file
  export async function extractFromFile(filePath: string): Promise<{
    symbols: Symbol[]
    imports: Import[]
    routes: Route[]
    tests: Test[]
  }> {
    try {
      const content = await Filesystem.readText(filePath)
      return {
        symbols: extractSymbols(content),
        imports: extractImports(content),
        routes: extractRoutes(content),
        tests: extractTests(content),
      }
    } catch (e) {
      log.error("Failed to extract from file", { file: filePath, error: e })
      return { symbols: [], imports: [], routes: [], tests: [] }
    }
  }
}
