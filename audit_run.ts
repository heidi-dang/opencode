import { InfinityRuntime } from "./packages/opencode/src/infinity/runtime"
import * as path from "path"

const auditRoot = path.join(process.cwd(), "packages/opencode/.local/audit-repo")
const runtime = new InfinityRuntime(auditRoot, { max_cycles: 5 })
console.log("Starting Infinity Runtime directly on audit repo at", auditRoot)
await runtime.start()
