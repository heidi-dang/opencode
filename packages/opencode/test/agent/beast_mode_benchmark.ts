/**
 * Beast Mode Agent Benchmark
 *
 * This script benchmarks the beast_mode agent implementation
 */

async function runBenchmarks() {
  console.log("🚀 Starting Beast Mode Agent Benchmark...\n")

  // Import types inline for standalone execution
  interface BenchmarkResult {
    name: string
    passed: boolean
    score: number
    details?: string
  }

  const results: BenchmarkResult[] = []

  // ==========================================================================
  // Benchmark 1: File Structure Check
  // ==========================================================================
  console.log("📋 Benchmark 1: File Structure")

  const fs = await import("fs")
  const path = await import("path")

  const baseDir = path.resolve(import.meta.dir, "../..")

  const requiredFiles = [
    "src/agent/agent.ts",
    "src/tool/opencode_plugin.ts",
    "src/tool/notebook.ts",
    "src/tool/problems.ts",
    "src/tool/terminal.ts",
    "src/tool/github_repo.ts",
    "src/tool/test_failure.ts",
    "src/tool/create_task.ts",
  ]

  let filesPassed = 0
  for (const file of requiredFiles) {
    const fullPath = path.join(baseDir, file)
    const exists = fs.existsSync(fullPath)
    if (exists) filesPassed++
    console.log(`  ${exists ? "✅" : "❌"} ${file}`)
  }

  results.push({
    name: "File Structure",
    passed: filesPassed === requiredFiles.length,
    score: filesPassed / requiredFiles.length,
    details: `${filesPassed}/${requiredFiles.length} files exist`,
  })

  // ==========================================================================
  // Benchmark 2: Registry Configuration
  // ==========================================================================
  console.log("\n📋 Benchmark 2: Registry Configuration")

  const registryPath = path.join(baseDir, "src/tool/registry.ts")
  const registryContent = fs.readFileSync(registryPath, "utf-8")

  const toolImports = [
    "OpenCodePluginListTool",
    "OpenCodeInstallPluginTool",
    "OpenCodePluginImplementTool",
    "NotebookRunCellTool",
    "NotebookSummaryTool",
    "ProblemsTool",
    "TerminalLastCommandTool",
    "TerminalSelectionTool",
    "GitHubRepoTool",
    "TestFailureTool",
    "CreateAndRunTaskTool",
    "ListTasksTool",
  ]

  let importsPassed = 0
  for (const tool of toolImports) {
    const imported = registryContent.includes(tool)
    if (imported) importsPassed++
    console.log(`  ${imported ? "✅" : "❌"} ${tool}`)
  }

  results.push({
    name: "Tool Imports",
    passed: importsPassed === toolImports.length,
    score: importsPassed / toolImports.length,
    details: `${importsPassed}/${toolImports.length} tools imported`,
  })

  // ==========================================================================
  // Benchmark 3: Tool Registration in Registry
  // ==========================================================================
  console.log("\n📋 Benchmark 3: Tool Registration")

  let toolsRegistered = 0
  for (const tool of toolImports) {
    const registered = registryContent.includes(`  ${tool},\n`) || registryContent.includes(`\n  ${tool},\n`)
    if (registered) toolsRegistered++
    console.log(`  ${registered ? "✅" : "❌"} ${tool} registered`)
  }

  results.push({
    name: "Tool Registration",
    passed: toolsRegistered === toolImports.length,
    score: toolsRegistered / toolImports.length,
    details: `${toolsRegistered}/${toolImports.length} tools registered`,
  })

  // ==========================================================================
  // Benchmark 4: Agent Configuration
  // ==========================================================================
  console.log("\n📋 Benchmark 4: Agent Configuration")

  const agentPath = path.join(baseDir, "src/agent/agent.ts")
  const agentContent = fs.readFileSync(agentPath, "utf-8")

  const agentChecks = [
    { name: "beast_mode definition exists", pattern: /beast_mode:/ },
    { name: "Has name '4.1 Beast Mode v3.1'", pattern: /name:\s*"4\.1 Beast Mode v3\.1"/ },
    { name: "Has GPT 4.1 description", pattern: /description:\s*"GPT 4\.1 as a top-notch coding agent\."/ },
    {
      name: "Has GPT 4.1 model",
      pattern:
        /model:\s*\{[\s\S]*?providerID:\s*ProviderID\.make\("openai"\)[\s\S]*?modelID:\s*ModelID\.make\("gpt-4\.1"\)/,
    },
    { name: "Has prompt", pattern: /prompt:\s*(PROMPT_BEAST|".*GPT 4\.1)/ },
    { name: "Mode is subagent", pattern: /mode:\s*"subagent"/ },
    { name: "Native flag is true", pattern: /native:\s*true/ },
    { name: "Has permission config", pattern: /permission:\s*PermissionNext\.merge/ },
  ]

  let agentPassed = 0
  for (const check of agentChecks) {
    const passed = check.pattern.test(agentContent)
    if (passed) agentPassed++
    console.log(`  ${passed ? "✅" : "❌"} ${check.name}`)
  }

  results.push({
    name: "Agent Configuration",
    passed: agentPassed === agentChecks.length,
    score: agentPassed / agentChecks.length,
    details: `${agentPassed}/${agentChecks.length} checks passed`,
  })

  // ==========================================================================
  // Benchmark 5: VSCode Tools Replaced
  // ==========================================================================
  console.log("\n📋 Benchmark 5: VSCode Tools Replacement")

  const vscodeTools = [
    "VSCodeProjectSetupTool",
    "VSCodeInstallExtensionTool",
    "VSCodeNewWorkspaceTool",
    "VSCodeExtensionsTool",
    "VSCodeApiTool",
  ]

  let vscodeRemoved = 0
  for (const tool of vscodeTools) {
    const removed = !registryContent.includes(tool)
    if (removed) vscodeRemoved++
    console.log(`  ${removed ? "✅" : "❌"} ${tool} removed`)
  }

  results.push({
    name: "VSCode Tools Removed",
    passed: vscodeRemoved === vscodeTools.length,
    score: vscodeRemoved / vscodeTools.length,
    details: `${vscodeRemoved}/${vscodeTools.length} VSCode tools removed`,
  })

  // ==========================================================================
  // Summary
  // ==========================================================================
  const total = results.length
  const passed = results.filter((r) => r.passed).length
  const failed = total - passed
  const score = results.reduce((acc, r) => acc + r.score, 0) / total

  console.log("\n" + "=".repeat(60))
  console.log("📊 BENCHMARK SUMMARY")
  console.log("=".repeat(60))
  console.log(`Agent:          beast_mode`)
  console.log(`Model:          GPT-4.1`)
  console.log(`Timestamp:      ${new Date().toISOString()}`)
  console.log("=".repeat(60))
  console.log(`Total Tests:    ${total}`)
  console.log(`Passed:         ${passed}`)
  console.log(`Failed:         ${failed}`)
  console.log(`Overall Score:  ${(score * 100).toFixed(1)}%`)
  console.log("=".repeat(60))

  // Print detailed results
  console.log("\n📋 Detailed Results:")
  for (const result of results) {
    console.log(`  ${result.passed ? "✅" : "❌"} ${result.name}: ${(result.score * 100).toFixed(0)}%`)
    if (result.details) {
      console.log(`     ${result.details}`)
    }
  }

  // Generate recommendations
  console.log("\n💡 Recommendations:")
  if (score === 1) {
    console.log("  🎉 All benchmarks passed! Beast Mode agent is fully configured.")
  } else {
    const failedTests = results.filter((r) => !r.passed)
    for (const test of failedTests) {
      console.log(`  ⚠️  Review: ${test.name}`)
    }
  }

  return {
    agent: "beast_mode",
    model: "GPT-4.1",
    timestamp: new Date().toISOString(),
    results,
    summary: { total, passed, failed, score },
  }
}

runBenchmarks()
  .then((report) => {
    console.log("\n📄 JSON Report:")
    console.log(JSON.stringify(report, null, 2))
    process.exit(report.summary.failed > 0 ? 1 : 0)
  })
  .catch((err) => {
    console.error("Benchmark failed:", err)
    process.exit(1)
  })
