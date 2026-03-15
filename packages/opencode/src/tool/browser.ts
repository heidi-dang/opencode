import z from "zod"
import { Tool } from "./tool"
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core"
import { Instance } from "../project/instance"
import { Log } from "../util/log"
import { abortAfterAny } from "../util/abort"
import type { MessageV2 } from "../session/message-v2"
import TurndownService from "turndown"
import fs from "fs/promises"
import path from "path"

import DESC_NAVIGATE from "./browser-navigate.txt"
import DESC_SCREENSHOT from "./browser-screenshot.txt"
import DESC_CLICK from "./browser-click.txt"
import DESC_TYPE from "./browser-type.txt"
import DESC_SCROLL from "./browser-scroll.txt"
import DESC_RESIZE from "./browser-resize.txt"
import DESC_READ from "./browser-read.txt"

const log = Log.create({ service: "tool.browser" })

const DEFAULT_TIMEOUT = 30 * 1000

interface BrowserState {
  browser: Browser | null
  context: BrowserContext | null
  pages: Page[]
}

const state = Instance.state<BrowserState>(
  () => ({
    browser: null,
    context: null,
    pages: [],
  }),
  async (s) => {
    if (s.context) await s.context.close().catch(() => {})
    if (s.browser) await s.browser.close().catch(() => {})
  },
)

async function ensureBrowser() {
  const s = state()
  if (s.browser && s.browser.isConnected()) return s.browser
  log.info("launching browser")
  s.browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })
  s.context = await s.browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: {
      dir: path.join(Instance.directory, ".opencode", "recordings"),
    },
  })
  s.context.on("page", (newPage) => {
    s.pages.push(newPage)
    newPage.on("close", () => {
      s.pages = s.pages.filter((p) => p !== newPage)
    })
  })
  const initialPage = await s.context.newPage()
  return s.browser
}

async function ensurePage() {
  const s = state()
  await ensureBrowser()
  if (s.pages.length === 0) {
    if (!s.context) s.context = await s.browser!.newContext()
    await s.context.newPage()
  }
  return s.pages[s.pages.length - 1]
}

async function takeErrorScreenshot(
  page: Page,
  actionName: string,
): Promise<Omit<MessageV2.FilePart, "id" | "sessionID" | "messageID"> | undefined> {
  try {
    const buffer = await page.screenshot({ fullPage: false, type: "jpeg", quality: 50 })
    return {
      type: "file",
      mime: "image/jpeg",
      url: `data:image/jpeg;base64,${buffer.toString("base64")}`,
    }
  } catch {
    return undefined
  }
}

// -- Typed Metadata Interfaces --

interface NavigateMeta { url: string; timeout?: number }
interface ScreenshotMeta { fullPage?: boolean }
interface ClickMeta { selector: string; force?: boolean }
interface TypeMeta { selector: string; text: string }
interface ScrollMeta { amount?: number; direction?: string }
interface ResizeMeta { width: number; height: number }
interface ReadMeta { format: string }
interface WaitMeta { selector?: string; timeMs?: number }
interface HoverMeta { selector: string }
interface PressMeta { key: string }

// -- 1. Navigate Tool --

export const BrowserNavigateTool = Tool.define("browser_navigate", {
  description: DESC_NAVIGATE,
  parameters: z.object({
    url: z.string().describe("The URL to navigate to"),
    timeout: z.number().optional().describe("Timeout in milliseconds"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "browser",
      patterns: [params.url],
      always: ["*"],
      metadata: { action: "navigate", url: params.url },
    })

    const timeoutMs = params.timeout ?? DEFAULT_TIMEOUT
    const { signal, clearTimeout } = abortAfterAny(timeoutMs, ctx.abort)
    const page = await ensurePage()

    try {
      await page.goto(params.url, { waitUntil: "load" })
      clearTimeout()
      return {
        title: `Navigated to ${params.url}`,
        output: `Successfully navigated to ${params.url}`,
        metadata: { url: params.url, timeout: params.timeout },
      }
    } catch (error: any) {
      clearTimeout()
      const attachment = await takeErrorScreenshot(page, "navigate")
      throw new Error(`Navigation failed: ${error.message}${attachment ? " (See attached screenshot)" : ""}`)
    }
  },
})

// -- 2. Screenshot Tool --

