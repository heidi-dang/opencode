import z from "zod"
import { Tool } from "./tool"
import { HeidiState } from "../heidi/state"
import { root as heidiRoot } from "../heidi/state"
import { Filesystem } from "../util/filesystem"
import { spawn } from "child_process"
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
    const rep = path.join(rootDir, "browser_report.md")
    const shot = path.join(rootDir, "browser_screenshot.png")
    const con = path.join(rootDir, "console_errors.json")
    const net = path.join(rootDir, "network_failures.json")
    const dom = path.join(rootDir, "dom_snapshot.json")
    const script = path.join(rootDir, "run_browser.js")

    // Ensure root dir exists
    await Filesystem.write(path.join(rootDir, ".keep"), "")

    const js = `
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  const errs = [];

  page.on('console', msg => logs.push(msg.type() + ': ' + msg.text()));
  page.on('requestfailed', req => errs.push({ url: req.url(), error: req.failure()?.errorText || 'unknown' }));
  page.on('response', res => {
    if (res.status() >= 400) errs.push({ url: res.url(), error: String(res.status()) });
  });

  try {
    const response = await page.goto(${JSON.stringify(params.url)}, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: ${JSON.stringify(shot)}, fullPage: true });

    const dom = await page.evaluate(() => ({
      title: document.title,
      bodyLength: document.body?.innerHTML?.length || 0,
      links: Array.from(document.querySelectorAll('a')).length,
    }));

    fs.writeFileSync(${JSON.stringify(con)}, JSON.stringify(logs, null, 2));
    fs.writeFileSync(${JSON.stringify(net)}, JSON.stringify(errs, null, 2));
    fs.writeFileSync(${JSON.stringify(dom)}, JSON.stringify(dom, null, 2));

    const status = response && response.ok() ? 'pass' : 'fail';
    const httpStatus = response ? response.status() : null;

    const report = [
      '# Browser Validation Report',
      '**URL**: ${params.url}',
      '**Status**: ' + (httpStatus || 'unknown'),
      '**Result**: ' + status,
      '',
      '## Console Logs',
      logs.length ? logs.map(l => '- ' + l).join('\\n') : 'No console messages.',
      '',
      '## Network Errors',
      errs.length ? errs.map(e => '- ' + e.url + ': ' + e.error).join('\\n') : 'No network errors.',
      '',
      '## DOM Snapshot',
      '- Title: ' + dom.title,
      '- Body length: ' + dom.bodyLength,
      '- Links: ' + dom.links,
      '',
      '## Screenshots',
      'Screenshot saved to browser_screenshot.png',
    ].join('\\n');

    fs.writeFileSync(${JSON.stringify(rep)}, report);

    console.log(JSON.stringify({ status, httpStatus, consoleErrors: logs.map(String), networkFailures: errs.map(e => e.url + ': ' + e.error) }));
  } catch (err) {
    const msg = err.message || String(err);
    fs.writeFileSync(${JSON.stringify(rep)}, '# Browser Validation Report\\n\\n**FAILED**: ' + msg);
    fs.writeFileSync(${JSON.stringify(con)}, JSON.stringify([msg]));
    fs.writeFileSync(${JSON.stringify(net)}, JSON.stringify([]));
    fs.writeFileSync(${JSON.stringify(dom)}, JSON.stringify({}));
    console.error('BROWSER_ERROR: ' + msg);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
`

    await Filesystem.write(script, js)

    const result = spawn("node", [script], {
      cwd: rootDir,
      stdio: "inherit",
    })

    await new Promise((resolve) => result.on("close", resolve))

    const ok = await Filesystem.exists(rep)
    const status = ok ? "pass" : "fail"

    return {
      title: "Browser Validation",
      metadata: {},
      output: `Playwright validation complete. Status: ${status}\nReport: ${rep}`,
    }
  },
})
