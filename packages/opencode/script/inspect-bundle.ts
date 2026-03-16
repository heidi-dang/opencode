import { $, plugin } from "bun"
import solidPlugin from "@opentui/solid/bun-plugin"
import fs from "fs"

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./out",
  target: "bun",
  plugins: [
    {
      name: "zod-alias",
      setup(build) {
        build.onResolve({ filter: /^zod$/ }, (args) => {
          return { path: new URL(import.meta.resolve("zod/index.cjs")).pathname }
        })
      },
    },
    solidPlugin,
  ],
})

if (!result.success) {
  console.error("Build failed")
  for (const log of result.logs) {
    console.error(log)
  }
} else {
  console.log("Build successful")
}
