import z from "zod"
import { Tool } from "./tool"

const DESCRIPTION = `Submits URLs to search engines via the IndexNow protocol. Supported by Bing, Yandex, and Seznam.`

export const IndexNowTool = Tool.define("indexnow", {
  description: DESCRIPTION,
  parameters: z.object({
    host: z.string().describe("The host name of the site (e.g. example.com)"),
    key: z.string().describe("The IndexNow API key"),
    urls: z.array(z.string().url()).describe("The list of URLs that have changed"),
  }),
  async execute(params, ctx) {
    // Mocking the IndexNow POST request
    const payload = {
      host: params.host,
      key: params.key,
      keyLocation: `https://${params.host}/${params.key}.txt`,
      urlList: params.urls,
    }

    await ctx.ask({
      permission: "webfetch", 
      patterns: ["https://api.indexnow.org/*"],
      always: ["*"],
      metadata: payload
    })

    return {
      title: "IndexNow Submission",
      metadata: { payload },
      output: `Successfully notified IndexNow of ${params.urls.length} updated URLs for ${params.host}.`
    }
  }
})
