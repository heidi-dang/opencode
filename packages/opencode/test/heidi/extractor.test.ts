import { describe, test, expect } from "bun:test"
import { HeidiExtractor } from "@/heidi/extractor"

describe("HeidiExtractor", () => {
  test("should extract function symbols", () => {
    const content = `
function foo() {}
async function bar() {}
export function baz() {}
`
    const syms = HeidiExtractor.extractSymbols(content)
    expect(syms.length).toBeGreaterThanOrEqual(3)
    expect(syms.some((s) => s.name === "foo" && s.type === "function")).toBe(true)
  })

  test("should extract imports", () => {
    const content = `
import { foo, bar } from "baz"
import "module"
`
    const imports = HeidiExtractor.extractImports(content)
    expect(imports.length).toBe(2)
    expect(imports[0].items).toContain("foo")
  })

  test("should extract Fastify routes", () => {
    const content = `
app.get('/api/users', handler)
fastify.post('/api/data', handler)
`
    const routes = HeidiExtractor.extractRoutes(content)
    expect(routes.length).toBe(2)
    expect(routes[0].method).toBe("GET")
    expect(routes[1].path).toBe("/api/data")
  })

  test("should extract Bun tests", () => {
    const content = `
test("should do something", () => {})
it("should work", () => {})
`
    const tests = HeidiExtractor.extractTests(content)
    expect(tests.length).toBe(2)
    expect(tests[0].name).toBe("should do something")
  })
})
