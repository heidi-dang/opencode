import z from "zod"
import { Tool } from "./tool"
import { HeidiState } from "../heidi/state"
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
    
    const rootDir = HeidiState.root(ctx.sessionID)
    const reportPath = path.join(rootDir, "browser_report.md")
    const screenshotPath = path.join(rootDir, "browser_screenshot.png")
    
    // We will run a playwright script in a child process to avoid leaking or blocking the main process
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
  page.on('requestfailed', request => networkErrors.push(request.url() + ' ' + request.failure().errorText));
  page.on('response', response => {
    if (response.status() >= 400) {
      networkErrors.push(response.url() + ' ' + response.status());
    }
  });

  try {
    const response = await page.goto('${params.url}', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: '${screenshotPath}', fullPage: true });
    
    const html = await page.content();
    
    const report = [
      '# Browser Validation Report',
      '**URL**: ${params.url}',
      '**Status**: ' + (response ? response.status() : 'Unknown'),
      '',
      '## Console Logs',
      consoleLogs.length ? consoleLogs.map(l => '- ' + l).join('\\n') : 'No console messages.',
      '',
      '## Network Errors',
      networkErrors.length ? networkErrors.map(e => '- ' + e).join('\\n') : 'No network errors.',
      '',
      '## Screenshots',
      'Screenshot saved to browser_screenshot.png'
    ].join('\\n');
    
    fs.writeFileSync('${reportPath}', report);
    
    console.log(JSON.stringify({
      status: response && response.ok() ? 'pass' : 'fail',
      httpStatus: response ? response.status() : null,
      consoleErrors: consoleLogs,
      networkFailures: networkErrors
    }));
  } catch (err) {
    console.error("BROWSER_ERROR:", err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
`;

    const scriptPath = path.join(rootDir, "run_browser.js");
    await Filesystem.write(scriptPath, script);

    return new Promise((resolve) => {
      const proc = spawn("node", [scriptPath], { cwd: Instance.directory });
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => (stdout += data.toString()));
      proc.stderr.on("data", (data) => (stderr += data.toString()));

      proc.on("close", async (code) => {
        let status = "fail";
        let consoleErrors = [];
        let networkFailures = [];

        if (code === 0 && stdout) {
          try {
            const parsed = JSON.parse(stdout.trim());
            status = parsed.status;
            consoleErrors = parsed.consoleErrors || [];
            networkFailures = parsed.networkFailures || [];
          } catch (e) {
            status = "fail";
          }
        } else {
          status = "fail";
          consoleErrors.push(stderr);
        }

        const evidence = {
          required: true,
          status,
          screenshots: ["browser_screenshot.png"],
          html: [],
          console_errors: consoleErrors,
          network_failures: networkFailures,
          report: "browser_report.md"
        };

        // Merge with existing verification.json
        let verify = await HeidiState.readVerification(ctx.sessionID);
        if (!verify) {
          verify = {
            task_id: ctx.sessionID,
            status,
            checks: [],
            evidence: { changed_files: [], command_summary: [], before_after: "" },
            warnings: [],
            remediation: [],
          };
        }
        verify.browser = evidence;
        await HeidiState.writeVerification(ctx.sessionID, verify);

        resolve({
          title: "Browser Validation Subagent",
          metadata: evidence,
          output: `Playwright validation completed. Status: ${status}.\nReport written to browser_report.md`,
        });
      });
    });
  },
})