export const BrowserScreenshotTool = Tool.define("browser_screenshot", {
  description: DESC_SCREENSHOT,
  parameters: z.object({
    fullPage: z.boolean().optional().describe("Capture the full scrollable page instead of just the viewport"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "browser",
      patterns: ["screenshot"],
      always: ["*"],
      metadata: { action: "screenshot", fullPage: params.fullPage },
    })

    const page = await ensurePage()
    const buffer = await page.screenshot({ fullPage: params.fullPage })
    const base64 = buffer.toString("base64")

    // Optional: save to recordings directory
    try {
      const recDir = path.join(Instance.directory, ".opencode", "recordings")
      await fs.mkdir(recDir, { recursive: true })
      await fs.writeFile(path.join(recDir, `screenshot-${Date.now()}.png`), buffer)
    } catch (e) {
      log.debug("failed to save screenshot to disk", { error: e })
    }

    return {
      title: "Browser Screenshot",
      output: params.fullPage ? "Full page screenshot captured" : "Viewport screenshot captured",
      metadata: { fullPage: params.fullPage },
      attachments: [{
        type: "file",
        mime: "image/png",
        url: `data:image/png;base64,${base64}`,
      }],
    }
  },
})

// -- 3. Click Tool --

export const BrowserClickTool = Tool.define("browser_click", {
  description: DESC_CLICK,
  parameters: z.object({
    selector: z.string().describe("CSS selector or Playwright locator for the element to click"),
    force: z.boolean().optional().describe("Bypass actionability checks (e.g. if covered by another element)"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "browser",
      patterns: [params.selector],
      always: ["*"],
      metadata: { action: "click", selector: params.selector, force: params.force },
    })

    const page = await ensurePage()
    try {
      await page.click(params.selector, { timeout: 5000, force: params.force })
      return {
        title: `Clicked ${params.selector}`,
        output: `Successfully clicked element: ${params.selector}`,
        metadata: { selector: params.selector },
      }
    } catch (error: any) {
      const attachment = await takeErrorScreenshot(page, "click")
      throw new Error(`Click failed: ${error.message}${attachment ? " (See attached screenshot)" : ""}`)
    }
  },
})

// -- 4. Type Tool --

export const BrowserTypeTool = Tool.define("browser_type", {
  description: DESC_TYPE,
  parameters: z.object({
    selector: z.string().describe("CSS selector for the input element"),
    text: z.string().describe("Text to enter into the element"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "browser",
      patterns: [params.selector],
      always: ["*"],
      metadata: { action: "type", selector: params.selector },
    })

    const page = await ensurePage()
    try {
      await page.fill(params.selector, params.text, { timeout: 5000 })
      return {
        title: `Typed into ${params.selector}`,
        output: `Successfully typed text into element: ${params.selector}`,
        metadata: { selector: params.selector, text: params.text },
      }
    } catch (error: any) {
      const attachment = await takeErrorScreenshot(page, "type")
      throw new Error(`Type failed: ${error.message}${attachment ? " (See attached screenshot)" : ""}`)
    }
  },
})

// -- 5. Scroll Tool --

export const BrowserScrollTool = Tool.define("browser_scroll", {
  description: DESC_SCROLL,
  parameters: z.object({
    amount: z.number().optional().describe("Pixels to scroll (default 500)"),
    direction: z.enum(["down", "up"]).optional().default("down").describe("Direction to scroll"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "browser",
      patterns: ["scroll"],
      always: ["*"],
      metadata: { action: "scroll" },
    })

    const page = await ensurePage()
    const amount = params.amount || 500
    const y = params.direction === "up" ? -amount : amount
    
    await page.evaluate((scrollAmount) => window.scrollBy(0, scrollAmount), y)
    
    return {
      title: `Scrolled ${params.direction}`,
      output: `Scrolled page ${params.direction} by ${amount} pixels`,
      metadata: { amount: params.amount, direction: params.direction },
    }
  },
})

// -- 6. Resize Tool --

export const BrowserResizeTool = Tool.define("browser_resize", {
  description: DESC_RESIZE,
  parameters: z.object({
    width: z.number().describe("Viewport width in pixels (e.g., 375 for mobile, 1440 for desktop)"),
    height: z.number().describe("Viewport height in pixels"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "browser",
      patterns: ["resize"],
      always: ["*"],
      metadata: { action: "resize", width: params.width, height: params.height },
    })

    const page = await ensurePage()
    await page.setViewportSize({ width: params.width, height: params.height })

    return {
      title: "Resized Viewport",
      output: `Resized viewport to ${params.width}x${params.height}`,
      metadata: { width: params.width, height: params.height },
    }
  },
})

// -- 7. Wait Tool --

