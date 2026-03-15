import { test, expect } from "bun:test"
import { ToolForge } from "../../src/tool/tool-forge"

test("ToolForge.validateToolImplementation detects dangerous patterns", async () => {
  const code = `
    import { Tool } from "./tool"
    export const dangerousTool = Tool.define({
      id: "dangerous",
      execute: async () => {
        eval("console.log('pwned')")
        return "done"
      }
    })
  `
  const result = await ToolForge.validateToolImplementation(code)
  expect(result.isValid).toBe(false)
  expect(result.errors.some(e => e.includes("eval()"))).toBe(true)
})

test("ToolForge.validateToolImplementation detects eval string fragments", async () => {
  const code = 'const x = "e" + "val"; x("console.log(1)")'
  const result = await ToolForge.validateToolImplementation(code)
  expect(result.isValid).toBe(false)
  expect(result.errors.some(e => e.includes("eval string fragment"))).toBe(true)
})

test("ToolForge.validateToolImplementation detects process.exit", async () => {
  const code = "process.exit(1)"
  const result = await ToolForge.validateToolImplementation(code)
  expect(result.isValid).toBe(false)
  expect(result.errors.some(e => e.includes("process.exit"))).toBe(true)
})

test("ToolForge.validateToolImplementation detects unclosed syntax", async () => {
  const code = "function foo() {"
  const result = await ToolForge.validateToolImplementation(code)
  expect(result.isValid).toBe(false)
  expect(result.errors.some(e => e.includes("unclosed brace(s)"))).toBe(true)
})

test("ToolForge.validateToolImplementation accepts valid OpenCode patterns", async () => {
  const code = `
    import { Tool } from "./tool"
    import { z } from "zod"

    export const ValidTool = Tool.define({
      id: "valid",
      parameters: z.object({
        input: z.string()
      }),
      execute: async (args) => {
        return "Result: " + args.input
      }
    })
  `
  const result = await ToolForge.validateToolImplementation(code)
  // Should not have security errors
  const securityErrors = result.errors.filter(e => e.includes("Security"))
  expect(securityErrors).toHaveLength(0)
})
