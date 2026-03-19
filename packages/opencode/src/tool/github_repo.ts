import z from "zod"
import { Tool } from "./tool"
import { Instance } from "../project/instance"
import path from "path"

const DESCRIPTION = `GitHub Repository Tool - Interact with GitHub repositories.`

export const GitHubRepoTool = Tool.define("github_repo", {
  description: DESCRIPTION,
  parameters: z.object({
    action: z.enum(["clone", "info", "ls", "read", "search"]).describe("Action to perform"),
    repo: z.string().describe("Repository in 'owner/repo' format"),
    path: z.string().describe("Path within the repository").optional(),
    branch: z.string().describe("Branch or tag name").optional(),
    token: z.string().describe("GitHub token for private repos").optional(),
    search_query: z.string().describe("Search query for 'search' action").optional(),
  }),
  async execute(params, ctx) {
    const token = params.token || process.env.GITHUB_TOKEN
    const headers: Record<string, string> = {
      "Accept": "application/vnd.github.v3+json",
    }
    if (token) {
      headers["Authorization"] = `token ${token}`
    }

    const baseUrl = "https://api.github.com"
    const ref = params.branch || "main"
    const metadata: Record<string, any> = { action: params.action, repo: params.repo }

    if (params.action === "clone") {
      await ctx.ask({ permission: "bash", patterns: ["git clone *"], always: ["git clone *"], metadata: {} })
      const cloneUrl = token ? `https://${token}@github.com/${params.repo}.git` : `https://github.com/${params.repo}.git`
      const targetDir = params.repo.split("/")[1]
      const targetPath = path.resolve(Instance.directory, targetDir)
      const result = Bun.spawn({ cmd: ["git", "clone", cloneUrl, targetPath, ...(params.branch ? ["--branch", params.branch] : [])], stdout: "pipe", stderr: "pipe" })
      const error = await new Response(result.stderr).text()
      if (result.exitCode !== 0) throw new Error(`Clone failed: ${error}`)
      metadata.target = targetPath
      return { title: "Repository Cloned", metadata, output: `Cloned ${params.repo} to ${targetPath}` }
    }

    if (params.action === "info") {
      const response = await fetch(`${baseUrl}/repos/${params.repo}`, { headers })
      if (!response.ok) throw new Error(`Failed to get repo info: ${response.statusText}`)
      const info = await response.json()
      metadata.stars = info.stargazers_count
      metadata.forks = info.forks_count
      metadata.language = info.language
      return {
        title: `Repo: ${params.repo}`,
        metadata,
        output: JSON.stringify({ name: info.full_name, description: info.description, stars: info.stargazers_count, forks: info.forks_count, language: info.language }, null, 2),
      }
    }

    if (params.action === "ls") {
      const apiPath = params.path || ""
      const response = await fetch(`${baseUrl}/repos/${params.repo}/contents/${apiPath}?ref=${ref}`, { headers })
      if (!response.ok) throw new Error(`Failed to list contents: ${response.statusText}`)
      const contents = await response.json()
      const items = (Array.isArray(contents) ? contents : [contents]).map((item: any) => `[${item.type}] ${item.name}`)
      return { title: `Contents: ${params.repo}/${apiPath}`, metadata, output: items.join("\n") }
    }

    if (params.action === "read") {
      const apiPath = params.path || "README.md"
      const response = await fetch(`${baseUrl}/repos/${params.repo}/contents/${apiPath}?ref=${ref}`, { headers })
      if (!response.ok) throw new Error(`Failed to read file: ${response.statusText}`)
      const file = await response.json()
      if (file.encoding === "base64") {
        const content = Buffer.from(file.content, "base64").toString("utf-8")
        metadata.file = apiPath
        return { title: file.name, metadata, output: content }
      }
      throw new Error("File is not text content")
    }

    if (params.action === "search") {
      if (!params.search_query) throw new Error("search_query is required for 'search' action")
      const url = `${baseUrl}/search/code?q=${encodeURIComponent(params.search_query)}+repo:${params.repo}`
      const response = await fetch(url, { headers })
      if (!response.ok) throw new Error(`Search failed: ${response.statusText}`)
      const results = await response.json()
      metadata.count = results.total_count
      return { title: `Search: ${params.search_query}`, metadata, output: results.items?.map((i: any) => i.path).join("\n") || "No results" }
    }

    throw new Error(`Unknown action: ${params.action}`)
  },
})
