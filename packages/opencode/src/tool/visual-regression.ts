import { Filesystem } from "@/util/filesystem"
import path from "path"
import { createWriteStream } from "fs"
import pixelmatch from "pixelmatch"

// pngjs has a different import structure
const PNG = require("pngjs").PNG

export interface VisualDiff {
  same: boolean
  diffPath: string
  diffCount: number
}

export async function compareScreenshots(
  baseline: string,
  current: string,
  diffOutput: string,
): Promise<VisualDiff> {
  // Read PNG files
  const img1 = PNG.sync.read(Buffer.from(await Filesystem.readBytes(baseline)))
  const img2 = PNG.sync.read(Buffer.from(await Filesystem.readBytes(current)))

  // Create diff image
  const { width, height } = img1
  const diff = new PNG({ width, height })

  // Compare
  const diffCount = pixelmatch(
    img1.data as Uint8Array<ArrayBuffer>,
    img2.data as Uint8Array<ArrayBuffer>,
    diff.data as Uint8Array<ArrayBuffer>,
    width,
    height,
    { threshold: 0.1 },
  )

  // Save diff image
  const stream = createWriteStream(diffOutput)
  diff.pack().pipe(stream)

  return new Promise((resolve) => {
    stream.on("finish", () => {
      resolve({
        same: diffCount === 0,
        diffPath: diffOutput,
        diffCount,
      })
    })
  })
}

export async function checkVisualRegression(
  sessionID: string,
  baselinePath: string,
  currentPath: string,
): Promise<{ passed: boolean; diff?: string }> {
  const rootDir = path.join(
    process.cwd(),
    ".opencode",
    "heidi",
    sessionID,
  )

  const diffPath = path.join(rootDir, "visual_diff.png")

  try {
    const result = await compareScreenshots(baselinePath, currentPath, diffPath)
    return {
      passed: result.same,
      diff: result.diffCount > 0 ? result.diffPath : undefined,
    }
  } catch (e) {
    return { passed: false, diff: undefined }
  }
}
