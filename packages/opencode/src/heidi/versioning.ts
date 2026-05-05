import { Filesystem } from "@/util/filesystem"
import path from "path"
import { Instance } from "@/project/instance"

export namespace HeidiVersioning {
  export const CURRENT_VERSION = "1.0.0"

  export interface ArtifactMeta {
    version: string
    type: string
    created_at: string
    session_id: string
  }

  export function addVersion(meta: Omit<ArtifactMeta, "version" | "created_at">): ArtifactMeta {
    const result: ArtifactMeta = {
      ...meta,
      version: CURRENT_VERSION,
      created_at: new Date().toISOString(),
    }
    return result
  }

  export async function readVersionedArtifact(
    sessionID: string,
    artifactName: string,
  ): Promise<ArtifactMeta | null> {
    const metaPath = path.join(
      Instance.worktree,
      ".opencode",
      "heidi",
      sessionID,
      `${artifactName}.meta.json`,
    )

    if (!(await Filesystem.exists(metaPath))) return null
    return Filesystem.readJson<ArtifactMeta>(metaPath)
  }

  export async function writeVersionedArtifact(
    sessionID: string,
    artifactName: string,
    data: any,
  ): Promise<ArtifactMeta> {
    const meta = addVersion({
      type: artifactName,
      session_id: sessionID,
    })

    const metaPath = path.join(
      Instance.worktree,
      ".opencode",
      "heidi",
      sessionID,
      `${artifactName}.meta.json`,
    )

    await Filesystem.writeJson(metaPath, meta)
    await Filesystem.write(
      path.join(Instance.worktree, ".opencode", "heidi", sessionID, artifactName),
      typeof data === "string" ? data : JSON.stringify(data, null, 2),
    )

    return meta
  }
}