import DESC_WAIT from "./browser-wait.txt"
export const BrowserWaitTool = Tool.define("browser_wait", {
  description: DESC_WAIT,
  parameters: z.object({
    selector: z.string().optional().describe("Wait for this CSS selector to appear in the DOM"),
    timeMs: z.number().optional().describe("Wait for exactly this many milliseconds"),
  }),
  async execute(params, ctx) {
    if (!params.selector && !params.timeMs) {
      throw new Error("Must provide either selector or timeMs")
    }
    
    await ctx.ask({
      permission: "browser",
      patterns: [params.selector || "timeout"],
      always: ["*"],
      metadata: { action: "wait", selector: params.selector, timeMs: params.timeMs },
    })

    const page = await ensurePage()
    try {
      if (params.selector) {
        await page.waitForSelector(params.selector, { state: "visible", timeout: params.timeMs || 10000 })
        return {
          title: `Waited for ${params.selector}`,
          output: `Successfully waited for element to become visible: ${params.selector}`,
          metadata: { selector: params.selector, timeMs: params.timeMs },
        }
      } else {
        await page.waitForTimeout(params.timeMs!)
        return {
          title: `Waited for ${params.timeMs}ms`,
          output: `Successfully waited for ${params.timeMs}ms`,
          metadata: { selector: params.selector, timeMs: params.timeMs },
        }
      }
    } catch (error: any) {
      const attachment = await takeErrorScreenshot(page, "wait")
      throw new Error(`Wait failed: ${error.message}${attachment ? " (See attached screenshot)" : ""}`)
    }
  },
})

// -- 8. Hover Tool --

import DESC_HOVER from "./browser-hover.txt"
export const BrowserHoverTool = Tool.define("browser_hover", {
  description: DESC_HOVER,
  parameters: z.object({
    selector: z.string().describe("CSS selector to hover over"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "browser",
      patterns: [params.selector],
      always: ["*"],
      metadata: { action: "hover", selector: params.selector },
    })

    const page = await ensurePage()
    try {
      await page.hover(params.selector, { timeout: 5000 })
      return {
        title: `Hovered over ${params.selector}`,
        output: `Successfully hovered over element: ${params.selector}`,
        metadata: { selector: params.selector },
      }
    } catch (error: any) {
      const attachment = await takeErrorScreenshot(page, "hover")
      throw new Error(`Hover failed: ${error.message}${attachment ? " (See attached screenshot)" : ""}`)
    }
  },
})

// -- 9. Press Tool --

import DESC_PRESS from "./browser-press.txt"
export const BrowserPressTool = Tool.define("browser_press", {
  description: DESC_PRESS,
  parameters: z.object({
    key: z.string().describe("Key to press (e.g. 'Enter', 'Escape', 'Tab', 'ArrowDown')"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "browser",
      patterns: [params.key],
      always: ["*"],
      metadata: { action: "press", key: params.key },
    })

    const page = await ensurePage()
    try {
      await page.keyboard.press(params.key)
      return {
        title: `Pressed ${params.key}`,
        output: `Successfully pressed key: ${params.key}`,
        metadata: { key: params.key },
      }
    } catch (error: any) {
      const attachment = await takeErrorScreenshot(page, "press")
      throw new Error(`Press failed: ${error.message}${attachment ? " (See attached screenshot)" : ""}`)
    }
  },
})

// -- 10. Read Tool --

export const BrowserReadTool = Tool.define("browser_read", {
  description: DESC_READ,
  parameters: z.object({
    format: z.enum(["markdown", "html", "accessibility"]).default("markdown").describe("Output format"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "browser",
      patterns: ["read"],
      always: ["*"],
      metadata: { action: "read", format: params.format },
    })

    const page = await ensurePage()
    
    if (params.format === "accessibility") {
      const snapshot = await (page as any).accessibility.snapshot()
      return {
        title: "Accessibility Tree Snapshot",
        output: JSON.stringify(snapshot, null, 2),
        metadata: { format: params.format as string },
      }
    }

    // Inject logical IDs recursively so that elements always have a selector
    await page.evaluate(() => {
      let counter = 1
      const elements = document.querySelectorAll("a, button, input, select, textarea, [role='button'], [role='link'], [tabindex]")
      elements.forEach((el) => {
        if (!el.hasAttribute("id") && !el.hasAttribute("data-oc-id")) {
          el.setAttribute("data-oc-id", `oc-${counter}`)
          counter++
        }
      })
    })

    const content = await page.content()
    
    if (params.format === "html") {
      return {
        title: "Read Page HTML",
        output: content,
        metadata: { format: params.format as string },
      }
    }

    const turndown = new TurndownService()
    turndown.remove(["script", "style", "meta", "link", "noscript"])
    
    // Custom rule to retain data-oc-id or id in markdown
    turndown.addRule("interactiveItems", {
      filter: ["a", "button", "input", "select", "textarea"],
      replacement: function (content, node: any) {
        const id = node.getAttribute("id")
        const ocId = node.getAttribute("data-oc-id")
        const selector = id ? `[id="${id}"]` : (ocId ? `[data-oc-id="${ocId}"]` : null)
        
        let text = content.trim() || node.getAttribute("aria-label") || node.getAttribute("title") || node.getAttribute("placeholder") || node.getAttribute("value") || node.tagName.toLowerCase()
        
        if (selector) {
          return ` ${text} (selector: \`${selector}\`) `
        }
        return ` ${text} `
      }
    })

    const markdown = turndown.turndown(content)
    
    return {
      title: "Read Page Markdown",
      output: markdown,
      metadata: { format: params.format as string },
    }
  },
})
