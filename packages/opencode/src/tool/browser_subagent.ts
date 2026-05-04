import z from "zod"
import { Tool } from "./tool"
import { HeidiState } from "../heidi/state"
import { root as heidiRoot } from "../heidi/state"
import { Filesystem } from "../util/filesystem"
import { spawn } from "child_process"
import { Instance } from "../project/instance"
import path from "path"

export const BrowserSubagentTool = Tool.define("browser_subagent", {
  description:
    "Playwright-powered browser worker contract. Executes headless browser checks, captures screenshots, network requests, console logs, and DOM state. Persists a browser_report.md.",
  parameters: z.object({
    url: z.string(),
    checks: z.array(z.string()).default([]),
  }),
  async execute(params, ctx) {
    await HeidiState.ensure(ctx.sessionID, "browser verification")

    const rootDir = heidiRoot(ctx.sessionID)
    const reportPath = path.join(rootDir, "browser_report.md")
    const screenshotPath = path.join(rootDir, "browser_screenshot.png")
    const consolePath = path.join(rootDir, "console_errors.json")
    const networkPath = path.join(rootDir, "network_failures.json")
    const domPath = path.join(rootDir, "dom_snapshot.json")
    const scriptPath = path.join(rootDir, "run_browser.js")

    // Ensure root dir exists
    await Filesystem.write(path.join(rootDir, ".keep"), "")

    const script = `
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  const networkErrors = [];

  page.on('console', msg => consoleLogs.push(msg.type() + ': ' + msg.text()));
  page.on('requestfailed', req => networkErrors.push({ url: req.url(), error: req.failure()?.errorText || 'unknown' }));
  page.on('response', res => {
    if (res.status() >= 400) networkErrors.push({ url: res.url(), error: String(res.status()) });
  });

  try {
    const response = await page.goto(${JSON.stringify(params.url)}, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: ${JSON.stringify(screenshotPath)}, fullPage: true });

    const dom = await page.evaluate(() => ({
      title: document.title,
      bodyLength: document.body?.innerHTML?.length || 0,
      links: Array.from(document.querySelectorAll('a')).length,
    }));

    fs.writeFileSync(${JSON.stringify(consolePath)}, JSON.stringify(consoleLogs, null, 2));
    fs.writeFileSync(${JSON.stringify(networkPath)}, JSON.stringify(networkErrors, null, 2));
    fs.writeFileSync(${JSON.stringify(domPath)}, JSON.stringify(dom, null, 2));

    const status = response && response.ok() ? 'pass' : 'fail';
    const httpStatus = response ? response.status() : null;

    const report = [
      '# Browser Validation Report',
      '**URL**: ${params.url}',
      '**Status**: ' + (httpStatus || 'unknown'),
      '**Result**: ' + status,
      '',
      '## Console Logs',
      consoleLogs.length ? consoleLogs.map(l => '- ' + l).join('\\n') : 'No console messages.',
      '',
      '## Network Errors',
      networkErrors.length ? networkErrors.map(e => '- ' + e.url + ': ' + e.error).join('\\n') : 'No network errors.',
      '',
      '## DOM Snapshot',
      '- Title: ' + dom.title,
      '- Body length: ' + dom.bodyLength,
      '- Links: ' + dom.links,
      '',
      '## Screenshots',
      'Screenshot saved to browser_screenshot.png',
    ].join('\\n');

    fs.writeFileSync(${JSON.stringify(reportPath)}, report);

    console.log(JSON.stringify({ status, httpStatus, consoleErrors: consoleLogs.map(String), networkFailures: networkErrors.map(e => e.url + ': ' + e.error) }));
  } catch (err) {
    const msg = err.message || String(err);
    fs.writeFileSync(${JSON.stringify(reportPath)}, '# Browser Validation Report\\n\\n**FAILED**: ' + msg);
    fs.writeFileSync(${JSON.stringify(consolePath)}, JSON.stringify([msg]));
    fs.writeFileSync(${JSON.stringify(networkPath)}, JSON.stringify([]));
    fs.writeFileSync(${JSON.stringify(domPath)}, JSON.stringify({}));
    console.error('BROWSER_ERROR: ' + msg);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
`

    await Filesystem.write(scriptPath, script)

    return new Promise<{ title: string; metadata: Record<string, unknown>; output: string }>((resolve) => {
      const proc = spawn("node", [scriptPath], { cwd: Instance.directory })
      let stdout = ""
      let stderr = ""

      proc.stdout.on("data", (data) => (stdout += data.toString()))
      proc.stderr.on("data", (data) => (stderr += data.toString()))

      proc.on("close", async (code) => {
        let status: "pass" | "fail" | "skipped" = "fail"
        let consoleErrors: string[] = []
        let networkFailures: string[] = []

        if (code === 0 && stdout) {
          const parsed = JSON.parse(stdout.trim())
          status = parsed.status === "pass" ? "pass" : "fail"
          consoleErrors = parsed.consoleErrors ?? []
          networkFailures = parsed.networkFailures ?? []
        } else {
          consoleErrors = [stderr.slice(0, 2000)]
        }

        const evidence = {
          required: true,
          status,
          screenshots: ["browser_screenshot.png"],
          html: [] as string[],
          console_errors: consoleErrors,
          network_failures: networkFailures,
        }

        // Merge with existing verification.json or create fresh
        let verify = await HeidiState.readVerification(ctx.sessionID)
        if (!verify) {
          verify = {
            task_id: ctx.sessionID,
            status: status === "pass" ? "pass" : "fail",
            checks: [],
            evidence: { changed_files: [], command_summary: [] },
            warnings: [],
            remediation: [],
          }
        }
        verify.browser = evidence
        await HeidiState.writeVerification(ctx.sessionID, verify)

        resolve({
          title: "Browser Validation Subagent",
          metadata: { status, artifacts: ["browser_report.md", "browser_screenshot.png", "console_errors.json", "network_failures.json", "dom_snapshot.json"] },
          output: `Playwright validation complete. Status: ${status}\nReport: ${reportPath}`,
        })
      })
    })
  },
})
