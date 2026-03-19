import { Instance } from "@/project/instance"
import { Filesystem } from "@/util/filesystem"
import path from "path"

export namespace HeidiJail {
  /**
   * Validates that a path is within the project workspace (directory or worktree).
   * Throws an error if the path escapes the jail.
   */
  export function assert(filepath: string) {
    const resolved = path.isAbsolute(filepath) ? filepath : path.resolve(Instance.directory, filepath)
    if (!Instance.containsPath(resolved)) {
      throw new Error(`Workspace Jail: Path "${filepath}" is outside the allowed project boundaries.`)
    }
  }

  /**
   * Resolves a path relative to the project directory and validates it.
   */
  export function resolve(filepath: string) {
    const res = path.isAbsolute(filepath) ? filepath : path.join(Instance.directory, filepath)
    assert(res)
    return res
  }
}
