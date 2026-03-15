import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./browser.txt"
import { chromium, type Browser, type Page } from "playwright-core"
import { Instance } from "../project/instance"
import { Log } from "../util/log"
import { iife } from "@/util/iife"
import TurndownService from "turndown"

const log = Log.create({ service: "tool.browser" })

interface BrowserState {
  browser: Browser | null
  page: Page | null
}

const state = Instance.state<BrowserState>(
  () => ({
    browser: null,
    page: null,
  }),
  async (s) => {
    if (s.browser) {
      await s.browser.close()
    }
  },
)

export const BrowserTool = Tool.define("browser", {
  description: DESCRIPTION,
  parameters: z.object({
    action: z.enum(["navigate", "screenshot", "click", "type", "scroll", "read", "close"]),
    url: z.string().optional().describe("URL for navigate action"),
    selector: z.string().optional().describe("CSS selector for click/type/read actions"),
    text: z.string().optional().describe("Text to type or scroll amount"),
    format: z.enum(["markdown", "html"]).default("markdown").describe("Format for read action"),
  }),
  async execute(params, ctx) {
    const s = state()

    const ensureBrowser = async () => {
      if (s.browser && s.browser.isConnected()) return s.browser
      log.info("launching browser")
      s.browser = await chromium.launch({ 
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"] 
      })
      s.page = await s.browser.newPage()
      return s.browser
    }

    const ensurePage = async () => {
      await ensureBrowser()
      if (!s.page || s.page.isClosed()) {
        s.page = await s.browser!.newPage()
      }
      return s.page
    }

    try {
      switch (params.action) {
        case "navigate": {
          if (!params.url) throw new Error("URL is required for navigate action")
          const page = await ensurePage()
          await page.goto(params.url, { waitUntil: "load" })
          return {
            title: `Navigated to ${params.url}`,
            output: `Successfully navigated to ${params.url}`,
            metadata: { url: params.url } as any,
          }
        }

        case "screenshot": {
          const page = await ensurePage()
          const buffer = await page.screenshot({ fullPage: false })
          const base64 = buffer.toString("base64")
          return {
            title: "Browser Screenshot",
            output: "Screenshot captured successfully",
            metadata: {} as any,
            attachments: [
              {
                type: "file",
                mime: "image/png",
                url: `data:image/png;base64,${base64}`,
              },
            ],
          }
        }

        case "click": {
          if (!params.selector) throw new Error("Selector is required for click action")
          const page = await ensurePage()
          await page.click(params.selector)
          return {
            title: `Clicked ${params.selector}`,
            output: `Successfully clicked element: ${params.selector}`,
            metadata: { selector: params.selector } as any,
          }
        }

        case "type": {
          if (!params.selector || params.text === undefined)
            throw new Error("Selector and text are required for type action")
          const page = await ensurePage()
          await page.fill(params.selector, params.text)
          return {
            title: `Typed into ${params.selector}`,
            output: `Successfully typed into element: ${params.selector}`,
            metadata: { selector: params.selector, text: params.text } as any,
          }
        }

        case "scroll": {
          const page = await ensurePage()
          const amount = parseInt(params.text || "500")
          await page.evaluate((y) => window.scrollBy(0, y), amount)
          return {
            title: "Scrolled page",
            output: `Scrolled page by ${amount} pixels`,
            metadata: { amount } as any,
          }
        }

        case "read": {
          const page = await ensurePage()
          const content = await page.content()
          if (params.format === "html") {
            return {
              title: "Read Page HTML",
              output: content,
              metadata: {} as any,
            }
          }
          const turndown = new TurndownService()
          const markdown = turndown.turndown(content)
          return {
            title: "Read Page Markdown",
            output: markdown,
            metadata: {} as any,
          }
        }

        case "close": {
          if (s.browser) {
            await s.browser.close()
            s.browser = null
            s.page = null
          }
          return {
            title: "Closed Browser",
            output: "Browser instance closed successfully",
            metadata: {} as any,
          }
        }

        default:
          throw new Error(`Unsupported action: ${params.action}`)
      }
    } catch (error: any) {
      log.error("browser action failed", { action: params.action, error: error.message })
      throw new Error(`Browser action '${params.action}' failed: ${error.message}`)
    }
  },
})
