import { cmd } from "./cmd"
import { Installation } from "../../installation"
import $ from "bun"

export const ProvenanceCommand = cmd({
  command: "provenance",
  describe: "show build provenance information",
  handler: async () => {
    const provenance = Installation.getProvenance()
    console.log(`OpenCode Build Provenance`)
    console.log(`========================`)
    console.log(`Version: ${provenance.version}`)
    console.log(`Repo URL: ${provenance.repoUrl}`)
    console.log(`Branch: ${provenance.branch}`)
    console.log(`Commit SHA: ${provenance.commitSha}`)
    console.log(`Build Time (UTC): ${provenance.buildTime}`)
  },
})
