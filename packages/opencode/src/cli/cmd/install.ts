import type { Argv } from "yargs"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import { Installation } from "../../installation"
import { Process } from "../../util/process"
import { Filesystem } from "../../util/filesystem"
import path from "path"
import { git } from "@/util/git"

interface InstallArgs {
  localRepo: boolean
  method?: string
  target?: string
}

export const InstallCommand = {
  command: "install [target]",
  describe: "install opencode or install from local repository",
  builder: (yargs: Argv) => {
    return yargs
      .positional("target", {
        describe: "version to install, for ex '0.1.48' or 'v0.1.48'",
        type: "string",
      })
      .option("local-repo", {
        alias: "l",
        describe: "install from the current local repository",
        type: "boolean",
        default: false,
      })
      .option("method", {
        alias: "m",
        describe: "installation method to use",
        type: "string",
        choices: ["curl", "npm", "pnpm", "bun", "brew", "choco", "scoop"],
      })
  },
  handler: async (args: InstallArgs) => {
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()
    prompts.intro("Install")

    if (args.localRepo) {
      await installFromLocalRepo()
      return
    }

    const detectedMethod = await Installation.method()
    const method = (args.method as Installation.Method) ?? detectedMethod
    
    if (method === "unknown") {
      prompts.log.error(`Cannot detect installation method. Please specify --method`)
      prompts.outro("Done")
      return
    }

    prompts.log.info("Using method: " + method)
    const target = args.target ? args.target.replace(/^v/, "") : await Installation.latest()

    prompts.log.info(`Installing opencode ${target}`)
    const spinner = prompts.spinner()
    spinner.start("Installing...")
    
    const err = await Installation.upgrade(method, target).catch((err) => err)
    if (err) {
      spinner.stop("Install failed", 1)
      if (err instanceof Installation.UpgradeFailedError) {
        if (method === "choco" && err.data.stderr.includes("not running from an elevated command shell")) {
          prompts.log.error("Please run the terminal as Administrator and try again")
        } else {
          prompts.log.error(err.data.stderr)
        }
      } else if (err instanceof Error) prompts.log.error(err.message)
      prompts.outro("Done")
      return
    }
    
    spinner.stop("Install complete")
    prompts.outro("Done")
  },
}

async function installFromLocalRepo() {
  // Get repository root using git command
  const gitResult = await git(["rev-parse", "--show-toplevel"], { cwd: "." })
  if (gitResult.exitCode !== 0) {
    prompts.log.error("Not in a git repository")
    prompts.outro("Done")
    return
  }

  const repoRoot = gitResult.text().trim()
  prompts.log.info(`Installing from local repository: ${repoRoot}`)

  // Check if this looks like the opencode repository
  const packageJsonPath = path.join(repoRoot, "package.json")
  if (!(await Filesystem.exists(packageJsonPath))) {
    prompts.log.error("No package.json found in repository root")
    prompts.outro("Done")
    return
  }

  const packageJson = await Filesystem.readJson(packageJsonPath)
  if (packageJson.name !== "opencode") {
    prompts.log.error("This doesn't appear to be the opencode repository")
    prompts.outro("Done")
    return
  }

  prompts.log.info("Building local version...")
  const spinner = prompts.spinner()
  spinner.start("Building...")

  // Build the project
  const buildResult = await Process.run(["bun", "run", "build"], { 
    cwd: repoRoot, 
    nothrow: true 
  })

  if (buildResult.code !== 0) {
    spinner.stop("Build failed", 1)
    prompts.log.error("Failed to build the project:")
    prompts.log.error(buildResult.stderr.toString())
    prompts.outro("Done")
    return
  }

  spinner.start("Installing locally...")

  // Install globally using the local build
  const installResult = await Process.run(["bun", "install", "-g", "."], { 
    cwd: repoRoot, 
    nothrow: true 
  })

  if (installResult.code !== 0) {
    spinner.stop("Install failed", 1)
    prompts.log.error("Failed to install locally:")
    prompts.log.error(installResult.stderr.toString())
    prompts.outro("Done")
    return
  }

  spinner.stop("Local install complete")
  prompts.log.success(`Installed opencode from ${repoRoot}`)
  prompts.outro("Done")
}
