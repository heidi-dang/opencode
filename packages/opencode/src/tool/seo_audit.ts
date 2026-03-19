import z from "zod"
import { Tool } from "./tool"
import { Filesystem } from "@/util/filesystem"
import { Instance } from "@/project/instance"
import path from "path"
import { Glob } from "@/util/glob"

const DESCRIPTION = `Scans the project for technical SEO issues such as broken links, missing meta tags, and schema markup errors. Returns a structured audit report.`

export const SeoAuditTool = Tool.define("seo_audit", {
  description: DESCRIPTION,
  parameters: z.object({
    directory: z.string().describe("The directory to scan for HTML/markdown files (defaults to project root)").optional(),
    checks: z.array(z.enum(["links", "meta", "schema", "indexing"])).default(["links", "meta", "schema"]),
  }),
  async execute(params, ctx) {
    const root = params.directory ?? Instance.directory
    const files = await Glob.scan("**/*.{html,htm,md,mdx}", { cwd: root, absolute: true })
    
    const results = {
      files_scanned: files.length,
      issues: [] as { file: string; type: string; message: string; severity: "error" | "warning" }[],
      summary: {
        errors: 0,
        warnings: 0,
      }
    }

    for (const file of files) {
      const content = await Filesystem.readText(file)
      const relPath = path.relative(Instance.worktree, file)

      if (params.checks.includes("meta")) {
        if (!content.includes("<title>")) {
          results.issues.push({ file: relPath, type: "meta", message: "Missing <title> tag", severity: "error" })
          results.summary.errors++
        }
        if (!content.includes('name="description"')) {
          results.issues.push({ file: relPath, type: "meta", message: "Missing meta description", severity: "warning" })
          results.summary.warnings++
        }
      }

      if (params.checks.includes("schema") && !content.includes('type="application/ld+json"')) {
        results.issues.push({ file: relPath, type: "schema", message: "Missing JSON-LD schema markup", severity: "warning" })
        results.summary.warnings++
      }

      if (params.checks.includes("links")) {
        // Simple regex for internal broken links (stubs for more complex logic)
        const brokenLinks = content.match(/href=["'](?!http|https|#)[^"']+["']/g) || []
        for (const link of brokenLinks) {
          const target = link.slice(6, -1)
          const targetPath = path.join(path.dirname(file), target)
          const exists = await Filesystem.exists(targetPath).catch(() => false)
          if (!exists) {
            results.issues.push({ file: relPath, type: "link", message: `Broken internal link: ${target}`, severity: "error" })
            results.summary.errors++
          }
        }
      }
    }

    return {
      title: "SEO Audit Report",
      metadata: results,
      output: [
        `SEO Audit complete for ${results.files_scanned} files.`,
        `Errors: ${results.summary.errors}`,
        `Warnings: ${results.summary.warnings}`,
        "",
        ...results.issues.map(i => `[${i.severity.toUpperCase()}] ${i.file}: (${i.type}) ${i.message}`)
      ].join("\n")
    }
  }
})
