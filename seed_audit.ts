import { InfinityRuntime } from "./packages/opencode/src/infinity/runtime"
import * as path from "path"

const auditRoot = path.join(process.cwd(), "packages/opencode/.local/audit-repo")
const runtime = new InfinityRuntime(auditRoot)

console.log("Seeding audit targets...")
await runtime.seedAuditTargets()
console.log("Done.")
