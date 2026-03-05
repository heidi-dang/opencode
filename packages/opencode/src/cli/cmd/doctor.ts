import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { Installation } from "../../installation"
import { Global } from "../../global"
import { Database } from "../../storage/db"
import { Filesystem } from "../../util/filesystem"
import { SessionTable } from "../../session/session.sql"
import { ProjectTable } from "../../project/project.sql"
import path from "path"
import os from "os"

interface DoctorCheck {
  name: string
  status: "pass" | "warn" | "fail"
  message: string
  details?: string
}

export const DoctorCommand = cmd({
  command: "doctor",
  describe: "diagnose and fix common issues",
  builder: (yargs: Argv) => {
    return yargs.option("verbose", {
      describe: "show detailed output",
      type: "boolean",
      default: false,
    })
  },
  handler: async (args) => {
    const checks = await runDoctorChecks(args.verbose)

    displayDoctorResults(checks)

    const failed = checks.filter((c) => c.status === "fail")
    const warned = checks.filter((c) => c.status === "warn")

    if (failed.length > 0) {
      console.log("\n✗ Failed checks require attention")
      process.exit(1)
    } else if (warned.length > 0) {
      console.log("\n⚠ Warnings found, but no critical failures")
      process.exit(0)
    } else {
      console.log("\n✓ All checks passed")
      process.exit(0)
    }
  },
})

async function runDoctorChecks(verbose: boolean): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []

  checks.push(checkInstallation())
  checks.push(checkNodeVersion())
  checks.push(await checkHomeDir())
  checks.push(checkDatabase())

  if (verbose) {
    checks.push(checkDiskSpace())
  }

  return checks
}

function checkInstallation(): DoctorCheck {
  const version = Installation.VERSION
  const isLocal = Installation.isLocal()

  return {
    name: "Installation",
    status: "pass",
    message: isLocal ? `Development mode (${version})` : `Installed (${version})`,
    details: isLocal ? "Running from local source" : undefined,
  }
}

function checkNodeVersion(): DoctorCheck {
  const nodeVersion = process.version
  const major = parseInt(nodeVersion.slice(1).split(".")[0])

  if (major < 18) {
    return {
      name: "Node.js",
      status: "fail",
      message: `Node.js ${nodeVersion} is too old`,
      details: "OpenCode requires Node.js 18 or higher",
    }
  }

  return {
    name: "Node.js",
    status: "pass",
    message: `Node.js ${nodeVersion}`,
  }
}

async function checkHomeDir(): Promise<DoctorCheck> {
  const homeDir = os.homedir()

  if (!homeDir) {
    return {
      name: "Home Directory",
      status: "fail",
      message: "Home directory not accessible",
      details: "HOME not set",
    }
  }

  const configDir = Global.Path.config
  const dataDir = Global.Path.data

  const configExists = await Filesystem.exists(configDir)
  const dataExists = await Filesystem.exists(dataDir)

  if (!configExists || !dataExists) {
    return {
      name: "Config Directory",
      status: "warn",
      message: "Directories may need initialization",
      details: `Config: ${configExists ? "OK" : "Missing"}, Data: ${dataExists ? "OK" : "Missing"}`,
    }
  }

  return {
    name: "Directories",
    status: "pass",
    message: "All directories accessible",
  }
}

function checkDatabase(): DoctorCheck {
  try {
    const dbPath = path.join(Global.Path.data, "opencode.db")
    const exists = Filesystem.exists(dbPath)

    if (!exists) {
      return {
        name: "Database",
        status: "warn",
        message: "Database not initialized",
        details: "Run 'opencode' to initialize",
      }
    }

    const sessionCount = Database.use((db) => db.select().from(SessionTable).all()).length
    const projectCount = Database.use((db) => db.select().from(ProjectTable).all()).length

    return {
      name: "Database",
      status: "pass",
      message: `Connected (${sessionCount} sessions, ${projectCount} projects)`,
    }
  } catch (e) {
    return {
      name: "Database",
      status: "fail",
      message: "Database connection failed",
      details: e instanceof Error ? e.message : String(e),
    }
  }
}

function checkDiskSpace(): DoctorCheck {
  try {
    const freeBytes = (os.freemem() / os.totalmem()) * 100
    const freePercent = Math.round(freeBytes)

    if (freePercent < 10) {
      return {
        name: "Disk Space",
        status: "fail",
        message: `Low memory: ${freePercent}% free`,
        details: "Less than 10% memory available",
      }
    }

    if (freePercent < 25) {
      return {
        name: "Disk Space",
        status: "warn",
        message: `Low memory: ${freePercent}% free`,
      }
    }

    return {
      name: "Memory",
      status: "pass",
      message: `${freePercent}% memory available`,
    }
  } catch {
    return {
      name: "Memory",
      status: "warn",
      message: "Unable to check memory",
    }
  }
}

function displayDoctorResults(checks: DoctorCheck[]) {
  const width = 60

  function renderRow(name: string, status: string, message: string): string {
    const statusIcon = status === "pass" ? "✓" : status === "warn" ? "⚠" : "✗"
    const availableWidth = width - name.length - statusIcon.length - 4
    const truncated = message.length > availableWidth ? message.slice(0, availableWidth - 2) + ".." : message
    return `│ ${statusIcon} ${name.padEnd(width - truncated.length - 6)}${truncated} │`
  }

  console.log("┌" + "─".repeat(width) + "┐")
  console.log("│" + " System Diagnostics ".padStart((width + 14) / 2).padEnd(width) + "│")
  console.log("├" + "─".repeat(width) + "┤")

  for (const check of checks) {
    console.log(renderRow(check.name, check.status, check.message))
    if (check.details) {
      console.log("│   " + check.details.padEnd(width - 4) + "│")
    }
  }

  console.log("└" + "─".repeat(width) + "┘")
}
