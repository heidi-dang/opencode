import { marked } from "marked"
import markedKatex from "marked-katex-extension"
import markedShiki from "marked-shiki"
import katex from "katex"
import { bundledLanguages, type BundledLanguage } from "shiki"
import { codeToHtml, createCssVariablesTheme } from "shiki"
import { createSimpleContext } from "./helper"

// Create OpenCode theme using shiki's theme API
const openCodeTheme = createCssVariablesTheme({
  name: "OpenCode",
  variablePrefix: "--vscode-",
})

// Type for the theme registration
export type ThemeRegistrationResolved = typeof openCodeTheme

// Export for compatibility with existing code
function registerCustomTheme(name: string, theme: () => Promise<any>) {
  // Theme is already defined above
  return theme
}

registerCustomTheme("OpenCode", () => {
  return Promise.resolve({
    name: "OpenCode",
    colors: {
      "editor.background": "var(--color-background-stronger)",
      "editor.foreground": "var(--text-base)",
    },
    tokenColors: [
      { scope: ["comment"], settings: { foreground: "var(--syntax-comment)" } },
      { scope: ["string"], settings: { foreground: "var(--syntax-string)" } },
      { scope: ["constant"], settings: { foreground: "var(--syntax-constant)" } },
      { scope: ["keyword"], settings: { foreground: "var(--syntax-keyword)" } },
      { scope: ["entity.name.function"], settings: { foreground: "var(--syntax-function)" } },
      { scope: ["variable"], settings: { foreground: "var(--syntax-variable)" } },
    ],
  })
})

export interface IMarkedContext {
  parse(markdown: string): Promise<string>
}

// Use createSimpleContext with the correct signature
export const MarkedContext = createSimpleContext<
  IMarkedContext,
  { nativeParser?: (markdown: string) => Promise<string> }
>({
  name: "marked",
  init: (props) => {
    if (props.nativeParser) {
      return {
        async parse(markdown: string): Promise<string> {
          const html = await props.nativeParser!(markdown)
          const withMath = renderMathExpressions(html)
          return highlightCodeBlocks(withMath)
        },
      }
    }
    // Default JS parser
    const jsParser = marked.use({
      gfm: true,
      breaks: true,
      renderer: {
        link({ href, title, text }) {
          const titleAttr = title ? ` title="${title}"` : ""
          return `<a href="${href}"${titleAttr} class="external-link" target="_blank" rel="noopener noreferrer">${text}</a>`
        },
      },
    })
    jsParser.use(
      markedKatex({
        throwOnError: false,
        nonStandard: true,
      }),
      markedShiki({
        async highlight(code, lang) {
          const validLang = lang && lang in bundledLanguages ? lang : "text"
          return codeToHtml(code, {
            lang: validLang,
            theme: openCodeTheme,
          })
        },
      }),
    )
    return {
      parse: async (markdown: string) => {
        return await jsParser.parse(markdown)
      },
    }
  },
})

export function useMarked(): IMarkedContext {
  return MarkedContext.use()
}

export function MarkedProvider(props: { children?: any; nativeParser?: (markdown: string) => Promise<string> }) {
  return <MarkedContext.provider nativeParser={props.nativeParser}>{props.children}</MarkedContext.provider>
}

// Helper function to render math expressions
function renderMathExpressions(html: string): string {
  // Implementation would go here
  return html
}

// Helper function to highlight code blocks
function highlightCodeBlocks(html: string): Promise<string> {
  // Implementation would go here
  return Promise.resolve(html)
}
